import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import { z } from "zod";
import type { AuthState } from "../../../shared/types.js";
import { isValidTimeZone } from "../../../shared/time.js";
import { audit, type AppContext } from "../../context.js";
import { sendSystemEmail } from "../../notify/dispatcher.js";
import { renderLoginEmail, renderWelcomeEmail } from "../../notify/templates/emails.js";
import { templateEnv } from "../../notify/dispatcher.js";
import { hashPassword, passwordProblems } from "../../security/password.js";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../../security/totp.js";
import { safeEqual } from "../../security/vault.js";
import {
  checkPassword,
  checkSecondFactor,
  createOwner,
  createSession,
  deleteSession,
  ensureSetupCode,
  findUserByEmail,
  getUser,
  hasUser,
  issueRecoveryCodes,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionUser,
} from "../../services/auth.js";
import { HttpError, RateLimiter, clientIp, readJson, type AppEnv } from "../util.js";

const authLimiter = new RateLimiter(10, 15 * 60_000);


export function setSessionCookie(ctx: AppContext, c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: "Lax",
    path: `${ctx.config.basePath}/`,
    maxAge: SESSION_DAYS * 86400,
  });
}

export function authRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  // Account-wide cap on failed sign-ins, whatever IP they claim to come from (behind a proxy the
  // per-IP key is only as good as the forwarded address). Single-owner console, so one bucket.
  const failedLogins = new RateLimiter(40, 15 * 60_000);

  app.get("/state", (c) => {
    const session = sessionUser(ctx, getCookie(c, SESSION_COOKIE));
    if (!hasUser(ctx)) ensureSetupCode(ctx);
    const state: AuthState = {
      setupRequired: !hasUser(ctx),
      authenticated: !!session,
      user: session?.user ?? null,
      demoAvailable: true,
    };
    return c.json(state);
  });

  app.post("/setup", async (c) => {
    const ip = clientIp(c, ctx.config.trustProxy);
    if (!authLimiter.take(`setup:${ip}`).ok) throw new HttpError(429, "Too many attempts. Try again later.");
    const body = await readJson(
      c,
      z.object({
        setupCode: z.string().max(40),
        email: z.email().max(200),
        name: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
        notifyEmail: z.email().max(200).optional().or(z.literal("")),
        timezone: z.string().max(80).optional(),
        currency: z.string().length(3).optional(),
      }),
    );
    if (hasUser(ctx)) throw new HttpError(409, "This instance is already set up.");
    const expected = ensureSetupCode(ctx);
    if (!expected || !safeEqual(body.setupCode.trim().toUpperCase(), expected)) throw new HttpError(403, "That setup code doesn't match. Check the server logs for the current code.");
    const problem = passwordProblems(body.password);
    if (problem) throw new HttpError(422, problem);
    const userId = await createOwner(ctx, {
      email: body.email,
      name: body.name,
      password: body.password,
      notifyEmail: body.notifyEmail || null,
      timezone: body.timezone && isValidTimeZone(body.timezone) ? body.timezone : undefined,
      currency: body.currency?.toUpperCase(),
    });
    const { token } = createSession(ctx, userId, ip, c.req.header("user-agent") ?? null);
    setSessionCookie(ctx, c, token);
    authLimiter.reset(`setup:${ip}`);
    void sendSystemEmail(ctx, renderWelcomeEmail(templateEnv(ctx)), { title: "Welcome to Adminak", body: "Your console is ready." }).catch(() => undefined);
    return c.json({ ok: true });
  });

  app.post("/login", async (c) => {
    const ip = clientIp(c, ctx.config.trustProxy);
    const limit = authLimiter.take(`login:${ip}`);
    if (!limit.ok) throw new HttpError(429, `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`);
    const global = failedLogins.blocked("all");
    if (global) throw new HttpError(429, `Too many failed sign-ins on this console. Try again in ${Math.ceil(global / 60)} minutes.`);
    const body = await readJson(c, z.object({ email: z.string().max(200), password: z.string().max(200), code: z.string().max(20).optional() }));
    const user = findUserByEmail(ctx, body.email);
    // Always run a hash comparison to keep timing uniform.
    const passwordOk = user ? await checkPassword(user, body.password) : (await hashPassword(body.password), false);
    if (!user || !passwordOk) {
      audit(ctx, "auth.login_failed", body.email.slice(0, 120), ip);
      failedLogins.take("all");
      throw new HttpError(401, "Email or password is incorrect.");
    }
    if (user.totp_enabled) {
      if (!body.code) return c.json({ ok: false, totpRequired: true }, 401);
      if (!checkSecondFactor(ctx, user, body.code)) {
        audit(ctx, "auth.totp_failed", user.email, ip);
        return c.json({ ok: false, totpRequired: true, error: "That code didn't work. Try the current code or a recovery code." }, 401);
      }
    }
    const knownIp = ip ? ctx.db.prepare("SELECT 1 FROM sessions WHERE user_id = ? AND ip = ? LIMIT 1").get(user.id, ip) : true;
    const { token } = createSession(ctx, user.id, ip, c.req.header("user-agent") ?? null);
    setSessionCookie(ctx, c, token);
    authLimiter.reset(`login:${ip}`);
    audit(ctx, "auth.login", user.email, ip);
    if (!knownIp && ctx.settings.get().notifications.loginAlerts) {
      const email = renderLoginEmail(templateEnv(ctx), { ip, userAgent: c.req.header("user-agent") ?? null, at: ctx.now().toISOString() });
      void sendSystemEmail(ctx, email, { title: "New sign-in to Adminak", body: `From ${ip ?? "unknown IP"}` }).catch(() => undefined);
    }
    return c.json({ ok: true });
  });

  app.post("/logout", (c) => {
    const session = sessionUser(ctx, getCookie(c, SESSION_COOKIE));
    if (session) deleteSession(ctx, session.sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: `${ctx.config.basePath}/` });
    return c.json({ ok: true });
  });

  return app;
}

