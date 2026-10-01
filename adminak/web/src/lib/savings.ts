import type { SavingsInsight } from "@shared/types";

/** How a savings insight's amount should read: what it means differs by kind. */
export function savingsFigure(s: SavingsInsight, money: (amount: number, currency: string | null) => string): { text: string; tone: "good" | "high" } | null {
  if (!s.amount) return null;
  switch (s.kind) {
    case "duplicate":
      return { text: `${money(s.amount, s.currency)}/mo`, tone: "good" };
    case "annual_switch":
      return { text: `save ~${money(s.amount, s.currency)}/yr`, tone: "good" };
    case "price_increase":
      return { text: `+${money(s.amount, s.currency)}/yr`, tone: "high" };
    default:
      return null;
  }
}
