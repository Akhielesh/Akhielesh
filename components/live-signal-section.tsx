"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowUpRight, Github, Linkedin, MessageSquareMore, RefreshCw, type LucideIcon } from "lucide-react";

import { githubProfileUrl, guestbookLabel, linkedinActivityUrl, linkedinProfileUrl } from "@/content/site";
import { fetchLiveSignalSnapshot, type SignalFeedItem, type SignalMetric } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

type SignalFilter = "All" | SignalFeedItem["source"];

type SourceCard = {
  label: string;
  state: "Live" | "Ready";
  note: string;
  href: string;
  icon: LucideIcon;
};

const filters: SignalFilter[] = ["All", "GitHub", "Remarks", "LinkedIn"];

const sourceCards: SourceCard[] = [
  {
    label: "GitHub signal",
    state: "Live",
    note: "Profile metadata, recent repos, and public events are pulled directly from GitHub.",
    href: githubProfileUrl,
    icon: Github
  },
  {
    label: "LinkedIn lane",
    state: linkedinActivityUrl ? "Live" : "Ready",
    note: linkedinActivityUrl
      ? "Public posts are flowing through the configured LinkedIn feed endpoint."
      : "Profile is linked. Add NEXT_PUBLIC_LINKEDIN_ACTIVITY_URL to stream public LinkedIn posts here.",
    href: linkedinProfileUrl,
    icon: Linkedin
  },
  {
    label: "Visitor remarks",
    state: "Live",
    note: `Guestbook issues using the ${guestbookLabel} label flow back into the dashboard.`,
    href: "/remarks/",
    icon: MessageSquareMore
  }
];

const defaultMetrics: SignalMetric[] = [
  {
    label: "Public repos",
    value: "--",
    note: "GitHub profile metrics appear once this section is near view."
  },
  {
    label: "Repos touched in 90d",
    value: "--",
    note: "Recent repo movement is calculated from public pushes."
  },
  {
    label: "Signals in 30d",
    value: "--",
    note: "This count combines public events, remarks, and linked posts."
  },
  {
    label: "Live product doors",
    value: "--",
    note: "Public product entry points stay visible even before the feed loads."
  }
];

