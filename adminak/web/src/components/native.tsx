import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloudOff, Download, PlusSquare, RefreshCw, Share, X, type LucideIcon } from "lucide-react";
import { haptic, isTouch, useInstallOffer, useOnline } from "../lib/native";
import { cn } from "../lib/utils";
import { Button } from "./ui";

const PULL_MAX = 112;
const PULL_TRIGGER = 72;

/**
 * Pull down at the top of the page to refresh, Material-style: a spinner slides in over the
 * content. Touch only; ignored inside dialogs, while a sheet holds the scroll, or mid-refresh.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!isTouch()) return;
    const s = { x: 0, y: 0, tracking: false, decided: false, pull: 0 };
    const start = (e: TouchEvent) => {
      s.tracking = false;
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return;
      if (document.body.style.overflow === "hidden") return;
      const target = e.target as Element | null;
      if (target?.closest('[role="dialog"], [data-no-pull]')) return;
      s.x = e.touches[0]!.clientX;
      s.y = e.touches[0]!.clientY;
      s.tracking = true;
      s.decided = false;
      s.pull = 0;
    };
    const move = (e: TouchEvent) => {
      if (!s.tracking) return;
      const dx = e.touches[0]!.clientX - s.x;
      const dy = e.touches[0]!.clientY - s.y;
      if (!s.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        s.decided = true;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          s.tracking = false;
          return;
        }
      }
      // Rubber-band: quick at first, then resists.
      const next = PULL_MAX * (1 - Math.exp(-Math.max(0, dy) / 170));
      if (next >= PULL_TRIGGER && s.pull < PULL_TRIGGER) haptic("tap");
      s.pull = next;
      setPull(next);
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!s.tracking) return;
      s.tracking = false;
      if (s.pull >= PULL_TRIGGER) {
        busy.current = true;
        setRefreshing(true);
        setPull(PULL_TRIGGER - 8);
        void onRefreshRef.current().finally(() => {
          busy.current = false;
          setRefreshing(false);
          setPull(0);
        });
      } else setPull(0);
      s.pull = 0;
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, []);

  if (pull === 0 && !refreshing) return null;
  const ready = pull >= PULL_TRIGGER || refreshing;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+56px)] z-20 flex justify-center lg:hidden" aria-hidden={!refreshing}>
      <div
        className={cn(
          "grid size-10 place-items-center rounded-full border border-line bg-surface shadow-lg",
          pull === 0 || refreshing ? "transition-transform duration-200" : "",
        )}
        style={{ transform: `translateY(${pull - 28}px)`, opacity: Math.min(1, pull / 40) }}
        role={refreshing ? "status" : undefined}
        aria-label={refreshing ? "Refreshing" : undefined}
      >
        <RefreshCw
          className={cn("size-[18px]", ready ? "text-accent" : "text-muted", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${(pull / PULL_TRIGGER) * 300}deg)` }}
        />
      </div>
    </div>
  );
}

export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  tone: "good" | "info" | "warn";
  onCommit: () => void;
}

const TONE: Record<SwipeAction["tone"], { idle: string; armed: string }> = {
  good: { idle: "bg-good-soft text-good", armed: "bg-good text-white dark:text-[#0c0d0f]" },
  info: { idle: "bg-low-soft text-low", armed: "bg-low text-white dark:text-[#0c0d0f]" },
  warn: { idle: "bg-med-soft text-med", armed: "bg-med text-white dark:text-[#0c0d0f]" },
};

/**
 * iOS-style swipe actions for list rows. Swipe right to reveal `leading`, left for `trailing`;
 * past the threshold the action commits on release. Touch only; mouse users keep the row buttons.
 */
