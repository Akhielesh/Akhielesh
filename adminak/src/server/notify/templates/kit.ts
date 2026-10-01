// Email-safe building blocks: table layouts + inline styles, with a dark-mode stylesheet
// for clients that support it (Apple Mail, iOS Mail, Outlook.com via [data-ogsc]).

import type { Fact, Severity } from "../../../shared/types.js";

export const C = {
  page: "#f3f1ec",
  card: "#ffffff",
  border: "#e7e4dc",
  ink: "#15161a",
  ink2: "#4f4e49",
  muted: "#8b8983",
  accent: "#b5651d",
  accentSoft: "#fbf1e4",
  link: "#1d64c4",
  track: "#efece5",
  bar: "#2a78d6",
};

export const SEVERITY_STYLE: Record<Severity, { label: string; dot: string; bg: string; text: string; icon: string }> = {
  critical: { label: "Critical", dot: "#d03b3b", bg: "#fdecec", text: "#a42b2b", icon: "⛔" },
  high: { label: "High", dot: "#e0713f", bg: "#fdf0e8", text: "#a8501f", icon: "▲" },
  medium: { label: "Medium", dot: "#d99a06", bg: "#fdf6e3", text: "#8a6200", icon: "●" },
  low: { label: "Low", dot: "#2a78d6", bg: "#eaf2fc", text: "#1c5cab", icon: "○" },
  info: { label: "Info", dot: "#8b8983", bg: "#f1f0ec", text: "#5b5a55", icon: "·" },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? esc(url) : null;
}

