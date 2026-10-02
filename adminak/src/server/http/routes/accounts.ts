import { Hono } from "hono";
import { z } from "zod";
import { audit, type AppContext } from "../../context.js";
import { deleteMeta, getMeta, parseJson, setMeta } from "../../db/index.js";
import { buildGoogleAuthUrl, exchangeGoogleCode } from "../../ingest/gmail.js";
import { IMAP_PRESETS, testImapConnection } from "../../ingest/imap.js";
import { accountFromRow, createDemoAccount, deleteAccount, listSyncRuns, syncAccount, syncAll, type AccountRow } from "../../ingest/sync.js";
import type { ImapSettings } from "../../ingest/types.js";
import { randomToken } from "../../security/vault.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";

const imapSchema = z.object({
  label: z.string().max(80).optional(),
  email: z.email().max(200),
  host: z.string().min(1).max(200),
  port: z.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  user: z.string().max(200).optional(),
  password: z.string().min(1).max(500),
  folders: z.array(z.string().min(1).max(200)).max(10).optional(),
  backfillDays: z.number().int().min(1).max(3650).optional(),
});

export function accountRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/accounts", (c) => {
    const rows = ctx.db.prepare("SELECT * FROM accounts ORDER BY id").all() as AccountRow[];
    return c.json({
      accounts: rows.map((r) => accountFromRow(ctx, r)),
      runs: listSyncRuns(ctx, 25),
      google: !!ctx.config.google,
      redirectUri: `${ctx.config.appUrl}/api/accounts/google/callback`,
      presets: Object.entries(IMAP_PRESETS).map(([id, p]) => ({ id, ...p })),
    });
  });

  app.post("/accounts/imap/test", async (c) => {
    const body = await readJson(c, imapSchema.partial({ email: true, label: true }));
    const settings: ImapSettings = { host: body.host, port: body.port, secure: body.secure };
    const result = await testImapConnection(settings, body.user || body.email || "", body.password);
    return c.json(result);
  });

  app.post("/accounts/imap", async (c) => {
    const body = await readJson(c, imapSchema);
    const settings: ImapSettings = {
      host: body.host,
      port: body.port,
      secure: body.secure,
      user: body.user || body.email,
      folders: body.folders?.length ? body.folders : ["INBOX"],
      backfillDays: body.backfillDays,
    };
    const test = await testImapConnection(settings, settings.user!, body.password);
    if (!test.ok) throw new HttpError(422, `Couldn't connect: ${test.error}`);
    for (const folder of settings.folders ?? []) {
      if (!test.folders.includes(folder)) throw new HttpError(422, `Folder “${folder}” doesn't exist. Available: ${test.folders.slice(0, 12).join(", ")}`);
    }
    const res = ctx.db
      .prepare("INSERT INTO accounts(provider, label, email, status, secret_enc, settings, created_at) VALUES ('imap', ?, ?, 'active', ?, ?, ?)")
      .run(body.label || body.email, body.email.toLowerCase(), ctx.vault.encryptJson({ password: body.password }), JSON.stringify(settings), ctx.now().toISOString());
    const id = Number(res.lastInsertRowid);
    audit(ctx, "account.connect", `imap ${body.email}`);
    void syncAccount(ctx, id, "connect");
    return c.json(accountFromRow(ctx, ctx.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow), 201);
  });

  app.get("/accounts/google/start", (c) => {
    if (!ctx.config.google) throw new HttpError(409, "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to connect Gmail with one click.");
    const state = randomToken(24);
    const labels = c.req.query("labels") === "1";
    const send = c.req.query("send") === "1";
    setMeta(ctx.db, `oauth:${state}`, JSON.stringify({ userId: c.get("user").id, labels, send, exp: Date.now() + 15 * 60_000 }));
    return c.redirect(buildGoogleAuthUrl(ctx, state, { labels, send, loginHint: c.req.query("hint") || undefined }), 302);
  });

  app.get("/accounts/google/callback", async (c) => {
    const state = c.req.query("state") ?? "";
    const error = c.req.query("error");
    const stored = /^[\w-]{20,64}$/.test(state) ? getMeta(ctx.db, `oauth:${state}`) : null;
    if (stored) deleteMeta(ctx.db, `oauth:${state}`);
    const meta = parseJson<{ userId: number; labels: boolean; send: boolean; exp: number } | null>(stored, null);
    if (!meta || meta.exp < Date.now() || meta.userId !== c.get("user").id) return c.redirect("/accounts?error=state", 302);
    if (error) return c.redirect(`/accounts?error=${encodeURIComponent(error)}`, 302);
    const code = c.req.query("code");
    if (!code) return c.redirect("/accounts?error=missing_code", 302);
    try {
      const { secret, scopes, email } = await exchangeGoogleCode(ctx, code);
      const existing = ctx.db.prepare("SELECT id, settings FROM accounts WHERE provider = 'gmail' AND email = ?").get(email) as { id: number; settings: string } | undefined;
      const settings = { ...parseJson<Record<string, unknown>>(existing?.settings, {}), scopes, applyLabels: meta.labels };
      let id: number;
      if (existing) {
        id = existing.id;
        ctx.db
          .prepare("UPDATE accounts SET secret_enc = ?, settings = ?, status = 'active', last_error = NULL, error_count = 0 WHERE id = ?")
          .run(ctx.vault.encryptJson(secret), JSON.stringify(settings), id);
      } else {
        id = Number(
          ctx.db
            .prepare("INSERT INTO accounts(provider, label, email, status, secret_enc, settings, created_at) VALUES ('gmail', ?, ?, 'active', ?, ?, ?)")
            .run(email, email, ctx.vault.encryptJson(secret), JSON.stringify(settings), ctx.now().toISOString()).lastInsertRowid,
        );
      }
      if (meta.labels) ctx.settings.patch({ gmail: { applyLabels: true } });
      audit(ctx, "account.connect", `gmail ${email}`);
      void syncAccount(ctx, id, "connect");
      return c.redirect(`/accounts?connected=${encodeURIComponent(email)}`, 302);
    } catch (err) {
      ctx.log.warn("Google OAuth failed", { error: (err as Error).message });
      return c.redirect(`/accounts?error=${encodeURIComponent((err as Error).message.slice(0, 160))}`, 302);
    }
  });

  app.patch("/accounts/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(
      c,
      z.object({
        label: z.string().min(1).max(80).optional(),
        status: z.enum(["active", "paused"]).optional(),
        backfillDays: z.number().int().min(1).max(3650).optional(),
        folders: z.array(z.string().min(1).max(200)).max(10).optional(),
        applyLabels: z.boolean().optional(),
        password: z.string().min(1).max(500).optional(),
      }),
    );
    const row = ctx.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
    if (!row) throw new HttpError(404, "Account not found");
    const settings = parseJson<Record<string, unknown>>(row.settings, {});
    if (body.backfillDays !== undefined) settings.backfillDays = body.backfillDays;
    if (body.folders) settings.folders = body.folders;
    if (body.applyLabels !== undefined) settings.applyLabels = body.applyLabels;
    ctx.db
      .prepare("UPDATE accounts SET label = COALESCE(?, label), status = COALESCE(?, status), settings = ? WHERE id = ?")
      .run(body.label ?? null, body.status ?? null, JSON.stringify(settings), id);
    if (body.password && row.provider === "imap") {
      ctx.db.prepare("UPDATE accounts SET secret_enc = ?, status = 'active', last_error = NULL, error_count = 0 WHERE id = ?").run(ctx.vault.encryptJson({ password: body.password }), id);
    }
    if (body.folders) ctx.db.prepare("UPDATE accounts SET sync_state = '{}' WHERE id = ?").run(id);
    audit(ctx, "account.update", `${id}`);
    return c.json(accountFromRow(ctx, ctx.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow));
  });

  app.delete("/accounts/:id", (c) => {
    const id = intParam(c, "id");
    const row = ctx.db.prepare("SELECT email, provider FROM accounts WHERE id = ?").get(id) as { email: string; provider: string } | undefined;
    if (!row) throw new HttpError(404, "Account not found");
    deleteAccount(ctx, id);
    audit(ctx, "account.delete", `${row.provider} ${row.email}`);
    return c.json({ ok: true });
  });

  app.post("/accounts/:id/sync", (c) => {
    const id = intParam(c, "id");
    if (ctx.runtime.syncing.has(id)) return c.json({ ok: true, alreadyRunning: true });
    void syncAccount(ctx, id, "manual");
    return c.json({ ok: true });
  });

  app.post("/accounts/:id/resync", (c) => {
    const id = intParam(c, "id");
    ctx.db.prepare("UPDATE accounts SET sync_state = '{}', backfill_done = 0 WHERE id = ?").run(id);
    void syncAccount(ctx, id, "resync");
    return c.json({ ok: true });
  });

  app.post("/sync", (c) => {
    void syncAll(ctx, "manual");
    return c.json({ ok: true });
  });

  app.get("/sync/status", (c) =>
    c.json({
      syncing: [...ctx.runtime.syncing],
      progress: Object.fromEntries(ctx.runtime.progress),
    }),
  );

  app.post("/demo", async (c) => {
    const id = createDemoAccount(ctx);
    const outcome = await syncAccount(ctx, id, "demo");
    audit(ctx, "demo.load");
    return c.json(outcome);
  });

  app.delete("/demo", (c) => {
    const row = ctx.db.prepare("SELECT id FROM accounts WHERE provider = 'demo'").get() as { id: number } | undefined;
    if (row) deleteAccount(ctx, row.id);
    audit(ctx, "demo.clear");
    return c.json({ ok: true });
  });

  return app;
}
