import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Mail, Search, Sparkles } from "lucide-react";
import type { AskResponse } from "@shared/types";
import { errorMessage } from "../lib/api";
import { actions, useSystem } from "../lib/queries";
import { useTakeParam } from "../lib/hooks";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { MessageSheet } from "../components/message";
import { Badge, Card, Spinner } from "../components/ui";

const SUGGESTIONS = [
  "How much am I spending on subscriptions each month?",
  "Which subscriptions went up in price?",
  "When is my next credit card bill due?",
  "What's the status of my job applications?",
  "When is my next flight?",
  "Any suspicious sign-ins lately?",
  "What did I order this month?",
  "Which free trials are ending soon?",
];

interface Turn {
  id: number;
  question: string;
  answer?: AskResponse;
  error?: string;
}

export function AskPage() {
  const fmt = useFmt();
  const system = useSystem();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageId, setMessageId] = useState<number | null>(null);
  const seq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (text.length < 2 || busy) return;
    const id = ++seq.current;
    setTurns((t) => [...t, { id, question: text }]);
    setQuestion("");
    setBusy(true);
    try {
      const answer = await actions.ask(text);
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    } catch (error) {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, error: errorMessage(error) } : turn)));
    } finally {
      setBusy(false);
    }
  };

  useTakeParam("q", (q) => void ask(q));

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };
  const ai = !!system.data?.integrations.ai;

  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col">
      <PageHeader
        title="Ask Adminak"
        description={ai ? "Ask anything about your subscriptions, bills, orders, trips, career or accounts. Claude answers from your own mail." : "Search your intelligence in plain language. Add an Anthropic API key for full AI answers."}
        actions={<Badge tone={ai ? "accent" : "neutral"} icon={ai ? Sparkles : Search}>{ai ? "Claude" : "Search mode"}</Badge>}
      />

      <div className="flex-1 space-y-5">
        {turns.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void ask(s)} className="card flex items-center gap-3 p-3.5 text-left text-[14px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
                <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
                {s}
              </button>
            ))}
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-[18px] rounded-br-md bg-primary px-4 py-2.5 text-[14.5px] text-primary-ink">{t.question}</div>
              </div>
              <Card className="p-4 sm:p-5">
                {t.answer ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone={t.answer.mode === "ai" ? "accent" : "neutral"} icon={t.answer.mode === "ai" ? Sparkles : Search}>
                        {t.answer.mode === "ai" ? "Answered by Claude" : "From search"}
                      </Badge>
                    </div>
                    <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{t.answer.answer}</div>
                    {t.answer.sources.length ? (
                      <div className="mt-4 border-t border-line pt-3">
                        <div className="eyebrow mb-2">Sources</div>
                        <ul className="space-y-1">
                          {t.answer.sources.slice(0, 6).map((s) => (
                            <li key={s.id}>
                              <button type="button" onClick={() => setMessageId(s.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                                <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.subject}</span>
                                <span className="shrink-0 text-[12px] text-muted">{fmt.date(s.receivedAt, "monthDay")}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : t.error ? (
                  <p className="text-sm text-crit">{t.error}</p>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Spinner className="size-4" /> Reading your mail…
                  </div>
                )}
              </Card>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] mt-5 lg:bottom-6">
        <div className="flex items-end gap-2 rounded-[22px] border border-line bg-surface p-2 shadow-xl">
          <textarea
            ref={input}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder="Ask about your money, plans or accounts…"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted"
            aria-label="Your question"
          />
          <button
            type="submit"
            disabled={busy || question.trim().length < 2}
            className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-40")}
            aria-label="Ask"
          >
            {busy ? <Spinner className="size-4 text-accent-ink" /> : <ArrowUp className="size-5" />}
          </button>
        </div>
      </form>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </div>
  );
}
