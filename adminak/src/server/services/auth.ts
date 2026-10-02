import crypto from "node:crypto";
import type { AppContext } from "../context.js";
import { audit } from "../context.js";
import { deleteMeta, getMeta, setMeta } from "../db/index.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { generateRecoveryCodes, verifyTotp } from "../security/totp.js";
import { randomToken, sha256 } from "../security/vault.js";
import { createChannel } from "../notify/channels.js";

export const SESSION_COOKIE = "adminak_session";
export const SESSION_DAYS = 30;

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  totp_secret_enc: string | null;
  totp_enabled: number;
  totp_last_step: number | null;
  recovery_codes_enc: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  totpEnabled: boolean;
}

export function hasUser(ctx: AppContext): boolean {
  return !!ctx.db.prepare("SELECT 1 FROM users LIMIT 1").get();
}

export function getUser(ctx: AppContext, id: number): UserRow | undefined {
  return ctx.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function findUserByEmail(ctx: AppContext, email: string): UserRow | undefined {
  return ctx.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
}

const SETUP_CODE_KEY = "setup_code";

/**
 * One-time code printed to the server log; required to claim a fresh instance. It is kept in the
 * database until the owner account exists, so restarts and redeploys (and `cli setup-code`, which
 * runs in its own process) all agree on the same code.
 */
export function ensureSetupCode(ctx: AppContext): string | null {
  if (hasUser(ctx)) {
    ctx.runtime.setupCode = null;
    deleteMeta(ctx.db, SETUP_CODE_KEY);
    return null;
  }
  let code = getMeta(ctx.db, SETUP_CODE_KEY);
  if (!code) {
    const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
    code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
    setMeta(ctx.db, SETUP_CODE_KEY, code);
  }
  ctx.runtime.setupCode = code;
  return code;
}

export async function createOwner(
  ctx: AppContext,
  input: { email: string; name: string; password: string; notifyEmail?: string | null; timezone?: string; currency?: string },
): Promise<number> {
  if (hasUser(ctx)) throw new Error("An owner account already exists.");
  const now = ctx.now().toISOString();
  const hash = await hashPassword(input.password);
  const id = Number(
    ctx.db.prepare("INSERT INTO users(email, name, password_hash, created_at) VALUES (?, ?, ?, ?)").run(input.email.trim().toLowerCase(), input.name.trim(), hash, now)
      .lastInsertRowid,
  );
  ctx.settings.patch({
    profile: {
      name: input.name.trim(),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
    },
  });
  const notify = (input.notifyEmail ?? ctx.config.notifyEmail ?? input.email).trim();
  if (notify && !ctx.db.prepare("SELECT 1 FROM channels WHERE type = 'email'").get()) {
    createChannel(ctx, { type: "email", name: "Personal email", config: { to: notify }, minSeverity: "high" });
  }
  ctx.runtime.setupCode = null;
  deleteMeta(ctx.db, SETUP_CODE_KEY);
  audit(ctx, "owner.created", input.email);
  return id;
}

/** Creates the owner from ADMIN_EMAIL / ADMIN_PASSWORD on first boot. */
export async function bootstrapOwner(ctx: AppContext): Promise<boolean> {
  if (hasUser(ctx) || !ctx.config.admin) return false;
  await createOwner(ctx, { email: ctx.config.admin.email, name: ctx.config.admin.name, password: ctx.config.admin.password });
  ctx.log.info("Owner account created from ADMIN_EMAIL / ADMIN_PASSWORD");
  return true;
}

export function createSession(ctx: AppContext, userId: number, ip: string | null, userAgent: string | null): { token: string; expiresAt: Date } {
  const token = randomToken(32);
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000);
  ctx.db
    .prepare("INSERT INTO sessions(id, user_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(sha256(token), userId, now.toISOString(), expiresAt.toISOString(), now.toISOString(), ip, userAgent?.slice(0, 300) ?? null);
  ctx.db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now.toISOString(), userId);
  return { token, expiresAt };
}

export function sessionUser(ctx: AppContext, token: string | undefined): { user: SessionUser; sessionId: string; refreshed: Date | null } | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = sha256(token);
  const row = ctx.db
    .prepare(
      "SELECT s.id AS sid, s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.totp_enabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
    )
    .get(id) as { sid: string; expires_at: string; last_seen_at: string; id: number; email: string; name: string; totp_enabled: number } | undefined;
  if (!row) return null;
  const now = ctx.now();
  if (new Date(row.expires_at).getTime() < now.getTime()) {
    ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  let refreshed: Date | null = null;
  // Sliding expiry, written at most once an hour.
  if (now.getTime() - new Date(row.last_seen_at).getTime() > 3600_000) {
    refreshed = new Date(now.getTime() + SESSION_DAYS * 86400000);
    ctx.db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").run(now.toISOString(), refreshed.toISOString(), id);
  }
  return { user: { id: row.id, email: row.email, name: row.name, totpEnabled: !!row.totp_enabled }, sessionId: id, refreshed };
}

export function deleteSession(ctx: AppContext, sessionId: string): void {
  ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export async function checkPassword(user: UserRow, password: string): Promise<boolean> {
  return verifyPassword(password, user.password_hash);
}

/** Verifies a TOTP code or consumes a recovery code. */
export function checkSecondFactor(ctx: AppContext, user: UserRow, code: string): boolean {
  if (!user.totp_enabled || !user.totp_secret_enc) return true;
  const clean = code.trim().toUpperCase();
  if (/^\d{6}$/.test(clean.replace(/\s/g, ""))) {
    const secret = ctx.vault.decrypt(user.totp_secret_enc);
    const step = verifyTotp(secret, clean, user.totp_last_step);
    if (step === null) return false;
    ctx.db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").run(step, user.id);
    return true;
  }
  const codes = ctx.vault.decryptJson<string[]>(user.recovery_codes_enc, []);
  const hashed = sha256(clean.replace(/[^A-Z0-9]/g, ""));
  const index = codes.indexOf(hashed);
  if (index < 0) return false;
  codes.splice(index, 1);
  ctx.db.prepare("UPDATE users SET recovery_codes_enc = ? WHERE id = ?").run(ctx.vault.encryptJson(codes), user.id);
  audit(ctx, "auth.recovery_code_used", `${codes.length} left`);
  return true;
}

export function issueRecoveryCodes(ctx: AppContext, userId: number): string[] {
  const codes = generateRecoveryCodes(8);
  const hashed = codes.map((c) => sha256(c.replace(/[^A-Z0-9]/g, "")));
  ctx.db.prepare("UPDATE users SET recovery_codes_enc = ? WHERE id = ?").run(ctx.vault.encryptJson(hashed), userId);
  return codes;
}
