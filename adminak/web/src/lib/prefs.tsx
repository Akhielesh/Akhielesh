import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatDate, formatMoney, formatTotals, humanizeDay, timeAgo, daysUntil, type DateStyle } from "@shared/format";
import type { MoneyTotal } from "@shared/types";
import { useSettings } from "./queries";

interface Prefs {
  tz: string;
  currency: string;
  name: string;
}

const PrefsContext = createContext<Prefs>({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", currency: "USD", name: "" });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const value = useMemo<Prefs>(
    () => ({
      tz: settings.data?.profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      currency: settings.data?.profile.currency ?? "USD",
      name: settings.data?.profile.name ?? "",
    }),
    [settings.data],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  return useContext(PrefsContext);
}

/** Formatting helpers bound to the owner's time zone and currency. */
export function useFmt() {
  const prefs = usePrefs();
  return useMemo(
    () => ({
      tz: prefs.tz,
      currency: prefs.currency,
      money: (amount: number | null | undefined, currency?: string | null, opts: { compact?: boolean; signed?: boolean; whole?: boolean } = {}) =>
        formatMoney(amount, currency ?? prefs.currency, opts),
      totals: (totals: MoneyTotal[], opts: { compact?: boolean; whole?: boolean } = {}) => formatTotals(totals, { ...opts, currency: prefs.currency }),
      date: (iso: string | null | undefined, style: DateStyle = "medium") => formatDate(iso, prefs.tz, style),
      day: (iso: string | null | undefined) => humanizeDay(iso, prefs.tz),
      ago: (iso: string | null | undefined) => timeAgo(iso),
      daysUntil: (iso: string) => daysUntil(iso, prefs.tz),
    }),
    [prefs.tz, prefs.currency],
  );
}
