import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { createApp } from "./http/app.js";
import { startScheduler } from "./jobs/scheduler.js";
import { bootstrapOwner, ensureSetupCode } from "./services/auth.js";

async function main() {
  const config = loadConfig();
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

  const shutdown = (signal: string) => {
    ctx.log.info(`Received ${signal}, shutting down`);
    scheduler?.stop();
    server.close(() => {
      ctx.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
