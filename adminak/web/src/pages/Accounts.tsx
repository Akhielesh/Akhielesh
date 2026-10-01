import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  History,
  KeyRound,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Server,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";
import type { AccountDTO } from "@shared/types";
import { del, errorMessage, patch, post } from "../lib/api";
import { actions, useAccounts, useAutomation, useInvalidateData, type AccountsResponse } from "../lib/queries";
import { useTakeParam } from "../lib/hooks";
import { useFmt } from "../lib/prefs";
import { cn, copyText } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { Sheet } from "../components/sheet";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Progress, Segmented, Select, Skeleton, Switch } from "../components/ui";

const PROVIDER_LABEL: Record<AccountDTO["provider"], string> = { gmail: "Gmail", imap: "IMAP", demo: "Demo", webhook: "Automation inbox" };

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.2 3.31v2.75h3.56c2.08-1.92 3.24-4.74 3.24-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.75c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.15-4.53H2.17v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.85 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.35-2.12V7.04H2.17A11 11 0 0 0 1 12c0 1.78.43 3.46 1.17 4.96l3.68-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.17 7.04l3.68 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function AccountCard({ account, onEdit }: { account: AccountDTO; onEdit: () => void }) {
  const fmt = useFmt();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const tone = account.status === "error" ? "bad" : account.status === "paused" ? "neutral" : account.syncing ? "info" : "good";
  const statusLabel = account.syncing ? "Scanning" : account.status === "error" ? "Needs attention" : account.status === "paused" ? "Paused" : "Connected";
  const progress = account.progress;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2">
          {account.provider === "gmail" ? <GoogleMark /> : account.provider === "demo" ? <Sparkles className="size-5 text-accent" /> : account.provider === "webhook" ? <Webhook className="size-5 text-ink-2" /> : <Server className="size-5 text-ink-2" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{account.label}</span>
            <Badge tone={tone} icon={account.status === "error" ? CircleAlert : account.syncing ? RefreshCw : CircleCheck}>
              {statusLabel}
            </Badge>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {PROVIDER_LABEL[account.provider]}
            {account.email !== account.label ? ` · ${account.email}` : ""}
          </div>
        </div>
      </div>

      {account.syncing && progress ? (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
            <span className="capitalize">{progress.phase}</span>
            {progress.total ? (
              <span className="tabular">
                {progress.done} / {progress.total}
              </span>
            ) : null}
          </div>
          <Progress value={progress.total ? progress.done / progress.total : 0.1} />
        </div>
      ) : null}

      {account.lastError && account.status === "error" ? <p className="mt-3 rounded-xl bg-crit-soft px-3 py-2 text-[13px] text-crit">{account.lastError}</p> : null}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 px-2 py-2.5">
          <dt className="text-[11px] text-muted">Emails</dt>
          <dd className="tabular text-[15px] font-semibold text-ink">{account.messageCount.toLocaleString()}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-2 py-2.5">
          <dt className="text-[11px] text-muted">Last scan</dt>
          <dd className="text-[13.5px] font-semibold text-ink">{fmt.ago(account.lastSuccessAt)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-2 py-2.5">
          <dt className="text-[11px] text-muted">History</dt>
          <dd className="text-[13.5px] font-semibold text-ink">{account.backfillDone ? "Complete" : "Importing"}</dd>
        </div>
      </dl>

      {account.provider !== "webhook" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={RefreshCw} loading={busy === "sync"} disabled={account.syncing || account.status === "paused"} onClick={() => void run("sync", () => actions.syncAccount(account.id), "Scan started")}>
            Scan now
          </Button>
          {account.provider !== "demo" ? (
            <>
              <Button
                size="sm"
                icon={account.status === "paused" ? Play : Pause}
                loading={busy === "pause"}
                onClick={() => void run("pause", () => patch(`/accounts/${account.id}`, { status: account.status === "paused" ? "active" : "paused" }), account.status === "paused" ? "Scanning resumed" : "Scanning paused")}
              >
                {account.status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Settings
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-muted">Receives emails pushed to the ingest hook (see Automations below).</p>
      )}
    </Card>
  );
}

function EditAccountSheet({ account, onClose }: { account: AccountDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [label, setLabel] = useState(account?.label ?? "");
  const [backfill, setBackfill] = useState(String(account?.settings.backfillDays ?? 120));
  const [folders, setFolders] = useState((account?.settings.folders ?? ["INBOX"]).join(", "));
  const [password, setPassword] = useState("");
  const [applyLabels, setApplyLabels] = useState(!!account?.settings.applyLabels);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!account) return null;
  const canLabel = account.provider === "gmail" && (account.settings.scopes ?? []).some((s) => s.includes("gmail.modify"));
  const save = async () => {
    setBusy("save");
    try {
      await patch(`/accounts/${account.id}`, {
        label: label.trim() || undefined,
        backfillDays: Number(backfill) || undefined,
        ...(account.provider === "imap" ? { folders: folders.split(",").map((f) => f.trim()).filter(Boolean) } : {}),
        ...(password ? { password } : {}),
        ...(account.provider === "gmail" ? { applyLabels } : {}),
      });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Mailbox updated");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const resync = async () => {
    setBusy("resync");
    try {
      await post(`/accounts/${account.id}/resync`);
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Full re-scan started — existing emails are kept");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await del(`/accounts/${account.id}`);
      invalidate();
      toast.success("Mailbox disconnected and its data removed");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open onClose={onClose} title={account.label} subtitle={`${PROVIDER_LABEL[account.provider]} · ${account.email}`}>
      <div className="space-y-4">
        <Field label="Display name" htmlFor="a-label">
          <Input id="a-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="History to import (days)" htmlFor="a-backfill" hint="Used on the first scan and on a full re-scan.">
          <Input id="a-backfill" inputMode="numeric" value={backfill} onChange={(e) => setBackfill(e.target.value)} />
        </Field>
        {account.provider === "imap" ? (
          <>
            <Field label="Folders" htmlFor="a-folders" hint="Comma-separated, e.g. INBOX, Receipts">
              <Input id="a-folders" value={folders} onChange={(e) => setFolders(e.target.value)} />
            </Field>
            <Field label="New app password" htmlFor="a-pass" hint="Only if the old one was revoked.">
              <Input id="a-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : null}
        {account.provider === "gmail" ? (
          <div className="rounded-2xl border border-line p-4">
            <Switch
              checked={applyLabels}
              disabled={!canLabel}
              onChange={setApplyLabels}
              label="Label emails in Gmail"
              description={canLabel ? "Adds labels like Adminak/Subscriptions so you can filter in Gmail too." : "Reconnect with “Label emails in Gmail” checked to allow this."}
            />
          </div>
        ) : null}
        <Button variant="primary" size="lg" className="w-full" loading={busy === "save"} onClick={() => void save()}>
          Save
        </Button>
        <div className="space-y-2 border-t border-line pt-4">
          <Button className="w-full" icon={RotateCw} loading={busy === "resync"} onClick={() => void resync()}>
            Full re-scan
          </Button>
          {confirm ? (
            <Button className="w-full" variant="danger" icon={Trash2} loading={busy === "delete"} onClick={() => void remove()}>
              Yes, disconnect and delete its emails
            </Button>
          ) : (
            <Button className="w-full" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)}>
              Disconnect mailbox
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function ImapForm({ presets, onDone }: { presets: AccountsResponse["presets"]; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [preset, setPreset] = useState(presets[0]?.id ?? "custom");
  const p = presets.find((x) => x.id === preset);
  const [f, setF] = useState({ email: "", password: "", label: "", host: p?.host ?? "", port: String(p?.port ?? 993), secure: p?.secure ?? true, user: "", folders: (p?.folders ?? ["INBOX"]).join(", "), backfillDays: "120" });
  const [test, setTest] = useState<{ ok: boolean; error?: string; folders?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const choose = (id: string) => {
    setPreset(id);
    const next = presets.find((x) => x.id === id);
    if (next) setF((s) => ({ ...s, host: next.host, port: String(next.port), secure: next.secure, folders: next.folders.join(", ") }));
    setTest(null);
  };
  const body = () => ({
    email: f.email.trim(),
    password: f.password,
    label: f.label.trim() || undefined,
    host: f.host.trim(),
    port: Number(f.port) || 993,
    secure: f.secure,
    user: f.user.trim() || undefined,
    folders: f.folders.split(",").map((x) => x.trim()).filter(Boolean),
    backfillDays: Number(f.backfillDays) || undefined,
  });
  const runTest = async () => {
    setBusy("test");
    try {
      setTest(await post("/accounts/imap/test", body()));
    } catch (error) {
      setTest({ ok: false, error: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("connect");
    try {
      await post("/accounts/imap", body());
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Connected — the first scan is running");
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Provider" htmlFor="i-preset">
        <Select id="i-preset" value={preset} onChange={(e) => choose(e.target.value)}>
          {presets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      {p?.help ? <p className="rounded-xl bg-low-soft px-3 py-2 text-[13px] text-low">{p.help}</p> : null}
      <Field label="Email address" htmlFor="i-email">
        <Input id="i-email" type="email" required autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="App password" htmlFor="i-pass" hint="Use an app-specific password, not your main one. It's encrypted at rest.">
        <div className="relative">
          <Input id="i-pass" type={show ? "text" : "password"} required autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <details className="rounded-2xl border border-line p-4" open={preset === "custom"}>
        <summary className="cursor-pointer text-sm font-medium text-ink">Server settings</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="IMAP host" htmlFor="i-host">
              <Input id="i-host" required value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="imap.example.com" />
            </Field>
            <Field label="Port" htmlFor="i-port">
              <Input id="i-port" inputMode="numeric" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} />
            </Field>
          </div>
          <Switch checked={f.secure} onChange={(v) => setF({ ...f, secure: v })} label="Use TLS" />
          <Field label="Username" htmlFor="i-user" hint="Leave blank to use the email address.">
            <Input id="i-user" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} />
          </Field>
          <Field label="Folders to scan" htmlFor="i-folders" hint="Comma-separated. Gmail: [Gmail]/All Mail covers everything.">
            <Input id="i-folders" value={f.folders} onChange={(e) => setF({ ...f, folders: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Import history (days)" htmlFor="i-days">
              <Input id="i-days" inputMode="numeric" value={f.backfillDays} onChange={(e) => setF({ ...f, backfillDays: e.target.value })} />
            </Field>
            <Field label="Display name" htmlFor="i-label">
              <Input id="i-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Personal" />
            </Field>
          </div>
        </div>
      </details>
      {test ? (
        test.ok ? (
          <div className="rounded-xl bg-good-soft px-3 py-2 text-[13px] text-good">
            <strong>Connection works.</strong>
            {test.folders?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {test.folders.slice(0, 16).map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    className="rounded-md bg-surface px-1.5 py-0.5 text-[12px] text-ink-2 hover:text-ink"
                    onClick={() => setF((s) => ({ ...s, folders: [...new Set([...s.folders.split(",").map((x) => x.trim()).filter(Boolean), folder])].join(", ") }))}
                    title="Add to folders"
                  >
                    + {folder}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-crit-soft px-3 py-2 text-[13px] text-crit">{test.error ?? "Couldn't connect."}</p>
        )
      ) : null}
      <div className="flex gap-2">
        <Button icon={FlaskConical} loading={busy === "test"} disabled={!f.password || !f.host} onClick={() => void runTest()} className="flex-1">
          Test
        </Button>
        <Button type="submit" variant="primary" loading={busy === "connect"} className="flex-1">
          Connect
        </Button>
      </div>
    </form>
  );
}

function AddMailboxSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: AccountsResponse }) {
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [method, setMethod] = useState<"gmail" | "imap">(data.google ? "gmail" : "imap");
  const [labels, setLabels] = useState(false);
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasDemo = data.accounts.some((a) => a.provider === "demo");
  const google = () => {
    window.location.href = `/api/accounts/google/start?labels=${labels ? 1 : 0}&send=${send ? 1 : 0}`;
  };
  const demo = async () => {
    setBusy(true);
    try {
      const res = await actions.loadDemo();
      invalidate();
      toast.success(`Demo inbox loaded — ${res.inserted} emails, ${res.alerts} alerts`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Connect a mailbox" subtitle="Adminak reads mail read-only and keeps everything on your server.">
      <div className="space-y-5">
        <Segmented
          className="w-full"
          value={method}
          onChange={setMethod}
          options={[
            { value: "gmail", label: "Gmail" },
            { value: "imap", label: "iCloud · Outlook · IMAP" },
          ]}
        />
        {method === "gmail" ? (
          data.google ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-line p-4">
                <Switch checked={send} onChange={setSend} label="Send my alerts from this Gmail" description="Lets Adminak email you without setting up SMTP. Uses the gmail.send permission." />
                <Switch checked={labels} onChange={setLabels} label="Label emails in Gmail" description="Adds Adminak/… labels to classified mail (gmail.modify permission)." />
              </div>
              <Button variant="primary" size="lg" className="w-full" onClick={google}>
                <GoogleMark /> Continue with Google
              </Button>
              <p className="text-[12.5px] text-muted">You'll approve read-only access on Google's consent screen. Revoke it anytime at myaccount.google.com → Security → Third-party access.</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-line p-4 text-[13.5px] text-ink-2">
              <p className="font-semibold text-ink">One-click Gmail needs a Google OAuth client</p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>In Google Cloud Console, enable the Gmail API and create an OAuth client (Web application).</li>
                <li>
                  Add this redirect URI:
                  <code className="mt-1 block rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-[12px] break-all text-ink">{data.redirectUri}</code>
                </li>
                <li>
                  Set <code className="rounded bg-surface-2 px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-surface-2 px-1">GOOGLE_CLIENT_SECRET</code> and restart.
                </li>
              </ol>
              <p className="text-muted">
                Or connect Gmail over IMAP right now with an{" "}
                <button type="button" className="font-medium text-accent" onClick={() => setMethod("imap")}>
                  app password
                </button>
                .
              </p>
            </div>
          )
        ) : (
          <ImapForm presets={data.presets} onDone={onClose} />
        )}
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Just exploring?</p>
              <p className="mt-0.5 text-[13px] text-muted">Load ~100 realistic sample emails to see subscriptions, bills, trips and alerts in action. Remove them anytime.</p>
              <Button size="sm" className="mt-3" loading={busy} disabled={hasDemo} onClick={() => void demo()}>
                {hasDemo ? "Demo loaded" : "Load demo inbox"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Secret({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{show ? value : `${value.slice(0, 4)}${"•".repeat(20)}`}</code>
      <button type="button" onClick={() => setShow((s) => !s)} className="text-muted hover:text-ink" aria-label={show ? "Hide" : "Reveal"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button type="button" onClick={() => void copyText(value).then((ok) => toast[ok ? "success" : "error"](ok ? "Copied" : "Couldn't copy"))} className="text-muted hover:text-ink" aria-label="Copy">
        <Copy className="size-4" />
      </button>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const toast = useToast();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-[#0c0d0f] p-3 pr-10 font-mono text-[11.5px] leading-relaxed text-[#e9e6df]">{code}</pre>
      <button type="button" onClick={() => void copyText(code).then((ok) => ok && toast.success("Copied"))} className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg text-[#a7a39b] hover:bg-white/10 hover:text-white" aria-label="Copy command">
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function Automations() {
  const automation = useAutomation();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"scan" | "ingest" | "summary" | "digest">("scan");
  const data = automation.data;
  const rotate = async (which: "hook" | "calendar") => {
    try {
      await post("/automation/rotate", { which });
      await qc.invalidateQueries({ queryKey: ["automation"] });
      toast.success(which === "hook" ? "Automation token rotated — update your automations" : "Calendar link rotated — re-subscribe your calendar");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  if (!data) return <Skeleton className="h-48" />;
  // Examples reference an env var so the token is never displayed unless explicitly revealed above.
  const auth = `-H "Authorization: Bearer $ADMINAK_TOKEN"`;
  const examples: Record<typeof tab, { title: string; note: string; code: string }> = {
    scan: {
      title: "Trigger a scan",
      note: "Run from cron, Zapier, Make, n8n, an Apple Shortcut or a Home Assistant automation. Add ?wait=1 to wait for results.",
      code: `curl -X POST ${data.endpoints.scan} \\\n  ${auth}`,
    },
    ingest: {
      title: "Push an email in",
      note: "Forward mail from any source (e.g. a Gmail filter → Zapier/Make webhook) as JSON, or POST a raw .eml with Content-Type: message/rfc822.",
      code: `curl -X POST ${data.endpoints.ingest} \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"from":"Netflix <info@account.netflix.com>","subject":"Your membership renews soon","text":"Your plan renews on Oct 12 for $22.99."}'`,
    },
    summary: {
      title: "Read a summary",
      note: "JSON with open alerts, monthly subscriptions, upcoming items and the briefing — great for widgets and dashboards.",
      code: `curl ${data.endpoints.summary} \\\n  ${auth}`,
    },
    digest: {
      title: "Send the daily brief now",
      note: "Emails (and pushes) the digest immediately to every channel that receives digests.",
      code: `curl -X POST ${data.endpoints.digest} \\\n  ${auth}`,
    },
  };
  const ex = examples[tab];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Webhook className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Automations</h2>
          <p className="mt-0.5 text-[13px] text-muted">Adminak scans on its own schedule, and these authenticated hooks let any automation tool trigger scans, push email in, or read your summary.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-2">Automation token</span>
          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => void rotate("hook")}>
            Rotate
          </Button>
        </div>
        <Secret value={data.hookToken} />
      </div>
      <Segmented
        className="mt-4 w-full"
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: "scan", label: "Scan" },
          { value: "ingest", label: "Ingest" },
          { value: "summary", label: "Summary" },
          { value: "digest", label: "Digest" },
        ]}
      />
      <div className="mt-3">
        <p className="mb-2 text-[13px] text-muted">
          <strong className="text-ink">{ex.title}.</strong> {ex.note}
        </p>
        <CodeBlock code={ex.code} />
        <p className="mt-2 text-[12px] text-muted">
          Set <code className="rounded bg-surface-2 px-1">ADMINAK_TOKEN</code> to the token above in your automation's secrets.
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
        <span className="text-muted">Calendar feed link</span>
        <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => void rotate("calendar")}>
          Rotate calendar link
        </Button>
      </div>
    </Card>
  );
}

export function AccountsPage() {
  const accounts = useAccounts();
  const fmt = useFmt();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [adding, setAdding] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [editing, setEditing] = useState<AccountDTO | null>(null);
  const [clearing, setClearing] = useState(false);
  useTakeParam("add", () => setAdding(true));
  useTakeParam("welcome", () => setWelcome(true));
  useTakeParam("connected", (email) => toast.success(`${email} connected — scanning your mail now`));
  useTakeParam("error", (error) => toast.error(error === "state" ? "The Google sign-in expired. Try again." : `Google connection failed: ${error}`));

  const data = accounts.data;
  useEffect(() => {
    if (welcome && data && data.accounts.length === 0) setAdding(true);
  }, [welcome, data]);

  const clearDemo = async () => {
    setClearing(true);
    try {
      await actions.clearDemo();
      invalidate();
      toast.success("Demo data removed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setClearing(false);
    }
  };
  const hasDemo = data?.accounts.some((a) => a.provider === "demo");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mailboxes"
        description="Connected inboxes Adminak scans continuously. New mail is picked up every few minutes; history is imported on first connect."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)} disabled={!data}>
            Connect
          </Button>
        }
      />

      {welcome ? (
        <Card className="border-accent/30 bg-accent-soft/40 p-4 sm:p-5">
          <h2 className="text-[16px] font-semibold text-ink">Welcome to Adminak 👋</h2>
          <ol className="mt-2 space-y-1 text-[13.5px] text-ink-2">
            <li>1. Connect a mailbox (or load the demo inbox to look around).</li>
            <li>2. Check Notifications — alerts and the daily brief go to your personal email.</li>
            <li>3. Add Adminak to your Home Screen for a full-screen app with push alerts.</li>
          </ol>
        </Card>
      ) : null}

      {!data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : data.accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Mail}
            title="No mailboxes yet"
            action={
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Connect a mailbox
              </Button>
            }
          >
            Connect Gmail with one click, or iCloud, Outlook, Yahoo, Fastmail and any IMAP inbox with an app password.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.accounts.map((a) => (
            <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      )}

      {hasDemo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3">
          <p className="text-[13px] text-muted">You're looking at demo data. Remove it before connecting your real inbox for clean numbers.</p>
          <Button size="sm" variant="danger" icon={Trash2} loading={clearing} onClick={() => void clearDemo()}>
            Remove demo data
          </Button>
        </div>
      ) : null}

      <Automations />

      <Card className="overflow-hidden">
        <CardHeader title="Scan history" icon={History} />
        <div className="mt-2 overflow-x-auto">
          {data?.runs.length ? (
            <table className="tabular w-full min-w-[520px] text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr className="border-y border-line bg-surface-3/60">
                  <th className="px-4 py-2 font-medium sm:px-5">When</th>
                  <th className="px-3 py-2 font-medium">Mailbox</th>
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 text-right font-medium">New</th>
                  <th className="px-3 py-2 text-right font-medium">Alerts</th>
                  <th className="px-4 py-2 font-medium sm:px-5">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2 whitespace-nowrap text-ink-2 sm:px-5">{fmt.date(r.startedAt, "datetime")}</td>
                    <td className="max-w-40 truncate px-3 py-2 text-ink">{r.accountLabel ?? "All"}</td>
                    <td className="px-3 py-2 text-muted capitalize">{r.trigger}</td>
                    <td className="px-3 py-2 text-right text-ink">{r.newMessages}</td>
                    <td className="px-3 py-2 text-right text-ink">{r.alertsCreated}</td>
                    <td className="px-4 py-2 sm:px-5">
                      <span className={cn("inline-flex items-center gap-1", r.status === "error" ? "text-crit" : r.status === "running" ? "text-low" : "text-good")} title={r.error ?? undefined}>
                        {r.status === "error" ? <CircleAlert className="size-3.5" /> : r.status === "running" ? <RefreshCw className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5" />}
                        {r.status === "error" ? "Failed" : r.status === "running" ? "Running" : "OK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted">No scans yet.</p>
          )}
        </div>
      </Card>

      {data ? <AddMailboxSheet open={adding} onClose={() => setAdding(false)} data={data} /> : null}
      {editing ? <EditAccountSheet key={editing.id} account={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
