import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Pencil, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { CATEGORY_META } from "@shared/catalog";
import { CATEGORIES, RULE_FIELDS, RULE_OPERATORS, SEVERITIES, type Category, type MessageListItem, type RuleCondition, type RuleDTO, type RuleField, type RuleOperator, type Severity } from "@shared/types";
import { del, errorMessage, patch, post } from "../lib/api";
import { useRules, useSenderOverrides } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { PageHeader } from "../components/layout";
import { MessageRow, MessageSheet } from "../components/message";
import { Sheet } from "../components/sheet";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, SEVERITY_UI, Segmented, Select, Skeleton, Switch } from "../components/ui";

const FIELD_LABEL: Record<RuleField, string> = {
  from: "Sender email",
  fromName: "Sender name",
  fromDomain: "Sender domain",
  subject: "Subject",
  body: "Email text",
  any: "Subject or text",
  category: "Category",
  vendor: "Company",
  amount: "Amount",
};

const OP_LABEL: Record<RuleOperator, string> = {
  contains: "contains",
  not_contains: "doesn't contain",
  equals: "is",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches regex",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

const NUMERIC_OPS: RuleOperator[] = ["gt", "gte", "lt", "lte", "equals"];
const TEXT_OPS: RuleOperator[] = ["contains", "not_contains", "equals", "starts_with", "ends_with", "matches"];

interface Draft {
  id?: number;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  conditions: RuleCondition[];
  alert: boolean;
  severity: Severity;
  title: string;
  category: Category | "";
  ignore: boolean;
}

const BLANK: Draft = { name: "", enabled: true, match: "all", conditions: [{ field: "subject", op: "contains", value: "" }], alert: true, severity: "high", title: "", category: "", ignore: false };

const PRESETS: { name: string; description: string; draft: Partial<Draft> }[] = [
  {
    name: "Big purchases",
    description: "Alert on any receipt or charge over $500",
    draft: { name: "Charges over $500", conditions: [{ field: "amount", op: "gt", value: "500" }], alert: true, severity: "high" },
  },
  {
    name: "VIP sender",
    description: "Never miss an email from someone specific",
    draft: { name: "VIP: my manager", conditions: [{ field: "from", op: "equals", value: "boss@company.com" }], alert: true, severity: "critical", category: "personal" },
  },
  {
    name: "Dream companies",
    description: "Flag career mail from companies you care about",
    draft: {
      name: "Dream company update",
      match: "all",
      conditions: [
        { field: "category", op: "equals", value: "career" },
        { field: "any", op: "matches", value: "anthropic|stripe|figma" },
      ],
      alert: true,
      severity: "high",
      title: "Dream company replied",
    },
  },
  {
    name: "Client invoices",
    description: "Invoices or payments from a client's domain",
    draft: {
      name: "Client invoices",
      conditions: [
        { field: "fromDomain", op: "equals", value: "client.com" },
        { field: "subject", op: "matches", value: "invoice|payment|remittance" },
      ],
      alert: true,
      severity: "medium",
      category: "finance",
    },
  },
  {
    name: "Silence a sender",
    description: "Ignore a noisy list without unsubscribing",
    draft: { name: "Ignore weekly digest", conditions: [{ field: "from", op: "contains", value: "digest@" }], alert: false, ignore: true },
  },
  {
    name: "School & kids",
    description: "Anything mentioning your kid's school",
    draft: { name: "School notices", conditions: [{ field: "any", op: "contains", value: "Lincoln Elementary" }], alert: true, severity: "high", category: "personal" },
  },
];

function toDraft(rule: RuleDTO): Draft {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    match: rule.match,
    conditions: rule.conditions.length ? rule.conditions : BLANK.conditions,
    alert: !!rule.actions.alert,
    severity: rule.actions.severity ?? "high",
    title: rule.actions.title ?? "",
    category: rule.actions.category ?? "",
    ignore: !!rule.actions.ignore,
  };
}

function toBody(d: Draft) {
  return {
    name: d.name.trim() || "Untitled rule",
    enabled: d.enabled,
    match: d.match,
    conditions: d.conditions.filter((c) => c.value.trim()).map((c) => ({ ...c, value: c.value.trim() })),
    actions: {
      alert: d.alert && !d.ignore,
      severity: d.severity,
      title: d.title.trim() || undefined,
      category: d.category || undefined,
      ignore: d.ignore,
    },
  };
}

function describe(rule: RuleDTO): string {
  const conds = rule.conditions.map((c) => `${FIELD_LABEL[c.field].toLowerCase()} ${OP_LABEL[c.op]} “${c.value}”`).join(rule.match === "all" ? " and " : " or ");
  const acts = [
    rule.actions.ignore ? "ignore it" : null,
    rule.actions.alert ? `${SEVERITY_UI[rule.actions.severity ?? "medium"].label.toLowerCase()} alert` : null,
    rule.actions.category ? `file as ${CATEGORY_META[rule.actions.category].label}` : null,
  ].filter(Boolean);
  return `When ${conds} → ${acts.join(", ") || "do nothing"}`;
}

