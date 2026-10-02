import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  CreditCard,
  ExternalLink,
  EyeOff,
  FileUp,
  Landmark,
  Link2,
  Mail,
  Pause,
  PiggyBank,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { SPEND_CATEGORY_META } from "@shared/catalog";
import { titleCase } from "@shared/format";
import {
  CHARGE_KINDS,
  FIN_ACCOUNT_TYPES,
  SPEND_CATEGORIES,
  type BankingProviders,
  type ChargeDTO,
  type ChargeKind,
  type CsvMapping,
  type FinAccountDTO,
  type FinAccountRef,
  type FinAccountType,
  type FinConnectionDTO,
  type ImportPreviewDTO,
  type ImportResultDTO,
  type SpendCategory,
} from "@shared/types";
import { errorMessage } from "../lib/api";
import { actions, useInvalidateData } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { Badge, Button, Card, ExternalA, Field, Input, Segmented, Select, Switch, Textarea } from "./ui";
import { VendorMark } from "./vendor";

export const ACCOUNT_TYPE_LABEL: Record<FinAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit card",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

export const CHARGE_KIND_LABEL: Record<ChargeKind, string> = {
  purchase: "Purchase",
  subscription: "Subscription",
  bill_payment: "Bill payment",
  refund: "Refund",
  deposit: "Income / deposit",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  fee: "Fee",
  card_payment: "Card payment",
};

const PROVIDER_LABEL: Record<FinConnectionDTO["provider"], string> = { teller: "Teller", simplefin: "SimpleFIN", file: "Statements", demo: "Demo" };

export function accountName(a: Pick<FinAccountRef, "name" | "mask">): string {
  return a.mask ? `${a.name} ••${a.mask}` : a.name;
}

