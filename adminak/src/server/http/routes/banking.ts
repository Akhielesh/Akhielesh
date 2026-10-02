import { Hono } from "hono";
import { z } from "zod";
import { CHARGE_KINDS, FIN_ACCOUNT_TYPES, SPEND_CATEGORIES } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { categorizeMerchantsWithAi } from "../../finance/ai.js";
import { importStatement, previewStatement } from "../../finance/import.js";
import { merchantKey } from "../../finance/merchant.js";
import { claimSetupToken } from "../../finance/simplefin.js";
import { applyMerchantRule, flipAccountSigns, type FinAccountRow } from "../../finance/store.js";
import { buildBanking, finConnectionDTO } from "../../finance/summary.js";
import { createFinConnection, deleteFinConnection, syncFinConnection, type FinConnectionRow } from "../../finance/sync.js";
import { tellerAccounts, tellerTransport } from "../../finance/teller.js";
import { BankAuthError } from "../../finance/types.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";
import { CHARGE_SELECT, chargeFromRow, type ChargeRow } from "./dashboard.js";

const mappingSchema = z
  .object({
    date: z.number().int().min(-1).max(200),
    description: z.number().int().min(-1).max(200),
    amount: z.number().int().min(-1).max(200),
    debit: z.number().int().min(-1).max(200),
    credit: z.number().int().min(-1).max(200),
    category: z.number().int().min(-1).max(200),
    direction: z.number().int().min(-1).max(200),
    positiveIsOut: z.boolean(),
  })
  .nullable()
  .optional();

const fileSchema = z.object({
  filename: z.string().max(200).default("statement.csv"),
  content: z.string().min(1).max(8_500_000),
  mapping: mappingSchema,
});

const IMPORT_LIMIT = 9_000_000;