export function SwipeRow({ children, leading, trailing, disabled }: { children: ReactNode; leading?: SwipeAction; trailing?: SwipeAction; disabled?: boolean }) {
  const row = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const g = useRef({ id: -1, x: 0, y: 0, axis: null as "x" | "y" | null, dx: 0, swiped: false });

  const threshold = () => Math.min(120, (row.current?.offsetWidth ?? 360) * 0.32);
  const clamp = (v: number) => {
    if (v > 0 && !leading) return v * 0.15;
    if (v < 0 && !trailing) return v * 0.15;
    return v;
  };
  const settle = (to: number) => {
    setSettling(true);
    setDx(to);
    window.setTimeout(() => setSettling(false), 200);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    // A swipe that never produced a click must not swallow the next tap.
    g.current.swiped = false;
    if (disabled || e.pointerType !== "touch" || (!leading && !trailing)) return;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0, swiped: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = g.current;
    if (s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
      if (s.axis === "y") {
        s.id = -1;
        return;
      }
      row.current?.setPointerCapture(e.pointerId);
    }
    const next = clamp(mx);
    const t = threshold();
    if (Math.abs(next) >= t && Math.abs(s.dx) < t) haptic("tap");
    s.dx = next;
    s.swiped = true;
    setDx(next);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = g.current;
    if (s.id !== e.pointerId) return;
    s.id = -1;
    if (s.axis !== "x") return;
    const action = s.dx > 0 ? leading : trailing;
    if (action && Math.abs(s.dx) >= threshold()) {
      const width = row.current?.offsetWidth ?? 400;
      haptic("success");
      settle(s.dx > 0 ? width : -width);
      window.setTimeout(() => {
        action.onCommit();
        setDx(0);
      }, 190);
    } else settle(0);
  };
  const onPointerCancel = () => {
    g.current.id = -1;
    settle(0);
  };

  const t = typeof window === "undefined" ? 120 : threshold();
  const armed = Math.abs(dx) >= t;
  const shown = dx > 0 ? leading : dx < 0 ? trailing : null;
  return (
    <div className="relative overflow-hidden">
      {shown ? (
        <div className={cn("absolute inset-0 flex items-center px-6 transition-colors", dx > 0 ? "justify-start" : "justify-end", armed ? TONE[shown.tone].armed : TONE[shown.tone].idle)} aria-hidden>
          <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ transform: `scale(${armed ? 1.06 : 0.92})`, transition: "transform 120ms" }}>
            <shown.icon className="size-5" />
            {shown.label}
          </span>
        </div>
      ) : null}
      <div
        ref={row}
        className={cn("relative bg-surface", settling && "transition-transform duration-200 ease-out")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (g.current.swiped) {
            e.preventDefault();
            e.stopPropagation();
            g.current.swiped = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** "Install Adminak" card: the browser's own prompt where available, Add to Home Screen steps on iPhone. */
export function InstallCard() {
  const offer = useInstallOffer();
  if (!offer.kind) return null;
  return (
    <div className="card flex items-start gap-3 p-4" style={{ animation: "toast-in 200ms ease-out" }}>
      <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold text-ink">Install Adminak</div>
        {offer.kind === "prompt" ? (
          <p className="mt-0.5 text-[13px] text-muted">Full screen from your home screen, an alert count on the icon, and push alerts.</p>
        ) : (
          <p className="mt-0.5 text-[13px] text-muted">
            Tap <Share className="inline size-[15px] -translate-y-px text-low" aria-label="Share" /> then{" "}
            <span className="font-medium text-ink-2">
              Add to Home Screen <PlusSquare className="inline size-[15px] -translate-y-px" aria-hidden />
            </span>{" "}
            for the full-screen app and push alerts.
          </p>
        )}
        {offer.kind === "prompt" ? (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={Download} onClick={() => void offer.install()}>
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={offer.dismiss}>
              Not now
            </Button>
          </div>
        ) : null}
      </div>
      {offer.kind === "ios" ? (
        <button type="button" onClick={offer.dismiss} className="-m-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[45] flex justify-center px-4 lg:top-20" role="status">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-lg">
        <CloudOff className="size-4 text-med" aria-hidden /> Offline — showing what was last loaded
      </div>
    </div>,
    document.body,
  );
}
