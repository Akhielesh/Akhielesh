import { appUrl } from "../lib/base";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  CircleAlert,
  CircleCheck,
  Clock,
  Eye,
  FileText,
  Hash,
  Mail,
  MessageCircle,
  Monitor,
  Plus,
  Send,
  Smartphone,
  Trash2,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { ALERT_TYPES, CATEGORY_META } from "@shared/catalog";
import { SEVERITIES, type ChannelDTO, type ChannelEvents, type ChannelType, type Settings, type Severity } from "@shared/types";
import { del, errorMessage, get, patch, post } from "../lib/api";
import { useChannels, useNotificationLog, useSettings, useSettingsMutation, useTemplates, type ChannelsResponse } from "../lib/queries";
import { enablePush, isIos, isStandalone, pushSupported } from "../lib/push";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { Sheet } from "../components/sheet";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, SEVERITY_UI, Segmented, Select, Skeleton, Switch } from "../components/ui";

type Tab = "channels" | "schedule" | "types" | "templates" | "log";

const CHANNEL_UI: Record<ChannelType, { label: string; icon: LucideIcon; blurb: string }> = {
  email: { label: "Email", icon: Mail, blurb: "Instant alerts, the daily brief and weekly/monthly reports in your inbox." },
  push: { label: "Push", icon: Smartphone, blurb: "Native notifications on this phone or computer." },
  ntfy: { label: "ntfy", icon: BellRing, blurb: "Free push to the ntfy app on iOS/Android via a private topic." },
  slack: { label: "Slack", icon: Hash, blurb: "Post to a channel through an incoming webhook." },
  discord: { label: "Discord", icon: MessageCircle, blurb: "Post to a channel through a Discord webhook." },
  telegram: { label: "Telegram", icon: Send, blurb: "Messages from your own Telegram bot." },
  webhook: { label: "Webhook", icon: Webhook, blurb: "Signed JSON to Zapier, Make, n8n, Home Assistant or your own code." },
};

