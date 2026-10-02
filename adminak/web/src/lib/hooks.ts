import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * Deep links like `/subscriptions?id=12` open a sheet. The param is consumed once and stripped
 * (replace, not push) so the sheet owns its own history entry: the back gesture closes it
 * without re-opening it from a stale URL.
 */
export function useTakeParam(key: string, onValue: (value: string) => void): void {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const callback = useRef(onValue);
  callback.current = onValue;
  useEffect(() => {
    if (!value) return;
    callback.current(value);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [value, key, setParams]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
