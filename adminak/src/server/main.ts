import { serve } from "@hono/node-server";
import { RemoteBackup } from "./backup.js";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { createApp } from "./http/app.js";
import { startScheduler } from "./jobs/scheduler.js";
import { createLogger } from "./logger.js";
import { bootstrapOwner, ensureSetupCode } from "./services/auth.js";

async function main() {
  const config = loadConfig();

  // On a host with a throwaway disk, the database has to come back before anything opens it.
  // restore() throws when it cannot tell what is stored, so we never start empty over a good copy.
  const remote = config.backup
    ? new RemoteBackup({
        url: config.backup.url,
        dataDir: config.dataDir,
        intervalSeconds: config.backup.intervalSeconds,
        backsUpKey: !config.appSecret,
        log: createLogger(config.logLevel, "adminak:backup"),
      })
    : null;
  if (remote) {
    const outcome = await remote.restore();
    createLogger(config.logLevel, "adminak:backup").info(
      outcome === "restored" ? "Restored the database from the backup store" : outcome === "fresh" ? "No backup stored yet — starting with an empty database" : "Using the database already on disk",
    );
  }

  const ctx = createContext(config);
  await bootstrapOwner(ctx);
  const code = ensureSetupCode(ctx);
  const app = createApp(ctx);

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    ctx.log.info(`Adminak ${ctx.version} listening`, { url: config.appUrl, port: info.port });
    if (code) {
      const line = "─".repeat(58);
      console.log(`\n${line}\n  First-time setup: open ${config.appUrl}/setup\n  One-time setup code:  ${code}\n${line}\n`);
    }
    if (!config.smtp) ctx.log.warn("SMTP is not configured — email alerts will be saved to DATA_DIR/outbox until you set SMTP_* (or connect Gmail with send access).");
    if (!config.google) ctx.log.info("Gmail one-click connect is off (set GOOGLE_CLIENT_ID/SECRET). IMAP with an app password works without it.");
  });

  const scheduler = config.disableScheduler ? null : startScheduler(ctx);
  const backups = remote ? remote.start(ctx) : null;

  const shutdown = (signal: string) => {
    ctx.log.info(`Received ${signal}, shutting down`);
    scheduler?.stop();
    backups?.stop();
    let finishing = false;
    const finish = async () => {
      if (finishing) return;
      finishing = true;
      if (backups) {
        try {
          await backups.flush();
          ctx.log.info("Final backup uploaded");
        } catch (error) {
          ctx.log.error("Final backup failed", { error: (error as Error).message });
        }
      }
      ctx.db.close();
      process.exit(0);
    };
    server.close(() => void finish());
    setTimeout(() => void finish(), 5000).unref();
    // The platform allows a slow stop (Cloudflare gives containers 15 minutes); the final upload must not hang it.
    setTimeout(() => process.exit(0), backups ? 30_000 : 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
