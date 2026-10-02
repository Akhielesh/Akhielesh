import { appUrl } from "../lib/base";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, Copy, Database, Download, KeyRound, LogOut, Monitor, Moon, ScanSearch, ShieldCheck, Smartphone, SquareTerminal, Sun, Trash2, UserRound } from "lucide-react";
import { titleCase } from "@shared/format";
import type { Settings } from "@shared/types";
import { del, errorMessage, post, patch } from "../lib/api";
import { useAgentActivity, useAudit, useAuthState, useSessions, useSettings, useSettingsMutation, useSystem, useInvalidateData } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { useTheme, type ThemePref } from "../lib/theme";
import { cn, copyText } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, Field, Input, Segmented, Select, Skeleton, Switch, Textarea } from "../components/ui";

type Tab = "general" | "security" | "ai" | "data" | "system";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "CHF", "AED", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "HKD", "KRW"];

function useSectionDraft<K extends keyof Settings>(settings: Settings, key: K) {
  const [draft, setDraft] = useState(settings[key]);
  useEffect(() => setDraft(settings[key]), [settings, key]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings[key]);
  return [draft, setDraft, dirty] as const;
}

function SaveRow({ dirty, busy, onSave, onReset }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="flex justify-end gap-2 border-t border-line pt-4">
      <Button size="sm" variant="ghost" onClick={onReset}>
        Discard
      </Button>
      <Button size="sm" variant="primary" loading={busy} onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

function GeneralTab({ settings }: { settings: Settings }) {
  const mutation = useSettingsMutation();
  const toast = useToast();
  const auth = useAuthState();
  const qc = useQueryClient();
  const [profile, setProfile, profileDirty] = useSectionDraft(settings, "profile");
  const [scanning, setScanning, scanningDirty] = useSectionDraft(settings, "scanning");
  const [gmail, setGmail, gmailDirty] = useSectionDraft(settings, "gmail");
  const [ignore, setIgnore] = useState(settings.scanning.ignoreSenders.join("\n"));
  const [email, setEmail] = useState(auth.data?.user?.email ?? "");
  const [theme, setTheme] = useTheme();
  useEffect(() => setIgnore(settings.scanning.ignoreSenders.join("\n")), [settings.scanning.ignoreSenders]);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return [profile.timezone];
    }
  }, [profile.timezone]);
  const save = (patchBody: Parameters<typeof mutation.mutate>[0], message: string) =>
    mutation.mutate(patchBody, { onSuccess: () => toast.success(message), onError: (e) => toast.error(errorMessage(e)) });
  const ignoreList = ignore
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const ignoreDirty = JSON.stringify(ignoreList) !== JSON.stringify(settings.scanning.ignoreSenders);
  const saveEmail = async () => {
    try {
      await patch("/me/profile", { email });
      await qc.invalidateQueries({ queryKey: ["auth"] });
      toast.success("Sign-in email updated");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Profile" icon={UserRound} flush />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name">
            <Input id="p-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Sign-in email" htmlFor="p-email">
            <div className="flex gap-2">
              <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {email && email !== auth.data?.user?.email ? (
                <Button variant="primary" onClick={() => void saveEmail()}>
                  Save
                </Button>
              ) : null}
            </div>
          </Field>
          <Field label="Time zone" htmlFor="p-tz" hint="Due dates, quiet hours and report times use this.">
            <Select id="p-tz" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Home currency" htmlFor="p-cur" hint="Totals and charts are shown in this currency.">
            <Select id="p-cur" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}>
              {[...new Set([profile.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <SaveRow dirty={profileDirty} busy={mutation.isPending} onReset={() => setProfile(settings.profile)} onSave={() => save({ profile }, "Profile saved")} />
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Scanning" icon={ScanSearch} flush />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Check for new mail every" htmlFor="s-int" hint="minutes">
            <Input id="s-int" type="number" min={1} max={1440} value={scanning.intervalMinutes} onChange={(e) => setScanning({ ...scanning, intervalMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Import history" htmlFor="s-back" hint="days, for new mailboxes">
            <Input id="s-back" type="number" min={1} max={3650} value={scanning.backfillDays} onChange={(e) => setScanning({ ...scanning, backfillDays: Number(e.target.value) })} />
          </Field>
          <Field label="History cap" htmlFor="s-max" hint="emails per mailbox">
            <Input id="s-max" type="number" min={50} max={50000} value={scanning.maxBackfillMessages} onChange={(e) => setScanning({ ...scanning, maxBackfillMessages: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <Switch checked={scanning.storeBodies} onChange={(v) => setScanning({ ...scanning, storeBodies: v })} label="Keep email text" description="Needed for search and re-analysis. Off = only extracted facts are kept." />
          {scanning.storeBodies ? (
            <Field label="Delete email text after" htmlFor="s-ret" hint="days (extracted facts are kept forever)">
              <Input id="s-ret" type="number" min={7} max={3650} value={scanning.bodyRetentionDays} onChange={(e) => setScanning({ ...scanning, bodyRetentionDays: Number(e.target.value) })} className="max-w-40" />
            </Field>
          ) : null}
        </div>
        <SaveRow dirty={scanningDirty} busy={mutation.isPending} onReset={() => setScanning(settings.scanning)} onSave={() => save({ scanning: { ...scanning, ignoreSenders: settings.scanning.ignoreSenders } }, "Scanning settings saved")} />
        <Field label="Never analyze mail from" htmlFor="s-ignore" hint="One address or @domain per line. Messages are skipped entirely.">
          <Textarea id="s-ignore" value={ignore} onChange={(e) => setIgnore(e.target.value)} placeholder={"@spammy-shop.com\nnoreply@social.example"} className="font-mono text-[13px]" />
        </Field>
        <SaveRow dirty={ignoreDirty} busy={mutation.isPending} onReset={() => setIgnore(settings.scanning.ignoreSenders.join("\n"))} onSave={() => save({ scanning: { ignoreSenders: ignoreList } }, "Ignore list saved")} />
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <CardHeader title="Gmail labels" icon={ScanSearch} flush />
        <Switch checked={gmail.applyLabels} onChange={(v) => setGmail({ ...gmail, applyLabels: v })} label="Label classified mail in Gmail" description="Requires a Gmail mailbox connected with label permission." />
        <Field label="Label prefix" htmlFor="g-prefix" hint={`Labels look like ${gmail.labelPrefix || "Adminak"}/Subscriptions.`}>
          <Input id="g-prefix" value={gmail.labelPrefix} onChange={(e) => setGmail({ ...gmail, labelPrefix: e.target.value })} className="max-w-60" />
        </Field>
        <SaveRow dirty={gmailDirty} busy={mutation.isPending} onReset={() => setGmail(settings.gmail)} onSave={() => save({ gmail }, "Gmail settings saved")} />
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHeader title="Appearance" icon={Sun} flush />
        <p className="mt-1 text-[13px] text-muted">Shared with akhielesh.com — pick a theme on either and both follow.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["system", "System", Monitor],
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["crt", "CRT", SquareTerminal],
            ] as [ThemePref, string, typeof Sun][]
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={cn("flex h-11 items-center justify-center gap-2 rounded-full border text-[13.5px] font-medium", theme === value ? "border-transparent bg-primary text-primary-ink" : "border-line text-ink-2 hover:bg-surface-2")}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TwoFactor() {
  const auth = useAuthState();
  const qc = useQueryClient();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const enabled = !!auth.data?.user?.totpEnabled;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <CardHeader title="Two-factor authentication" icon={Smartphone} flush />
        <Badge tone={enabled ? "good" : "warn"}>{enabled ? "On" : "Off"}</Badge>
      </div>
      <p className="text-[13.5px] text-muted">Require a 6-digit code from an authenticator app (1Password, Google Authenticator, Authy…) when signing in. Strongly recommended — this console sees all your mail.</p>

      {codes ? (
        <div className="rounded-2xl border border-med/40 bg-med-soft p-4">
          <p className="text-sm font-semibold text-ink">Save your recovery codes</p>
          <p className="mt-0.5 text-[13px] text-ink-2">Each works once if you lose your phone. They won't be shown again.</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[13px] text-ink">
            {codes.map((c) => (
              <span key={c} className="rounded-lg bg-surface px-2 py-1 text-center">
                {c}
              </span>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" icon={Copy} onClick={() => void copyText(codes.join("\n")).then(() => toast.success("Copied"))}>
              Copy
            </Button>
            <Button size="sm" variant="primary" onClick={() => setCodes(null)}>
              I saved them
            </Button>
          </div>
        </div>
      ) : null}

      {!enabled && !setup ? (
        <Button variant="primary" icon={ShieldCheck} loading={busy === "setup"} onClick={() => void run("setup", async () => setSetup(await post("/me/totp/setup")))}>
          Set up two-factor
        </Button>
      ) : null}

      {!enabled && setup ? (
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("enable", async () => {
              const res = await post<{ recoveryCodes: string[] }>("/me/totp/enable", { code });
              setCodes(res.recoveryCodes);
              setSetup(null);
              setCode("");
              await qc.invalidateQueries({ queryKey: ["auth"] });
              toast.success("Two-factor authentication is on");
            });
          }}
        >
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} alt="QR code for your authenticator app" className="size-44 rounded-xl bg-white p-2" />
            <div className="min-w-0 space-y-2 text-[13px] text-ink-2">
              <p>1. Scan the QR code with your authenticator app.</p>
              <p>
                On this phone? <a href={setup.otpauthUrl} className="font-medium text-accent">Open in authenticator</a>, or enter this key:
              </p>
              <code className="block rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-[12px] break-all text-ink">{setup.secret}</code>
              <p>2. Enter the 6-digit code it shows.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="max-w-40 tracking-[0.3em]" aria-label="Authentication code" required />
            <Button type="submit" variant="primary" loading={busy === "enable"}>
              Turn on
            </Button>
          </div>
        </form>
      ) : null}

      {enabled ? (
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <Field label="Confirm with your password to manage 2FA" htmlFor="tf-pass">
            <Input id="tf-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={KeyRound}
              disabled={!password}
              loading={busy === "codes"}
              onClick={() =>
                void run("codes", async () => {
                  const res = await post<{ recoveryCodes: string[] }>("/me/recovery-codes", { password });
                  setCodes(res.recoveryCodes);
                  setPassword("");
                })
              }
            >
              New recovery codes
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!password}
              loading={busy === "disable"}
              onClick={() =>
                void run("disable", async () => {
                  await post("/me/totp/disable", { password });
                  setPassword("");
                  await qc.invalidateQueries({ queryKey: ["auth"] });
                  toast.success("Two-factor authentication turned off");
                })
              }
            >
              Turn off 2FA
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/me/password", { current, next });
      setCurrent("");
      setNext("");
      toast.success("Password changed — other sessions were signed out");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Password" icon={KeyRound} flush />
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Current password" htmlFor="pw-cur">
          <Input id="pw-cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-new">
          <Input id="pw-new" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy}>
          Change
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const sessions = useSessions();
  const qc = useQueryClient();
  const toast = useToast();
  const fmt = useFmt();
  const describe = (ua: string | null) => {
    if (!ua) return "Unknown device";
    const device = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android" : /mac os/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : /linux/i.test(ua) ? "Linux" : "Device";
    const browser = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : /curl|node|bot/i.test(ua) ? "Script" : "Browser";
    return `${device} · ${browser}`;
  };
  const revoke = async (id: string | null) => {
    try {
      if (id) await del(`/me/sessions/${id}`);
      else await post("/me/sessions/revoke-others");
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(id ? "Session signed out" : "Signed out everywhere else");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const list = sessions.data ?? [];
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Active sessions"
        icon={Monitor}
        action={
          list.length > 1 ? (
            <Button size="sm" variant="ghost" icon={LogOut} onClick={() => void revoke(null)}>
              Sign out others
            </Button>
          ) : null
        }
      />
      <ul className="mt-2 divide-y divide-line">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                {describe(s.userAgent)}
                {s.current ? <Badge tone="good">This device</Badge> : null}
              </span>
              <span className="block text-[12px] text-muted">
                {s.ip ?? "unknown IP"} · active {fmt.ago(s.lastSeenAt)} · since {fmt.date(s.createdAt, "medium")}
              </span>
            </span>
            {!s.current ? (
              <Button size="sm" variant="ghost" onClick={() => void revoke(s.id)}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
        {sessions.isLoading ? (
          <li className="p-5">
            <Skeleton className="h-10" />
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function AgentVisitsCard() {
  const activity = useAgentActivity();
  const fmt = useFmt();
  const [open, setOpen] = useState<string | null>(null);
  const data = activity.data;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="AI visitors" icon={Bot} eyebrow="Crawlers and agents sent to the check-in page" />
      <div className="mt-3 px-4 pb-4 sm:px-5">
        <p className="text-[13px] text-muted">
          AI crawlers, scripts and automated browsers never see this app. They get a check-in page with 50 questions about who they are and what they do with data, plus a synthetic sample record that carries a tracking token. Your automation hooks and calendar feed are not affected.
        </p>
        {!data ? (
          <Skeleton className="mt-3 h-16" />
        ) : data.byAgent.length === 0 && data.checkins.length === 0 ? (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">No agents have visited yet.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {data.byAgent.map((a) => (
                <li key={`${a.agentName}-${a.agentKind}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-ink">
                    {a.agentName} <span className="font-normal text-muted">· {a.agentKind}</span>
                  </span>
                  <span className="tabular shrink-0 text-muted">
                    {a.visits} visit{a.visits === 1 ? "" : "s"} · {fmt.ago(a.lastSeen)}
                  </span>
                </li>
              ))}
            </ul>
            {data.checkins.length ? (
              <div className="mt-3 space-y-2">
                <div className="eyebrow">Check-ins</div>
                {data.checkins.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-line">
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px]" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                      <span className="font-medium text-ink">{c.agentName}</span>
                      <span className="text-muted">
                        {c.answered}/50 answered · {fmt.ago(c.createdAt)}
                      </span>
                    </button>
                    {open === c.id ? (
                      <dl className="space-y-2 border-t border-line px-3 py-3 text-[13px]">
                        {Object.entries(c.answers).map(([q, a]) => (
                          <div key={q}>
                            <dt className="font-mono text-[11.5px] text-muted">{q}</dt>
                            <dd className="whitespace-pre-wrap text-ink-2">{a}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function AuditCard() {
  const audit = useAudit();
  const fmt = useFmt();
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Audit log" icon={Activity} eyebrow="Sign-ins, connections, exports and setting changes" />
      <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto">
        {(audit.data ?? []).map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-[13px] sm:px-5">
            <span className="min-w-0">
              <span className="font-medium text-ink">{titleCase(a.action.replace(/\./g, " "))}</span>
              {a.detail ? <span className="text-muted"> · {a.detail}</span> : null}
              {a.ip ? <span className="block text-[11.5px] text-muted">{a.ip}</span> : null}
            </span>
            <span className="shrink-0 text-[12px] text-muted">{fmt.date(a.at, "datetime")}</span>
          </li>
        ))}
        {audit.data?.length === 0 ? <li className="px-5 py-6 text-center text-sm text-muted">No events yet.</li> : null}
      </ul>
    </Card>
  );
}

function AiTab({ settings }: { settings: Settings }) {
  const mutation = useSettingsMutation();
  const system = useSystem();
  const toast = useToast();
  const [ai, setAi, dirty] = useSectionDraft(settings, "ai");
  const available = !!system.data?.integrations.ai;
  const usage = system.data?.ai;
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <CardHeader title="Claude AI" icon={Bot} flush />
          <Badge tone={available ? "good" : "neutral"}>{available ? "Connected" : "Not configured"}</Badge>
        </div>
        <p className="text-[13.5px] text-muted">
          Optional. Adminak's built-in engine handles classification and extraction on its own. With an Anthropic API key, Claude also double-checks uncertain emails, writes your daily briefing in plain language, and answers questions in Ask Adminak.
        </p>
        {!available ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            Set <code className="rounded bg-surface px-1">ANTHROPIC_API_KEY</code> on the server and restart to enable. Model: <code className="rounded bg-surface px-1">{system.data?.integrations.aiModel ?? "claude-opus-5-5"}</code> (override with <code className="rounded bg-surface px-1">AI_MODEL</code>).
          </p>
        ) : null}
        <Switch checked={ai.enabled} disabled={!available} onChange={(v) => setAi({ ...ai, enabled: v })} label="Use Claude" />
        <Field label="Which emails Claude reads" htmlFor="ai-mode">
          <Select id="ai-mode" value={ai.mode} disabled={!available} onChange={(e) => setAi({ ...ai, mode: e.target.value as Settings["ai"]["mode"] })}>
            <option value="smart">Smart — only ones the engine is unsure about</option>
            <option value="all">All important emails</option>
          </Select>
        </Field>
        <Field label="Daily limit" htmlFor="ai-limit" hint="Maximum Claude calls per day, to keep costs predictable.">
          <Input id="ai-limit" type="number" min={0} max={5000} disabled={!available} value={ai.dailyLimit} onChange={(e) => setAi({ ...ai, dailyLimit: Number(e.target.value) })} className="max-w-40" />
        </Field>
        <Switch checked={ai.briefing} disabled={!available} onChange={(v) => setAi({ ...ai, briefing: v })} label="AI-written daily briefing" />
        {usage && available ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[11px] text-muted">Calls today</div>
              <div className="tabular text-[15px] font-semibold text-ink">
                {usage.callsToday} / {usage.limit}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[11px] text-muted">Input tokens</div>
              <div className="tabular text-[15px] font-semibold text-ink">{usage.inputTokensToday.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <div className="text-[11px] text-muted">Output tokens</div>
              <div className="tabular text-[15px] font-semibold text-ink">{usage.outputTokensToday.toLocaleString()}</div>
            </div>
          </div>
        ) : null}
        <SaveRow
          dirty={dirty}
          busy={mutation.isPending}
          onReset={() => setAi(settings.ai)}
          onSave={() => mutation.mutate({ ai }, { onSuccess: () => toast.success("AI settings saved"), onError: (e) => toast.error(errorMessage(e)) })}
        />
      </Card>
      <Card className="p-4 sm:p-5 text-[13px] text-muted">
        <p>
          <strong className="text-ink">Privacy:</strong> for each email Claude reviews, Adminak sends the sender, subject and up to ~8,000 characters of its text to Anthropic's API (verification codes are redacted first). Ask Adminak sends short snippets of the matching emails. Nothing is sent while AI is off.
        </p>
      </Card>
    </div>
  );
}

function DataTab() {
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const purge = async (scope: "bodies" | "everything") => {
    setBusy(scope);
    try {
      await post("/data/purge", { scope, confirm });
      setConfirm("");
      invalidate();
      toast.success(scope === "bodies" ? "Stored email text deleted" : "All analyzed data deleted — mailboxes will re-import on next scan");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const exports = ["subscriptions", "charges", "bills", "alerts", "messages", "insights"];
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <CardHeader title="Export your data" icon={Download} flush />
        <p className="mt-1 text-[13.5px] text-muted">Everything Adminak knows, in open formats.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a href={appUrl("/api/export.json")} download className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-ink sm:col-span-1">
            <Download className="size-4" aria-hidden /> Full JSON
          </a>
          {exports.map((t) => (
            <a key={t} href={appUrl(`/api/export/${t}.csv`)} download className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink hover:bg-surface-2">
              {titleCase(t)} CSV
            </a>
          ))}
        </div>
      </Card>
      <Card className="space-y-4 border-crit/30 p-4 sm:p-5">
        <CardHeader title="Delete data" icon={Trash2} flush />
        <p className="text-[13.5px] text-muted">Type PURGE to confirm. This can't be undone.</p>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="PURGE" className="max-w-40 font-mono" aria-label="Type PURGE to confirm" />
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={confirm !== "PURGE"} loading={busy === "bodies"} onClick={() => void purge("bodies")}>
            Delete stored email text
          </Button>
          <Button variant="danger" disabled={confirm !== "PURGE"} loading={busy === "everything"} onClick={() => void purge("everything")}>
            Delete all analyzed data
          </Button>
        </div>
        <p className="text-[12px] text-muted">Mailbox connections, rules, channels and settings are kept. To remove a mailbox and its emails, disconnect it in Mailboxes.</p>
      </Card>
    </div>
  );
}

function SystemTab() {
  const system = useSystem();
  const fmt = useFmt();
  const s = system.data;
  if (!s) return <Skeleton className="h-64" />;
  const uptime = Math.max(0, Date.now() - new Date(s.startedAt).getTime());
  const hours = Math.floor(uptime / 3600000);
  const integrations: [string, boolean, string][] = [
    ["Email delivery", s.emailConfigured, s.integrations.smtp ? "SMTP" : s.emailConfigured ? "Gmail API" : "Local outbox only"],
    ["Gmail one-click", s.integrations.gmailApi, s.integrations.gmailApi ? "OAuth client configured" : "Set GOOGLE_CLIENT_ID/SECRET"],
    ["Claude AI", s.integrations.ai, s.integrations.ai ? s.integrations.aiModel : "Set ANTHROPIC_API_KEY"],
    ["Web push", s.integrations.push, "VAPID keys generated"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="eyebrow">Version</div>
          <div className="mt-2 text-[20px] font-semibold text-ink">{s.version}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Uptime</div>
          <div className="mt-2 text-[20px] font-semibold text-ink">{hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor((uptime % 3600000) / 60000)}m`}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Database</div>
          <div className="tabular mt-2 text-[20px] font-semibold text-ink">{(s.dbSizeBytes / 1024 / 1024).toFixed(1)} MB</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Emails</div>
          <div className="tabular mt-2 text-[20px] font-semibold text-ink">{(s.counts.messages ?? 0).toLocaleString()}</div>
        </div>
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Integrations" icon={Database} />
        <ul className="mt-2 divide-y divide-line">
          {integrations.map(([name, ok, detail]) => (
            <li key={name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] sm:px-5">
              <span className="font-medium text-ink">{name}</span>
              <span className="flex items-center gap-2 text-right text-muted">
                <span className="hidden sm:inline">{detail}</span>
                <Badge tone={ok ? "good" : "neutral"}>{ok ? "On" : "Off"}</Badge>
              </span>
            </li>
          ))}
        </ul>
        <p className="px-4 pt-1 pb-4 text-[12px] text-muted sm:px-5">
          Public URL: <code className="rounded bg-surface-2 px-1">{s.integrations.appUrl}</code> · data in <code className="rounded bg-surface-2 px-1">{s.dataDir}</code>
        </p>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Background jobs" icon={Activity} />
        <div className="mt-2 overflow-x-auto">
          <table className="tabular w-full min-w-[460px] text-[13px]">
            <thead className="text-left text-[12px] text-muted">
              <tr className="border-y border-line bg-surface-3/60">
                <th className="px-4 py-2 font-medium sm:px-5">Job</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 text-right font-medium">Took</th>
                <th className="px-4 py-2 font-medium sm:px-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {s.jobs.map((j) => (
                <tr key={j.name} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 font-medium text-ink sm:px-5">{titleCase(j.name)}</td>
                  <td className="px-3 py-2 text-ink-2">{fmt.ago(j.lastRunAt)}</td>
                  <td className="px-3 py-2 text-right text-muted">{j.durationMs !== null ? `${j.durationMs} ms` : "—"}</td>
                  <td className="px-4 py-2 sm:px-5" title={j.lastError ?? undefined}>
                    <Badge tone={j.lastStatus === "error" ? "bad" : j.lastStatus === "ok" ? "good" : "neutral"}>{j.lastStatus ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
              {s.jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-center text-muted">
                    Jobs haven't run yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4 sm:p-5">
        <CardHeader title="What's stored" icon={Database} flush />
        <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {Object.entries(s.counts).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-2 p-2.5 text-center">
              <dt className="text-[11px] text-muted capitalize">{k}</dt>
              <dd className="tabular text-[15px] font-semibold text-ink">{v.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "general";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "general") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="Profile, scanning, security, AI and your data." />
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "general", label: "General" },
            { value: "security", label: "Security" },
            { value: "ai", label: "AI" },
            { value: "data", label: "Data" },
            { value: "system", label: "System" },
          ]}
        />
      </div>
      {!settings.data ? (
        <Skeleton className="h-64" />
      ) : tab === "general" ? (
        <GeneralTab settings={settings.data} />
      ) : tab === "security" ? (
        <div className="space-y-4">
          <TwoFactor />
          <PasswordCard />
          <SessionsCard />
          <AgentVisitsCard />
          <AuditCard />
        </div>
      ) : tab === "ai" ? (
        <AiTab settings={settings.data} />
      ) : tab === "data" ? (
        <DataTab />
      ) : (
        <SystemTab />
      )}
    </div>
  );
}
