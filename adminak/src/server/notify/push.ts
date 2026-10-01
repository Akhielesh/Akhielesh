import webpush from "web-push";
import type { AppContext } from "../context.js";
import { getMeta, setMeta } from "../db/index.js";

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export function vapidKeys(ctx: AppContext): { publicKey: string; privateKey: string } {
  const pub = getMeta(ctx.db, "vapid_public");
  const privEnc = getMeta(ctx.db, "vapid_private_enc");
  if (pub && privEnc) return { publicKey: pub, privateKey: ctx.vault.decrypt(privEnc) };
  const keys = webpush.generateVAPIDKeys();
  setMeta(ctx.db, "vapid_public", keys.publicKey);
  setMeta(ctx.db, "vapid_private_enc", ctx.vault.encrypt(keys.privateKey));
  return keys;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  severity?: string;
}

export async function sendPush(ctx: AppContext, subscription: PushSubscriptionJSON, payload: PushPayload): Promise<void> {
  const keys = vapidKeys(ctx);
  const owner = ctx.db.prepare("SELECT email FROM users ORDER BY id LIMIT 1").get() as { email: string } | undefined;
  const subject = owner ? `mailto:${owner.email}` : ctx.config.appUrl.startsWith("https://") ? ctx.config.appUrl : "mailto:adminak@localhost";
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 6 * 3600,
    urgency: payload.severity === "critical" ? "high" : payload.severity === "high" ? "normal" : "low",
    vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
}
