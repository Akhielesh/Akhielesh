import { Container, ContainerProxy, getContainer, type StopParams } from "@cloudflare/containers";
import { handleBackupRequest } from "./backup-store";

/** Required for the outbound handler below to be reachable from the container. */
export { ContainerProxy };

/**
 * Adminak on Cloudflare: this Worker owns one container running the same image as the Dockerfile,
 * starts it on demand, and keeps it awake so Adminak's own scheduler (mailbox scans, alerts, reports)
 * keeps running. The container's disk is wiped whenever it restarts, so the database lives in R2:
 * the container talks to a made-up hostname (backup.internal) that this Worker answers from the BACKUP bucket.
 */

export interface Env {
  ADMINAK: DurableObjectNamespace<AdminakContainer>;
  BACKUP: R2Bucket;
  APP_URL?: string;
  SITE_DASHBOARD_URL?: string;
  /** Optional settings and secrets, passed through to the container when present (see PASSTHROUGH). */
  [setting: string]: unknown;
}

/**
 * Anything Adminak reads from its environment that you may want to set as a Worker variable or secret.
 * None is required: with no APP_SECRET one is generated and stored (with the database) in the backup bucket,
 * and with no SMTP the alert emails are saved to the outbox until you connect Gmail with send access.
 */
const PASSTHROUGH = [
  "APP_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TELLER_APPLICATION_ID",
  "TELLER_ENVIRONMENT",
  "TELLER_CERTIFICATE",
  "TELLER_PRIVATE_KEY",
  "SIMPLEFIN_HOSTS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "NOTIFY_EMAIL",
  "ANTHROPIC_API_KEY",
  "AI_MODEL",
  "SYNC_INTERVAL_MINUTES",
  "LOG_LEVEL",
  "BACKUP_INTERVAL_SECONDS",
] as const;

const DEFAULT_APP_URL = "https://akhielesh.com/adminak";
const DEFAULT_SITE_DASHBOARD_URL = "https://akhielesh.com/adminak/site/";

export function containerEnv(env: Env): Record<string, string> {
  const vars: Record<string, string> = {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "8787",
    DATA_DIR: "/data",
    TRUST_PROXY: "true",
    APP_URL: env.APP_URL || DEFAULT_APP_URL,
    SITE_DASHBOARD_URL: env.SITE_DASHBOARD_URL || DEFAULT_SITE_DASHBOARD_URL,
    BACKUP_URL: "http://backup.internal",
  };
  for (const name of PASSTHROUGH) {
    const value = env[name];
    if (typeof value === "string" && value !== "") vars[name] = value;
  }
  return vars;
}

export class AdminakContainer extends Container<Env> {
  override defaultPort = 8787;
  /** Longer than the cron interval, so the cron keeps one instance up and a missed tick does not stop it. */
  override sleepAfter = "30m";
  /** Needed for IMAP, SMTP, the Gmail API and bank providers. */
  override enableInternet = true;
  override pingEndpoint = "localhost/healthz";

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);
    this.envVars = containerEnv(env);
  }

  /** The container's only route to R2: plain HTTP to backup.internal, answered here with the BACKUP binding. */
  static override outboundByHost = {
    "backup.internal": (request: Request, env: Env) => handleBackupRequest(request, env.BACKUP),
  };

  override onStart(): void {
    console.log("adminak container started");
  }

  override onStop(params: StopParams): void {
    console.log("adminak container stopped", params);
  }

  override onError(error: unknown): unknown {
    console.error("adminak container error", error);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await getContainer(env.ADMINAK).fetch(request);
    } catch (error) {
      // Usually the container is still starting (it restores the database first). The next request finds it ready.
      console.error("adminak is not reachable", error);
      return new Response("Adminak is starting up. Try again in a few seconds.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "5", "cache-control": "no-store" },
      });
    }
  },

  /** Cron: touch the container so it stays up (and starts again if it was ever stopped). */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const response = await getContainer(env.ADMINAK).fetch(new Request("http://adminak/healthz"));
    if (!response.ok) console.error("adminak health check failed", response.status);
  },
} satisfies ExportedHandler<Env>;
