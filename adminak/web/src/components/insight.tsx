import {
  AlarmClock,
  BadgeCheck,
  Banknote,
  Briefcase,
  Car,
  ClipboardCheck,
  CreditCard,
  FileText,
  Fingerprint,
  Hotel,
  KeyRound,
  Lock,
  Mail,
  Package,
  PackageCheck,
  PackageX,
  Plane,
  Receipt,
  ShieldAlert,
  Stethoscope,
  Ticket,
  TrainFront,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { titleCase } from "@shared/format";
import type { InsightDTO } from "@shared/types";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { Badge, type Tone } from "./ui";
import { VendorMark } from "./vendor";

export const INSIGHT_STATUS: Record<string, { label: string; tone: Tone }> = {
  // career
  applied: { label: "Applied", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  assessment: { label: "Assessment", tone: "warn" },
  interviewing: { label: "Interviewing", tone: "accent" },
  offer: { label: "Offer", tone: "good" },
  rejected: { label: "Closed", tone: "neutral" },
  outreach: { label: "Recruiter", tone: "info" },
  alert: { label: "Job alert", tone: "neutral" },
  network: { label: "Networking", tone: "neutral" },
  // orders
  order_placed: { label: "Ordered", tone: "neutral" },
  shipped: { label: "Shipped", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "accent" },
  delivered: { label: "Delivered", tone: "good" },
  delayed: { label: "Delayed", tone: "high" },
  return: { label: "Return", tone: "neutral" },
  refund: { label: "Refunded", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  // travel
  flight: { label: "Flight", tone: "info" },
  flight_change: { label: "Changed", tone: "high" },
  checkin: { label: "Check-in open", tone: "accent" },
  hotel: { label: "Stay", tone: "info" },
  car_rental: { label: "Car rental", tone: "info" },
  train: { label: "Train", tone: "info" },
  ride: { label: "Ride", tone: "neutral" },
  // security
  new_signin: { label: "New sign-in", tone: "warn" },
  password_changed: { label: "Password changed", tone: "high" },
  password_reset: { label: "Password reset", tone: "warn" },
  suspicious_activity: { label: "Suspicious", tone: "bad" },
  breach_notice: { label: "Breach", tone: "bad" },
  mfa_change: { label: "2FA change", tone: "high" },
  account_locked: { label: "Locked", tone: "high" },
  email_changed: { label: "Email changed", tone: "high" },
  // finance / bills
  paid: { label: "Paid", tone: "good" },
  statement: { label: "Statement", tone: "neutral" },
  tax_document: { label: "Tax form", tone: "warn" },
  credit_score: { label: "Credit", tone: "info" },
  investment: { label: "Investing", tone: "info" },
  fraud_alert: { label: "Fraud alert", tone: "bad" },
  low_balance: { label: "Low balance", tone: "high" },
  deposit: { label: "Deposit", tone: "good" },
  transfer_in: { label: "Received", tone: "good" },
  transfer_out: { label: "Sent", tone: "neutral" },
  // life
  appointment: { label: "Appointment", tone: "accent" },
  invitation: { label: "Invite", tone: "info" },
  reservation: { label: "Reservation", tone: "info" },
  ticket: { label: "Tickets", tone: "info" },
  prescription: { label: "Prescription", tone: "neutral" },
  results: { label: "Results", tone: "warn" },
  claim: { label: "Claim", tone: "neutral" },
};

const TYPE_ICON: Record<string, LucideIcon> = {
  order_placed: Package,
  shipped: Truck,
  out_for_delivery: Truck,
  delivered: PackageCheck,
  delayed: PackageX,
  return: Package,
  flight: Plane,
  flight_change: Plane,
  checkin: Plane,
  hotel: Hotel,
  car_rental: Car,
  train: TrainFront,
  ride: Car,
  new_signin: Fingerprint,
  password_changed: KeyRound,
  password_reset: KeyRound,
  suspicious_activity: ShieldAlert,
  breach_notice: ShieldAlert,
  mfa_change: Lock,
  account_locked: Lock,
  email_changed: Mail,
  statement: FileText,
  tax_document: FileText,
  credit_score: BadgeCheck,
  investment: Banknote,
  fraud_alert: ShieldAlert,
  low_balance: AlarmClock,
  deposit: Banknote,
  transfer_in: Banknote,
  transfer_out: Banknote,
  transaction: CreditCard,
  refund: Receipt,
  payment_confirmation: Receipt,
  appointment: Stethoscope,
  prescription: Stethoscope,
  results: ClipboardCheck,
  claim: FileText,
  invitation: Ticket,
  reservation: Ticket,
  ticket: Ticket,
  message: UserRound,
  interview_request: Briefcase,
  assessment: ClipboardCheck,
  offer: BadgeCheck,
};

export function insightIcon(item: Pick<InsightDTO, "type" | "category">): LucideIcon {
  return TYPE_ICON[item.type] ?? (item.category === "career" ? Briefcase : item.category === "travel" ? Plane : item.category === "orders" ? Package : FileText);
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const ui = INSIGHT_STATUS[status];
  return <Badge tone={ui?.tone ?? "neutral"}>{ui?.label ?? titleCase(status)}</Badge>;
}

export function InsightRow({ item, onOpen, showVendor = true, showStatus = true }: { item: InsightDTO; onOpen?: () => void; showVendor?: boolean; showStatus?: boolean }) {
  const fmt = useFmt();
  const Icon = insightIcon(item);
  const when = item.occursAt ?? item.occurredAt;
  const future = item.occursAt ? fmt.daysUntil(item.occursAt) >= 0 : false;
  const Comp = onOpen ? "button" : "div";
  return (
    <Comp type={onOpen ? "button" : undefined} onClick={onOpen} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left sm:px-5", onOpen && "transition-colors hover:bg-surface-2/50")}>
      {showVendor && item.vendor ? (
        <VendorMark vendor={item.vendor} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug font-medium text-ink">{item.title}</span>
        {item.summary && item.summary !== item.title ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{item.summary}</span> : null}
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          {showStatus ? <StatusBadge status={item.status} /> : null}
          <span className={cn(future && "font-medium text-accent")}>{future ? `${fmt.day(when)} · ${fmt.date(when, item.occursAt?.endsWith("T12:00:00.000Z") ? "weekday" : "datetime")}` : fmt.date(when, "medium")}</span>
        </span>
      </span>
      {item.amount !== null ? <span className="tabular shrink-0 text-[14px] font-semibold text-ink">{fmt.money(item.amount, item.currency)}</span> : null}
    </Comp>
  );
}
