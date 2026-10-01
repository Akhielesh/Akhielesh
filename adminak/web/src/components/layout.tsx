import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, LogOut, Menu, Monitor, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { timeAgo } from "@shared/format";
import { actions, useAccounts, useAlertCounts, useInvalidateData, useSubscriptions } from "../lib/queries";
import { usePrefs } from "../lib/prefs";
import { useTheme, type ThemePref } from "../lib/theme";
import { cn } from "../lib/utils";
import { errorMessage } from "../lib/api";
import { ALL_NAV, BOTTOM_NAV, NAV, titleFor, type NavItem } from "./nav";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { Kbd } from "./ui";

function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight text-ink">
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#1c1d22] to-[#0c0d0f] text-[15px] font-bold text-[#f2efe8] ring-1 ring-white/10">
        A<span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#f0b56f]" />
      </span>
      {compact ? null : <span className="text-[16px]">Adminak</span>}
    </span>
  );
}

function AlertBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return <span className={cn("tabular grid h-5 min-w-5 place-items-center rounded-full bg-crit px-1.5 text-[11px] font-bold text-white", className)}>{count > 99 ? "99+" : count}</span>;
}

/** Scan button with live status; polls while any mailbox is syncing. */
export function SyncButton({ compact }: { compact?: boolean }) {
  const accounts = useAccounts();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [starting, setStarting] = useState(false);
  const list = accounts.data?.accounts ?? [];
  const syncing = list.some((a) => a.syncing);
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !syncing) invalidate();
    wasSyncing.current = syncing;
  }, [syncing, invalidate]);
  const last = list.map((a) => a.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null;
  const progress = list.find((a) => a.progress)?.progress;
  const onClick = async () => {
    if (list.length === 0) {
      toast.info("Connect a mailbox first — or load the demo inbox from Mailboxes.");
      return;
    }
    setStarting(true);
    try {
      await actions.syncAll();
      await accounts.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };
  const label = syncing ? (progress ? `${progress.phase} ${progress.total ? `${progress.done}/${progress.total}` : ""}` : "Scanning…") : last ? `Scanned ${timeAgo(last)}` : "Scan now";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink",
        compact && "w-9 justify-center px-0",
      )}
      aria-label={label}
      title={label}
    >
      <RefreshCw className={cn("size-4", (syncing || starting) && "animate-spin text-good")} aria-hidden />
      {compact ? null : <span className="max-w-40 truncate">{label}</span>}
    </button>
  );
}

function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const next: Record<ThemePref, ThemePref> = { system: "dark", dark: "light", light: "system" };
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setPref(next[pref])}
      className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink"
      aria-label={`Theme: ${pref}. Switch theme`}
      title={`Theme: ${pref}`}
    >
      <Icon className="size-4" />
    </button>
  );
}

function SideNav({ alertCount, onSignOut }: { alertCount: number; onSignOut: () => void }) {
  const prefs = usePrefs();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-5")}>
            {group.section ? <div className="eyebrow mb-1.5 px-3">{group.section}</div> : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium transition-colors",
                        isActive ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn("size-[17px]", isActive ? "text-accent" : "text-muted group-hover:text-ink-2")} aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge === "alerts" ? <AlertBadge count={alertCount} /> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <button type="button" onClick={onSignOut} className="flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          <LogOut className="size-4 text-muted" aria-hidden />
          <span className="flex-1 truncate text-left">Sign out{prefs.name ? ` · ${prefs.name.split(" ")[0]}` : ""}</span>
        </button>
      </div>
    </aside>
  );
}

