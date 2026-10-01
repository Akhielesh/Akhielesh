import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ExternalLink, Inbox, MailX, Search } from "lucide-react";
import { CATEGORY_META } from "@shared/catalog";
import { CATEGORIES, type Category, type MessageListItem } from "@shared/types";
import { errorMessage, get, post } from "../lib/api";
import { useMessages, useOverview, useSenders } from "../lib/queries";
import { useDebounced } from "../lib/hooks";
import { useFmt } from "../lib/prefs";
import { PageHeader } from "../components/layout";
import { CategoryBadge, MessageRow, MessageSheet } from "../components/message";
import { useToast } from "../components/toast";
import { Button, Card, Chip, ChipRow, EmptyState, ExternalA, Input, Segmented, Skeleton } from "../components/ui";
import { VendorMark } from "../components/vendor";

function MailList() {
  const [params, setParams] = useSearchParams();
  const overview = useOverview();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounced = useDebounced(q.trim(), 300);
  const category = params.get("category") ?? "signal";
  const [messageId, setMessageId] = useState<number | null>(null);
  const [more, setMore] = useState<MessageListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: "60" });
    if (debounced) p.set("q", debounced);
    if (category !== "all") p.set("category", category);
    return p;
  }, [debounced, category]);
  const messages = useMessages(query);

  useEffect(() => {
    setMore([]);
    setExhausted(false);
  }, [query]);

  const list = [...(messages.data ?? []), ...more];
  const loadMore = async () => {
    const last = list.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams(query);
      p.set("before", last.receivedAt);
      const page = await get<MessageListItem[]>(`/messages?${p.toString()}`);
      setMore((m) => [...m, ...page]);
      if (page.length < 60) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const setCategory = (c: string) => {
    const next = new URLSearchParams(params);
    if (c === "signal") next.delete("category");
    else next.set("category", c);
    setParams(next, { replace: true });
  };

  const counts = overview.data?.categoryCounts ?? {};
  const cats = CATEGORIES.filter((c) => (counts[c] ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every scanned email — “invoice”, “flight”, a person…" className="pl-10" type="search" aria-label="Search emails" />
      </div>
      <ChipRow>
        <Chip active={category === "signal"} onClick={() => setCategory("signal")}>
          Important
        </Chip>
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          Everything
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)} count={counts[c]}>
            {CATEGORY_META[c].label}
          </Chip>
        ))}
      </ChipRow>
      <Card className="overflow-hidden">
        {messages.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={Inbox} title={debounced ? "No matches" : "No emails scanned yet"}>
            {debounced ? "Try fewer or different words." : "Connect a mailbox and Adminak will read, classify and summarize your mail here."}
          </EmptyState>
        ) : (
          <>
            <div className="divide-y divide-line">
              {list.map((m) => (
                <MessageRow key={m.id} message={m} onOpen={() => setMessageId(m.id)} />
              ))}
            </div>
            {!exhausted && list.length >= 60 ? (
              <div className="border-t border-line p-2">
                <Button variant="ghost" className="w-full" loading={loadingMore} onClick={() => void loadMore()}>
                  Load older
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </div>
  );
}

function Declutter() {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const senders = useSenders();
  const [busy, setBusy] = useState<string | null>(null);
  const mute = async (email: string, muted: boolean) => {
    setBusy(email);
    try {
      await post("/senders/mute", { email, muted });
      await qc.invalidateQueries({ queryKey: ["senders"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["sender-overrides"] });
      toast.success(muted ? `Muted ${email} — no more alerts from it` : `Unmuted ${email}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  const list = senders.data ?? [];
  const total = list.reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-3">
      <p className="px-1 text-[13.5px] text-muted">
        Your noisiest newsletter, promo and social senders over the last 90 days{total ? ` — ${total} emails from ${list.length} senders` : ""}. Unsubscribe at the source, or mute so Adminak ignores them.
      </p>
      <Card className="overflow-hidden">
        {senders.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={MailX} title="Nothing to declutter">
            Newsletters and promotions will be ranked here by volume.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.fromEmail} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <VendorMark name={s.fromName ?? s.domain} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{s.fromName ?? s.fromEmail}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <CategoryBadge category={s.category as Category} />
                    <span className="tabular">{s.count} emails</span>
                    <span aria-hidden>·</span>
                    <span>last {fmt.ago(s.lastAt)}</span>
                  </div>
                </div>
                {s.unsubscribeUrl && /^https:/.test(s.unsubscribeUrl) ? (
                  <ExternalA href={s.unsubscribeUrl} className="hidden h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 sm:inline-flex">
                    Unsubscribe <ExternalLink className="size-3.5" aria-hidden />
                  </ExternalA>
                ) : null}
                <Button size="sm" variant={s.muted ? "secondary" : "outline"} icon={s.muted ? Bell : BellOff} loading={busy === s.fromEmail} onClick={() => void mute(s.fromEmail, !s.muted)}>
                  {s.muted ? "Unmute" : "Mute"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function InboxPage() {
  const [tab, setTab] = useState<"mail" | "declutter">("mail");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox intelligence"
        description="Every scanned email with what Adminak understood from it: category, amounts, dates, and why. Tap one to see the reasoning or teach it."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "mail", label: "Emails" },
              { value: "declutter", label: "Declutter" },
            ]}
          />
        }
      />
      {tab === "mail" ? <MailList /> : <Declutter />}
    </div>
  );
}