export function layout(opts: { title: string; preheader: string; body: string; footer: string; appUrl: string }): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(opts.title)}</title>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  a{color:${C.link};}
  @media (max-width:620px){
    .container{width:100%!important;}
    .px{padding-left:18px!important;padding-right:18px!important;}
    .stack{display:block!important;width:100%!important;box-sizing:border-box;}
    .kpi{display:block!important;width:100%!important;margin:0 0 8px 0!important;box-sizing:border-box;}
    .h1{font-size:22px!important;line-height:28px!important;}
    .hero-num{font-size:34px!important;line-height:40px!important;}
    .hide-sm{display:none!important;}
  }
  @media (prefers-color-scheme:dark){
    body,.bg{background:#0f1012!important;}
    .card{background:#17181b!important;border-color:#2a2b30!important;}
    .ink{color:#f2efe8!important;}
    .ink2{color:#c9c6bd!important;}
    .muted{color:#97948b!important;}
    .soft{background:#1f2024!important;border-color:#2a2b30!important;}
    .accent{color:#f0b56f!important;}
    .btn{background:#f2efe8!important;color:#15161a!important;}
    .btn2{border-color:#3a3b40!important;color:#f2efe8!important;}
    .track{background:#26272b!important;}
    .divider{border-color:#2a2b30!important;}
  }
  [data-ogsc] .ink{color:#f2efe8!important;}
  [data-ogsc] .muted{color:#97948b!important;}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px;max-width:600px;">
<tr><td class="px" style="padding:0 8px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.01em;" class="ink">
      <a href="${esc(opts.appUrl)}" style="color:${C.ink};text-decoration:none;" class="ink"><span style="display:inline-block;width:9px;height:9px;border-radius:9px;background:#f0b56f;margin-right:7px;vertical-align:middle;"></span>Adminak</a>
    </td>
    <td align="right" style="font-family:${FONT};font-size:12px;color:${C.muted};" class="muted">Personal intelligence</td>
  </tr></table>
</td></tr>
${opts.body}
<tr><td class="px" style="padding:22px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};" class="muted">
${opts.footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A white rounded card section. */
export function card(inner: string, opts: { padding?: string; marginTop?: number } = {}): string {
  return `<tr><td style="padding-top:${opts.marginTop ?? 12}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="background:${C.card};border:1px solid ${C.border};border-radius:16px;">
<tr><td class="px" style="padding:${opts.padding ?? "26px 28px"};font-family:${FONT};">${inner}</td></tr>
</table>
</td></tr>`;
}

export function eyebrow(text: string): string {
  return `<div class="muted" style="font-family:${FONT};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};margin:0 0 10px;">${esc(text)}</div>`;
}

export function h1(text: string): string {
  return `<h1 class="h1 ink" style="margin:0;font-family:${FONT};font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">${esc(text)}</h1>`;
}

export function h2(text: string, right = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="ink" style="font-family:${FONT};font-size:16px;font-weight:700;color:${C.ink};padding:0 0 10px;">${esc(text)}</td>
${right ? `<td align="right" class="muted" style="font-family:${FONT};font-size:12px;color:${C.muted};padding:0 0 10px;">${right}</td>` : ""}
</tr></table>`;
}

export function p(text: string, opts: { muted?: boolean; size?: number; margin?: string } = {}): string {
  return `<p class="${opts.muted ? "muted" : "ink2"}" style="margin:${opts.margin ?? "10px 0 0"};font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:1.55;color:${opts.muted ? C.muted : C.ink2};">${text}</p>`;
}

export function badge(severity: Severity): string {
  const s = SEVERITY_STYLE[severity];
  return `<span style="display:inline-block;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${s.text};background:${s.bg};border-radius:999px;padding:3px 9px 3px 8px;"><span style="display:inline-block;width:7px;height:7px;border-radius:7px;background:${s.dot};margin-right:6px;vertical-align:1px;"></span>${s.label}</span>`;
}

export function chip(text: string): string {
  return `<span class="soft muted" style="display:inline-block;font-family:${FONT};font-size:11px;font-weight:600;color:${C.ink2};background:#f4f2ed;border:1px solid ${C.border};border-radius:999px;padding:2px 9px;">${esc(text)}</span>`;
}

export function button(label: string, href: string | null, opts: { secondary?: boolean } = {}): string {
  const url = safeHref(href);
  if (!url) return "";
  return opts.secondary
    ? `<a href="${url}" class="btn2" style="display:inline-block;font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};text-decoration:none;border:1px solid ${C.border};border-radius:10px;padding:11px 18px;margin:6px 8px 0 0;">${esc(label)}</a>`
    : `<a href="${url}" class="btn" style="display:inline-block;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;background:${C.ink};text-decoration:none;border-radius:10px;padding:12px 20px;margin:6px 8px 0 0;">${esc(label)}</a>`;
}

export function facts(rows: Fact[]): string {
  const visible = rows.filter((r) => r.value && r.value.trim() && r.value !== "—");
  if (visible.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="soft" style="margin-top:16px;background:#faf9f6;border:1px solid ${C.border};border-radius:12px;">
${visible
  .map(
    (r, i) => `<tr>
<td class="muted" style="font-family:${FONT};font-size:13px;color:${C.muted};padding:10px 14px;${i ? `border-top:1px solid ${C.border};` : ""}width:38%;vertical-align:top;">${esc(r.label)}</td>
<td class="ink" style="font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};padding:10px 14px;${i ? `border-top:1px solid ${C.border};` : ""}vertical-align:top;">${esc(r.value)}</td>
</tr>`,
  )
  .join("")}
</table>`;
}

export function kpis(items: { label: string; value: string; hint?: string }[]): string {
  const width = Math.floor(100 / items.length);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${items
  .map(
    (k, i) => `<td class="kpi" width="${width}%" style="padding:0 ${i < items.length - 1 ? 8 : 0}px 0 0;vertical-align:top;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="soft" style="background:#faf9f6;border:1px solid ${C.border};border-radius:12px;"><tr><td style="padding:12px 14px;font-family:${FONT};">
<div class="muted" style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};">${esc(k.label)}</div>
<div class="ink" style="font-size:20px;font-weight:700;color:${C.ink};margin-top:4px;letter-spacing:-0.01em;">${esc(k.value)}</div>
${k.hint ? `<div class="muted" style="font-size:12px;color:${C.muted};margin-top:2px;">${esc(k.hint)}</div>` : ""}
</td></tr></table></td>`,
  )
  .join("")}
</tr></table>`;
}

export function divider(): string {
  return `<div class="divider" style="border-top:1px solid ${C.border};margin:18px 0;"></div>`;
}

export function callout(html: string, title?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${C.accentSoft};border-radius:12px;" class="soft"><tr><td style="padding:14px 16px;font-family:${FONT};">
${title ? `<div class="accent" style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.accent};margin-bottom:6px;">${esc(title)}</div>` : ""}
<div class="ink2" style="font-size:14px;line-height:1.6;color:${C.ink2};">${html}</div>
</td></tr></table>`;
}

/** Horizontal bar rows for spend breakdowns (email-safe: nested tables, no images). */
export function barRows(rows: { label: string; value: string; ratio: number }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows
  .map((r) => {
    const pct = Math.max(2, Math.min(100, Math.round(r.ratio * 100)));
    return `<tr><td style="padding:6px 0;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="ink2" style="font-size:13px;color:${C.ink2};">${esc(r.label)}</td>
<td align="right" class="ink" style="font-size:13px;font-weight:600;color:${C.ink};">${esc(r.value)}</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="track" style="background:${C.track};border-radius:4px;margin-top:5px;"><tr>
<td width="${pct}%" style="background:${C.bar};height:6px;border-radius:4px;font-size:0;line-height:0;">&nbsp;</td><td style="font-size:0;line-height:0;">&nbsp;</td>
</tr></table>
</td></tr>`;
  })
  .join("")}
</table>`;
}

export interface ListRow {
  left: string;
  title: string;
  subtitle?: string;
  right?: string;
  href?: string | null;
  badge?: Severity | null;
}

export function listRows(rows: ListRow[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows
  .map((r, i) => {
    const href = safeHref(r.href);
    const title = href ? `<a href="${href}" class="ink" style="color:${C.ink};text-decoration:none;">${esc(r.title)}</a>` : esc(r.title);
    return `<tr>
<td class="muted" style="font-family:${FONT};font-size:12px;color:${C.muted};padding:11px 12px 11px 0;${i ? `border-top:1px solid ${C.border};` : ""}width:64px;vertical-align:top;white-space:nowrap;" >${esc(r.left)}</td>
<td style="font-family:${FONT};padding:11px 0;${i ? `border-top:1px solid ${C.border};` : ""}vertical-align:top;">
${r.badge ? `<div style="margin-bottom:5px;">${badge(r.badge)}</div>` : ""}
<div class="ink" style="font-size:14px;font-weight:600;line-height:1.4;color:${C.ink};">${title}</div>
${r.subtitle ? `<div class="muted" style="font-size:13px;line-height:1.45;color:${C.muted};margin-top:2px;">${esc(r.subtitle)}</div>` : ""}
</td>
<td align="right" class="ink" style="font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};padding:11px 0 11px 12px;${i ? `border-top:1px solid ${C.border};` : ""}vertical-align:top;white-space:nowrap;">${esc(r.right ?? "")}</td>
</tr>`;
  })
  .join("")}
</table>`;
}

export function footer(appUrl: string, reason: string): string {
  const settings = `${appUrl}/notifications`;
  return `${esc(reason)}<br>
<a href="${esc(settings)}" style="color:${C.muted};text-decoration:underline;" class="muted">Notification settings</a> · <a href="${esc(appUrl)}" style="color:${C.muted};text-decoration:underline;" class="muted">Open Adminak</a><br>
<span style="color:#b3b0a8;">Sent by your self-hosted Adminak. Adminak never asks for passwords by email.</span>`;
}

/** Plain-text helpers. */
export function textFacts(rows: Fact[]): string {
  return rows
    .filter((r) => r.value && r.value.trim())
    .map((r) => `  ${r.label}: ${r.value}`)
    .join("\n");
}
