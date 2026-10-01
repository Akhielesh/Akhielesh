import { convert } from "html-to-text";
import type { LinkRef } from "../../shared/types.js";

const INVISIBLE = /[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u206f\ufeff\u034f\u00ad\u061c\u180e]/g;

export function htmlToText(html: string): string {
  try {
    return convert(html, {
      wordwrap: false,
      preserveNewlines: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "head", format: "skip" },
        { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false, maxColumnWidth: 80 } },
        { selector: "h1", options: { uppercase: false } },
        { selector: "h2", options: { uppercase: false } },
        { selector: "h3", options: { uppercase: false } },
        { selector: "th", options: { uppercase: false } },
      ],
      limits: { maxInputLength: 600_000 },
    });
  } catch {
    return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  }
}

export function cleanText(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(/\r\n?/g, "\n")
    .replace(/&nbsp;| /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Picks the most useful plain-text body: the text/plain part unless it's empty or a stub. */
export function bodyText(text: string | null | undefined, html: string | null | undefined): string {
  const plain = cleanText(text ?? "");
  if (html && (plain.length < 80 || /view (this|it) (email )?in (your|a) (web )?browser/i.test(plain.slice(0, 200)) && plain.length < 400)) {
    const fromHtml = cleanText(htmlToText(html));
    if (fromHtml.length > plain.length) return fromHtml.slice(0, 60_000);
  }
  return plain.slice(0, 60_000);
}

export function snippetOf(text: string, length = 220): string {
  const flat = text
    .replace(/\[[^\]]{0,80}\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

const LINK_KINDS: { kind: string; label: string; text: RegExp; url?: RegExp }[] = [
  { kind: "cancel", label: "Cancel subscription", text: /\b(cancel( (your )?(subscription|membership|plan|trial))?|turn off auto-?renew(al)?)\b/i },
  { kind: "manage", label: "Manage subscription", text: /\b(manage (your )?(subscription|membership|plan|account|billing|payment)|(subscription|billing|account) settings|update (your )?(payment|billing)( method| details| info(rmation)?)?|change plan|view plans?)\b/i },
  { kind: "pay", label: "Pay now", text: /\b(pay (now|bill|your bill|online|balance)|make (a )?payment|schedule (a )?payment)\b/i },
  { kind: "statement", label: "View statement", text: /\b(view (your )?(e-?)?(statement|bill|invoice|receipt)|download (your )?(statement|invoice|receipt|pdf)|see (your )?bill)\b/i },
  { kind: "track", label: "Track package", text: /\b(track( (your )?(package|order|shipment|delivery))?|tracking (details|number|info)|see delivery)\b/i },
  { kind: "order", label: "View order", text: /\b(view (your )?order|order details|manage (your )?order|return (items?|or replace))\b/i },
  { kind: "checkin", label: "Check in", text: /\b(check[- ]in( now| online)?|get (your )?boarding pass)\b/i },
  { kind: "itinerary", label: "View trip", text: /\b(view (your )?(trip|itinerary|reservation|booking)|manage (your )?(trip|booking|reservation))\b/i },
  { kind: "join", label: "Join meeting", text: /\b(join (the )?(meeting|call|interview|zoom|teams)|join with google meet)\b/i, url: /(zoom\.us\/j|meet\.google\.com|teams\.microsoft\.com|webex\.com)/i },
  { kind: "schedule", label: "Pick a time", text: /\b(schedule|book|pick|choose|select) (a |your )?(time|slot|interview|call|meeting)\b/i, url: /(calendly\.com|goodtime\.io|cal\.com|greenhouse\.io\/schedul|ashbyhq\.com\/schedul)/i },
  { kind: "review", label: "Review activity", text: /\b(review (your )?(account )?(activity|sign-?in|devices|security)|check activity|secure (your )?account|this wasn'?t me|not you\??|yes,? it was me)\b/i },
  { kind: "reset", label: "Reset password", text: /\b(reset (your )?password|change (your )?password)\b/i },
  { kind: "assessment", label: "Start assessment", text: /\b(start|begin|take) (the |your )?(assessment|test|challenge)\b/i },
  { kind: "rsvp", label: "RSVP", text: /\b(rsvp|accept|going|respond to (the )?invite)\b/i },
  { kind: "document", label: "Review document", text: /\b(review (the )?document|sign (the )?document|view (the )?document)\b/i },
];

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

/** Extracts actionable links (manage, cancel, pay, track…) from an HTML body. */
export function extractLinks(html: string | null | undefined, text: string): LinkRef[] {
  const found: LinkRef[] = [];
  const seen = new Set<string>();
  const push = (kind: string, label: string, url: string) => {
    if (found.length >= 6 || seen.has(kind) || !/^https?:\/\//i.test(url) || url.length > 2000) return;
    seen.add(kind);
    found.push({ kind, label, url });
  };
  if (html) {
    const anchor = /<a\s[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = anchor.exec(html)) && guard++ < 400) {
      const url = decodeEntities(match[2]!.trim());
      const inner = decodeEntities(match[3]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      const alt = /alt\s*=\s*["']([^"']+)["']/i.exec(match[3]!)?.[1] ?? "";
      const label = inner || alt;
      if (!label && !url) continue;
      for (const def of LINK_KINDS) {
        if ((label && def.text.test(label)) || (def.url && def.url.test(url))) {
          push(def.kind, def.label, url);
          break;
        }
      }
    }
  }
  // Meeting links often appear as bare URLs in plain text invitations.
  const meeting = /(https:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j\/[\w?=&.-]+|meet\.google\.com\/[\w-]+|teams\.microsoft\.com\/l\/meetup-join\/\S+))/i.exec(text);
  if (meeting) push("join", "Join meeting", meeting[1]!);
  return found;
}

/** Parses the List-Unsubscribe header and returns an https URL when available. */
export function unsubscribeUrl(header: string | undefined): string | null {
  if (!header) return null;
  const urls = [...header.matchAll(/<([^>]+)>/g)].map((m) => m[1]!.trim());
  return urls.find((u) => /^https:\/\//i.test(u)) ?? urls.find((u) => /^mailto:/i.test(u)) ?? null;
}

/** Masks one-time passcodes so they are never stored. */
export function redactOtp(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const out = text.replace(
    /((?:verification|security|one[- ]time|login|sign[- ]in|confirmation|authentication|access|otp|2fa|your)\s+(?:code|passcode|pin|password)(?:\s+is)?\s*[:\-]?\s*)(\d{4,8}|[A-Z0-9]{3}-?[A-Z0-9]{3})\b/gi,
    (_m, prefix: string) => {
      redacted = true;
      return `${prefix}••••••`;
    },
  );
  const standalone = out.replace(/^\s*(\d{6})\s*$/gm, () => {
    redacted = true;
    return "••••••";
  });
  return { text: standalone, redacted };
}