function formatSnapshotTime(value: string | null) {
  if (!value) {
    return "Waiting for first fetch";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getFilterCount(filter: SignalFilter, items: SignalFeedItem[]) {
  if (filter === "All") {
    return items.length;
  }

  return items.filter((item) => item.source === filter).length;
}

export function LiveSignalSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [items, setItems] = useState<SignalFeedItem[]>([]);
  const [metrics, setMetrics] = useState<SignalMetric[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<SignalFilter>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshotTime, setSnapshotTime] = useState<string | null>(null);

  useEffect(() => {
    const node = sectionRef.current;

    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const load = async (mode: "initial" | "refresh") => {
      if (mode === "initial") {
        setStatus("loading");
      } else {
        setIsRefreshing(true);
      }

      controller?.abort();
      controller = new AbortController();

      try {
        const snapshot = await fetchLiveSignalSnapshot(controller.signal);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setItems(snapshot.items);
          setMetrics(snapshot.metrics);
          setSnapshotTime(snapshot.fetchedAt);
          setStatus("ready");
          setSelectedId((current) => (snapshot.items.some((item) => item.id === current) ? current : snapshot.items[0]?.id ?? null));
        });
      } catch {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setStatus((current) => (current === "ready" ? current : "error"));
        });
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(
        () => {
          void load("initial");
        },
        { timeout: 800 }
      );
    } else {
      timeoutId = setTimeout(() => {
        void load("initial");
      }, 140);
    }

    intervalId = setInterval(() => {
      void load("refresh");
    }, 1000 * 60 * 5);

    return () => {
      cancelled = true;
      controller?.abort();
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if ("cancelIdleCallback" in window && idleId) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [shouldLoad]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "All") {
      return items;
    }

    return items.filter((item) => item.source === activeFilter);
  }, [activeFilter, items]);

  useEffect(() => {
    if (!filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? null);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  return (
    <section ref={sectionRef} id="live-signal" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <SectionHeading
          eyebrow="Live Signal"
          title="A factual dashboard for work shipped in public."
          description="This section now reads from public GitHub profile data, public GitHub activity, the guestbook, and an optional LinkedIn feed. The goal is to show live work surface area, not decorative motion pretending to be proof."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(metrics.length > 0 ? metrics : defaultMetrics).map((metric) => (
            <div key={metric.label} className="panel-shell rounded-[1.6rem] border border-white/10 p-5">
              <p className="eyebrow-label">{metric.label}</p>
              <p className="mt-3 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-none tracking-tight text-foreground">{metric.value}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{metric.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-3">
                  <Activity className="size-4 text-muted-foreground" />
                  <p className="eyebrow-label">Activity console</p>
                </div>
                <h3 className="mt-3 font-display text-[clamp(1.5rem,4vw,2.25rem)] leading-none tracking-tight text-foreground">Public activity and remarks</h3>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                <RefreshCw className={cn("size-3.5", (status === "loading" || isRefreshing) && "animate-spin")} />
                {status === "loading" ? "Loading signal" : isRefreshing ? "Refreshing" : "Refreshes every 5 minutes"}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 rounded-full border border-white/8 bg-black/20 p-1.5">
              {filters.map((filter) => {
                const isActive = filter === activeFilter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] transition-colors duration-200",
                      isActive
                        ? "border-white/12 bg-white/[0.08] text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {filter}
                    <span className="ml-2 text-[10px] text-muted-foreground">{String(getFilterCount(filter, items)).padStart(2, "0")}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-3">
              {!shouldLoad || status === "idle" ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                  The dashboard wakes up when this section is near view so the top of the page stays light.
                </div>
              ) : null}

              {status === "loading" ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                  Pulling GitHub profile data, recent public activity, and guestbook remarks.
                </div>
              ) : null}

              {status === "error" ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                  GitHub is quiet right now or the public API request was rate-limited. The dashboard keeps retrying automatically.
                </div>
              ) : null}

              {status === "ready" && filteredItems.length === 0 ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-muted-foreground">
                  Nothing has landed in this lane yet. Remarks will appear here once guestbook posts use the{" "}
                  <span className="text-foreground">{guestbookLabel}</span> label, and LinkedIn needs the public feed endpoint enabled.
                </div>
              ) : null}

              {filteredItems.map((item, index) => {
                const isActive = selectedItem?.id === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    onMouseEnter={() => setSelectedId(item.id)}
                    onFocus={() => setSelectedId(item.id)}
                    className={cn(
                      "w-full rounded-[1.5rem] border p-4 text-left transition-all duration-200",
                      isActive
                        ? "border-white/18 bg-white/[0.07] shadow-[0_24px_60px_-42px_rgba(0,0,0,0.9)]"
                        : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={item.source === "Remarks" ? "accent" : "subtle"}>{item.source}</Badge>
                        <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{item.relativeTime}</span>
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <h4 className="mt-4 text-lg font-medium text-foreground">{item.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
              <p className="eyebrow-label">Selected signal</p>
              <div className="relative mt-5 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6">
                <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(246,186,116,0.14),_transparent_68%)] blur-3xl" />
                <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(118,183,201,0.12),_transparent_70%)] blur-3xl" />

                {selectedItem ? (
                  <>
                    <div className="relative z-10 flex flex-wrap items-center gap-3">
                      <Badge variant={selectedItem.source === "Remarks" ? "accent" : "subtle"}>{selectedItem.source}</Badge>
                      <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{selectedItem.relativeTime}</span>
                    </div>

                    <h3 className="relative z-10 mt-5 font-display text-[clamp(1.5rem,4vw,2.55rem)] leading-[0.94] tracking-tight text-foreground">
                      {selectedItem.title}
                    </h3>
                    <p className="relative z-10 mt-4 text-sm leading-7 text-muted-foreground">{selectedItem.summary}</p>

                    <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4">
                        <p className="eyebrow-label">Observed</p>
                        <p className="mt-3 text-sm text-foreground">{selectedItem.relativeTime}</p>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4">
                        <p className="eyebrow-label">Snapshot</p>
                        <p className="mt-3 text-sm text-foreground">{formatSnapshotTime(snapshotTime)}</p>
                      </div>
                    </div>

                    <Link
                      href={selectedItem.href}
                      target={selectedItem.href.startsWith("http") ? "_blank" : undefined}
                      rel={selectedItem.href.startsWith("http") ? "noreferrer" : undefined}
                      className="relative z-10 mt-6 inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-white"
                    >
                      Open source item
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="relative z-10 flex items-center gap-3">
                      <Badge variant="subtle">Monitoring</Badge>
                    </div>
                    <h3 className="relative z-10 mt-5 font-display text-[clamp(1.5rem,4vw,2.4rem)] leading-[0.94] tracking-tight text-foreground">
                      Waiting for the next public signal.
                    </h3>
                    <p className="relative z-10 mt-4 text-sm leading-7 text-muted-foreground">
                      Once public activity arrives, the selected signal preview shows the item, the source, and the latest snapshot time here.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="panel-shell rounded-[2.1rem] border border-white/10 p-6">
              <div className="inline-flex items-center gap-3">
                <Activity className="size-4 text-muted-foreground" />
                <p className="eyebrow-label">Connected sources</p>
              </div>

              <div className="mt-5 grid gap-3">
                {sourceCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                      className="interactive-panel rounded-[1.4rem] border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Icon className="size-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                        </div>
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.22em]",
                              item.state === "Live"
                                ? "border-emerald-400/22 bg-emerald-400/10 text-emerald-100"
                                : "border-white/10 bg-white/[0.04] text-muted-foreground"
                            )}
                          >
                            {item.state}
                          </span>
                          <ArrowUpRight className="size-4 text-muted-foreground" />
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-5 rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="eyebrow-label">Data provenance</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  GitHub is live today. Remarks are live through the guestbook. LinkedIn becomes live once the public feed endpoint is provided.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
