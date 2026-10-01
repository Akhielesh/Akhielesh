// Maintenance commands for self-hosters:  npm run cli -- <command>
import readline from "node:readline/promises";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { createDemoAccount, syncAccount, syncAll } from "./ingest/sync.js";
import { sendDigest } from "./notify/dispatcher.js";
import { hashPassword, passwordProblems } from "./security/password.js";
import { ensureSetupCode } from "./services/auth.js";
import { runReminders } from "./services/reminders.js";

const HELP = `Adminak CLI

  setup-code            Print the one-time setup code for a fresh instance
  reset-password        Set a new password for the owner (and sign out everywhere)
  disable-2fa           Turn off two-factor authentication for the owner
  sync                  Scan all connected mailboxes now
  demo                  Load the demo inbox
  digest                Send the daily brief now
  reminders             Recompute renewal / bill / trip reminders
`;

async function main() {
  const [command] = process.argv.slice(2);
  const config = loadConfig();
  const ctx = createContext(config);
  switch (command) {
    case "setup-code": {
      const code = ensureSetupCode(ctx);
      console.log(code ? `Setup code: ${code} (valid until the server restarts — prefer reading it from the server log)` : "This instance is already set up.");
      break;
    }
    case "reset-password": {
      const user = ctx.db.prepare("SELECT id, email FROM users ORDER BY id LIMIT 1").get() as { id: number; email: string } | undefined;
      if (!user) throw new Error("No owner account yet — open the app to set it up.");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const password = await rl.question(`New password for ${user.email}: `);
      rl.close();
      const problem = passwordProblems(password);
      if (problem) throw new Error(problem);
      ctx.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), user.id);
      ctx.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      console.log("Password updated. All sessions were signed out.");
      break;
    }
    case "disable-2fa": {
      ctx.db.prepare("UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, recovery_codes_enc = NULL").run();
      console.log("Two-factor authentication disabled.");
      break;
    }
    case "sync":
      console.table(await syncAll(ctx, "cli"));
      break;
    case "demo":
      console.log(await syncAccount(ctx, createDemoAccount(ctx), "cli"));
      break;
    case "digest":
      console.log(await sendDigest(ctx, "digest"));
      break;
    case "reminders":
      console.log(runReminders(ctx));
      break;
    default:
      console.log(HELP);
  }
  ctx.db.close();
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
