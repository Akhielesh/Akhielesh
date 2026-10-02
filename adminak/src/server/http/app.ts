import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import type { AppContext } from "../context.js";
import { SESSION_COOKIE, sessionUser } from "../services/auth.js";
import { setSessionCookie, accountSecurityRoutes, authRoutes } from "./routes/auth.js";
import { accountRoutes } from "./routes/accounts.js";
import { alertRoutes, subscriptionRoutes } from "./routes/alerts.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { messageRoutes } from "./routes/messages.js";
import { notificationRoutes } from "./routes/notifications.js";
import { publicRoutes } from "./routes/public.js";
import { agentGate, agentRoutes } from "./routes/agents.js";
import { systemRoutes } from "./routes/system.js";
import { HttpError, RateLimiter, clientIp, type AppEnv } from "./util.js";

const PUBLIC_API = new Set(["/api/auth/state", "/api/auth/login", "/api/auth/setup", "/api/auth/logout"]);

function resolveWebDist(ctx: AppContext): string | null {
  const candidates = [
    ctx.config.webDist,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web"),
    path.resolve(process.cwd(), "dist/web"),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) ?? null;
}

/** The console with every route at the root; createApp mounts it under the configured base path. */
function createRootApp(ctx: AppContext) {
  const app = new Hono<AppEnv>();
  const apiLimiter = new RateLimiter(1500, 60_000);
  const appOrigin = new URL(ctx.config.appUrl).origin;

  // Security headers on every response.
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    if (!c.res.headers.get("Content-Security-Policy")) {
      c.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'",
      );
      c.header("X-Frame-Options", "DENY");
    }
    // A private console: nothing here should be indexed, trained on or retrieved by AI.
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noai, noimageai");
    // Under a base path the console shares its host with another site (akhielesh.com), so it
    // doesn't decide HSTS for that host's subdomains.
    if (ctx.config.secureCookies) c.header("Strict-Transport-Security", ctx.config.basePath ? "max-age=31536000" : "max-age=31536000; includeSubDomains");
    if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, details: err.details ?? null }, err.status);
    ctx.log.error("Unhandled request error", { path: c.req.path, error: err.message });
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  // AI crawlers and automated agents get the check-in page, never the app.
  app.use("*", agentGate(ctx));

  app.route("/", publicRoutes(ctx));
  app.route("/", agentRoutes(ctx));

  // CSRF: state-changing API calls must come from our own pages (custom header + same origin).
  app.use("/api/*", async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !c.req.path.startsWith("/api/hooks/")) {
      if (c.req.header("x-adminak") !== "1") throw new HttpError(403, "Missing request header");
      const origin = c.req.header("origin");
      if (origin) {
        const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
        let ok = origin === appOrigin;
        try {
          ok = ok || (!!host && new URL(origin).host === host);
        } catch {
          ok = false;
        }
        if (!ok) throw new HttpError(403, "Cross-origin request blocked");
      }
    }
    await next();
  });

  // Authentication for everything under /api except the public auth endpoints and hooks.
  app.use("/api/*", async (c, next) => {
    if (PUBLIC_API.has(c.req.path) || c.req.path.startsWith("/api/hooks/")) return next();
    const session = sessionUser(ctx, getCookie(c, SESSION_COOKIE));
    if (!session) throw new HttpError(401, "Please sign in.");
    const limit = apiLimiter.take(`api:${session.sessionId}`);
    if (!limit.ok) throw new HttpError(429, "Slow down a little.");
    c.set("user", session.user);
    c.set("sessionId", session.sessionId);
    if (session.refreshed) {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) setSessionCookie(ctx, c, token);
    }
    await next();
  });

  app.route("/api/auth", authRoutes(ctx));
  app.route("/api/me", accountSecurityRoutes(ctx));
  app.route("/api", dashboardRoutes(ctx));
  app.route("/api/alerts", alertRoutes(ctx));
  app.route("/api/subscriptions", subscriptionRoutes(ctx));
  app.route("/api", messageRoutes(ctx));
  app.route("/api", accountRoutes(ctx));
  app.route("/api", notificationRoutes(ctx));
  app.route("/api", systemRoutes(ctx));

  app.all("/api/*", () => {
    throw new HttpError(404, "Not found");
  });

  const webDist = resolveWebDist(ctx);
  if (webDist) {
    const relRoot = path.relative(process.cwd(), webDist) || ".";
    // The shell always goes through withBase (never the raw file), so it carries <base href>.
    const indexHtml = withBase(fs.readFileSync(path.join(webDist, "index.html"), "utf8"), ctx);
    const serveIndex = (c: Context<AppEnv>) => {
      c.header("Cache-Control", "no-cache");
      return c.html(indexHtml);
    };
    app.get("/", serveIndex);
    app.get("/index.html", serveIndex);
    app.use(
      "/assets/*",
      serveStatic({
        root: relRoot,
        onFound: (_p, c) => {
          c.header("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
    app.use(
      "*",
      serveStatic({
        root: relRoot,
        onFound: (filePath, c) => {
          c.header("Cache-Control", filePath.endsWith("sw.js") || filePath.endsWith(".html") || filePath.endsWith(".webmanifest") ? "no-cache" : "public, max-age=3600");
        },
      }),
    );
    app.get("*", serveIndex);
  } else {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><meta charset="utf-8"><title>Adminak API</title><body style="font-family:system-ui;padding:40px;background:#0f1012;color:#f2efe8"><h1>Adminak API is running</h1><p>Build the dashboard with <code>npm run build</code>, or use <code>npm run dev</code> and open the Vite URL.</p></body>`,
      ),
    );
  }

  return app;
}

function attr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/**
 * The web build uses relative asset URLs; a <base> tag points them (and the app's API calls,
 * via the adminak-base meta tag) at wherever the console is mounted.
 */
function withBase(html: string, ctx: AppContext): string {
  const base = ctx.config.basePath;
  const tags = [`<base href="${attr(base)}/">`, `<meta name="adminak-base" content="${attr(base)}">`];
  if (ctx.config.siteDashboardUrl) tags.push(`<meta name="adminak-site-dashboard" content="${attr(ctx.config.siteDashboardUrl)}">`);
  return html.replace(/<head>/i, `<head>\n    ${tags.join("\n    ")}`);
}

/**
 * The HTTP app. With APP_URL at a sub-path (https://akhielesh.com/adminak) everything is served
 * under that prefix; /healthz stays at the root for the platform health check.
 */
export function createApp(ctx: AppContext) {
  const root = createRootApp(ctx);
  const base = ctx.config.basePath;
  if (!base) return root;
  const app = new Hono();
  app.get("/healthz", (c) => root.fetch(c.req.raw));
  app.get("/", (c) => c.redirect(`${base}/`, 302));
  app.get(base, (c) => c.redirect(`${base}/`, 301));
  app.mount(base, root.fetch);
  app.all("*", (c) => c.text("Not found", 404));
  return app;
}

export { clientIp };