export function bankingRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  const connectionRow = (id: number) => {
    const row = ctx.db.prepare("SELECT * FROM fin_connections WHERE id = ?").get(id) as FinConnectionRow | undefined;
    if (!row) throw new HttpError(404, "Connection not found");
    return row;
  };

  app.get("/banking", (c) => c.json(buildBanking(ctx)));

  // ── Teller (Capital One and ~5,000 US banks) ───────────────────────────────
  app.post("/banking/teller", async (c) => {
    if (!ctx.config.teller) throw new HttpError(409, "Teller isn't set up on this server yet. Add TELLER_APPLICATION_ID and the Teller certificate, then try again.");
    const body = await readJson(
      c,
      z.object({
        accessToken: z.string().min(8).max(300),
        enrollmentId: z.string().min(1).max(120),
        institution: z.string().max(120).optional(),
        institutionId: z.string().max(80).optional(),
      }),
    );
    // Prove the token works (and learn the accounts) before storing it.
    let accounts;
    try {
      accounts = await tellerAccounts(tellerTransport(ctx.config.teller, body.accessToken));
    } catch (error) {
      throw new HttpError(error instanceof BankAuthError ? 401 : 502, `Teller didn't accept the connection: ${(error as Error).message}`);
    }
    const institution = body.institution ?? accounts[0]?.institution?.name ?? "Bank";
    const existing = ctx.db.prepare("SELECT id FROM fin_connections WHERE provider = 'teller' AND external_id = ?").get(body.enrollmentId) as { id: number } | undefined;
    let id: number;
    if (existing) {
      id = existing.id;
      ctx.db
        .prepare("UPDATE fin_connections SET secret_enc = ?, status = 'active', last_error = NULL, error_count = 0 WHERE id = ?")
        .run(ctx.vault.encryptJson({ accessToken: body.accessToken }), id);
      audit(ctx, "bank.reconnect", `teller ${institution}`);
    } else {
      id = createFinConnection(ctx, {
        provider: "teller",
        label: institution,
        institution,
        institutionId: body.institutionId ?? accounts[0]?.institution?.id ?? null,
        externalId: body.enrollmentId,
        secret: { accessToken: body.accessToken },
      });
    }
    void syncFinConnection(ctx, id, existing ? "reconnect" : "connect");
    return c.json(finConnectionDTO(ctx, connectionRow(id)), existing ? 200 : 201);
  });

  // ── SimpleFIN Bridge (any bank the Bridge supports) ────────────────────────
  app.post("/banking/simplefin", async (c) => {
    const body = await readJson(c, z.object({ setupToken: z.string().min(10).max(4000), label: z.string().max(80).optional() }));
    let access;
    try {
      access = await claimSetupToken(body.setupToken, ctx.config.simplefinHosts);
    } catch (error) {
      throw new HttpError(422, (error as Error).message);
    }
    const id = createFinConnection(ctx, { provider: "simplefin", label: body.label || "SimpleFIN Bridge", secret: access });
    const outcome = await syncFinConnection(ctx, id, "connect");
    const row = connectionRow(id);
    // Name the connection after the bank(s) it brought in.
    if (!body.label) {
      const names = [...new Set((ctx.db.prepare("SELECT institution FROM fin_accounts WHERE connection_id = ? AND institution IS NOT NULL").all(id) as { institution: string }[]).map((r) => r.institution))];
      if (names.length) ctx.db.prepare("UPDATE fin_connections SET label = ?, institution = ? WHERE id = ?").run(names.slice(0, 3).join(", ").slice(0, 80), names[0], id);
    }
    return c.json({ connection: finConnectionDTO(ctx, connectionRow(id)), outcome: { ...outcome, error: outcome.error ?? null }, label: row.label }, 201);
  });

  // ── Statement import (CSV / OFX / QFX) ─────────────────────────────────────
  app.post("/banking/import/preview", async (c) => {
    const body = await readJson(c, fileSchema, IMPORT_LIMIT);
    try {
      return c.json(previewStatement(ctx, body.filename, body.content, body.mapping ?? null));
    } catch (error) {
      throw new HttpError(422, (error as Error).message);
    }
  });

  app.post("/banking/import", async (c) => {
    const body = await readJson(
      c,
      fileSchema.extend({
        finAccountId: z.number().int().positive().optional(),
        account: z
          .object({
            name: z.string().min(1).max(120),
            type: z.enum(FIN_ACCOUNT_TYPES),
            institution: z.string().max(120).nullable().optional(),
            mask: z
              .string()
              .regex(/^\d{2,6}$/)
              .nullable()
              .optional(),
          })
          .optional(),
      }),
      IMPORT_LIMIT,
    );
    try {
      return c.json(importStatement(ctx, body.filename, body.content, { finAccountId: body.finAccountId, account: body.account }, body.mapping ?? null));
    } catch (error) {
      throw new HttpError(422, (error as Error).message);
    }
  });

  // ── Connections ────────────────────────────────────────────────────────────
  app.patch("/banking/connections/:id", async (c) => {
    const id = intParam(c, "id");
    connectionRow(id);
    const body = await readJson(c, z.object({ label: z.string().min(1).max(80).optional(), status: z.enum(["active", "paused"]).optional() }));
    ctx.db.prepare("UPDATE fin_connections SET label = COALESCE(?, label), status = COALESCE(?, status) WHERE id = ?").run(body.label ?? null, body.status ?? null, id);
    audit(ctx, "bank.update", String(id));
    return c.json(finConnectionDTO(ctx, connectionRow(id)));
  });

  app.delete("/banking/connections/:id", (c) => {
    const id = intParam(c, "id");
    const row = connectionRow(id);
    deleteFinConnection(ctx, id);
    audit(ctx, "bank.delete", `${row.provider} ${row.label}`);
    return c.json({ ok: true });
  });

  app.post("/banking/connections/:id/sync", (c) => {
    const id = intParam(c, "id");
    const row = connectionRow(id);
    if (row.provider === "file") throw new HttpError(409, "Imported statements don't refresh on their own. Import a newer file instead.");
    if (ctx.runtime.bankSyncing.has(id)) return c.json({ ok: true, alreadyRunning: true });
    void syncFinConnection(ctx, id, "manual");
    return c.json({ ok: true });
  });

  // ── Accounts ───────────────────────────────────────────────────────────────
  app.patch("/banking/accounts/:id", async (c) => {
    const id = intParam(c, "id");
    const row = ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(id) as FinAccountRow | undefined;
    if (!row) throw new HttpError(404, "Account not found");
    const body = await readJson(
      c,
      z.object({
        name: z.string().min(1).max(120).optional(),
        type: z.enum(FIN_ACCOUNT_TYPES).optional(),
        hidden: z.boolean().optional(),
        invertAmounts: z.boolean().optional(),
      }),
    );
    ctx.db
      .prepare("UPDATE fin_accounts SET name = COALESCE(?, name), type = COALESCE(?, type), hidden = COALESCE(?, hidden), updated_at = ? WHERE id = ?")
      .run(body.name ?? null, body.type ?? null, body.hidden === undefined ? null : body.hidden ? 1 : 0, ctx.now().toISOString(), id);
    if (body.invertAmounts !== undefined && body.invertAmounts !== !!row.invert_amounts) {
      ctx.db.prepare("UPDATE fin_accounts SET invert_amounts = ? WHERE id = ?").run(body.invertAmounts ? 1 : 0, id);
      flipAccountSigns(ctx, { ...row, type: body.type ?? row.type });
    }
    audit(ctx, "bank.account.update", String(id));
    return c.json({ ok: true });
  });

  app.delete("/banking/accounts/:id", (c) => {
    const id = intParam(c, "id");
    const row = ctx.db.prepare("SELECT a.id, c.provider FROM fin_accounts a JOIN fin_connections c ON c.id = a.connection_id WHERE a.id = ?").get(id) as { id: number; provider: string } | undefined;
    if (!row) throw new HttpError(404, "Account not found");
    if (row.provider !== "file") throw new HttpError(409, "Accounts from a live bank connection come back on the next refresh. Hide it, or remove the whole connection.");
    ctx.db.transaction(() => {
      ctx.db.prepare("DELETE FROM charges WHERE fin_account_id = ?").run(id);
      ctx.db.prepare("DELETE FROM fin_accounts WHERE id = ?").run(id);
      ctx.db.prepare("DELETE FROM fin_connections WHERE provider = 'file' AND id NOT IN (SELECT connection_id FROM fin_accounts)").run();
    })();
    audit(ctx, "bank.account.delete", String(id));
    return c.json({ ok: true });
  });

  // ── Recategorize a transaction (optionally every transaction from that merchant) ──
  app.patch("/charges/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(
      c,
      z.object({
        spendCategory: z.enum(SPEND_CATEGORIES).optional(),
        kind: z.enum(CHARGE_KINDS).optional(),
        description: z.string().min(1).max(200).optional(),
        applyToMerchant: z.boolean().default(false),
      }),
    );
    const row = ctx.db.prepare("SELECT id, merchant, merchant_key, vendor_id FROM charges WHERE id = ?").get(id) as
      | { id: number; merchant: string | null; merchant_key: string | null; vendor_id: number | null }
      | undefined;
    if (!row) throw new HttpError(404, "Transaction not found");
    ctx.db
      .prepare("UPDATE charges SET spend_category = COALESCE(?, spend_category), kind = COALESCE(?, kind), description = COALESCE(?, description), category_source = 'user' WHERE id = ?")
      .run(body.spendCategory ?? null, body.kind ?? null, body.description ?? null, id);
    let applied = 0;
    if (body.applyToMerchant) {
      const key = row.merchant_key ?? (row.merchant ? merchantKey(row.merchant) : null);
      if (!key) throw new HttpError(422, "This transaction has no merchant to make a rule for.");
      ctx.db
        .prepare(
          `INSERT INTO merchant_rules(merchant_key, spend_category, kind, vendor_id, source, created_at) VALUES (?, ?, ?, ?, 'user', ?)
           ON CONFLICT(merchant_key) DO UPDATE SET spend_category = COALESCE(excluded.spend_category, spend_category), kind = COALESCE(excluded.kind, kind), source = 'user'`,
        )
        .run(key, body.spendCategory ?? null, body.kind ?? null, row.vendor_id, ctx.now().toISOString());
      applied = applyMerchantRule(ctx, { merchant_key: key, spend_category: body.spendCategory ?? null, kind: body.kind ?? null, vendor_id: null }, "rule");
    }
    audit(ctx, "charge.update", `${id}${body.applyToMerchant ? " +rule" : ""}`);
    return c.json({ charge: chargeFromRow(ctx.db.prepare(`${CHARGE_SELECT} WHERE c.id = ?`).get(id) as ChargeRow), applied });
  });

  app.get("/banking/rules", (c) =>
    c.json(
      (ctx.db.prepare("SELECT id, merchant_key AS merchantKey, spend_category AS spendCategory, kind, source, created_at AS createdAt FROM merchant_rules ORDER BY source = 'ai', created_at DESC LIMIT 500").all() as unknown[]),
    ),
  );

  app.delete("/banking/rules/:id", (c) => {
    ctx.db.prepare("DELETE FROM merchant_rules WHERE id = ?").run(intParam(c, "id"));
    return c.json({ ok: true });
  });

  app.post("/banking/categorize", async (c) => {
    if (!ctx.config.ai) throw new HttpError(409, "Add ANTHROPIC_API_KEY to use AI categorization.");
    return c.json({ applied: await categorizeMerchantsWithAi(ctx) });
  });

  return app;
}
