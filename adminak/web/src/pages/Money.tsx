import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, CreditCard, Download, ExternalLink, FileText, Mail, Plus, Receipt, RotateCcw, Search, Trash2, Wallet } from "lucide-react";
import { SPEND_CATEGORY_META } from "@shared/catalog";
import { formatTotals, sumByCurrency, titleCase } from "@shared/format";
import { BILL_KINDS, SPEND_CATEGORIES, type BillDTO, type BillKind, type ChargeDTO, type MoneyDTO, type SpendCategory } from "@shared/types";
import { del, errorMessage, patch, post } from "../lib/api";
import { useCharges, useMoney } from "../lib/queries";
import { useDebounced, useTakeParam } from "../lib/hooks";
import { useFmt } from "../lib/prefs";
import { cn, pct } from "../lib/utils";
import { DueChip } from "../components/alerts";
import { CategoryBars, SpendBars } from "../components/charts";
import { InsightRow } from "../components/insight";
import { PageHeader } from "../components/layout";
import { MessageSheet } from "../components/message";
import { Sheet } from "../components/sheet";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, ExternalA, Field, Input, Segmented, Select, Skeleton, Stat, Switch, Textarea, type Tone } from "../components/ui";
import { VendorMark } from "../components/vendor";

type Tab = "overview" | "bills" | "activity" | "documents";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "CHF", "AED"];

const BILL_KIND_LABEL: Record<BillKind, string> = {
  credit_card: "Credit card",
  utility: "Utility",
  phone: "Phone",
  internet: "Internet",
  insurance: "Insurance",
  rent: "Rent / mortgage",
  loan: "Loan",
  tax: "Tax",
  subscription: "Subscription",
  other: "Other",
};

function billStatus(b: BillDTO): { label: string; tone: Tone } {
  if (b.status === "paid") return { label: "Paid", tone: "good" };
  if (b.status === "overdue") return { label: "Overdue", tone: "bad" };
  if (b.autopay || b.status === "scheduled") return { label: "Autopay", tone: "info" };
  return { label: "Due", tone: "warn" };
}

