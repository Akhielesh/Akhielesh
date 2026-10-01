import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Check, ExternalLink, Mail, RotateCcw, Trash2 } from "lucide-react";
import { ALERT_TYPES, CATEGORY_META } from "@shared/catalog";
import type { AlertDTO } from "@shared/types";
import { actions } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { errorMessage } from "../lib/api";
import { cn } from "../lib/utils";
import { MessageSheet } from "./message";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { Badge, Button, ExternalA, SEVERITY_UI, SeverityBadge, SeverityIcon } from "./ui";

export function DueChip({ iso }: { iso: string | null }) {
  const fmt = useFmt();
  if (!iso) return null;
  const days = fmt.daysUntil(iso);
  const tone = days < 0 ? "bad" : days <= 1 ? "high" : days <= 3 ? "warn" : "neutral";
  return (
    <Badge tone={tone} icon={AlarmClock}>
      {fmt.day(iso)}
    </Badge>
  );
}

export function AlertRow({ alert, onOpen, onDone, compact }: { alert: AlertDTO; onOpen: () => void; onDone?: () => void; compact?: boolean }) {
  const fmt = useFmt();
  const unread = alert.status === "new";
  return (
    <div className={cn("group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5", alert.status === "done" && "opacity-60")}>
      <SeverityIcon severity={alert.severity} className="mt-0.5" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-start gap-2">
          <span className={cn("min-w-0 flex-1 text-[14.5px] leading-snug", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>{alert.title}</span>
          {unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
        </div>
        {!compact && alert.body ? <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{alert.body}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className={SEVERITY_UI[alert.severity].text}>{SEVERITY_UI[alert.severity].label}</span>
          <span aria-hidden>·</span>
          <span>{ALERT_TYPES[alert.type]?.label ?? CATEGORY_META[alert.category]?.label}</span>
          <span aria-hidden>·</span>
          <span>{fmt.ago(alert.createdAt)}</span>
          {alert.dueAt ? <DueChip iso={alert.dueAt} /> : null}
          {alert.status === "snoozed" && alert.snoozedUntil ? <Badge tone="info">Snoozed · {fmt.date(alert.snoozedUntil, "datetime")}</Badge> : null}
        </div>
      </button>
      {onDone && alert.status !== "done" ? (
        <button
          type="button"
          onClick={onDone}
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted opacity-100 hover:bg-good-soft hover:text-good sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          aria-label="Mark done"
          title="Mark done"
        >
          <Check className="size-[18px]" />
        </button>
      ) : null}
    </div>
  );
}

function snoozeTimes(): { label: string; at: Date }[] {
  const now = new Date();
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const laterToday = new Date(now.getTime() + 3 * 3600_000);
  const nextMonday = at(((8 - now.getDay()) % 7) || 7, 9);
  return [
    { label: "3 hours", at: laterToday },
    { label: "Tomorrow 9am", at: at(1, 9) },
    { label: "In 3 days", at: at(3, 9) },
    { label: "Next week", at: nextMonday },
  ];
}

export function AlertSheet({ alert, open, onClose }: { alert: AlertDTO | null; open: boolean; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [messageId, setMessageId] = useState<number | null>(null);
  const [showSnooze, setShowSnooze] = useState(false);
  if (!alert) return null;
  const meta = ALERT_TYPES[alert.type];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["alerts"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      refresh();
      toast.success(message);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const amountFact = alert.facts.find((f) => /amount|price|then/i.test(f.label));
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <span className="text-[13px] font-medium text-muted">{meta?.label ?? "Alert"}</span>
          </span>
        }
        footer={
          <div className="flex flex-wrap gap-2">
            {alert.status !== "done" ? (
              <Button variant="primary" icon={Check} loading={busy === "done"} onClick={() => run("done", () => actions.updateAlert(alert.id, { status: "done" }), "Marked as done")} className="flex-1">
                Done
              </Button>
            ) : (
              <Button variant="secondary" icon={RotateCcw} loading={busy === "reopen"} onClick={() => run("reopen", () => actions.updateAlert(alert.id, { status: "new" }), "Reopened")} className="flex-1">
                Reopen
              </Button>
            )}
            <Button variant="secondary" icon={AlarmClock} onClick={() => setShowSnooze((s) => !s)} className="flex-1">
              Snooze
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete alert" onClick={() => run("delete", () => actions.bulkAlerts({ ids: [alert.id], action: "delete" }), "Alert deleted")}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        }
      >
        <h3 className="text-[19px] leading-snug font-semibold text-ink">{alert.title}</h3>
        {alert.body ? <p className="mt-2 text-[14.5px] text-ink-2">{alert.body}</p> : null}

        {alert.dueAt || amountFact ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {amountFact ? (
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <div className="eyebrow">{amountFact.label}</div>
                <div className="tabular mt-1 text-[22px] font-semibold text-ink">{amountFact.value}</div>
              </div>
            ) : null}
            {alert.dueAt ? (
              <div className="rounded-2xl bg-surface-2 p-3.5">
                <div className="eyebrow">When</div>
                <div className={cn("mt-1 text-[18px] font-semibold", fmt.daysUntil(alert.dueAt) <= 1 ? SEVERITY_UI.high.text : "text-ink")}>{fmt.day(alert.dueAt)}</div>
                <div className="text-[12.5px] text-muted">{fmt.date(alert.dueAt, alert.dueAt.endsWith("T12:00:00.000Z") ? "long" : "datetime")}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {showSnooze ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {snoozeTimes().map((s) => (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                loading={busy === s.label}
                onClick={() => run(s.label, () => actions.updateAlert(alert.id, { status: "snoozed", snoozeUntil: s.at.toISOString() }), `Snoozed until ${s.at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        ) : null}

        {alert.facts.length ? (
          <dl className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {alert.facts.map((f) => (
              <div key={f.label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-muted">{f.label}</dt>
                <dd className="text-right font-medium break-words text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {alert.actionUrl ? (
            <ExternalA href={alert.actionUrl} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink">
              {alert.actionLabel ?? "Open"} <ExternalLink className="size-4" aria-hidden />
            </ExternalA>
          ) : null}
          {alert.message ? (
            <button type="button" onClick={() => setMessageId(alert.message!.id)} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-left hover:bg-surface-2">
              <Mail className="size-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{alert.message.subject}</span>
                <span className="block truncate text-[12.5px] text-muted">
                  {alert.message.fromName ?? alert.message.fromEmail} · {fmt.date(alert.message.receivedAt, "datetime")}
                </span>
              </span>
            </button>
          ) : null}
        </div>
        <p className="mt-4 text-[12px] text-muted">
          Created {fmt.date(alert.createdAt, "datetime")}
          {alert.notifiedAt ? ` · notified ${fmt.ago(alert.notifiedAt)}` : ""}. {meta?.description ?? ""}
        </p>
      </Sheet>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </>
  );
}
