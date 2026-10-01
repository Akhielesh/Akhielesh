import { cycleShort, formatDate, formatMoney } from "../../shared/format.js";
import { calendarDaysBetween } from "../../shared/time.js";
import type { BillingCycle } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { createAlert, wakeSnoozed } from "./alerts.js";
import { recomputeAllSubscriptions } from "./subscriptions.js";

function dayLabel(iso: string, tz: string, now: Date): string {
  const diff = calendarDaysBetween(now, new Date(iso), iso.endsWith("T12:00:00.000Z") ? "UTC" : tz);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

/**
 * Time-based intelligence: renewals, trials, bills, trips, interviews and appointments
 * coming up soon. Idempotent thanks to alert fingerprints — safe to run every few minutes.
 */
export function runReminders(ctx: AppContext): { created: number; resolved: number } {
  const db = ctx.db;
  const now = ctx.now();
  const nowIso = now.toISOString();
  const settings = ctx.settings.get();
  const tz = settings.profile.timezone;
  const r = settings.notifications.reminders;
  let created = 0;
  const day = 86400000;

  recomputeAllSubscriptions(ctx);
  wakeSnoozed(ctx);

  // Subscription renewals.
  const subs = db
    .prepare(
      `SELECT id, name, amount, currency, cycle, next_renewal_at, manage_url, vendor_id, payment_method FROM subscriptions
       WHERE status = 'active' AND muted = 0 AND next_renewal_at IS NOT NULL AND next_renewal_at BETWEEN ? AND ?`,
    )
    .all(new Date(now.getTime() - day).toISOString(), new Date(now.getTime() + 61 * day).toISOString()) as {
    id: number;
    name: string;
    amount: number | null;
    currency: string | null;
    cycle: BillingCycle;
    next_renewal_at: string;
    manage_url: string | null;
    vendor_id: number | null;
    payment_method: string | null;
  }[];
  for (const sub of subs) {
    const window = sub.cycle === "annual" || sub.cycle === "semiannual" ? r.annualRenewalDays : r.renewalDays;
    const days = (new Date(sub.next_renewal_at).getTime() - now.getTime()) / day;
    if (window <= 0 || days > window + 0.5 || days < -1) continue;
    const price = sub.amount !== null ? `${formatMoney(sub.amount, sub.currency)}${cycleShort(sub.cycle)}` : "";
    const id = createAlert(ctx, {
      fingerprint: `sub-renewal:${sub.id}:${sub.next_renewal_at.slice(0, 10)}`,
      type: "subscription.renewal",
      title: `${sub.name} renews ${dayLabel(sub.next_renewal_at, tz, now)}${price ? ` — ${price}` : ""}`,
      body: `Renews on ${formatDate(sub.next_renewal_at, tz, "long")}. Cancel before then if you don't need it.`,
      facts: [
        { label: "Service", value: sub.name },
        { label: "Price", value: price },
        { label: "Renews", value: formatDate(sub.next_renewal_at, tz, "medium") },
        { label: "Payment method", value: sub.payment_method ?? "" },
      ],
      vendorId: sub.vendor_id,
      entityType: "subscription",
      entityId: sub.id,
      dueAt: sub.next_renewal_at,
      actionUrl: sub.manage_url,
      actionLabel: sub.manage_url ? "Manage" : null,
    });
    if (id) created++;
  }

  // Trials converting to paid.
  const trials = db
    .prepare(
      `SELECT id, name, amount, currency, cycle, trial_ends_at, manage_url, vendor_id FROM subscriptions
       WHERE status = 'trial' AND muted = 0 AND trial_ends_at BETWEEN ? AND ?`,
    )
    .all(nowIso, new Date(now.getTime() + (r.trialDays + 0.5) * day).toISOString()) as {
    id: number;
    name: string;
    amount: number | null;
    currency: string | null;
    cycle: BillingCycle;
    trial_ends_at: string;
    manage_url: string | null;
    vendor_id: number | null;
  }[];
  for (const t of trials) {
    if (r.trialDays <= 0) break;
    const price = t.amount !== null ? `${formatMoney(t.amount, t.currency)}${cycleShort(t.cycle)}` : "";
    const id = createAlert(ctx, {
      fingerprint: `sub-trial:${t.id}:${t.trial_ends_at.slice(0, 10)}`,
      type: "subscription.trial_ending",
      title: `${t.name} trial ends ${dayLabel(t.trial_ends_at, tz, now)}${price ? ` — then ${price}` : ""}`,
      body: "Cancel before it ends if you don't want to be charged.",
      facts: [
        { label: "Service", value: t.name },
        { label: "Trial ends", value: formatDate(t.trial_ends_at, tz, "medium") },
        { label: "Then", value: price },
      ],
      vendorId: t.vendor_id,
      entityType: "subscription",
      entityId: t.id,
      dueAt: t.trial_ends_at,
      actionUrl: t.manage_url,
      actionLabel: "Cancel or manage",
    });
    if (id) created++;
  }

  // Bills due soon / overdue.
  const bills = db
    .prepare(
      `SELECT id, name, amount_due, currency, due_at, status, autopay, pay_url, vendor_id, account_hint FROM bills
       WHERE status IN ('due','overdue','scheduled') AND due_at IS NOT NULL AND due_at <= ?`,
    )
    .all(new Date(now.getTime() + (r.billDays + 0.5) * day).toISOString()) as {
    id: number;
    name: string;
    amount_due: number | null;
    currency: string | null;
    due_at: string;
    status: string;
    autopay: number;
    pay_url: string | null;
    vendor_id: number | null;
    account_hint: string | null;
  }[];
  for (const bill of bills) {
    const days = (new Date(bill.due_at).getTime() - now.getTime()) / day;
    const amount = bill.amount_due !== null ? formatMoney(bill.amount_due, bill.currency) : "";
    const facts = [
      { label: "Biller", value: bill.name },
      { label: "Amount due", value: amount },
      { label: "Due", value: formatDate(bill.due_at, tz, "medium") },
      { label: "Autopay", value: bill.autopay ? "On" : "Off" },
    ];
    if (days < -1.5 && !bill.autopay && bill.status !== "scheduled") {
      if (bill.status !== "overdue") db.prepare("UPDATE bills SET status = 'overdue', updated_at = ? WHERE id = ?").run(nowIso, bill.id);
      if (days > -30) {
        const id = createAlert(ctx, {
          fingerprint: `bill-overdue:${bill.id}`,
          type: "bill.overdue",
          title: `${bill.name} looks overdue${amount ? ` — ${amount}` : ""}`,
          body: `It was due ${formatDate(bill.due_at, tz, "long")} and Adminak hasn't seen a payment confirmation. Mark it paid if you've handled it.`,
          facts,
          vendorId: bill.vendor_id,
          entityType: "bill",
          entityId: bill.id,
          dueAt: bill.due_at,
          actionUrl: bill.pay_url,
          actionLabel: bill.pay_url ? "Pay" : null,
        });
        if (id) created++;
      }
    } else if (days >= -1 && !bill.autopay && bill.status === "due" && r.billDays > 0) {
      const id = createAlert(ctx, {
        fingerprint: `bill-due:${bill.id}:${bill.due_at.slice(0, 10)}`,
        type: "bill.due",
        title: `${bill.name}${amount ? ` — ${amount}` : ""} due ${dayLabel(bill.due_at, tz, now)}`,
        body: "Pay on time to avoid late fees.",
        facts,
        vendorId: bill.vendor_id,
        entityType: "bill",
        entityId: bill.id,
        dueAt: bill.due_at,
        actionUrl: bill.pay_url,
        actionLabel: bill.pay_url ? "Pay" : null,
      });
      if (id) created++;
    } else if (bill.status === "scheduled" && days < -2) {
      // Autopay bills are assumed paid once the date passes.
      db.prepare("UPDATE bills SET status = 'paid', paid_at = COALESCE(paid_at, due_at), updated_at = ? WHERE id = ?").run(nowIso, bill.id);
    }
  }

  // Upcoming trips, interviews, events and appointments from insights.
  const upcoming = db
    .prepare(
      `SELECT i.id, i.category, i.type, i.title, i.occurs_at, i.group_key, i.vendor_id, i.message_id, i.data FROM insights i
       WHERE i.archived = 0 AND i.occurs_at BETWEEN ? AND ? AND i.category IN ('travel','career','events','health')`,
    )
    .all(nowIso, new Date(now.getTime() + 2 * day).toISOString()) as {
    id: number;
    category: string;
    type: string;
    title: string;
    occurs_at: string;
    group_key: string | null;
    vendor_id: number | null;
    message_id: number | null;
    data: string;
  }[];
  for (const item of upcoming) {
    const hours = (new Date(item.occurs_at).getTime() - now.getTime()) / 3600000;
    let type: string | null = null;
    let windowHours = 0;
    if (item.category === "travel" && ["flight", "hotel", "car_rental", "train", "checkin"].includes(item.type)) {
      type = "travel.upcoming";
      windowHours = 36;
    } else if (item.category === "career" && ["interview_request", "assessment"].includes(item.type)) {
      type = "career.interview";
      windowHours = 24;
    } else if (item.category === "events" && ["invitation", "ticket", "reservation"].includes(item.type)) {
      type = "events.upcoming";
      windowHours = 20;
    } else if (item.category === "health" && item.type === "appointment") {
      type = "health.appointment";
      windowHours = 24;
    }
    if (!type || hours > windowHours) continue;
    const when = formatDate(item.occurs_at, tz, item.occurs_at.endsWith("T12:00:00.000Z") ? "weekday" : "datetime");
    const id = createAlert(ctx, {
      fingerprint: `soon:${type}:${item.group_key ?? item.id}:${item.occurs_at.slice(0, 10)}`,
      type,
      title: `${dayLabel(item.occurs_at, tz, now) === "today" ? "Today" : "Tomorrow"}: ${item.title}`,
      body: `Coming up ${when}.`,
      facts: [{ label: "When", value: when }],
      vendorId: item.vendor_id,
      messageId: item.message_id,
      entityType: "insight",
      entityId: item.id,
      dueAt: item.occurs_at,
    });
    if (id) created++;
  }

  // Close out reminders whose moment has passed.
  const resolved = db
    .prepare(
      `UPDATE alerts SET status = 'done', updated_at = ? WHERE status IN ('new','read') AND due_at IS NOT NULL AND due_at < ?
       AND type IN ('subscription.renewal','subscription.trial_ending','subscription.trial_started','bill.due','bill.statement','travel.upcoming','travel.checkin','events.upcoming','health.appointment','career.interview')`,
    )
    .run(nowIso, new Date(now.getTime() - 1.5 * day).toISOString()).changes;

  return { created, resolved };
}