function BillRow({ bill, onOpen }: { bill: BillDTO; onOpen: () => void }) {
  const fmt = useFmt();
  const status = billStatus(bill);
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 sm:px-5", bill.status === "paid" && "opacity-70")}>
      <VendorMark vendor={bill.vendor} name={bill.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-ink">{bill.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <Badge tone={status.tone}>{status.label}</Badge>
          {bill.status !== "paid" && bill.dueAt ? <DueChip iso={bill.dueAt} /> : null}
          {bill.status === "paid" && bill.paidAt ? <span>Paid {fmt.date(bill.paidAt, "monthDay")}</span> : null}
          {bill.accountHint && !bill.name.includes(bill.accountHint) ? <span>•• {bill.accountHint}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block text-[15px] font-semibold text-ink">{bill.amountDue !== null ? fmt.money(bill.amountDue, bill.currency) : "—"}</span>
        {bill.minimumDue !== null && bill.minimumDue !== bill.amountDue ? <span className="tabular block text-[11.5px] text-muted">min {fmt.money(bill.minimumDue, bill.currency)}</span> : null}
      </span>
    </button>
  );
}

function BillSheet({ bill, onClose }: { bill: BillDTO | null; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [messageId, setMessageId] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const refresh = async () => {
    await Promise.all(["money", "overview", "alerts", "timeline"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };
  const run = async (key: string, fn: () => Promise<unknown>, message: string, close = false) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      toast.success(message);
      if (close) onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const close = () => {
    setNotes(null);
    setAmount(null);
    setDue(null);
    setConfirm(false);
    onClose();
  };
  if (!bill) return null;
  const status = billStatus(bill);
  const dirty = notes !== null || amount !== null || due !== null;
  return (
    <>
      <Sheet open onClose={close} title={bill.name} subtitle={[BILL_KIND_LABEL[bill.kind], bill.accountHint && !bill.name.includes(bill.accountHint) ? `•• ${bill.accountHint}` : null, bill.source === "manual" ? "Added by you" : "Detected from email"].filter(Boolean).join(" · ")}>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <VendorMark vendor={bill.vendor} name={bill.name} size="lg" />
            <div>
              <div className="tabular text-[28px] leading-none font-semibold tracking-tight text-ink">{bill.amountDue !== null ? fmt.money(bill.amountDue, bill.currency) : "—"}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={status.tone}>{status.label}</Badge>
                {bill.dueAt && bill.status !== "paid" ? <DueChip iso={bill.dueAt} /> : null}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            {[
              { label: "Due date", value: bill.dueAt ? fmt.date(bill.dueAt, "medium") : "—" },
              { label: "Minimum due", value: bill.minimumDue !== null ? fmt.money(bill.minimumDue, bill.currency) : "—" },
              { label: "Statement balance", value: bill.statementBalance !== null ? fmt.money(bill.statementBalance, bill.currency) : "—" },
              { label: "Statement date", value: bill.statementAt ? fmt.date(bill.statementAt, "medium") : "—" },
              ...(bill.paidAt ? [{ label: "Paid", value: `${fmt.date(bill.paidAt, "medium")}${bill.paidAmount !== null ? ` · ${fmt.money(bill.paidAmount, bill.currency)}` : ""}` }] : []),
            ].map((row) => (
              <div key={row.label} className="rounded-2xl bg-surface-2 p-3">
                <dt className="eyebrow">{row.label}</dt>
                <dd className="tabular mt-1 truncate text-[14.5px] font-semibold text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2">
            {bill.status !== "paid" ? (
              <Button variant="primary" icon={Check} loading={busy === "paid"} onClick={() => void run("paid", () => patch(`/bills/${bill.id}`, { status: "paid" }), "Marked as paid", true)}>
                Mark paid
              </Button>
            ) : (
              <Button icon={RotateCcw} loading={busy === "unpaid"} onClick={() => void run("unpaid", () => patch(`/bills/${bill.id}`, { status: "due" }), "Marked as unpaid", true)}>
                Not paid yet
              </Button>
            )}
            {bill.payUrl ? (
              <ExternalA href={bill.payUrl} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink">
                Pay now <ExternalLink className="size-4" aria-hidden />
              </ExternalA>
            ) : null}
            {bill.messageId ? (
              <Button variant="ghost" icon={Mail} onClick={() => setMessageId(bill.messageId)}>
                Source email
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line p-4">
            <Switch
              checked={bill.autopay}
              disabled={busy === "autopay"}
              onChange={(v) => void run("autopay", () => patch(`/bills/${bill.id}`, { autopay: v, ...(bill.status !== "paid" ? { status: v ? "scheduled" : "due" } : {}) }), v ? "Autopay on — reminders become FYIs" : "Autopay off")}
              label="Autopay is set up"
              description="Adminak still reminds you, but treats it as scheduled rather than urgent."
            />
          </div>

          <section className="space-y-3">
            <h4 className="eyebrow">Edit</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount due" htmlFor="b-amt">
                <Input id="b-amt" inputMode="decimal" value={amount ?? (bill.amountDue !== null ? String(bill.amountDue) : "")} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Due date" htmlFor="b-due">
                <Input id="b-due" type="date" value={due ?? bill.dueAt?.slice(0, 10) ?? ""} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="b-notes">
              <Textarea id="b-notes" value={notes ?? bill.notes ?? ""} onChange={(e) => setNotes(e.target.value)} placeholder="Pay from checking, dispute the late fee…" />
            </Field>
            {dirty ? (
              <Button
                variant="primary"
                className="w-full"
                loading={busy === "save"}
                onClick={() =>
                  void run(
                    "save",
                    async () => {
                      const body: Record<string, unknown> = {};
                      if (notes !== null) body.notes = notes || null;
                      if (amount !== null) body.amountDue = amount.trim() ? Number(amount.replace(/[^\d.]/g, "")) : null;
                      if (due !== null) body.dueAt = due ? new Date(`${due}T12:00:00Z`).toISOString() : null;
                      await patch(`/bills/${bill.id}`, body);
                      setNotes(null);
                      setAmount(null);
                      setDue(null);
                    },
                    "Bill updated",
                  )
                }
              >
                Save changes
              </Button>
            ) : null}
          </section>

          <div className="border-t border-line pt-4">
            {confirm ? (
              <Button size="sm" variant="danger" icon={Trash2} loading={busy === "delete"} onClick={() => void run("delete", () => del(`/bills/${bill.id}`), "Bill removed", true)}>
                Confirm remove
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)}>
                Remove bill
              </Button>
            )}
          </div>
        </div>
      </Sheet>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </>
  );
}

function AddBillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const empty = { name: "", kind: "utility" as BillKind, amountDue: "", currency: fmt.currency, dueAt: "", autopay: false, payUrl: "", notes: "" };
  const [f, setF] = useState(empty);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/bills", {
        name: f.name.trim(),
        kind: f.kind,
        amountDue: f.amountDue.trim() ? Number(f.amountDue.replace(/[^\d.]/g, "")) : null,
        currency: f.currency,
        dueAt: f.dueAt,
        autopay: f.autopay,
        payUrl: f.payUrl.trim(),
        notes: f.notes.trim() || undefined,
      });
      await Promise.all(["money", "overview", "timeline"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.success(`${f.name} added — you'll get a reminder before it's due`);
      setF(empty);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a bill" subtitle="Rent, a utility that only sends paper statements, a loan — anything with a due date.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="nb-name">
          <Input id="nb-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rent, Electricity, Car loan…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="nb-kind">
            <Select id="nb-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as BillKind })}>
              {BILL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {BILL_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="nb-due">
            <Input id="nb-due" type="date" required value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Amount due" htmlFor="nb-amt">
            <Input id="nb-amt" inputMode="decimal" value={f.amountDue} onChange={(e) => setF({ ...f, amountDue: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Currency" htmlFor="nb-cur">
            <Select id="nb-cur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {[...new Set([f.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Payment link" htmlFor="nb-url">
          <Input id="nb-url" type="url" value={f.payUrl} onChange={(e) => setF({ ...f, payUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Notes" htmlFor="nb-notes">
          <Textarea id="nb-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="rounded-2xl border border-line p-4">
          <Switch checked={f.autopay} onChange={(v) => setF({ ...f, autopay: v })} label="Autopay is set up" />
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Add bill
        </Button>
      </form>
    </Sheet>
  );
}

function ChargeRow({ charge, onOpen, onDelete }: { charge: ChargeDTO; onOpen?: () => void; onDelete?: () => void }) {
  const fmt = useFmt();
  const incoming = charge.direction === "in";
  return (
    <div className="group flex items-center gap-3 px-4 py-3 sm:px-5">
      <button type="button" onClick={onOpen} disabled={!onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {charge.vendor ? (
          <VendorMark vendor={charge.vendor} size="sm" />
        ) : (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", incoming ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2")}>
            {incoming ? <ArrowDownLeft className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{charge.vendor?.name ?? charge.description}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span>{fmt.date(charge.occurredAt, "monthDay")}</span>
            <span aria-hidden>·</span>
            <span>{SPEND_CATEGORY_META[charge.spendCategory]?.label ?? charge.spendCategory}</span>
            {charge.paymentMethod ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{charge.paymentMethod}</span>
              </>
            ) : null}
            {charge.status !== "posted" ? <Badge tone={charge.status === "failed" ? "bad" : charge.status === "refunded" ? "good" : "neutral"}>{titleCase(charge.status)}</Badge> : null}
            {charge.source === "manual" ? <Badge>Manual</Badge> : null}
          </span>
        </span>
      </button>
      <span className={cn("tabular shrink-0 text-[14.5px] font-semibold", incoming ? "text-good" : "text-ink", charge.status === "failed" && "line-through opacity-60")}>
        {incoming ? "+" : "−"}
        {fmt.money(charge.amount, charge.currency)}
      </span>
      {onDelete ? (
        <button type="button" onClick={onDelete} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-crit-soft hover:text-crit" aria-label="Delete transaction">
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function AddChargeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const empty = { description: "", amount: "", currency: fmt.currency, direction: "out" as "in" | "out", spendCategory: "other" as SpendCategory, occurredAt: today };
  const [f, setF] = useState(empty);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/charges", { ...f, amount: Number(f.amount.replace(/[^\d.]/g, "")), occurredAt: new Date(`${f.occurredAt}T12:00:00`).toISOString() });
      await Promise.all(["money", "charges", "overview"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.success("Transaction added");
      setF(empty);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a transaction" subtitle="Cash, a transfer, or anything that didn't arrive by email.">
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          className="w-full"
          value={f.direction}
          onChange={(v) => setF({ ...f, direction: v, spendCategory: v === "in" ? "income" : f.spendCategory === "income" ? "other" : f.spendCategory })}
          options={[
            { value: "out", label: "Money out" },
            { value: "in", label: "Money in" },
          ]}
        />
        <Field label="Description" htmlFor="nc-desc">
          <Input id="nc-desc" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Farmers market, Paycheck…" />
        </Field>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Amount" htmlFor="nc-amt">
            <Input id="nc-amt" required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="nc-cur">
            <Select id="nc-cur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {[...new Set([f.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="nc-cat">
            <Select id="nc-cat" value={f.spendCategory} onChange={(e) => setF({ ...f, spendCategory: e.target.value as SpendCategory })}>
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SPEND_CATEGORY_META[c].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="nc-date">
            <Input id="nc-date" type="date" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Add transaction
        </Button>
      </form>
    </Sheet>
  );
}

function OverviewTab({ money, onBill }: { money: MoneyDTO; onBill: (b: BillDTO) => void }) {
  const fmt = useFmt();
  const [metric, setMetric] = useState<"out" | "in">("out");
  const [messageId, setMessageId] = useState<number | null>(null);
  const cur = money.baseCurrency;
  const thisMonth = money.monthly.at(-1);
  const lastMonth = money.monthly.at(-2);
  const upcoming = money.bills.filter((b) => b.status !== "paid").slice(0, 5);
  // Average over completed months that actually have data, so a short history isn't diluted by empty months.
  const tracked = money.monthly.slice(0, -1).filter((m) => m.out > 0);
  const avg = tracked.length ? tracked.reduce((s, m) => s + m.out, 0) / tracked.length : null;
  const vsAvg = thisMonth && avg ? pct(thisMonth.out, avg) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={thisMonth ? `Spent in ${thisMonth.label}` : "Spent this month"}
          value={<span className="tabular">{fmt.money(thisMonth?.out ?? 0, cur, { whole: (thisMonth?.out ?? 0) >= 1000 })}</span>}
          hint={lastMonth && lastMonth.out > 0 ? `${lastMonth.label}: ${fmt.money(lastMonth.out, cur, { whole: true })}` : "month to date"}
          tone={vsAvg !== null && vsAvg > 25 ? "warn" : "neutral"}
        />
        <Stat label="Money in (30d)" value={<span className="tabular">{formatTotals(money.incomeLast30, { currency: cur, whole: true })}</span>} hint="deposits, payroll & transfers" />
        <Stat
          label="Bills due"
          value={money.billsSummary.dueCount}
          hint={money.billsSummary.dueCount ? formatTotals(money.billsSummary.dueTotal, { currency: cur }) : "nothing outstanding"}
          tone={money.billsSummary.overdueCount ? "bad" : "neutral"}
        />
        <Stat label="Monthly average" value={<span className="tabular">{avg !== null ? fmt.money(avg, cur, { whole: true }) : "—"}</span>} hint={tracked.length ? `over ${tracked.length} month${tracked.length === 1 ? "" : "s"}` : "needs a full month"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">{metric === "out" ? "Spending" : "Money in"} by month</h2>
            <Segmented
              size="sm"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "out", label: "Out" },
                { value: "in", label: "In" },
              ]}
            />
          </div>
          <SpendBars data={money.monthly} currency={cur} metric={metric} />
          <p className="mt-2 text-[12px] text-muted">From receipts, bank alerts and payment confirmations in your mail. The current month is shown lighter while it's in progress.</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Where it went · 30 days</h2>
          {money.spendByCategory.length ? (
            <CategoryBars rows={money.spendByCategory.slice(0, 7).map((c) => ({ label: SPEND_CATEGORY_META[c.category]?.label ?? c.category, value: c.total }))} currency={cur} />
          ) : (
            <EmptyState icon={Wallet} title="No spending yet" className="py-6" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Coming due" icon={CalendarClock} />
          <div className="mt-2 divide-y divide-line">
            {upcoming.length ? (
              upcoming.map((b) => <BillRow key={b.id} bill={b} onOpen={() => onBill(b)} />)
            ) : (
              <EmptyState icon={Check} title="No bills outstanding" className="py-8" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Top merchants · 90 days" icon={Receipt} />
          <ul className="mt-2 divide-y divide-line">
            {money.topMerchants.slice(0, 7).map((m) => (
              <li key={m.name} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <VendorMark vendor={m.vendor} name={m.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{m.name}</span>
                  <span className="block text-[12px] text-muted">
                    {m.count} charge{m.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tabular text-[14px] font-semibold text-ink">{fmt.money(m.total, cur)}</span>
              </li>
            ))}
            {money.topMerchants.length === 0 ? <li className="px-5 py-6 text-center text-sm text-muted">No purchases tracked yet.</li> : null}
          </ul>
        </Card>
      </div>

      {money.financeEvents.length ? (
        <Card>
          <CardHeader title="Bank & account activity" icon={CreditCard} eyebrow="Fraud alerts, balances, deposits and transfers" />
          <div className="mt-2 divide-y divide-line">
            {money.financeEvents.slice(0, 10).map((i) => (
              <InsightRow key={i.id} item={i} onOpen={i.messageId ? () => setMessageId(i.messageId) : undefined} />
            ))}
          </div>
        </Card>
      ) : null}
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </div>
  );
}

function BillsTab({ money, onBill, onAdd }: { money: MoneyDTO; onBill: (b: BillDTO) => void; onAdd: () => void }) {
  const fmt = useFmt();
  const groups = [
    { key: "overdue", title: "Overdue", items: money.bills.filter((b) => b.status === "overdue") },
    { key: "due", title: "To pay", items: money.bills.filter((b) => b.status === "due") },
    { key: "auto", title: "On autopay", items: money.bills.filter((b) => b.status === "scheduled") },
    { key: "paid", title: "Paid recently", items: money.bills.filter((b) => b.status === "paid") },
  ].filter((g) => g.items.length);
  if (!money.bills.length) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="No bills yet"
          action={
            <Button variant="primary" icon={Plus} onClick={onAdd}>
              Add a bill
            </Button>
          }
        >
          Credit card statements, utilities, phone and insurance bills are picked up automatically from your mail.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const total = sumByCurrency(g.items, (b) => b.amountDue, (b) => b.currency);
        return (
          <Card key={g.key} className="overflow-hidden">
            <div className="flex items-baseline justify-between px-4 pt-4 pb-1 sm:px-5">
              <h2 className={cn("text-[15px] font-semibold", g.key === "overdue" ? "text-crit" : "text-ink")}>
                {g.title} <span className="text-[13px] font-normal text-muted">{g.items.length}</span>
              </h2>
              {g.key !== "paid" ? <span className="tabular text-[13px] font-medium text-ink-2">{formatTotals(total, { currency: fmt.currency })}</span> : null}
            </div>
            <div className="divide-y divide-line">
              {g.items.map((b) => (
                <BillRow key={b.id} bill={b} onOpen={() => onBill(b)} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ActivityTab({ onAdd }: { onAdd: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<"all" | "out" | "in">("all");
  const [category, setCategory] = useState<SpendCategory | "">("");
  const [messageId, setMessageId] = useState<number | null>(null);
  const debounced = useDebounced(q.trim());
  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: "300" });
    if (debounced) p.set("q", debounced);
    if (direction !== "all") p.set("direction", direction);
    if (category) p.set("category", category);
    return p;
  }, [debounced, direction, category]);
  const charges = useCharges(params);
  const fmt = useFmt();
  const list = charges.data ?? [];
  const totals = {
    out: sumByCurrency(list.filter((c) => c.direction === "out" && c.status === "posted"), (c) => c.amount, (c) => c.currency),
    in: sumByCurrency(list.filter((c) => c.direction === "in" && c.status === "posted"), (c) => c.amount, (c) => c.currency),
  };
  const remove = async (c: ChargeDTO) => {
    try {
      await del(`/charges/${c.id}`);
      await Promise.all(["charges", "money", "overview"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.success("Transaction deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  // Group by month for scanning.
  const groups: { label: string; items: ChargeDTO[] }[] = [];
  for (const c of list) {
    const label = fmt.date(c.occurredAt, "monthYear");
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchants & descriptions" className="pl-10" type="search" aria-label="Search transactions" />
        </div>
        <div className="flex gap-2">
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: "all", label: "All" },
              { value: "out", label: "Out" },
              { value: "in", label: "In" },
            ]}
          />
          <Select value={category} onChange={(e) => setCategory(e.target.value as SpendCategory | "")} className="w-auto" aria-label="Category">
            <option value="">All categories</option>
            {SPEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SPEND_CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-muted">
        <span>
          {list.length} transaction{list.length === 1 ? "" : "s"} · out <strong className="tabular text-ink">{formatTotals(totals.out, { currency: fmt.currency })}</strong> · in{" "}
          <strong className="tabular text-good">{formatTotals(totals.in, { currency: fmt.currency })}</strong>
        </span>
        <span className="flex gap-1">
          <a href="/api/export/charges" download className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 font-medium text-ink-2 hover:bg-surface-2">
            <Download className="size-4" aria-hidden /> CSV
          </a>
          <Button size="sm" icon={Plus} onClick={onAdd}>
            Add
          </Button>
        </span>
      </div>
      <Card className="overflow-hidden">
        {charges.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions">
            {debounced || category || direction !== "all" ? "Nothing matches these filters." : "Receipts and bank alerts become transactions automatically."}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="border-b border-line bg-surface-3/80 px-4 py-1.5 text-[12px] font-semibold tracking-wide text-ink-2 uppercase sm:px-5">{g.label}</div>
              <div className="divide-y divide-line">
                {g.items.map((c) => (
                  <ChargeRow key={c.id} charge={c} onOpen={c.messageId ? () => setMessageId(c.messageId) : undefined} onDelete={c.source === "manual" ? () => void remove(c) : undefined} />
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </div>
  );
}

function DocumentsTab({ money }: { money: MoneyDTO }) {
  const [messageId, setMessageId] = useState<number | null>(null);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Statements & documents" icon={FileText} eyebrow="Tax forms, statements, investment and credit updates" />
      <div className="mt-2 divide-y divide-line">
        {money.documents.length ? (
          money.documents.map((d) => (
            <div key={d.id}>
              <InsightRow item={d} onOpen={d.messageId ? () => setMessageId(d.messageId) : undefined} />
              {d.links.length ? (
                <div className="flex flex-wrap gap-2 px-4 pb-3 pl-[60px] sm:px-5 sm:pl-[64px]">
                  {d.links.slice(0, 2).map((l) => (
                    <ExternalA key={l.url} href={l.url} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-ink hover:bg-surface-2">
                      {l.label} <ExternalLink className="size-3.5 text-muted" aria-hidden />
                    </ExternalA>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState icon={FileText} title="No documents yet">
            1099s, W-2s, bank and brokerage statements and credit score changes will collect here.
          </EmptyState>
        )}
      </div>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </Card>
  );
}

export function MoneyPage() {
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const [billId, setBillId] = useState<number | null>(null);
  const [addBill, setAddBill] = useState(false);
  const [addCharge, setAddCharge] = useState(false);
  useTakeParam("bill", (v) => setBillId(Number(v) || null));
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "overview") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };
  const bill = money.data?.bills.find((b) => b.id === billId) ?? null;
  const data = money.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills & spending"
        description="Bills and due dates, every receipt and bank alert as a transaction, and where your money goes."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => (tab === "activity" ? setAddCharge(true) : setAddBill(true))}>
            {tab === "activity" ? "Transaction" : "Bill"}
          </Button>
        }
      />
      <Segmented
        className="w-full sm:w-auto"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "bills", label: "Bills", count: data?.billsSummary.dueCount || undefined },
          { value: "activity", label: "Activity" },
          { value: "documents", label: "Docs" },
        ]}
      />
      {!data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : tab === "overview" ? (
        <OverviewTab money={data} onBill={(b) => setBillId(b.id)} />
      ) : tab === "bills" ? (
        <BillsTab money={data} onBill={(b) => setBillId(b.id)} onAdd={() => setAddBill(true)} />
      ) : tab === "activity" ? (
        <ActivityTab onAdd={() => setAddCharge(true)} />
      ) : (
        <DocumentsTab money={data} />
      )}
      <BillSheet key={bill?.id ?? "none"} bill={bill} onClose={() => setBillId(null)} />
      <AddBillSheet open={addBill} onClose={() => setAddBill(false)} />
      <AddChargeSheet open={addCharge} onClose={() => setAddCharge(false)} />
    </div>
  );
}
