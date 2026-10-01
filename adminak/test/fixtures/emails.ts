import type { IncomingEmail } from "../../src/server/intel/types.js";

export interface Fixture {
  name: string;
  email: IncomingEmail;
  expect: {
    category: string;
    subtype?: string;
    vendor?: string | null;
    amount?: number;
    currency?: string;
    cycle?: string;
    dateKind?: string;
    date?: string; // YYYY-MM-DD
    data?: Record<string, unknown>;
    priceChange?: { from: number; to: number };
  };
}

let seq = 0;
export function mail(
  from: string,
  subject: string,
  text: string,
  opts: { date?: string; headers?: Record<string, string>; html?: string; attachments?: IncomingEmail["attachments"] } = {},
): IncomingEmail {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return {
    providerId: `fx-${++seq}`,
    messageId: `<fx-${seq}@test>`,
    from: { name: match ? match[1]!.replace(/"/g, "") : null, address: match ? match[2]! : from },
    to: ["me@example.com"],
    subject,
    date: new Date(opts.date ?? "2026-09-15T14:00:00Z"),
    text,
    html: opts.html ?? null,
    headers: opts.headers ?? {},
    attachments: opts.attachments ?? [],
    labels: [],
  };
}

export const FIXTURES: Fixture[] = [
  {
    name: "Netflix monthly receipt",
    email: mail(
      "Netflix <info@account.netflix.com>",
      "Your Netflix receipt",
      `Hi Akhielesh,

Thanks for being a Netflix member. Here's your receipt.

Plan: Standard
Billing period: Sep 15, 2026 - Oct 14, 2026
Payment method: Visa ending in 4242

Subtotal $15.49
Tax $1.24
Total $16.73

Your next billing date is October 15, 2026.
Manage your membership anytime.`,
    ),
    expect: { category: "subscriptions", subtype: "receipt", vendor: "netflix", amount: 16.73, currency: "USD", dateKind: "renewal", date: "2026-10-15" },
  },
  {
    name: "Spotify price increase",
    email: mail(
      "Spotify <no-reply@spotify.com>",
      "An update to your Premium subscription price",
      `Hi there,

We're writing to let you know that the price of your Premium Individual plan will change from $11.99/month to $12.99/month.
Your new price will take effect from your next billing date on November 3, 2026.

You can cancel anytime in your account settings.`,
    ),
    expect: { category: "subscriptions", subtype: "price_change", vendor: "spotify", amount: 12.99, cycle: "monthly", priceChange: { from: 11.99, to: 12.99 } },
  },
  {
    name: "Adobe trial ending",
    email: mail(
      "Adobe <message@adobe.com>",
      "Your free trial ends in 3 days",
      `Your Adobe Creative Cloud Pro free trial ends in 3 days.
After your trial ends, you'll be billed US$69.99/mo starting September 18, 2026 unless you cancel.`,
    ),
    expect: { category: "subscriptions", subtype: "trial_ending", vendor: "adobe", amount: 69.99, cycle: "monthly" },
  },
  {
    name: "Apple iCloud receipt",
    email: mail(
      "Apple <no_reply@email.apple.com>",
      "Your receipt from Apple.",
      `Apple Account: me@example.com
Billed To: Visa •••• 1881

iCloud+ with 200 GB (Monthly)
Renews October 12, 2026
$2.99

Subtotal $2.99
Total $2.99`,
    ),
    expect: { category: "subscriptions", subtype: "receipt", vendor: "apple", amount: 2.99, cycle: "monthly", data: { name: "iCloud+" } },
  },
  {
    name: "ChatGPT payment failed",
    email: mail(
      "OpenAI <noreply@tm.openai.com>",
      "Action required: your ChatGPT Plus payment failed",
      `We were unable to process your payment of $20.00 for ChatGPT Plus.
Please update your payment method to keep your subscription active.`,
    ),
    expect: { category: "subscriptions", subtype: "payment_failed", vendor: "openai", amount: 20 },
  },
  {
    name: "GitHub annual renewal notice",
    email: mail(
      "GitHub <noreply@github.com>",
      "[GitHub] Your GitHub Copilot subscription will renew soon",
      `Your GitHub Copilot Individual subscription will automatically renew on October 5, 2026 for $100.00 per year.
To make changes, visit your billing settings.`,
    ),
    expect: { category: "subscriptions", subtype: "renewal_notice", vendor: "github", amount: 100, cycle: "annual", dateKind: "renewal", date: "2026-10-05" },
  },
  {
    name: "Stripe receipt for Linear",
    email: mail(
      "Linear <invoice+statements@stripe.com>",
      "Your receipt from Linear Orbit, Inc. #2391-0042",
      `Receipt from Linear Orbit, Inc.
Amount paid $8.00
Date paid Sep 15, 2026
Payment method Mastercard - 5454

Linear Standard (monthly)  $8.00
Total $8.00`,
    ),
    expect: { category: "subscriptions", subtype: "receipt", vendor: "linear", amount: 8 },
  },
  {
    name: "Subscription cancelled",
    email: mail(
      "Disney+ <disneyplus@mail.disneyplus.com>",
      "Your subscription has been canceled",
      `We're sorry to see you go. Your Disney+ subscription has been canceled. You'll continue to have access until October 2, 2026.`,
    ),
    expect: { category: "subscriptions", subtype: "cancelled", vendor: "disney-plus" },
  },
  {
    name: "Chase credit card statement",
    email: mail(
      "Chase <no.reply.alerts@chase.com>",
      "Your Chase Sapphire statement is ready",
      `Your statement for your credit card ending in 4421 is available.

Statement balance: $1,284.37
Minimum payment due: $40.00
Payment due date: 10/09/2026

Make a payment or set up AutoPay at chase.com.`,
    ),
    expect: { category: "bills", subtype: "statement", vendor: "chase", amount: 1284.37, dateKind: "due", date: "2026-10-09" },
  },
  {
    name: "Verizon bill due",
    email: mail(
      "Verizon <VZWMail@ecrmemail.verizonwireless.com>",
      "Your Verizon bill is ready",
      `Your bill is ready. Amount due: $142.18. Due date: Oct 2, 2026.
AutoPay is scheduled for Oct 2, 2026 from your account ending in 6610.`,
    ),
    expect: { category: "bills", vendor: "verizon", amount: 142.18, data: { autopay: true } },
  },
  {
    name: "Utility overdue",
    email: mail(
      "Con Edison <conedison@coned.com>",
      "Your payment is past due",
      `Your account ending 0042 has a past due balance of $86.40. Please pay by September 22, 2026 to avoid a late fee.`,
    ),
    expect: { category: "bills", subtype: "overdue", vendor: "con-edison", amount: 86.4 },
  },
  {
    name: "Card transaction alert",
    email: mail(
      "Chase <no.reply.alerts@chase.com>",
      "You made a $412.50 transaction with BEST BUY",
      `Chase Sapphire Preferred (...4421)
A charge of $412.50 at BEST BUY 00123 was made on your card ending in 4421 on Sep 15, 2026 at 2:14 PM ET.`,
    ),
    expect: { category: "finance", subtype: "transaction", vendor: "chase", amount: 412.5, data: { merchant: "Best Buy" } },
  },
  {
    name: "Payroll direct deposit",
    email: mail(
      "Gusto <no-reply@gusto.com>",
      "Your paycheck is ready",
      `Hi Akhielesh, your paycheck from Acme Labs has been deposited. Net pay: $4,312.88. Pay date: September 15, 2026.`,
    ),
    expect: { category: "finance", subtype: "deposit", vendor: "gusto", amount: 4312.88 },
  },
  {
    name: "Venmo money received",
    email: mail("Venmo <venmo@venmo.com>", "Rahul Mehta paid you $45.00", `Rahul Mehta paid you $45.00\n"Dinner 🍜"`),
    expect: { category: "finance", subtype: "transfer_in", vendor: "venmo", amount: 45, data: { counterparty: "Rahul Mehta" } },
  },
  {
    name: "Fraud alert",
    email: mail(
      "Capital One <capitalone@notification.capitalone.com>",
      "Did you make this purchase?",
      `We noticed unusual activity on your card ending in 1188. Did you make this purchase of $1,299.00 at ELECTRONICS HUB on Sep 15? Reply YES or NO.`,
    ),
    expect: { category: "finance", subtype: "fraud_alert", vendor: "capital-one", amount: 1299 },
  },
  {
    name: "Tax form",
    email: mail("Robinhood <notifications@robinhood.com>", "Your 2025 Form 1099 is ready", `Your consolidated Form 1099 for tax year 2025 is now available in the app.`),
    expect: { category: "finance", subtype: "tax_document", vendor: "robinhood" },
  },
  {
    name: "Amazon shipped",
    email: mail(
      "Amazon.com <shipment-tracking@amazon.com>",
      "Shipped: \"Anker USB-C Charger 65W\" and 1 more item",
      `Your package is on the way. Arriving Thursday, September 17.
Order #113-4422918-5530011
Track package
Carrier: UPS 1Z999AA10123456784`,
    ),
    expect: { category: "orders", subtype: "shipped", vendor: "amazon", data: { orderNumber: "113-4422918-5530011", carrier: "UPS", trackingNumber: "1Z999AA10123456784" } },
  },
  {
    name: "UPS delivered",
    email: mail("UPS <mcinfo@ups.com>", "UPS Update: Package Delivered", `Your package was delivered at 3:42 PM. Left at: Front Door. Tracking Number: 1Z999AA10123456784`),
    expect: { category: "orders", subtype: "delivered", vendor: "ups" },
  },
  {
    name: "Out for delivery",
    email: mail("FedEx <TrackingUpdates@fedex.com>", "Your package is out for delivery", `Your FedEx package 771234567890 is out for delivery today. Estimated between 2-6 PM.`),
    expect: { category: "orders", subtype: "out_for_delivery", vendor: "fedex", data: { trackingNumber: "771234567890" } },
  },
  {
    name: "Google new sign-in",
    email: mail(
      "Google <no-reply@accounts.google.com>",
      "Security alert",
      `A new sign-in on Windows
me@example.com
We noticed a new sign-in to your Google Account on a Windows device. If this was you, you don't need to do anything. If not, we'll help you secure your account.
Check activity`,
    ),
    expect: { category: "security", subtype: "new_signin", vendor: "google", data: { device: "Windows" } },
  },
  {
    name: "Verification code",
    email: mail("Microsoft account team <account-security-noreply@accountprotection.microsoft.com>", "Microsoft account security code", `Please use the following security code for the Microsoft account me@example.com.\nSecurity code: 482913`),
    expect: { category: "security", subtype: "verification_code", vendor: "microsoft" },
  },
  {
    name: "Password changed",
    email: mail("GitHub <noreply@github.com>", "[GitHub] Your password was changed", `Hi @akhielesh, the password for your GitHub account was recently changed. If you did this, you can safely disregard this email.`),
    expect: { category: "security", subtype: "password_changed", vendor: "github" },
  },
  {
    name: "Flight booking",
    email: mail(
      "United Airlines <unitedairlines@united.com>",
      "eTicket Itinerary and Receipt for Confirmation K7QX2P",
      `Thank you for choosing United.
Confirmation Number: K7QX2P
Flight UA 1549 · New York/Newark (EWR) to San Francisco (SFO)
Departure: Tue, Nov 4, 2026 7:05 AM
Total: $412.40`,
    ),
    expect: { category: "travel", subtype: "flight", vendor: "united", data: { confirmation: "K7QX2P" } },
  },
  {
    name: "Hotel reservation",
    email: mail(
      "Marriott Bonvoy <reservations@marriott.com>",
      "Reservation Confirmation #81726354 for Brooklyn Marriott",
      `Your reservation is confirmed at Brooklyn Marriott.
Check-in: Friday, December 18, 2026
Check-out: Monday, December 21, 2026
3 nights · 1 room`,
    ),
    expect: { category: "travel", subtype: "hotel", vendor: "marriott" },
  },
  {
    name: "Flight delayed",
    email: mail("Delta Air Lines <DeltaAirLines@e.delta.com>", "Your flight DL 402 has been delayed", `Your flight DL 402 from JFK to LAX has been delayed. New departure time: 9:40 PM.`),
    expect: { category: "travel", subtype: "flight_change", vendor: "delta" },
  },
  {
    name: "Application received (Greenhouse)",
    email: mail(
      "Stripe Recruiting <no-reply@us.greenhouse-mail.io>",
      "Thank you for applying to Stripe",
      `Hi Akhielesh,

Thank you for your interest in Stripe! We've received your application for the Software Engineer, AI Products position and our team is reviewing it.

Best,
Stripe Recruiting`,
    ),
    expect: { category: "career", subtype: "application_received", data: { company: "Stripe", stage: "applied" } },
  },
  {
    name: "Interview invitation",
    email: mail(
      "Priya Shah <priya@notion.so>",
      "Interview invitation: Notion — Product Engineer",
      `Hi Akhielesh,

Thanks for applying to Notion! We'd love to invite you to a technical interview for the Product Engineer role.
Please pick a time that works for you this week: https://calendly.com/notion-recruiting/tech-screen

Best,
Priya`,
    ),
    expect: { category: "career", subtype: "interview_request", data: { company: "Notion" } },
  },
  {
    name: "Offer letter",
    email: mail(
      "Anthropic Recruiting <recruiting@anthropic.com>",
      "Your offer from Anthropic",
      `Congratulations! We're thrilled to extend you an offer to join Anthropic as a Member of Technical Staff. Your offer letter is attached.`,
      { attachments: [{ filename: "Offer Letter.pdf", contentType: "application/pdf", size: 82000 }] },
    ),
    expect: { category: "career", subtype: "offer" },
  },
  {
    name: "Rejection",
    email: mail(
      "Figma Careers <no-reply@ashbyhq.com>",
      "Update on your application to Figma",
      `Hi Akhielesh, thank you for taking the time to interview with us. Unfortunately, we have decided to move forward with other candidates whose experience more closely matches our needs.`,
    ),
    expect: { category: "career", subtype: "rejection", data: { company: "Figma", stage: "rejected" } },
  },
  {
    name: "Recruiter outreach",
    email: mail(
      "Jordan Lee <jordan.lee@ramp.com>",
      "AI Engineer role at Ramp",
      `Hi Akhielesh,

I'm a technical recruiter at Ramp and came across your profile — your work on AI products really stood out. Would you be open to a quick chat about our Senior AI Engineer role?

Thanks,
Jordan`,
    ),
    expect: { category: "career", subtype: "recruiter_outreach", data: { company: "Ramp" } },
  },
  {
    name: "Personal email",
    email: mail(
      "Ananya Rao <ananya.rao@gmail.com>",
      "Re: weekend plans",
      `Hey Akhielesh,

Saturday works for me! Let's do brunch at 11.

Cheers,
Ananya`,
    ),
    expect: { category: "personal", vendor: null },
  },
  {
    name: "Promotion from a subscription brand",
    email: mail(
      "Spotify <no-reply@spotify.com>",
      "Get 3 months of Premium for $0 — limited time offer",
      `Don't miss out. Try Premium free for 3 months. Offer ends soon. Terms apply. Shop now.`,
      { headers: { "list-unsubscribe": "<https://spotify.com/unsub>" } },
    ),
    expect: { category: "promotions" },
  },
  {
    name: "Newsletter",
    email: mail(
      "Lenny's Newsletter <lenny@substack.com>",
      "How the best PMs prioritize",
      `Read in app. This week in the newsletter: frameworks for prioritization from top product leaders...`,
      { headers: { "list-unsubscribe": "<https://substack.com/unsub>" } },
    ),
    expect: { category: "newsletters" },
  },
  {
    name: "Calendar invitation",
    email: mail(
      "Google Calendar <calendar-notification@google.com>",
      "Invitation: Design review @ Thu Oct 8, 2026 3pm - 4pm (EDT)",
      `You have been invited to the following event.
Design review
When: Thursday Oct 8, 2026 3pm – 4pm Eastern Time
Join with Google Meet: https://meet.google.com/abc-defg-hij`,
      { attachments: [{ filename: "invite.ics", contentType: "text/calendar", size: 2000 }] },
    ),
    expect: { category: "events", subtype: "invitation" },
  },
  {
    name: "Doctor appointment",
    email: mail("One Medical <noreply@onemedical.com>", "Appointment confirmed", `Your appointment with Dr. Kim is confirmed for Monday, October 12, 2026 at 9:30 AM at our Flatiron office.`),
    expect: { category: "health", subtype: "appointment", vendor: "one-medical" },
  },
  {
    name: "Vercel deploy failure",
    email: mail("Vercel <notifications@vercel.com>", "Failed production deployment on akhielesh-portfolio", `Deployment failed for akhielesh-portfolio (main). Build error: Command "pnpm build" exited with 1.`),
    expect: { category: "updates", subtype: "dev_alert", vendor: "vercel" },
  },
  {
    name: "Domain renewal",
    email: mail(
      "Namecheap <support@namecheap.com>",
      "Domain renewal reminder: akhielesh.com",
      `Your domain akhielesh.com is set to auto-renew on October 20, 2026. The renewal price is $15.98 for 1 year.`,
    ),
    expect: { category: "subscriptions", subtype: "renewal_notice", vendor: "namecheap", amount: 15.98, cycle: "annual" },
  },
  {
    name: "Indian rupee subscription",
    email: mail(
      "Netflix <info@account.netflix.com>",
      "Your Netflix membership has been renewed",
      `Your membership has been renewed. Amount charged: ₹649.00 (Standard plan, monthly). Next billing date: 15 October 2026.`,
    ),
    expect: { category: "subscriptions", vendor: "netflix", amount: 649, currency: "INR", cycle: "monthly" },
  },
];
