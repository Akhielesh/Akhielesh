import { Hono } from "hono";
import { z } from "zod";
import { CHANNEL_TYPES, SEVERITIES } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { parseJson } from "../../db/index.js";
import { channelFromRow, createChannel, listChannels, type ChannelRow } from "../../notify/channels.js";
import { notificationLog, sendDigest, sendTest, templateEnv } from "../../notify/dispatcher.js";
import { vapidKeys } from "../../notify/push.js";
import { TEMPLATES } from "../../notify/templates/samples.js";
import { emailConfigured, emailTransport, verifySmtp } from "../../notify/transport.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";

const eventsSchema = z.object({ instant: z.boolean(), digest: z.boolean(), weekly: z.boolean(), monthly: z.boolean(), system: z.boolean() }).partial();

export function notificationRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/channels", (c) =>
    c.json({
      channels: listChannels(ctx),
      email: { configured: emailConfigured(ctx), transport: emailTransport(ctx).name, smtp: !!ctx.config.smtp },
      pushPublicKey: vapidKeys(ctx).publicKey,
    }),
  );

  app.post("/channels", async (c) => {
    const body = await readJson(
      c,
      z.object({
        type: z.enum(CHANNEL_TYPES),
        name: z.string().max(80).optional(),
        config: z.record(z.string(), z.unknown()),
        minSeverity: z.enum(SEVERITIES).optional(),
        events: eventsSchema.optional(),
      }),
    );
    try {
      const channel = createChannel(ctx, body);
      audit(ctx, "channel.create", `${body.type}`);
      return c.json(channel, 201);
    } catch (error) {
      if (error instanceof z.ZodError) throw new HttpError(422, error.issues[0]?.message ?? "Invalid channel settings");
      throw error;
    }
  });

  app.patch("/channels/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, z.object({ name: z.string().min(1).max(80).optional(), enabled: z.boolean().optional(), minSeverity: z.enum(SEVERITIES).optional(), events: eventsSchema.optional() }));
    const row = ctx.db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | undefined;
    if (!row) throw new HttpError(404, "Channel not found");
    const events = { ...parseJson<Record<string, boolean>>(row.events, {}), ...body.events };
    ctx.db
      .prepare("UPDATE channels SET name = COALESCE(?, name), enabled = COALESCE(?, enabled), min_severity = COALESCE(?, min_severity), events = ?, last_error = CASE WHEN ? = 1 THEN NULL ELSE last_error END WHERE id = ?")
      .run(body.name ?? null, body.enabled === undefined ? null : body.enabled ? 1 : 0, body.minSeverity ?? null, JSON.stringify(events), body.enabled ? 1 : 0, id);
    return c.json(channelFromRow(ctx.db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow));
  });

  app.delete("/channels/:id", (c) => {
    ctx.db.prepare("DELETE FROM channels WHERE id = ?").run(intParam(c, "id"));
    audit(ctx, "channel.delete");
    return c.json({ ok: true });
  });

  app.post("/channels/:id/test", async (c) => c.json(await sendTest(ctx, intParam(c, "id"))));

  app.get("/notifications/log", (c) => c.json(notificationLog(ctx, Math.min(200, Number(c.req.query("limit") ?? 60)))));

  app.post("/notifications/send", async (c) => {
    const body = await readJson(c, z.object({ kind: z.enum(["digest", "weekly", "monthly"]), channelIds: z.array(z.number().int()).max(20).optional() }));
    const result = await sendDigest(ctx, body.kind, { channelIds: body.channelIds });
    return c.json(result);
  });

  app.post("/notifications/smtp-check", async (c) => c.json(await verifySmtp(ctx)));

  app.get("/templates", (c) => c.json(TEMPLATES.map(({ id, name, description, subject }) => ({ id, name, description, subject }))));

  app.get("/templates/:id/preview", (c) => {
    const template = TEMPLATES.find((t) => t.id === c.req.param("id"));
    if (!template) throw new HttpError(404, "Template not found");
    const content = template.render(templateEnv(ctx));
    if (c.req.query("format") === "text") return c.text(content.text);
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    c.header("X-Frame-Options", "SAMEORIGIN");
    return c.html(content.html);
  });

  return app;
}
