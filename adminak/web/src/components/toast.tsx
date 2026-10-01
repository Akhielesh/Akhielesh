import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleX, Info } from "lucide-react";
import { cn } from "../lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: ReactNode, action?: Toast["action"]) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => undefined, error: () => undefined, info: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: ToastTone, message: ReactNode, action?: Toast["action"]) => {
    const id = ++seq.current;
    setToasts((list) => [...list.slice(-3), { id, tone, message, action }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 6500 : 4000);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({ success: (m, a) => push("success", m, a), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
          {toasts.map((t) => {
            const Icon = t.tone === "success" ? CircleCheck : t.tone === "error" ? CircleX : Info;
            return (
              <div
                key={t.id}
                className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-2xl"
                style={{ animation: "toast-in 180ms ease-out" }}
                role="status"
              >
                <Icon className={cn("size-5 shrink-0", t.tone === "success" ? "text-good" : t.tone === "error" ? "text-crit" : "text-low")} aria-hidden />
                <div className="min-w-0 flex-1 text-ink">{t.message}</div>
                {t.action ? (
                  <button type="button" onClick={t.action.onClick} className="shrink-0 font-semibold text-accent">
                    {t.action.label}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