function RuleEditor({ initial, open, onClose }: { initial: Draft; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ total: number; scanned: number; preview: MessageListItem[] } | null>(null);
  const [messageId, setMessageId] = useState<number | null>(null);

  const setCond = (i: number, patchCond: Partial<RuleCondition>) =>
    setD((s) => ({
      ...s,
      conditions: s.conditions.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...patchCond };
        if (patchCond.field) {
          const numeric = patchCond.field === "amount";
          if (numeric && !NUMERIC_OPS.includes(next.op)) next.op = "gt";
          if (!numeric && !TEXT_OPS.includes(next.op)) next.op = "contains";
          if (patchCond.field === "category") next.op = "equals";
        }
        return next;
      }),
    }));

  const runTest = async () => {
    const body = toBody(d);
    if (!body.conditions.length) {
      toast.error("Add at least one condition with a value.");
      return;
    }
    setBusy("test");
    try {
      setTest(await post("/rules/test", { match: body.match, conditions: body.conditions }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const body = toBody(d);
    if (!body.conditions.length) {
      toast.error("Add at least one condition with a value.");
      return;
    }
    setBusy("save");
    try {
      if (d.id) await patch(`/rules/${d.id}`, body);
      else await post("/rules", body);
      await qc.invalidateQueries({ queryKey: ["rules"] });
      toast.success(d.id ? "Rule saved" : "Rule created — it applies to new mail from now on");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        wide
        title={d.id ? "Edit rule" : "New rule"}
        footer={
          <div className="flex gap-2">
            <Button icon={FlaskConical} loading={busy === "test"} onClick={() => void runTest()} className="flex-1">
              Test on my mail
            </Button>
            <Button variant="primary" loading={busy === "save"} onClick={() => void save()} className="flex-1">
              Save rule
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Field label="Rule name" htmlFor="r-name">
            <Input id="r-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Charges over $500" />
          </Field>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="eyebrow">When an email matches</h4>
              <Segmented
                size="sm"
                value={d.match}
                onChange={(v) => setD({ ...d, match: v })}
                options={[
                  { value: "all", label: "All" },
                  { value: "any", label: "Any" },
                ]}
              />
            </div>
            <div className="space-y-2">
              {d.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-line p-2 sm:grid-cols-[150px_140px_1fr_auto]">
                  <Select value={c.field} onChange={(e) => setCond(i, { field: e.target.value as RuleField })} aria-label="Field">
                    {RULE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABEL[f]}
                      </option>
                    ))}
                  </Select>
                  <Select value={c.op} onChange={(e) => setCond(i, { op: e.target.value as RuleOperator })} aria-label="Operator">
                    {(c.field === "amount" ? NUMERIC_OPS : c.field === "category" ? (["equals"] as RuleOperator[]) : TEXT_OPS).map((o) => (
                      <option key={o} value={o}>
                        {OP_LABEL[o]}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => setD((s) => ({ ...s, conditions: s.conditions.filter((_, idx) => idx !== i) }))}
                    disabled={d.conditions.length === 1}
                    className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 disabled:opacity-30 sm:order-last"
                    aria-label="Remove condition"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="col-span-3 sm:col-span-1">
                    {c.field === "category" ? (
                      <Select value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} aria-label="Category">
                        <option value="">Choose…</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORY_META[cat].label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        value={c.value}
                        onChange={(e) => setCond(i, { value: e.target.value })}
                        inputMode={c.field === "amount" ? "decimal" : undefined}
                        placeholder={c.field === "amount" ? "500" : c.op === "matches" ? "invoice|receipt" : "value"}
                        aria-label="Value"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {d.conditions.length < 10 ? (
              <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setD((s) => ({ ...s, conditions: [...s.conditions, { field: "subject", op: "contains", value: "" }] }))}>
                Add condition
              </Button>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-line p-4">
            <h4 className="eyebrow">Then</h4>
            <Switch checked={d.ignore} onChange={(v) => setD({ ...d, ignore: v, alert: v ? false : d.alert })} label="Ignore it" description="Mute the email: no alerts, hidden from your dashboard." />
            {!d.ignore ? (
              <>
                <Switch checked={d.alert} onChange={(v) => setD({ ...d, alert: v })} label="Raise an alert" description="Shows in Alerts and notifies you per your notification settings." />
                {d.alert ? (
                  <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                    <Field label="Severity" htmlFor="r-sev">
                      <Select id="r-sev" value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Severity })}>
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {SEVERITY_UI[s].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Alert title" htmlFor="r-title" hint="Leave blank to use the email's summary.">
                      <Input id="r-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
                    </Field>
                  </div>
                ) : null}
              </>
            ) : null}
            <Field label="File it under" htmlFor="r-cat">
              <Select id="r-cat" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Category | "" })}>
                <option value="">Keep Adminak's category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Switch checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label="Rule is on" />
          </section>

          {test ? (
            <section>
              <h4 className="eyebrow mb-2">
                Test: {test.total} of the last {test.scanned} emails match
              </h4>
              {test.preview.length ? (
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {test.preview.slice(0, 8).map((m) => (
                    <MessageRow key={m.id} message={m} onOpen={() => setMessageId(m.id)} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">No recent emails match. The rule will still apply to new mail.</p>
              )}
            </section>
          ) : null}
        </div>
      </Sheet>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </>
  );
}

function SenderOverrides() {
  const overrides = useSenderOverrides();
  const qc = useQueryClient();
  const toast = useToast();
  const fmt = useFmt();
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<string>("ignore");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await post("/sender-overrides", { pattern: pattern.trim(), ignore: action === "ignore", category: action === "ignore" ? null : action });
      setPattern("");
      await qc.invalidateQueries({ queryKey: ["sender-overrides"] });
      toast.success("Saved — applies to new mail");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number) => {
    try {
      await del(`/sender-overrides/${id}`);
      await qc.invalidateQueries({ queryKey: ["sender-overrides"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const list = overrides.data ?? [];
  return (
    <Card>
      <CardHeader title="Sender shortcuts" eyebrow="Always file or ignore a sender or a whole domain" />
      <div className="mt-3 grid gap-2 px-4 sm:grid-cols-[1fr_200px_auto] sm:px-5">
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="person@example.com or @example.com" aria-label="Sender or domain" />
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
          <option value="ignore">Ignore</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              File as {CATEGORY_META[c].label}
            </option>
          ))}
        </Select>
        <Button variant="primary" loading={busy} disabled={pattern.trim().length < 3} onClick={() => void add()}>
          Add
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {overrides.isLoading ? (
          <li className="p-5">
            <Skeleton className="h-10" />
          </li>
        ) : list.length ? (
          list.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] text-ink">{o.pattern}</span>
                <span className="text-[12px] text-muted">added {fmt.ago(o.createdAt)}</span>
              </span>
              {o.ignore ? <Badge tone="neutral">Ignored</Badge> : o.category ? <Badge tone="info">{CATEGORY_META[o.category].label}</Badge> : null}
              <button type="button" onClick={() => void remove(o.id)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-crit-soft hover:text-crit" aria-label={`Remove ${o.pattern}`}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))
        ) : (
          <li className="px-5 py-6 text-center text-sm text-muted">None yet. “Filed wrong?” on any email adds one automatically.</li>
        )}
      </ul>
    </Card>
  );
}

export function RulesPage() {
  const rules = useRules();
  const qc = useQueryClient();
  const toast = useToast();
  const fmt = useFmt();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const open = (d: Draft) => {
    setEditorKey((k) => k + 1);
    setEditing(d);
  };
  const toggle = async (rule: RuleDTO) => {
    try {
      await patch(`/rules/${rule.id}`, { enabled: !rule.enabled });
      await qc.invalidateQueries({ queryKey: ["rules"] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const remove = async (rule: RuleDTO) => {
    try {
      await del(`/rules/${rule.id}`);
      await qc.invalidateQueries({ queryKey: ["rules"] });
      toast.success("Rule deleted");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const list = rules.data ?? [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Rules"
        description="Teach Adminak what matters to you: custom alerts, auto-filing and ignore lists that run on every new email."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => open(BLANK)}>
            New rule
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {rules.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={WandSparkles} title="No rules yet">
            Adminak already knows subscriptions, bills, security and more. Rules add your own signals — start from a template below.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                <div className="pt-0.5">
                  <Switch checked={r.enabled} onChange={() => void toggle(r)} />
                </div>
                <button type="button" onClick={() => open(toDraft(r))} className="min-w-0 flex-1 text-left">
                  <span className="block text-[14.5px] font-semibold text-ink">{r.name}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{describe(r)}</span>
                  <span className="mt-1 block text-[12px] text-muted">
                    {r.hits ? `Matched ${r.hits} email${r.hits === 1 ? "" : "s"}${r.lastHitAt ? ` · last ${fmt.ago(r.lastHitAt)}` : ""}` : "No matches yet"}
                  </span>
                </button>
                <div className="flex shrink-0">
                  <button type="button" onClick={() => open(toDraft(r))} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${r.name}`}>
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" onClick={() => void remove(r)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-crit-soft hover:text-crit" aria-label={`Delete ${r.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section>
        <h3 className="eyebrow mb-2 px-1">Start from a template</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => open({ ...BLANK, ...p.draft })} className="card flex items-start gap-3 p-4 text-left transition-colors hover:border-line-strong">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-ink">{p.name}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <SenderOverrides />

      {editing ? <RuleEditor key={editorKey} initial={editing} open onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
