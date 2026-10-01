import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Bottom sheet on phones, side drawer on larger screens. Closes on Escape, overlay tap,
 * and the browser back gesture (it pushes a history entry while open).
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" style={{ animation: "fade-in 160ms ease-out" }} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] border border-line bg-surface shadow-2xl outline-none sm:max-h-none sm:rounded-none sm:rounded-l-[22px]",
          wide ? "sm:w-[640px]" : "sm:w-[480px]",
          "animate-[sheet-up_220ms_cubic-bezier(.2,.8,.2,1)] sm:animate-[sheet-left_220ms_cubic-bezier(.2,.8,.2,1)]",
        )}
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line px-5 pt-3 pb-3">{footer}</div> : <div className="safe-bottom sm:hidden" />}
      </div>
    </div>,
    document.body,
  );
}
