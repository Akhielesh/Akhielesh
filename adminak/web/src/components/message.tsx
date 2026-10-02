import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, ChevronDown, ExternalLink, Paperclip, Sparkles, Tags } from "lucide-react";
import { CATEGORY_META } from "@shared/catalog";
import { titleCase } from "@shared/format";
import { CATEGORIES, type Category, type MessageListItem } from "@shared/types";
import { post, errorMessage } from "../lib/api";
import { useMessage, useInvalidateData, useSystem } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { Badge, Button, ExternalA, Select, Skeleton } from "./ui";
import { VendorMark } from "./vendor";

const CATEGORY_TONE: Partial<Record<Category, "accent" | "info" | "good" | "warn" | "bad" | "high" | "neutral">> = {
  subscriptions: "accent",
  bills: "warn",
  finance: "good",
  security: "bad",
  career: "info",
  travel: "info",
  orders: "neutral",
  personal: "high",
};

export function CategoryBadge({ category }: { category: Category }) {
  return <Badge tone={CATEGORY_TONE[category] ?? "neutral"}>{CATEGORY_META[category]?.label ?? category}</Badge>;
}

export function MessageRow({ message, onOpen }: { message: MessageListItem; onOpen: () => void }) {
  const fmt = useFmt();
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50 sm:px-5">
      <VendorMark vendor={message.vendor} name={message.fromName ?? message.fromEmail} size="sm" className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{message.vendor?.name ?? message.fromName ?? message.fromEmail}</span>
          <span className="shrink-0 text-[12px] text-muted">{fmt.ago(message.receivedAt)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] text-ink-2">{message.summary ?? message.subject}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={message.category} />
          {message.subtype && message.subtype !== "general" ? <span className="text-[11.5px] text-muted">{titleCase(message.subtype)}</span> : null}
          {message.hasAttachments ? <Paperclip className="size-3 text-muted" aria-label="Has attachments" /> : null}
          {message.aiEnriched ? <Sparkles className="size-3 text-accent" aria-label="AI enriched" /> : null}
        </span>
      </span>
    </button>
  );
}