/** Account-security routes that require an authenticated session. */
export function accountSecurityRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/sessions", (c) => {
    const rows = ctx.db
      .prepare("SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC")
      .all(c.get("user").id) as { id: string; created_at: string; last_seen_at: string; expires_at: string; ip: string | null; user_agent: string | null }[];
    return c.json(
      rows.map((r) => ({
        id: r.id,
        current: r.id === c.get("sessionId"),
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        ip: r.ip,
        userAgent: r.user_agent,
      })),
    );
  });

  app.delete("/sessions/:id", (c) => {
    const id = c.req.param("id");
    ctx.db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(id, c.get("user").id);
    audit(ctx, "auth.session_revoked");
    return c.json({ ok: true });
  });

  app.post("/sessions/revoke-others", (c) => {
    const removed = ctx.db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(c.get("user").id, c.get("sessionId")).changes;
    audit(ctx, "auth.sessions_revoked", `${removed}`);
    return c.json({ ok: true, removed });
  });

  app.post("/password", async (c) => {
    const body = await readJson(c, z.object({ current: z.string().max(200), next: z.string().max(200) }));
    const user = getUser(ctx, c.get("user").id)!;
    if (!(await checkPassword(user, body.current))) throw new HttpError(403, "Current password is incorrect.");
    const problem = passwordProblems(body.next);
    if (problem) throw new HttpError(422, problem);
    ctx.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(body.next), user.id);
    ctx.db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(user.id, c.get("sessionId"));
    audit(ctx, "auth.password_changed");
    return c.json({ ok: true });
  });

  app.patch("/profile", async (c) => {
    const body = await readJson(c, z.object({ name: z.string().min(1).max(80).optional(), email: z.email().max(200).optional() }));
    const user = c.get("user");
    if (body.email) ctx.db.prepare("UPDATE users SET email = ? WHERE id = ?").run(body.email.toLowerCase(), user.id);
    if (body.name) {
      ctx.db.prepare("UPDATE users SET name = ? WHERE id = ?").run(body.name, user.id);
      ctx.settings.patch({ profile: { name: body.name } });
    }
    return c.json({ ok: true });
  });

  app.post("/totp/setup", async (c) => {
    const user = getUser(ctx, c.get("user").id)!;
    if (user.totp_enabled) throw new HttpError(409, "Two-factor authentication is already on.");
    const secret = generateTotpSecret();
    ctx.db.prepare("UPDATE users SET totp_secret_enc = ?, totp_last_step = NULL WHERE id = ?").run(ctx.vault.encrypt(secret), user.id);
    const url = otpauthUrl(secret, user.email);
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return c.json({ secret, otpauthUrl: url, qrSvg });
  });

  app.post("/totp/enable", async (c) => {
    const body = await readJson(c, z.object({ code: z.string().max(12) }));
    const user = getUser(ctx, c.get("user").id)!;
    if (!user.totp_secret_enc) throw new HttpError(400, "Start setup first.");
    const step = verifyTotp(ctx.vault.decrypt(user.totp_secret_enc), body.code, null);
    if (step === null) throw new HttpError(422, "That code didn't match. Check your authenticator app's clock and try the next code.");
    ctx.db.prepare("UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?").run(step, user.id);
    const recoveryCodes = issueRecoveryCodes(ctx, user.id);
    audit(ctx, "auth.totp_enabled");
    return c.json({ ok: true, recoveryCodes });
  });

  app.post("/totp/disable", async (c) => {
    const body = await readJson(c, z.object({ password: z.string().max(200) }));
    const user = getUser(ctx, c.get("user").id)!;
    if (!(await checkPassword(user, body.password))) throw new HttpError(403, "Password is incorrect.");
    ctx.db.prepare("UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, recovery_codes_enc = NULL, totp_last_step = NULL WHERE id = ?").run(user.id);
    audit(ctx, "auth.totp_disabled");
    return c.json({ ok: true });
  });

  app.post("/recovery-codes", async (c) => {
    const body = await readJson(c, z.object({ password: z.string().max(200) }));
    const user = getUser(ctx, c.get("user").id)!;
    if (!user.totp_enabled) throw new HttpError(400, "Turn on two-factor authentication first.");
    if (!(await checkPassword(user, body.password))) throw new HttpError(403, "Password is incorrect.");
    return c.json({ recoveryCodes: issueRecoveryCodes(ctx, user.id) });
  });

  return app;
}
