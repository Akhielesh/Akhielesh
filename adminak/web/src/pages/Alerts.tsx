import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, BellRing, Check, CheckCheck, ListChecks, Search, Trash2, X } from "lucide-react";
import { CATEGORY_META } from "@shared/catalog";
import { SEVERITIES, type AlertDTO, type Category, type Severity } from "@shared/types";
import { get, errorMessage } from "../lib/api";
import { actions, useAlertCounts, useAlerts } from "../lib/queries";
import { useDebounced, useTakeParam } from "../lib/hooks";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { AlertRow, AlertSheet } from "../components/alerts";
import { SwipeRow } from "../components/native";
import { PageHeader } from "../components/layout";
import { useToast } from "../components/toast";
import { Button, Card, Chip, ChipRow, EmptyState, Input, SEVERITY_UI, Segmented, Skeleton } from "../components/ui";

type Tab = "open" | "snoozed" | "done" | "all";

function bucketFor(iso: string, fmt: ReturnType<typeof useFmt>): string {
  const days = -fmt.daysUntil(iso);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Older";
}

export function AlertsPage() {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("status") as Tab) || "open";
  const severity = params.get("severity") as Severity | null;
  const category = params.get("category") as Category | null;
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounced = useDebounced(q.trim());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<AlertDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ status: tab, limit: "300" });
    if (severity) p.set("severity", severity);
    if (category) p.set("category", category);
    if (debounced) p.set("q", debounced);
    return p;
  }, [tab, severity, category, debounced]);
  const alerts = useAlerts(query);
  const counts = useAlertCounts();

  // Deep link from notification emails: /alerts?focus=123
  useTakeParam("focus", (value) => {
    get<AlertDTO>(`/alerts/${Number(value)}`)
      .then(setOpen)
      .catch(() => toast.error("That alert no longer exists."));
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["alerts"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };

  const list = alerts.data ?? [];
  const groups = useMemo(() => {
    const out: { label: string; items: AlertDTO[] }[] = [];
    for (const a of list) {
      const label = bucketFor(a.createdAt, fmt);
      const last = out.at(-1);
      if (last?.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [list, fmt]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = async (action: "done" | "read" | "snooze" | "delete") => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(action);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const res = await actions.bulkAlerts({ ids, action, snoozeUntil: action === "snooze" ? tomorrow.toISOString() : undefined });
      toast.success(`${res.changed} alert${res.changed === 1 ? "" : "s"} ${action === "delete" ? "deleted" : action === "snooze" ? "snoozed until tomorrow" : action === "read" ? "marked read" : "done"}`);
      setSelected(new Set());
      setSelecting(false);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const markDone = async (alert: AlertDTO) => {
    try {
      await actions.updateAlert(alert.id, { status: "done" });
      refresh();
      toast.success("Marked as done", {
        label: "Undo",
        onClick: () => {
          void actions.updateAlert(alert.id, { status: "new" }).then(refresh);
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const snoozeTomorrow = async (alert: AlertDTO) => {
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(9, 0, 0, 0);
    try {
      await actions.updateAlert(alert.id, { status: "snoozed", snoozeUntil: until.toISOString() });
      refresh();
      toast.success("Snoozed until tomorrow 9am", {
        label: "Undo",
        onClick: () => {
          void actions.updateAlert(alert.id, { status: alert.status, snoozeUntil: alert.snoozedUntil ?? undefined }).then(refresh);
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const readAll = async () => {
    setBusy("readAll");
    try {
      const res = await actions.readAllAlerts();
      toast.success(res.changed ? `Marked ${res.changed} as read` : "Nothing unread");
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const c = counts.data;
  const openTotal = c ? Object.values(c.bySeverity).reduce((s, n) => s + n, 0) : undefined;
  const categories = c ? (Object.entries(c.byCategory) as [Category, number][]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div>
      <PageHeader
        title="Alerts"
        description={
          <>
            Everything Adminak flagged from your mail: renewals, price changes, bills, security events and more.
            <span className="hidden pointer-coarse:inline"> Swipe a row left to finish it, right to snooze until tomorrow.</span>
          </>
        }
        actions={
          <>
            <Button size="sm" variant="ghost" icon={selecting ? X : ListChecks} onClick={() => (setSelecting((s) => !s), setSelected(new Set()))}>
              {selecting ? "Cancel" : "Select"}
            </Button>
            <Button size="sm" variant="secondary" icon={CheckCheck} loading={busy === "readAll"} onClick={readAll} disabled={!c?.new}>
              Mark all read
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <Segmented
          className="w-full sm:w-auto"
          value={tab}
          onChange={(v) => setParam("status", v === "open" ? null : v)}
          options={[
            { value: "open", label: "Inbox", count: openTotal },
            { value: "snoozed", label: "Snoozed", count: c?.snoozed },
            { value: "done", label: "Done", count: c?.done },
            { value: "all", label: "All" },
          ]}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alerts" className="pl-10" aria-label="Search alerts" type="search" />
        </div>
        <ChipRow>
          <Chip active={!severity} onClick={() => setParam("severity", null)}>
            Any severity
          </Chip>
          {SEVERITIES.filter((s) => s !== "info").map((s) => (
            <Chip key={s} active={severity === s} onClick={() => setParam("severity", severity === s ? null : s)} count={c?.bySeverity[s] || undefined}>
              <span className={cn("size-2 rounded-full", SEVERITY_UI[s].dot)} aria-hidden />
              {SEVERITY_UI[s].label}
            </Chip>
          ))}
        </ChipRow>
        {categories.length > 1 ? (
          <ChipRow>
            <Chip active={!category} onClick={() => setParam("category", null)}>
              All areas
            </Chip>
            {categories.map(([cat, n]) => (
              <Chip key={cat} active={category === cat} onClick={() => setParam("category", category === cat ? null : cat)} count={n}>
                {CATEGORY_META[cat]?.label ?? cat}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
      </div>

      <Card className="mt-4 overflow-hidden">
        {alerts.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={tab === "open" ? Check : BellRing} title={tab === "open" ? "You're all caught up" : "Nothing here"}>
            {tab === "open"
              ? "New renewals, bills, price changes and security events will show up here as Adminak scans your mail."
              : debounced || severity || category
                ? "No alerts match these filters."
                : "Alerts you snooze or finish land here."}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-center justify-between border-b border-line bg-surface-3/80 px-4 py-1.5 sm:px-5">
                <span className="text-[12px] font-semibold tracking-wide text-ink-2 uppercase">{g.label}</span>
                {selecting ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-accent"
                    onClick={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        const all = g.items.every((a) => next.has(a.id));
                        for (const a of g.items) {
                          if (all) next.delete(a.id);
                          else next.add(a.id);
                        }
                        return next;
                      })
                    }
                  >
                    {g.items.every((a) => selected.has(a.id)) ? "Clear" : "Select all"}
                  </button>
                ) : (
                  <span className="tabular text-[11.5px] text-muted">{g.items.length}</span>
                )}
              </div>
              <ul className="divide-y divide-line">
                {g.items.map((a) => (
                  <li key={a.id} className="flex items-stretch">
                    {selecting ? (
                      <label className="flex shrink-0 cursor-pointer items-center pl-4 sm:pl-5">
                        <input type="checkbox" className="size-[18px] accent-[var(--accent)]" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} />
                      </label>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <SwipeRow
                        disabled={selecting || a.status === "done"}
                        leading={{ label: "Tomorrow", icon: AlarmClock, tone: "info", onCommit: () => void snoozeTomorrow(a) }}
                        trailing={{ label: "Done", icon: Check, tone: "good", onCommit: () => void markDone(a) }}
                      >
                        <AlertRow alert={a} onOpen={() => (selecting ? toggle(a.id) : setOpen(a))} onDone={selecting ? undefined : () => void markDone(a)} />
                      </SwipeRow>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>

      {selecting && selected.size > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 px-4 pb-3 lg:bottom-6 lg:left-[248px]">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-2xl" style={{ animation: "toast-in 160ms ease-out" }}>
            <span className="tabular px-2 text-sm font-semibold text-ink">{selected.size}</span>
            <Button size="sm" variant="primary" icon={Check} loading={busy === "done"} onClick={() => void bulk("done")} className="flex-1">
              Done
            </Button>
            <Button size="sm" variant="secondary" icon={AlarmClock} loading={busy === "snooze"} onClick={() => void bulk("snooze")} className="flex-1">
              Snooze
            </Button>
            <Button size="sm" variant="ghost" loading={busy === "read"} onClick={() => void bulk("read")} className="hidden sm:inline-flex">
              Mark read
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} loading={busy === "delete"} onClick={() => void bulk("delete")} aria-label="Delete selected" />
          </div>
        </div>
      ) : null}

      <AlertSheet alert={open} open={!!open} onClose={() => setOpen(null)} />
    </div>
  );
}