export function MessageSheet({ messageId, onClose }: { messageId: number | null; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const system = useSystem();
  const query = useMessage(messageId);
  const [showBody, setShowBody] = useState(false);
  const [category, setCategory] = useState<Category | "">("");
  const [remember, setRemember] = useState<"none" | "sender" | "domain">("sender");
  const [busy, setBusy] = useState<string | null>(null);
  const m = query.data;
  const reset = () => {
    setShowBody(false);
    setCategory("");
  };
  const act = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(message);
      invalidate();
      await qc.invalidateQueries({ queryKey: ["message", messageId] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      open={messageId !== null}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title={m ? m.subject || "(no subject)" : "Email"}
      subtitle={m ? `${m.fromName ? `${m.fromName} · ` : ""}${m.fromEmail ?? ""} · ${fmt.date(m.receivedAt, "datetime")}` : null}
    >
      {!m ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <VendorMark vendor={m.vendor} name={m.fromName ?? m.fromEmail} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={m.category} />
                {m.subtype && m.subtype !== "general" ? <Badge>{titleCase(m.subtype)}</Badge> : null}
                <Badge tone={m.confidence > 0.75 ? "good" : m.confidence > 0.45 ? "warn" : "neutral"}>{Math.round(m.confidence * 100)}% confident</Badge>
                {m.userCategory ? <Badge tone="info">Filed by you</Badge> : null}
              </div>
              <p className="mt-2 text-[15px] font-medium text-ink">{m.summary}</p>
              {m.analysis.ai?.summary ? (
                <p className="mt-1 flex items-start gap-1.5 text-[13.5px] text-ink-2">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden /> {m.analysis.ai.summary}
                </p>
              ) : null}
              {m.analysis.ai?.action ? <p className="mt-1 text-[13.5px] font-medium text-high">→ {m.analysis.ai.action}</p> : null}
            </div>
          </div>

          <section>
            <h4 className="eyebrow mb-2">Why Adminak filed it here</h4>
            <ul className="space-y-1.5 text-[13.5px] text-ink-2">
              {m.analysis.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </section>

          {m.analysis.amounts.length || m.analysis.dates.length || m.analysis.plan || m.analysis.paymentMethod || m.analysis.cycle ? (
            <section>
              <h4 className="eyebrow mb-2">What it extracted</h4>
              <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
                {m.analysis.amounts.slice(0, 4).map((a, i) => (
                  <div key={`a${i}`} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted">{a.label === "amount" ? "Amount" : titleCase(a.label)}</dt>
                    <dd className="tabular font-medium text-ink">{fmt.money(a.amount, a.currency)}</dd>
                  </div>
                ))}
                {m.analysis.dates.slice(0, 4).map((d, i) => (
                  <div key={`d${i}`} className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted">{d.kind === "unknown" ? "Date" : titleCase(d.kind)}</dt>
                    <dd className="font-medium text-ink">{fmt.date(d.at, d.at.endsWith("T12:00:00.000Z") ? "medium" : "datetime")}</dd>
                  </div>
                ))}
                {m.analysis.cycle ? (
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted">Billing cycle</dt>
                    <dd className="font-medium text-ink capitalize">{m.analysis.cycle}</dd>
                  </div>
                ) : null}
                {m.analysis.plan ? (
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted">Plan</dt>
                    <dd className="font-medium text-ink">{m.analysis.plan}</dd>
                  </div>
                ) : null}
                {m.analysis.paymentMethod ? (
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted">Payment method</dt>
                    <dd className="font-medium text-ink">{m.analysis.paymentMethod}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {m.analysis.links.length || m.analysis.unsubscribeUrl ? (
            <section className="flex flex-wrap gap-2">
              {m.analysis.links.map((l) => (
                <ExternalA key={l.url} href={l.url} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink hover:bg-surface-2">
                  {l.label} <ExternalLink className="size-3.5 text-muted" aria-hidden />
                </ExternalA>
              ))}
              {m.analysis.unsubscribeUrl && /^https:/.test(m.analysis.unsubscribeUrl) ? (
                <ExternalA href={m.analysis.unsubscribeUrl} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                  Unsubscribe <ExternalLink className="size-3.5 text-muted" aria-hidden />
                </ExternalA>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-line p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Tags className="size-4 text-muted" aria-hidden /> Filed wrong? Teach Adminak
            </h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category">
                <option value="">Move to…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </Select>
              <Select value={remember} onChange={(e) => setRemember(e.target.value as typeof remember)} aria-label="Remember">
                <option value="sender">Always for this sender</option>
                <option value="domain">Always for this domain</option>
                <option value="none">Just this email</option>
              </Select>
              <Button
                variant="primary"
                disabled={!category}
                loading={busy === "reclassify"}
                onClick={() => act("reclassify", () => post(`/messages/${m.id}/reclassify`, { category, remember }), "Re-filed — Adminak will remember")}
              >
                Apply
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={BellOff} loading={busy === "mute"} onClick={() => act("mute", () => post(`/messages/${m.id}/mute-sender`, { scope: "sender" }), "Sender muted")}>
                Mute sender
              </Button>
              {system.data?.integrations.ai ? (
                <Button size="sm" variant="outline" icon={Sparkles} loading={busy === "ai"} onClick={() => act("ai", () => post(`/messages/${m.id}/enrich`), "Re-analyzed with AI")}>
                  Re-analyze with AI
                </Button>
              ) : null}
            </div>
          </section>

          {m.attachments.length ? (
            <section>
              <h4 className="eyebrow mb-2">Attachments</h4>
              <ul className="space-y-1 text-sm text-ink-2">
                {m.attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Paperclip className="size-3.5 text-muted" aria-hidden /> {a.filename}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {m.bodyText ? (
            <section>
              <button type="button" onClick={() => setShowBody((s) => !s)} className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm font-semibold text-ink">
                Email text
                <ChevronDown className={cn("size-4 text-muted transition-transform", showBody && "rotate-180")} aria-hidden />
              </button>
              {showBody ? (
                <pre className="mt-2 max-h-[50vh] overflow-auto rounded-2xl bg-surface-2 p-4 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{m.bodyText}</pre>
              ) : null}
            </section>
          ) : (
            <p className="text-[12.5px] text-muted">Email text isn't stored (retention or privacy settings).</p>
          )}
          <p className="text-[12px] text-muted">
            {m.account ? `From mailbox ${m.account.label}` : null}
            {m.labels.length ? ` · ${m.labels.slice(0, 4).join(", ")}` : ""}
          </p>
        </div>
      )}
    </Sheet>
  );
}