function AccountIcon({ type, className }: { type: FinAccountType; className?: string }) {
  const Icon = type === "credit" || type === "loan" ? CreditCard : type === "savings" ? PiggyBank : Landmark;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/** Tiny trend line for an account row (no axes; the number next to it carries the value). */
function MiniTrend({ history, owed }: { history: FinAccountDTO["history"]; owed: boolean }) {
  if (history.length < 3) return null;
  const values = history.map((h) => h.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 22;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const rising = values.at(-1)! >= values[0]!;
  const good = owed ? !rising : rising;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hidden h-[22px] w-[72px] shrink-0 sm:block" aria-hidden>
      <path d={d} fill="none" stroke={good ? "var(--good)" : "var(--med)"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function AccountRow({ account, onOpen }: { account: FinAccountDTO; onOpen?: () => void }) {
  const fmt = useFmt();
  const owed = account.type === "credit" || account.type === "loan";
  const util = owed && account.creditLimit && account.balanceCurrent !== null ? account.balanceCurrent / account.creditLimit : null;
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5", onOpen && "hover:bg-surface-2/60", account.hidden && "opacity-55")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", owed ? "bg-med-soft text-med" : "bg-good-soft text-good")}>
        <AccountIcon type={account.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[14px] font-medium text-ink">
          {accountName(account)}
          {account.hidden ? <EyeOff className="size-3.5 text-muted" aria-label="Hidden from totals" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">
          {ACCOUNT_TYPE_LABEL[account.type]}
          {account.institution ? ` · ${account.institution}` : ""}
          {util !== null ? ` · ${Math.round(util * 100)}% of ${fmt.money(account.creditLimit, account.currency, { whole: true })}` : ""}
          {account.transactionCount ? ` · ${account.transactionCount} transactions` : ""}
        </span>
      </span>
      <MiniTrend history={account.history} owed={owed} />
      <span className="shrink-0 text-right">
        <span className={cn("tabular block text-[15px] font-semibold", owed ? "text-ink" : "text-ink")}>
          {account.balanceCurrent === null ? "—" : `${owed && account.balanceCurrent > 0 ? "−" : ""}${fmt.money(Math.abs(account.balanceCurrent), account.currency)}`}
        </span>
        {account.balanceAvailable !== null && !owed && account.balanceAvailable !== account.balanceCurrent ? (
          <span className="tabular block text-[11.5px] text-muted">{fmt.money(account.balanceAvailable, account.currency)} available</span>
        ) : owed ? (
          <span className="block text-[11.5px] text-muted">owed</span>
        ) : null}
      </span>
    </button>
  );
}

export function BankConnectionCard({ connection, onAccount, onReconnect }: { connection: FinConnectionDTO; onAccount: (a: FinAccountDTO) => void; onReconnect?: (c: FinConnectionDTO) => void }) {
  const fmt = useFmt();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateData();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const live = connection.provider === "teller" || connection.provider === "simplefin";
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      invalidate();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const syncing = connection.syncing || busy === "sync";
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-ink">{connection.label}</h3>
            <Badge>{PROVIDER_LABEL[connection.provider]}</Badge>
            {connection.status === "paused" ? <Badge tone="warn">Paused</Badge> : null}
            {connection.status === "error" ? <Badge tone="bad">Needs attention</Badge> : null}
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {syncing ? (
              <span className="inline-flex items-center gap-1 text-low">
                <RefreshCw className="size-3.5 animate-spin" aria-hidden /> Refreshing…
              </span>
            ) : connection.lastSuccessAt ? (
              `${connection.provider === "file" ? "Last import" : "Refreshed"} ${fmt.ago(connection.lastSuccessAt)}`
            ) : (
              "Not refreshed yet"
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {live || connection.provider === "demo" ? (
            <Button size="icon" variant="ghost" aria-label="Refresh now" disabled={syncing} onClick={() => void run("sync", async () => {
              await actions.syncBank(connection.id);
              setTimeout(() => void qc.invalidateQueries({ queryKey: ["banking"] }), 800);
            })}>
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            </Button>
          ) : null}
          {live ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={connection.status === "paused" ? "Resume" : "Pause"}
              loading={busy === "pause"}
              onClick={() => void run("pause", () => actions.updateBank(connection.id, { status: connection.status === "paused" ? "active" : "paused" }))}
            >
              {connection.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" aria-label="Remove connection" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {connection.status === "error" || connection.lastError ? (
        <div className={cn("mx-4 mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] sm:mx-5", connection.status === "error" ? "bg-crit-soft text-crit" : "bg-surface-2 text-ink-2")}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{connection.lastError ?? "This connection stopped refreshing."}</span>
          {connection.status === "error" && onReconnect ? (
            <button type="button" className="shrink-0 font-semibold underline" onClick={() => onReconnect(connection)}>
              Reconnect
            </button>
          ) : null}
        </div>
      ) : null}
      {connection.accounts.length ? (
        <div className="divide-y divide-line border-t border-line">
          {connection.accounts.map((a) => (
            <AccountRow key={a.id} account={a} onOpen={() => onAccount(a)} />
          ))}
        </div>
      ) : (
        <p className="border-t border-line px-5 py-4 text-[13px] text-muted">{syncing ? "Fetching accounts…" : "No accounts yet."}</p>
      )}
      <Sheet open={confirming} onClose={() => setConfirming(false)} title={`Remove ${connection.label}?`}>
        <div className="space-y-4">
          <p className="text-[14px] text-ink-2">
            Its accounts and {connection.accounts.reduce((n, a) => n + a.transactionCount, 0)} transactions are deleted from Adminak. Email receipts that were matched to them count on their own again.
            {connection.provider === "teller" ? " To revoke access at the bank too, remove Adminak in Teller or your bank's connected-apps settings." : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy === "delete"}
              onClick={() => void run("delete", () => actions.deleteBank(connection.id), `${connection.label} removed`).then(() => setConfirming(false))}
            >
              Remove
            </Button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}

// ─── Teller Connect ──────────────────────────────────────────────────────────

interface TellerEnrollment {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string; institution: { name: string } };
}

interface TellerConnectInstance {
  open: () => void;
  destroy?: () => void;
}

declare global {
  interface Window {
    TellerConnect?: {
      setup: (opts: {
        applicationId: string;
        environment: string;
        products: string[];
        institution?: string;
        enrollmentId?: string;
        selectAccount?: "disabled" | "single" | "multiple";
        onSuccess: (enrollment: TellerEnrollment) => void;
        onExit?: () => void;
        onFailure?: (failure: { type: string; code: string; message: string }) => void;
      }) => TellerConnectInstance;
    };
  }
}

let tellerScript: Promise<void> | null = null;

function loadTellerConnect(): Promise<void> {
  if (window.TellerConnect) return Promise.resolve();
  tellerScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.teller.io/connect/connect.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      tellerScript = null;
      reject(new Error("Couldn't load Teller Connect. Check your connection (and any content blockers) and try again."));
    };
    document.head.appendChild(script);
  });
  return tellerScript;
}

/** Opens Teller Connect (bank login happens in Teller's window) and stores the resulting enrollment. */
export function useTellerConnect(providers: BankingProviders | undefined) {
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [busy, setBusy] = useState(false);
  const open = async (opts: { institution?: string; enrollmentId?: string } = {}) => {
    if (!providers?.teller.configured || !providers.teller.applicationId) {
      toast.error("Teller isn't set up on the server yet — see the setup steps.");
      return;
    }
    setBusy(true);
    try {
      await loadTellerConnect();
      const connect = window.TellerConnect!.setup({
        applicationId: providers.teller.applicationId,
        environment: providers.teller.environment,
        products: ["transactions", "balance"],
        institution: opts.institution,
        enrollmentId: opts.enrollmentId,
        selectAccount: "multiple",
        onSuccess: (enrollment) => {
          void (async () => {
            try {
              const connection = await actions.connectTeller({
                accessToken: enrollment.accessToken,
                enrollmentId: enrollment.enrollment.id,
                institution: enrollment.enrollment.institution?.name,
              });
              invalidate();
              toast.success(`${connection.label} connected — fetching balances and transactions`);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          })();
        },
        onExit: () => setBusy(false),
        onFailure: (failure) => {
          setBusy(false);
          toast.error(failure.message || "The bank connection didn't complete.");
        },
      });
      connect.open();
    } catch (error) {
      setBusy(false);
      toast.error(errorMessage(error));
    }
  };
  return { open, busy };
}

// ─── Connect sheet ───────────────────────────────────────────────────────────

type ConnectMode = "pick" | "teller-setup" | "simplefin" | "import";

export function ConnectBankSheet({ open, onClose, providers, accounts, initial = "pick" }: { open: boolean; onClose: () => void; providers: BankingProviders | undefined; accounts: FinAccountDTO[]; initial?: ConnectMode }) {
  const [mode, setMode] = useState<ConnectMode>(initial);
  const teller = useTellerConnect(providers);
  useEffect(() => {
    if (open) setMode(initial);
  }, [open, initial]);
  const title = mode === "simplefin" ? "Connect with SimpleFIN" : mode === "import" ? "Import a statement" : mode === "teller-setup" ? "Set up Capital One linking" : "Connect a bank or card";
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={mode === "pick" ? "Read-only. Adminak never sees your bank password." : undefined} wide={mode === "import"}>
      {mode === "pick" ? (
        <div className="space-y-3">
          <ConnectOption
            icon={Landmark}
            title="Capital One"
            badge={providers?.teller.configured ? "One tap" : "Needs setup"}
            tone={providers?.teller.configured ? "good" : "warn"}
            onClick={() => (providers?.teller.configured ? void teller.open({ institution: "capital_one" }).then(onClose) : setMode("teller-setup"))}
            loading={teller.busy}
          >
            Sign in to Capital One in Teller's secure window. Checking, savings and cards — balances and transactions refresh automatically.
          </ConnectOption>
          {providers?.teller.configured ? (
            <ConnectOption icon={Link2} title="Another bank" badge="One tap" tone="good" onClick={() => void teller.open().then(onClose)}>
              Chase, Bank of America, Wells Fargo, Amex, Citi, US Bank and ~5,000 more through Teller.
            </ConnectOption>
          ) : null}
          <ConnectOption icon={Link2} title="Any bank via SimpleFIN" badge="Paste a token" onClick={() => setMode("simplefin")}>
            Link your banks on SimpleFIN Bridge (about $15/year), then paste the setup token here. Works with Capital One and most US banks and credit unions.
          </ConnectOption>
          <ConnectOption icon={FileUp} title="Import a statement file" badge="No setup" tone="good" onClick={() => setMode("import")}>
            Download CSV or OFX/QFX from your bank's website (Capital One: Account → Download transactions) and drop it here.
          </ConnectOption>
        </div>
      ) : mode === "teller-setup" ? (
        <TellerSetupHelp onBack={() => setMode("pick")} onImport={() => setMode("import")} />
      ) : mode === "simplefin" ? (
        <SimplefinForm onDone={onClose} onBack={() => setMode("pick")} />
      ) : (
        <ImportStatement accounts={accounts} onDone={onClose} />
      )}
    </Sheet>
  );
}

function ConnectOption({
  icon: Icon,
  title,
  badge,
  tone = "neutral",
  children,
  onClick,
  loading,
}: {
  icon: typeof Landmark;
  title: string;
  badge: string;
  tone?: "good" | "warn" | "neutral";
  children: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-line-strong disabled:opacity-60">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
        {loading ? <RefreshCw className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{title}</span>
          <Badge tone={tone}>{badge}</Badge>
        </span>
        <span className="mt-1 block text-[13px] text-muted">{children}</span>
      </span>
    </button>
  );
}

function TellerSetupHelp({ onBack, onImport }: { onBack: () => void; onImport: () => void }) {
  return (
    <div className="space-y-4 text-[14px] text-ink-2">
      <p>
        Capital One doesn't offer personal API keys, so live linking goes through <strong className="text-ink">Teller</strong> — a read-only bank API that's free for personal use. One-time setup on the server:
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Create a free account at <ExternalA href="https://teller.io/signup">teller.io</ExternalA> and an application. Copy its <strong className="text-ink">Application ID</strong>.
        </li>
        <li>
          In the Teller dashboard, download the <strong className="text-ink">certificate</strong> and <strong className="text-ink">private key</strong> (certificate.pem, private_key.pem).
        </li>
        <li>
          In Railway → adminak → Variables, add <code className="rounded bg-surface-2 px-1">TELLER_APPLICATION_ID</code>, <code className="rounded bg-surface-2 px-1">TELLER_ENVIRONMENT=development</code>,{" "}
          <code className="rounded bg-surface-2 px-1">TELLER_CERTIFICATE</code> and <code className="rounded bg-surface-2 px-1">TELLER_PRIVATE_KEY</code> (paste each PEM, or its base64).
        </li>
        <li>After the redeploy, come back here and tap Capital One. Teller's development tier covers up to 100 live connections at no cost.</li>
      </ol>
      <p className="text-[13px] text-muted">Until then, a statement file gets the same analysis — just without automatic refresh.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" icon={FileUp} onClick={onImport}>
          Import a file instead
        </Button>
      </div>
    </div>
  );
}

function SimplefinForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.connectSimplefin(token.trim());
      invalidate();
      if (res.outcome.ok) toast.success(`${res.connection.label} connected — ${res.outcome.inserted} transactions, ${res.outcome.matched} matched to receipts`);
      else toast.error(`Connected, but the first refresh failed: ${res.outcome.error}`);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-2">
        <li>
          Open <ExternalA href="https://beta-bridge.simplefin.org/">SimpleFIN Bridge</ExternalA>, create an account and connect Capital One (and any other banks).
        </li>
        <li>
          Choose <strong className="text-ink">New connection → Setup token</strong> and copy the token.
        </li>
        <li>Paste it below. It works once; Adminak exchanges it for read-only access and keeps that encrypted.</li>
      </ol>
      <Field label="Setup token">
        <Textarea value={token} onChange={(e) => setToken(e.target.value)} rows={4} placeholder="aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS8..." className="font-mono text-[12.5px]" autoComplete="off" spellCheck={false} />
      </Field>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" loading={busy} disabled={token.trim().length < 20} onClick={() => void submit()}>
          Connect
        </Button>
      </div>
    </div>
  );
}

