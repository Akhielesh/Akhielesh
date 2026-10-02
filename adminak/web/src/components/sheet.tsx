import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { haptic } from "../lib/native";
import { cn } from "../lib/utils";

/**
 * Bottom sheet on phones, side drawer on larger screens. Closes on Escape, overlay tap,
 * the browser back gesture (it pushes a history entry while open), and on phones a downward
 * drag from the header or from the top of the content.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  headerAction,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  headerAction?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Drag down to dismiss (bottom-sheet layout only).
  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    setDrag(0);
    const s = { x: 0, y: 0, t: 0, dy: 0, header: false, decided: false, active: false, tracking: false };
    const start = (e: TouchEvent) => {
      s.tracking = false;
      if (window.innerWidth >= 640 || e.touches.length !== 1) return;
      const target = e.target as Element;
      if (target.closest("input, textarea, select, [contenteditable], iframe, [data-no-drag]")) return;
      s.x = e.touches[0]!.clientX;
      s.y = e.touches[0]!.clientY;
      s.t = performance.now();
      s.dy = 0;
      s.header = !body.current?.contains(target);
      s.decided = false;
      s.active = false;
      s.tracking = true;
    };
    const move = (e: TouchEvent) => {
      if (!s.tracking) return;
      const dx = e.touches[0]!.clientX - s.x;
      const dy = e.touches[0]!.clientY - s.y;
      if (!s.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        s.decided = true;
        s.active = dy > 0 && Math.abs(dy) > Math.abs(dx) && (s.header || (body.current?.scrollTop ?? 0) <= 0);
        if (!s.active) {
          s.tracking = false;
          return;
        }
        setDragging(true);
      }
      s.dy = Math.max(0, dy);
      setDrag(s.dy);
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!s.tracking || !s.active) return;
      s.tracking = false;
      setDragging(false);
      const velocity = s.dy / Math.max(1, performance.now() - s.t);
      if (s.dy > 120 || (s.dy > 40 && velocity > 0.5)) {
        haptic();
        setDrag(el.offsetHeight);
        window.setTimeout(() => onCloseRef.current(), 180);
      } else setDrag(0);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      setDrag(0);
      setDragging(false);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Close on the back gesture instead of leaving the page.
    window.history.pushState({ adminakSheet: true }, "");
    let closedByPop = false;
    const onPop = () => {
      closedByPop = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = overflow;
      if (!closedByPop && window.history.state?.adminakSheet) window.history.back();
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        style={{ animation: "fade-in 160ms ease-out", opacity: drag ? Math.max(0.15, 1 - drag / 500) : undefined }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] border border-line bg-surface shadow-2xl outline-none sm:max-h-none sm:rounded-none sm:rounded-l-[22px]",
          wide ? "sm:w-[640px]" : "sm:w-[480px]",
          "animate-[sheet-up_260ms_cubic-bezier(.2,.9,.25,1)] sm:animate-[sheet-left_220ms_cubic-bezier(.2,.8,.2,1)]",
          !dragging && "transition-transform duration-200 ease-out",
        )}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
        {title || headerAction ? (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-3 pb-3 sm:pt-5">
            <div className="min-w-0">
              {title ? <h2 className="text-[17px] leading-snug font-semibold text-ink">{title}</h2> : null}
              {subtitle ? <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerAction}
              <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
          </div>
        ) : null}
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer ? <div className="safe-bottom border-t border-line px-5 pt-3 pb-3">{footer}</div> : <div className="safe-bottom sm:hidden" />}
      </div>
    </div>,
    document.body,
  );
}