function BottomNav({ alertCount, onMore }: { alertCount: number; onMore: () => void }) {
  const location = useLocation();
  const items = BOTTOM_NAV.map((to) => ALL_NAV.find((n) => n.to === to)!).filter(Boolean);
  const inMore = !BOTTOM_NAV.some((to) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)));
  const short: Record<string, string> = { "/": "Home", "/alerts": "Alerts", "/subscriptions": "Subs", "/money": "Money" };
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl lg:hidden" aria-label="Main">
      <ul className="mx-auto flex max-w-xl">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => cn("flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive ? "text-ink" : "text-muted")}>
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <item.icon className={cn("size-[22px]", isActive && "text-accent")} aria-hidden />
                    {item.badge === "alerts" && alertCount ? <AlertBadge count={alertCount} className="absolute -top-2 -right-3 h-[18px] min-w-[18px] text-[10px]" /> : null}
                  </span>
                  {short[item.to] ?? item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="flex-1">
          <button type="button" onClick={onMore} className={cn("flex h-[60px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", inMore ? "text-ink" : "text-muted")}>
            <Menu className={cn("size-[22px]", inMore && "text-accent")} aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet({ open, onClose, onSignOut }: { open: boolean; onClose: () => void; onSignOut: () => void }) {
  const navigate = useNavigate();
  const [pref, setPref] = useTheme();
  const go = (to: string) => {
    onClose();
    setTimeout(() => navigate(to), 10);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Everything">
      <div className="space-y-5">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.section ? <div className="eyebrow mb-2">{group.section}</div> : null}
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <button key={item.to} type="button" onClick={() => go(item.to)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-3 p-3 text-left active:bg-surface-2">
                  <item.icon className="size-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 text-[13.5px] leading-tight font-medium text-ink">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div className="eyebrow mb-2">Appearance</div>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as ThemePref[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPref(t)}
                className={cn("h-10 rounded-xl border text-[13px] font-medium capitalize", pref === t ? "border-transparent bg-primary text-primary-ink" : "border-line text-ink-2")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onSignOut} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium text-ink-2">
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
    </Sheet>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const subs = useSubscriptions();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav: { key: string; label: string; hint: string; icon: NavItem["icon"]; go: string }[] = ALL_NAV.filter(
      (n) => !q || n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q),
    ).map((n) => ({ key: n.to, label: n.label, hint: n.description, icon: n.icon, go: n.to }));
    const subItems = q
      ? (subs.data?.items ?? [])
          .filter((s) => s.name.toLowerCase().includes(q))
          .slice(0, 5)
          .map((s) => ({ key: `sub-${s.id}`, label: s.name, hint: "Subscription", icon: ALL_NAV.find((n) => n.to === "/subscriptions")!.icon, go: `/subscriptions?id=${s.id}` }))
      : [];
    const search = q ? [{ key: "search", label: `Search emails for “${query.trim()}”`, hint: "Inbox intelligence", icon: Search, go: `/inbox?q=${encodeURIComponent(query.trim())}` }] : [];
    const ask = q.length > 8 ? [{ key: "ask", label: `Ask: “${query.trim()}”`, hint: "Ask Adminak", icon: ALL_NAV.find((n) => n.to === "/ask")!.icon, go: `/ask?q=${encodeURIComponent(query.trim())}` }] : [];
    return [...subItems, ...nav, ...search, ...ask].slice(0, 12);
  }, [query, subs.data]);
  const run = (i: number) => {
    const r = results[i];
    if (!r) return;
    onClose();
    navigate(r.go);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") run(index);
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Jump to a page, subscription or search emails…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(i)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === index ? "bg-surface-2" : "")}
              >
                <r.icon className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                  <span className="block truncate text-[12px] text-muted">{r.hint}</span>
                </span>
                {i === index ? <CornerDownLeft className="size-4 text-muted" aria-hidden /> : null}
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">No matches</li> : null}
        </ul>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const counts = useAlertCounts();
  const toast = useToast();
  const [more, setMore] = useState(false);
  const [palette, setPalette] = useState(false);
  const alertCount = (counts.data?.bySeverity.critical ?? 0) + (counts.data?.bySeverity.high ?? 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const signOut = async () => {
    try {
      await actions.logout();
    } catch (error) {
      toast.error(errorMessage(error));
    }
    qc.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-dvh">
      <SideNav alertCount={alertCount} onSignOut={signOut} />
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl lg:ml-[248px]">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
            <Logo compact />
            <span className="truncate text-[16px] font-semibold text-ink">{titleFor(location.pathname)}</span>
          </div>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-9 max-w-md flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-muted hover:text-ink-2 lg:flex"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search pages, subscriptions, emails…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="flex items-center gap-2 lg:ml-auto">
            <button type="button" onClick={() => setPalette(true)} className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink-2 lg:hidden" aria-label="Search">
              <Search className="size-4" />
            </button>
            <span className="hidden sm:inline-flex">
              <SyncButton />
            </span>
            <span className="sm:hidden">
              <SyncButton compact />
            </span>
            <span className="hidden lg:inline-flex">
              <ThemeToggle />
            </span>
          </div>
        </div>
      </header>
      <main className="lg:ml-[248px]">
        <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-[calc(92px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-6 lg:pb-12">
          <Outlet />
        </div>
      </main>
      <BottomNav alertCount={alertCount} onMore={() => setMore(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} onSignOut={signOut} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[14px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