// ─── Statement import ────────────────────────────────────────────────────────

const MAPPING_FIELDS: { key: keyof Omit<CsvMapping, "positiveIsOut">; label: string; optional?: boolean }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount", optional: true },
  { key: "debit", label: "Debit (money out)", optional: true },
  { key: "credit", label: "Credit (money in)", optional: true },
  { key: "category", label: "Category", optional: true },
];

function ImportStatement({ accounts, onDone }: { accounts: FinAccountDTO[]; onDone: () => void }) {
  const fmt = useFmt();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const [type, setType] = useState<FinAccountType>("credit");
  const [mask, setMask] = useState("");
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const runPreview = async (next: { name: string; content: string }, map: CsvMapping | null) => {
    setBusy(true);
    setError(null);
    try {
      const p = await actions.previewImport({ filename: next.name, content: next.content, mapping: map });
      setPreview(p);
      setMapping(p.mapping);
      setName(p.account.name ?? "");
      setType(p.account.type ?? "checking");
      setMask(p.account.mask ?? "");
      // Re-importing into an account we already know about: pick it.
      const existing = accounts.find((a) => p.account.mask && a.mask === p.account.mask);
      setTarget(existing ? String(existing.id) : "new");
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (f: File) => {
    if (f.size > 8 * 1024 * 1024) {
      setError("That file is over 8 MB. Export a shorter date range.");
      return;
    }
    const content = await f.text();
    const next = { name: f.name, content };
    setFile(next);
    setResult(null);
    await runPreview(next, null);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void readFile(f);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await actions.importStatement({
        filename: file.name,
        content: file.content,
        mapping,
        ...(target === "new" ? { account: { name: name.trim() || "Imported account", type, institution: preview?.account.institution ?? null, mask: /^\d{2,6}$/.test(mask) ? mask : null } } : { finAccountId: Number(target) }),
      });
      setResult(res);
      invalidate();
      toast.success(`Imported ${res.inserted} transactions${res.duplicates ? ` (${res.duplicates} already here)` : ""}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-good-soft p-4 text-[14px] text-ink">
          <p className="font-semibold">Imported {result.inserted} transactions</p>
          <p className="mt-1 text-ink-2">
            {result.from && result.to ? `${fmt.date(`${result.from}T12:00:00Z`, "medium")} – ${fmt.date(`${result.to}T12:00:00Z`, "medium")}. ` : ""}
            {result.duplicates ? `${result.duplicates} were already imported and skipped. ` : ""}
            {result.matched ? `${result.matched} matched to receipts in your mail.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setResult(null);
              setFile(null);
              setPreview(null);
            }}
          >
            Import another
          </Button>
          <Button variant="primary" className="flex-1" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn("rounded-2xl border border-dashed p-5 text-center transition-colors", dragOver ? "border-accent bg-accent-soft/40" : "border-line-strong")}
      >
        <Upload className="mx-auto size-6 text-muted" aria-hidden />
        <p className="mt-2 text-[14px] text-ink">{file ? file.name : "Drop a CSV, OFX, QFX or QBO file"}</p>
        <p className="mt-1 text-[12.5px] text-muted">Capital One: sign in → pick the account → “Download transactions” → CSV.</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => input.current?.click()} loading={busy && !preview}>
          {file ? "Choose another file" : "Choose file"}
        </Button>
        <input ref={input} type="file" accept=".csv,.ofx,.qfx,.qbo,.txt,text/csv" className="hidden" onChange={onPick} />
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-xl bg-crit-soft px-3 py-2 text-[13px] text-crit">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {preview ? (
        <>
          <div className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="good">{preview.formatLabel}</Badge>
              <span className="text-[13px] text-muted">
                {preview.count} transactions
                {preview.from && preview.to ? ` · ${fmt.date(`${preview.from}T12:00:00Z`, "monthDay")} – ${fmt.date(`${preview.to}T12:00:00Z`, "medium")}` : ""}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              Out <strong className="tabular text-ink">{fmt.money(preview.totalOut, preview.currency)}</strong> · In <strong className="tabular text-good">{fmt.money(preview.totalIn, preview.currency)}</strong>
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="mt-1 text-[12.5px] text-med">
                {w}
              </p>
            ))}
            <ul className="mt-3 divide-y divide-line border-t border-line text-[12.5px]">
              {preview.sample.map((s, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5">
                  <span className="tabular shrink-0 text-muted">{fmt.date(`${s.date}T12:00:00Z`, "monthDay")}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{s.description}</span>
                  <span className={cn("tabular shrink-0", s.amount > 0 ? "text-good" : "text-ink")}>
                    {s.amount > 0 ? "+" : "−"}
                    {fmt.money(Math.abs(s.amount), preview.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {preview.kind === "csv" && mapping && preview.columns.length ? (
            <details className="rounded-2xl border border-line p-4" open={preview.format === "generic_csv"}>
              <summary className="cursor-pointer text-[14px] font-medium text-ink">Columns {preview.format === "generic_csv" ? "(check these)" : ""}</summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {MAPPING_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Select value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                      <option value={-1}>{f.optional ? "— none —" : "Pick a column"}</option>
                      {preview.columns.map((c, i) => (
                        <option key={i} value={i}>
                          {c || `Column ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
              {mapping.amount >= 0 && mapping.direction < 0 ? (
                <div className="mt-3">
                  <Switch checked={mapping.positiveIsOut} onChange={(v) => setMapping({ ...mapping, positiveIsOut: v })} label="Positive amounts are money out" description="Most card exports list purchases as positive numbers." />
                </div>
              ) : null}
              <Button size="sm" variant="secondary" className="mt-3" loading={busy} onClick={() => file && void runPreview(file, mapping)}>
                Re-read with these columns
              </Button>
            </details>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-line p-4">
            <Field label="Import into">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">A new account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountName(a)} ({ACCOUNT_TYPE_LABEL[a.type]})
                  </option>
                ))}
              </Select>
            </Field>
            {target === "new" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Capital One Venture" />
                </Field>
                <Field label="Type">
                  <Select value={type} onChange={(e) => setType(e.target.value as FinAccountType)}>
                    {FIN_ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Last 4">
                  <Input value={mask} onChange={(e) => setMask(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" className="w-24" placeholder="1188" />
                </Field>
              </div>
            ) : null}
            <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={() => void doImport()}>
              Import {preview.count} transactions
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Account editor ──────────────────────────────────────────────────────────

export function BankAccountSheet({ account, connection, onClose }: { account: FinAccountDTO | null; connection: FinConnectionDTO | null; onClose: () => void }) {
  const fmt = useFmt();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<FinAccountType>(account?.type ?? "checking");
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const save = async (body: Parameters<typeof actions.updateBankAccount>[1], message = "Saved") => {
    setBusy(true);
    try {
      await actions.updateBankAccount(account.id, body);
      invalidate();
      toast.success(message);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const removable = connection?.provider === "file";
  return (
    <Sheet open={!!account} onClose={onClose} title={accountName(account)} subtitle={`${ACCOUNT_TYPE_LABEL[account.type]}${account.institution ? ` · ${account.institution}` : ""}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="eyebrow">{account.type === "credit" || account.type === "loan" ? "Owed" : "Balance"}</p>
            <p className="display mt-1 text-[26px] text-ink">{fmt.money(account.balanceCurrent, account.currency)}</p>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="eyebrow">{account.creditLimit ? "Limit" : "Available"}</p>
            <p className="display mt-1 text-[26px] text-ink">{fmt.money(account.creditLimit ?? account.balanceAvailable, account.currency)}</p>
          </div>
        </div>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" hint="Cards and loans count as money owed; checking and savings as cash.">
          <Select value={type} onChange={(e) => setType(e.target.value as FinAccountType)}>
            {FIN_ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" className="w-full" loading={busy} onClick={() => void save({ name: name.trim() || account.name, type })}>
          Save
        </Button>
        <div className="space-y-3 border-t border-line pt-4">
          <Switch checked={account.hidden} onChange={(v) => void save({ hidden: v }, v ? "Hidden from totals" : "Shown in totals")} label="Hide from totals" description="For joint or business accounts you don't want in your net worth." />
          <Switch
            checked={account.invertAmounts}
            onChange={(v) => void save({ invertAmounts: v }, "Flipped money in / money out for this account")}
            label="Purchases show up as money in"
            description="Turn on if this account's purchases and payments look reversed. Adminak detects this for new cards."
          />
        </div>
        {removable ? (
          <Button
            variant="danger"
            className="w-full"
            icon={Trash2}
            onClick={() =>
              void (async () => {
                try {
                  await actions.deleteBankAccount(account.id);
                  invalidate();
                  toast.success("Account and its imported transactions removed");
                  onClose();
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              })()
            }
          >
            Remove imported account
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

// ─── Transaction detail ──────────────────────────────────────────────────────

export function ChargeSheet({ charge, onClose, onOpenMessage }: { charge: ChargeDTO | null; onClose: () => void; onOpenMessage: (id: number) => void }) {
  const fmt = useFmt();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [category, setCategory] = useState<SpendCategory>(charge?.spendCategory ?? "other");
  const [kind, setKind] = useState<ChargeKind>(charge?.kind ?? "purchase");
  const [everywhere, setEverywhere] = useState(true);
  const [busy, setBusy] = useState(false);
  const merchant = charge?.merchant ?? charge?.vendor?.name ?? charge?.description ?? "";
  const changed = !!charge && (category !== charge.spendCategory || kind !== charge.kind);
  const kinds = useMemo(() => CHARGE_KINDS.filter((k) => (charge?.direction === "in" ? ["deposit", "refund", "transfer_in", "card_payment"] : ["purchase", "subscription", "bill_payment", "fee", "transfer_out", "card_payment"]).includes(k)), [charge?.direction]);
  if (!charge) return null;
  const save = async () => {
    setBusy(true);
    try {
      const res = await actions.updateCharge(charge.id, { spendCategory: category, kind, applyToMerchant: !!charge.merchant && everywhere });
      invalidate();
      toast.success(res.applied > 1 ? `Updated ${res.applied} ${merchant} transactions` : "Updated");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const incoming = charge.direction === "in";
  return (
    <Sheet open={!!charge} onClose={onClose} title={merchant} subtitle={fmt.date(charge.occurredAt, "long")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {charge.vendor ? (
            <VendorMark vendor={charge.vendor} size="lg" />
          ) : (
            <span className={cn("grid size-12 place-items-center rounded-2xl", incoming ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2")}>
              {incoming ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
            </span>
          )}
          <div>
            <p className={cn("display text-[34px] leading-none", incoming ? "text-good" : "text-ink")}>
              {incoming ? "+" : "−"}
              {fmt.money(charge.amount, charge.currency)}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {charge.account ? accountName(charge.account) : charge.paymentMethod ?? titleCase(charge.source)}
              {charge.status !== "posted" ? ` · ${titleCase(charge.status)}` : ""}
            </p>
          </div>
        </div>

        {charge.receipt ? (
          <button type="button" onClick={() => charge.receipt?.messageId && onOpenMessage(charge.receipt.messageId)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left hover:bg-surface-2/60">
            <Mail className="size-4 shrink-0 text-good" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink">Receipt matched from your mail</span>
              <span className="block truncate text-[12.5px] text-muted">{charge.receipt.description}</span>
            </span>
            {charge.receipt.messageId ? <ExternalLink className="size-4 text-muted" aria-hidden /> : null}
          </button>
        ) : charge.account && charge.direction === "out" && (charge.kind === "purchase" || charge.kind === "subscription") ? (
          <p className="rounded-2xl bg-surface-2 px-3 py-2 text-[12.5px] text-muted">No receipt for this in your mail.</p>
        ) : null}
        {charge.messageId && !charge.receipt ? (
          <Button variant="secondary" className="w-full" icon={Mail} onClick={() => onOpenMessage(charge.messageId!)}>
            Open the email
          </Button>
        ) : null}

        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as SpendCategory)}>
            {SPEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SPEND_CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" hint="Card payments and transfers never count as spending or income.">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {CHARGE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {charge.merchant ? <Switch checked={everywhere} onChange={setEverywhere} label={`Always for ${merchant}`} description="Applies to past and future transactions from this merchant." /> : null}
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!changed} onClick={() => void save()}>
          Save
        </Button>
        {charge.categorySource ? (
          <p className="text-center text-[12px] text-muted">
            Category from{" "}
            {charge.categorySource === "user" ? "you" : charge.categorySource === "rule" ? "your merchant rule" : charge.categorySource === "ai" ? "AI" : charge.categorySource === "bank" ? "the bank" : "Adminak's rules"}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

export function useBankAccounts(connections: FinConnectionDTO[] | undefined): FinAccountDTO[] {
  return useMemo(() => (connections ?? []).flatMap((c) => c.accounts), [connections]);
}

export function SegmentedAccountFilter({ accounts, value, onChange }: { accounts: FinAccountDTO[]; value: string; onChange: (v: string) => void }) {
  if (accounts.length === 0) return null;
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={onChange}
      options={[{ value: "", label: "All sources" }, { value: "bank", label: "Bank" }, { value: "email", label: "Email" }]}
    />
  );
}