const EVENT_LABEL: Record<keyof ChannelEvents, string> = { instant: "Instant alerts", digest: "Daily brief", weekly: "Weekly", monthly: "Monthly", system: "System" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ChannelCard({ channel }: { channel: ChannelDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fmt = useFmt();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ui = CHANNEL_UI[channel.type];
  const update = async (body: Partial<{ enabled: boolean; minSeverity: Severity; events: Partial<ChannelEvents> }>) => {
    try {
      await patch(`/channels/${channel.id}`, body);
      await qc.invalidateQueries({ queryKey: ["channels"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const res = await post<{ ok: boolean; error?: string; note?: string }>(`/channels/${channel.id}/test`);
      if (res.ok) toast.success(channel.type === "email" ? "Test email sent — check your inbox" : "Test sent");
      else toast.error(res.error ?? "Test failed");
      await qc.invalidateQueries({ queryKey: ["channels"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await del(`/channels/${channel.id}`);
      await qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel removed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className={cn("p-4 sm:p-5", !channel.enabled && "opacity-75")}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
          <ui.icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">{channel.name}</div>
          <div className="truncate text-[13px] text-muted">
            {ui.label}
            {channel.target ? ` · ${channel.target}` : ""}
          </div>
        </div>
        <Switch checked={channel.enabled} onChange={(v) => void update({ enabled: v })} />
      </div>
      {channel.lastError ? (
        channel.lastError.startsWith("No SMTP configured") ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-med-soft px-3 py-2 text-[12.5px] text-med">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Held in the server outbox until email delivery is set up.
          </p>
        ) : (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {channel.lastError}
          </p>
        )
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center">
        <label className="text-[13px] text-ink-2" htmlFor={`sev-${channel.id}`}>
          Instant alerts from
        </label>
        <Select id={`sev-${channel.id}`} value={channel.minSeverity} onChange={(e) => void update({ minSeverity: e.target.value as Severity })} className="h-9">
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_UI[s].label}
              {s === "info" ? " (everything)" : " and above"}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(EVENT_LABEL) as (keyof ChannelEvents)[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={channel.events[k]}
            onClick={() => void update({ events: { [k]: !channel.events[k] } })}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
              channel.events[k] ? "border-transparent bg-good-soft text-good" : "border-line text-muted line-through decoration-1",
            )}
          >
            {channel.events[k] ? <CircleCheck className="size-3" aria-hidden /> : null}
            {EVENT_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-[12px] text-muted">{channel.lastUsedAt ? `Last sent ${fmt.ago(channel.lastUsedAt)}` : "Not used yet"}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Send} loading={busy === "test"} onClick={() => void test()} disabled={!channel.enabled}>
            Test
          </Button>
          {confirm ? (
            <Button size="sm" variant="danger" loading={busy === "delete"} onClick={() => void remove()}>
              Remove
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)} aria-label="Remove channel" />
          )}
        </div>
      </div>
    </Card>
  );
}

function AddChannelSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: ChannelsResponse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<ChannelType>("email");
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({});
  }, [open, type]);
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const configFor = (): Record<string, unknown> => {
    switch (type) {
      case "email":
        return { to: f.to?.trim() };
      case "ntfy":
        return { url: f.url?.trim(), token: f.token?.trim() || undefined };
      case "telegram":
        return { botToken: f.botToken?.trim(), chatId: f.chatId?.trim() };
      case "webhook":
        return { url: f.url?.trim(), secret: f.secret?.trim() || undefined };
      default:
        return { url: f.url?.trim() };
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (type === "push") {
        await enablePush(data.pushPublicKey);
      } else {
        await post("/channels", { type, name: f.name?.trim() || undefined, config: configFor() });
      }
      await qc.invalidateQueries({ queryKey: ["channels"] });
      toast.success(`${CHANNEL_UI[type].label} connected — send a test to check it`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const pushHelp = !pushSupported()
    ? isIos() && !isStandalone()
      ? "On iPhone: tap Share → Add to Home Screen, open Adminak from your Home Screen, then enable push here."
      : "This browser doesn't support web push."
    : "Your browser will ask for permission. Each device you enable becomes its own channel.";
  return (
    <Sheet open={open} onClose={onClose} title="Add a notification channel">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(CHANNEL_UI) as ChannelType[]).map((t) => {
            const ui = CHANNEL_UI[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-[12px] font-medium", type === t ? "border-transparent bg-primary text-primary-ink" : "border-line text-ink-2 hover:bg-surface-2")}
              >
                <ui.icon className="size-5" aria-hidden />
                {ui.label}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-muted">{CHANNEL_UI[type].blurb}</p>
        {type === "push" ? (
          <p className="rounded-xl bg-low-soft px-3 py-2 text-[13px] text-low">{pushHelp}</p>
        ) : (
          <>
            {type === "email" ? (
              <Field label="Send to" htmlFor="c-to" hint={data.email.configured ? `Delivered via ${data.email.transport}.` : "No mail server yet — emails go to the local outbox until you set SMTP or connect Gmail with send access."}>
                <Input id="c-to" type="email" required value={f.to ?? ""} onChange={set("to")} placeholder="you@personal.com" />
              </Field>
            ) : null}
            {type === "ntfy" ? (
              <>
                <Field label="Topic URL" htmlFor="c-url" hint="Pick a long, unguessable topic name — anyone who knows it can read it.">
                  <Input id="c-url" type="url" required value={f.url ?? ""} onChange={set("url")} placeholder="https://ntfy.sh/adminak-7f3k2x9q" />
                </Field>
                <Field label="Access token (optional)" htmlFor="c-token">
                  <Input id="c-token" value={f.token ?? ""} onChange={set("token")} />
                </Field>
              </>
            ) : null}
            {type === "slack" || type === "discord" ? (
              <Field label="Webhook URL" htmlFor="c-url" hint={type === "slack" ? "Slack → Apps → Incoming Webhooks → Add to channel." : "Channel settings → Integrations → Webhooks → New webhook."}>
                <Input id="c-url" type="url" required value={f.url ?? ""} onChange={set("url")} placeholder={type === "slack" ? "https://hooks.slack.com/services/…" : "https://discord.com/api/webhooks/…"} />
              </Field>
            ) : null}
            {type === "telegram" ? (
              <>
                <Field label="Bot token" htmlFor="c-bot" hint="Create a bot with @BotFather and paste its token.">
                  <Input id="c-bot" required value={f.botToken ?? ""} onChange={set("botToken")} placeholder="123456:ABC-DEF…" />
                </Field>
                <Field label="Chat ID" htmlFor="c-chat" hint="Message your bot once, then get your ID from @userinfobot.">
                  <Input id="c-chat" required value={f.chatId ?? ""} onChange={set("chatId")} />
                </Field>
              </>
            ) : null}
            {type === "webhook" ? (
              <>
                <Field label="URL" htmlFor="c-url">
                  <Input id="c-url" type="url" required value={f.url ?? ""} onChange={set("url")} placeholder="https://hooks.zapier.com/…" />
                </Field>
                <Field label="Signing secret (optional)" htmlFor="c-secret" hint="Requests include X-Adminak-Signature: sha256=HMAC(body).">
                  <Input id="c-secret" value={f.secret ?? ""} onChange={set("secret")} />
                </Field>
              </>
            ) : null}
            <Field label="Name (optional)" htmlFor="c-name">
              <Input id="c-name" value={f.name ?? ""} onChange={set("name")} placeholder={CHANNEL_UI[type].label} />
            </Field>
          </>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={type === "push" && !pushSupported()}>
          {type === "push" ? "Enable push on this device" : "Add channel"}
        </Button>
      </form>
    </Sheet>
  );
}

function ChannelsTab() {
  const channels = useChannels();
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const data = channels.data;
  const sendNow = async (kind: "digest" | "weekly" | "monthly") => {
    setBusy(kind);
    try {
      const res = await post<{ sent: number; channels: number }>("/notifications/send", { kind });
      toast[res.sent ? "success" : "error"](res.sent ? `Sent to ${res.sent} channel${res.sent === 1 ? "" : "s"}` : "No channel accepts this report — turn it on for a channel below");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const smtpCheck = async () => {
    setBusy("smtp");
    try {
      const res = await post<{ ok: boolean; error?: string }>("/notifications/smtp-check");
      toast[res.ok ? "success" : "error"](res.ok ? "SMTP connection verified" : `SMTP: ${res.error}`);
    } finally {
      setBusy(null);
    }
  };
  if (!data) return <Skeleton className="h-64" />;
  const outbox = data.email.transport === "outbox";
  return (
    <div className="space-y-4">
      <Card className={cn("p-4 sm:p-5", outbox && "border-med/40")}>
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", outbox ? "bg-med-soft text-med" : "bg-good-soft text-good")}>
            {outbox ? <CircleAlert className="size-5" aria-hidden /> : <CircleCheck className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{outbox ? "Email delivery isn't set up yet" : "Email delivery is ready"}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {outbox ? (
                <>
                  Emails are being saved to the server's <code className="rounded bg-surface-2 px-1">outbox/</code> folder. Set <code className="rounded bg-surface-2 px-1">SMTP_*</code> variables (Gmail, iCloud, Fastmail, Resend, Postmark…) or connect Gmail with “Send my alerts” on.
                </>
              ) : (
                <>Sending through {data.email.transport}.</>
              )}
            </p>
          </div>
          {data.email.smtp ? (
            <Button size="sm" variant="ghost" loading={busy === "smtp"} onClick={() => void smtpCheck()}>
              Verify
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex items-center justify-between px-1">
        <h3 className="eyebrow">Channels</h3>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          Add channel
        </Button>
      </div>
      {data.channels.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.channels.map((c) => (
            <ChannelCard key={c.id} channel={c} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={BellRing} title="No channels" action={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add your email</Button>}>
            Add your personal email so Adminak can reach you.
          </EmptyState>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-ink">Send a report now</h2>
        <p className="mt-0.5 text-[13px] text-muted">Delivers to every enabled channel that receives that report.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button loading={busy === "digest"} onClick={() => void sendNow("digest")}>
            Daily brief
          </Button>
          <Button loading={busy === "weekly"} onClick={() => void sendNow("weekly")}>
            Weekly
          </Button>
          <Button loading={busy === "monthly"} onClick={() => void sendNow("monthly")}>
            Monthly
          </Button>
        </div>
      </Card>
      <AddChannelSheet open={adding} onClose={() => setAdding(false)} data={data} />
    </div>
  );
}

function ScheduleTab({ settings }: { settings: Settings }) {
  const mutation = useSettingsMutation();
  const toast = useToast();
  const [n, setN] = useState(settings.notifications);
  useEffect(() => setN(settings.notifications), [settings.notifications]);
  const dirty = JSON.stringify(n) !== JSON.stringify(settings.notifications);
  const save = () =>
    mutation.mutate(
      { notifications: { ...n, largeTransactionThreshold: Number(n.largeTransactionThreshold) || 0 } },
      { onSuccess: () => toast.success("Notification schedule saved"), onError: (e) => toast.error(errorMessage(e)) },
    );
  const reminder = (key: keyof Settings["notifications"]["reminders"], label: string, hint: string) => (
    <Field label={label} htmlFor={`rem-${key}`} hint={hint}>
      <Input
        id={`rem-${key}`}
        type="number"
        min={0}
        max={60}
        value={n.reminders[key]}
        onChange={(e) => setN({ ...n, reminders: { ...n.reminders, [key]: Math.max(0, Number(e.target.value) || 0) } })}
      />
    </Field>
  );
  return (
    <div className="space-y-4 pb-20">
      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Instant alerts" icon={BellRing} flush />
        <Field label="Send immediately when an alert is" htmlFor="n-min" hint="Lower-severity alerts wait for the daily brief. Each channel can be stricter.">
          <Select id="n-min" value={n.instantMinSeverity} onChange={(e) => setN({ ...n, instantMinSeverity: e.target.value as Severity | "off" })}>
            <option value="off">Off — briefs and reports only</option>
            {SEVERITIES.filter((s) => s !== "info").map((s) => (
              <option key={s} value={s}>
                {SEVERITY_UI[s].label}
                {s !== "critical" ? " or higher" : " only"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={n.quietHours.enabled} onChange={(v) => setN({ ...n, quietHours: { ...n.quietHours, enabled: v } })} label="Quiet hours" description="Hold instant alerts overnight. Critical ones (fraud, failed payments) still come through." />
          {n.quietHours.enabled ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="From" htmlFor="qh-start">
                <Input id="qh-start" type="time" value={n.quietHours.start} onChange={(e) => setN({ ...n, quietHours: { ...n.quietHours, start: e.target.value } })} />
              </Field>
              <Field label="Until" htmlFor="qh-end">
                <Input id="qh-end" type="time" value={n.quietHours.end} onChange={(e) => setN({ ...n, quietHours: { ...n.quietHours, end: e.target.value } })} />
              </Field>
            </div>
          ) : null}
        </div>
        <Field label="Large transaction threshold" htmlFor="n-large" hint="Charges at or above this amount raise a high-severity alert.">
          <Input id="n-large" type="number" min={0} value={n.largeTransactionThreshold} onChange={(e) => setN({ ...n, largeTransactionThreshold: Number(e.target.value) })} />
        </Field>
        <Switch checked={n.loginAlerts} onChange={(v) => setN({ ...n, loginAlerts: v })} label="Email me when someone signs in to Adminak from a new IP" />
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Briefs & reports" icon={Clock} flush />
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={n.digest.enabled} onChange={(v) => setN({ ...n, digest: { ...n.digest, enabled: v } })} label="Daily brief" description="Today's agenda, what's due, new alerts and spending." />
          {n.digest.enabled ? (
            <div className="mt-3 max-w-40">
              <Input type="time" aria-label="Daily brief time" value={n.digest.time} onChange={(e) => setN({ ...n, digest: { ...n.digest, time: e.target.value } })} />
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={n.weekly.enabled} onChange={(v) => setN({ ...n, weekly: { ...n.weekly, enabled: v } })} label="Weekly review" description="Spending vs last week, renewals ahead and open loops." />
          {n.weekly.enabled ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Select aria-label="Weekly day" value={n.weekly.day} onChange={(e) => setN({ ...n, weekly: { ...n.weekly, day: Number(e.target.value) } })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </Select>
              <Input type="time" aria-label="Weekly time" value={n.weekly.time} onChange={(e) => setN({ ...n, weekly: { ...n.weekly, time: e.target.value } })} />
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={n.monthly.enabled} onChange={(v) => setN({ ...n, monthly: { ...n.monthly, enabled: v } })} label="Monthly report" description="On the 1st: spend by category, subscriptions, income and savings ideas." />
          {n.monthly.enabled ? (
            <div className="mt-3 max-w-40">
              <Input type="time" aria-label="Monthly time" value={n.monthly.time} onChange={(e) => setN({ ...n, monthly: { ...n.monthly, time: e.target.value } })} />
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Reminder timing" icon={BellRing} eyebrow="Days before" flush />
        <div className="grid grid-cols-2 gap-3">
          {reminder("renewalDays", "Renewals", "monthly & weekly plans")}
          {reminder("annualRenewalDays", "Annual renewals", "yearly plans")}
          {reminder("trialDays", "Trials ending", "before conversion")}
          {reminder("billDays", "Bills due", "before the due date")}
        </div>
      </Card>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 px-4 pb-3 lg:bottom-6 lg:left-[248px]">
          <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
            <span className="flex-1 px-2 text-sm text-ink-2">Unsaved changes</span>
            <Button size="sm" variant="ghost" onClick={() => setN(settings.notifications)}>
              Discard
            </Button>
            <Button size="sm" variant="primary" loading={mutation.isPending} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TypesTab({ settings }: { settings: Settings }) {
  const mutation = useSettingsMutation();
  const toast = useToast();
  const overrides = settings.notifications.typeOverrides;
  const groups = useMemo(() => {
    const map = new Map<string, [string, (typeof ALERT_TYPES)[string]][]>();
    for (const entry of Object.entries(ALERT_TYPES)) {
      const key = entry[1].category;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()];
  }, []);
  const set = (type: string, value: { enabled?: boolean; severity?: Severity }) => {
    const current = { ...overrides[type], ...value };
    const meta = ALERT_TYPES[type]!;
    const clean: { enabled?: boolean; severity?: Severity } = {};
    if (current.enabled === false) clean.enabled = false;
    if (current.severity && current.severity !== meta.severity) clean.severity = current.severity;
    const next = { ...overrides };
    if (Object.keys(clean).length) next[type] = clean;
    else delete next[type];
    mutation.mutate({ notifications: { typeOverrides: next } }, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <div className="space-y-4">
      <p className="px-1 text-[13.5px] text-muted">Turn off alert types you don't care about, or change how urgent they are. Severity decides what's instant vs. saved for the brief.</p>
      {groups.map(([category, types]) => (
        <Card key={category} className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="text-[14px] font-semibold text-ink">{CATEGORY_META[category as keyof typeof CATEGORY_META]?.label ?? category}</h2>
          </div>
          <ul className="divide-y divide-line">
            {types.map(([type, meta]) => {
              const o = overrides[type] ?? {};
              const enabled = o.enabled !== false;
              const severity = o.severity ?? meta.severity;
              return (
                <li key={type} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", !enabled && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-ink">{meta.label}</div>
                    <div className="text-[12.5px] text-muted">{meta.description}</div>
                  </div>
                  <Select value={severity} onChange={(e) => set(type, { severity: e.target.value as Severity })} disabled={!enabled} className="h-9 w-[118px] shrink-0 text-[13px]" aria-label={`${meta.label} severity`}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_UI[s].label}
                      </option>
                    ))}
                  </Select>
                  <Switch checked={enabled} onChange={(v) => set(type, { enabled: v })} />
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function TemplatesTab() {
  const templates = useTemplates();
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"phone" | "desktop" | "text">("phone");
  const [text, setText] = useState<string>("");
  const current = templates.data?.find((t) => t.id === open);
  useEffect(() => {
    if (open && mode === "text") void get<string>(`/templates/${open}/preview?format=text`).then(setText).catch(() => setText("Couldn't load the text version."));
  }, [open, mode]);
  return (
    <div className="space-y-3">
      <p className="px-1 text-[13.5px] text-muted">These are the emails Adminak sends you, rendered with sample data. All are mobile-first, work in dark mode, and include a plain-text version.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)
          : templates.data?.map((t) => (
              <button key={t.id} type="button" onClick={() => setOpen(t.id)} className="card flex flex-col items-start p-4 text-left transition-colors hover:border-line-strong">
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">{t.name}</span>
                  <Eye className="size-4 text-muted" aria-hidden />
                </span>
                <span className="mt-1 text-[12.5px] text-muted">{t.description}</span>
                <span className="mt-3 w-full truncate rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-ink-2">{t.subject}</span>
              </button>
            ))}
      </div>
      <Sheet
        open={!!current}
        onClose={() => setOpen(null)}
        wide
        title={current?.name}
        subtitle={current?.subject}
        headerAction={
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "phone", label: <Smartphone className="size-4" aria-label="Phone" /> },
              { value: "desktop", label: <Monitor className="size-4" aria-label="Desktop" /> },
              { value: "text", label: <FileText className="size-4" aria-label="Plain text" /> },
            ]}
          />
        }
      >
        {current ? (
          mode === "text" ? (
            <pre className="rounded-2xl bg-surface-2 p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{text}</pre>
          ) : (
            <div className="flex justify-center rounded-2xl bg-surface-2 p-2 sm:p-4">
              <iframe
                key={current.id}
                title={`${current.name} preview`}
                src={appUrl(`/api/templates/${current.id}/preview`)}
                sandbox=""
                className={cn("h-[70dvh] rounded-xl border border-line bg-white", mode === "phone" ? "w-[375px] max-w-full" : "w-full")}
              />
            </div>
          )
        ) : null}
      </Sheet>
    </div>
  );
}

function LogTab() {
  const log = useNotificationLog();
  const fmt = useFmt();
  const list = log.data ?? [];
  return (
    <Card className="overflow-hidden">
      {log.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Send} title="Nothing sent yet">
          Every alert, brief and report Adminak delivers is logged here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.status === "sent" ? "bg-good" : n.status === "failed" ? "bg-crit" : n.status === "pending" ? "bg-med" : "bg-muted")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-ink">{n.subject}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  <Badge tone={n.status === "sent" ? "good" : n.status === "failed" ? "bad" : "neutral"}>{n.status === "sent" ? "Sent" : n.status === "failed" ? "Failed" : n.status === "pending" ? `Retrying (${n.attempts})` : "Skipped"}</Badge>
                  <span className="capitalize">{n.kind}</span>
                  <span aria-hidden>·</span>
                  <span>{n.channelName ?? n.channelType}</span>
                  <span aria-hidden>·</span>
                  <span>{fmt.date(n.sentAt ?? n.createdAt, "datetime")}</span>
                </div>
                {n.error ? <div className="mt-1 text-[12px] text-crit">{n.error}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NotificationsPage() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "channels";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "channels") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" description="Where alerts go, when briefs and reports arrive, and exactly what the emails look like." />
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "channels", label: "Channels" },
            { value: "schedule", label: "Schedule" },
            { value: "types", label: "Alert types" },
            { value: "templates", label: "Emails" },
            { value: "log", label: "Log" },
          ]}
        />
      </div>
      {tab === "channels" ? (
        <ChannelsTab />
      ) : tab === "schedule" ? (
        settings.data ? <ScheduleTab settings={settings.data} /> : <Skeleton className="h-64" />
      ) : tab === "types" ? (
        settings.data ? <TypesTab settings={settings.data} /> : <Skeleton className="h-64" />
      ) : tab === "templates" ? (
        <TemplatesTab />
      ) : (
        <LogTab />
      )}
    </div>
  );
}
