import type { IncomingEmail } from "../intel/types.js";

// A realistic, self-consistent synthetic inbox used for the demo workspace and end-to-end tests.
// Dates are relative to "now" so the dashboard always looks alive.

interface DemoSpec {
  at: number; // days relative to now (negative = past)
  hour?: number;
  from: string;
  subject: string;
  text: string;
  links?: [label: string, url: string][];
  headers?: Record<string, string>;
  attachments?: IncomingEmail["attachments"];
}

const DAY = 86400000;

function fmt(date: Date, style: "long" | "short" | "us" | "weekday" = "long"): string {
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    long: { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
    short: { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
    us: { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" },
    weekday: { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" },
  };
  return new Intl.DateTimeFormat("en-US", opts[style]).format(date);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtml(text: string, links: [string, string][] = []): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const buttons = links.map(([label, url]) => `<p><a href="${url}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px">${escapeHtml(label)}</a></p>`).join("\n");
  return `<html><body>${paragraphs}${buttons}</body></html>`;
}

function parseFrom(from: string): { name: string | null; address: string } {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return m ? { name: m[1]!.trim(), address: m[2]!.trim().toLowerCase() } : { name: null, address: from.toLowerCase() };
}

export function demoEmails(now: Date, owner = { name: "Akhielesh", email: "you@example.com" }): IncomingEmail[] {
  const d = (days: number, hour = 9) => {
    const base = new Date(now.getTime() + days * DAY);
    base.setUTCHours(hour, (Math.abs(days * 37) % 50) + 3, 0, 0);
    return base;
  };
  const first = owner.name.split(" ")[0] ?? "there";
  const specs: DemoSpec[] = [];
  const push = (spec: DemoSpec) => specs.push(spec);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  for (const [days, amount] of [
    [-98, "15.49"],
    [-67, "15.49"],
    [-37, "15.49"],
    [-6, "17.99"],
  ] as const) {
    push({
      at: days,
      hour: 13,
      from: "Netflix <info@account.netflix.com>",
      subject: "Your Netflix receipt",
      text: `Hi ${first},\n\nThanks for being a Netflix member. Here's your receipt.\n\nPlan: Standard\nPayment method: Visa ending in 4242\n\nTotal ${"$" + amount}\n\nYour next billing date is ${fmt(d(days + 30))}.`,
      links: [["Manage membership", "https://www.netflix.com/account"]],
    });
  }
  push({
    at: -26,
    hour: 16,
    from: "Netflix <info@account.netflix.com>",
    subject: "An update to your Netflix membership price",
    text: `Hi ${first},\n\nWe're updating the price of your Standard plan from $15.49/month to $17.99/month. The new price will take effect starting ${fmt(d(-6))}, your next billing date.\n\nYou can change plans or cancel anytime.`,
    links: [["Manage membership", "https://www.netflix.com/account"]],
  });
  for (const days of [-95, -65, -35, -5]) {
    push({
      at: days,
      hour: 7,
      from: "Spotify <no-reply@spotify.com>",
      subject: "Your Spotify Premium receipt",
      text: `Thanks for your payment.\n\nSpotify Premium Individual\nAmount charged $11.99 (monthly)\nPayment method Mastercard ending 5454\nNext payment ${fmt(d(days + 30))}`,
      links: [["Manage subscription", "https://www.spotify.com/account/subscription/"]],
    });
  }
  for (const days of [-88, -58, -28]) {
    push({
      at: days,
      hour: 18,
      from: "OpenAI <noreply@tm.openai.com>",
      subject: "Your ChatGPT Plus receipt",
      text: `Receipt from OpenAI\n\nChatGPT Plus Subscription — monthly\nAmount paid $20.00\nPayment method Visa - 4242\n\nNext billing date: ${fmt(d(days + 30))}`,
    });
  }
  push({
    at: -0.6,
    hour: 15,
    from: "OpenAI <noreply@tm.openai.com>",
    subject: "Action required: your ChatGPT Plus payment failed",
    text: `We were unable to process your payment of $20.00 for your ChatGPT Plus subscription. Your card ending in 4242 was declined.\n\nPlease update your payment method to keep access to ChatGPT Plus.`,
    links: [["Update payment method", "https://chatgpt.com/#settings/Subscription"]],
  });
  for (const days of [-100, -70, -40, -10]) {
    push({
      at: days,
      hour: 4,
      from: "Apple <no_reply@email.apple.com>",
      subject: "Your receipt from Apple.",
      text: `Apple Account: ${owner.email}\nBilled To: Visa •••• 4242\n\niCloud+ with 200 GB (Monthly)\nRenews ${fmt(d(days + 30))}\n$2.99\n\nTotal $2.99`,
      links: [["Manage Subscriptions", "https://apps.apple.com/account/subscriptions"]],
    });
  }
  push({
    at: -5,
    hour: 20,
    from: "Adobe <message@adobe.com>",
    subject: "Welcome to your Creative Cloud Pro free trial",
    text: `Your 7-day free trial has started. Enjoy Creative Cloud Pro.\nYour trial ends on ${fmt(d(2))}. After your trial, you'll be billed US$69.99/mo unless you cancel.`,
    links: [["Manage plan", "https://account.adobe.com/plans"]],
  });
  push({
    at: -0.3,
    hour: 12,
    from: "Adobe <message@adobe.com>",
    subject: "Your free trial ends in 2 days",
    text: `Your Creative Cloud Pro free trial ends on ${fmt(d(2))}. After your trial ends, you'll be billed US$69.99/mo.\n\nNot ready to commit? You can cancel your plan anytime before then.`,
    links: [
      ["Cancel your plan", "https://account.adobe.com/plans"],
      ["Manage plan", "https://account.adobe.com/plans"],
    ],
  });
  push({
    at: -2,
    hour: 10,
    from: "GitHub <noreply@github.com>",
    subject: "[GitHub] Your GitHub Copilot subscription will renew soon",
    text: `Hi @${first.toLowerCase()},\n\nYour GitHub Copilot Individual subscription will automatically renew on ${fmt(d(5))} for $100.00 per year.\nPayment method: Visa ending in 4242.`,
    links: [["Manage billing", "https://github.com/settings/billing"]],
  });
  for (const days of [-87, -57, -27]) {
    push({
      at: days,
      hour: 9,
      from: "Notion <team@mail.notion.so>",
      subject: "Your Notion receipt",
      text: `Thanks for your payment.\n\nNotion Plus plan (monthly)\nAmount paid $10.00\nNext billing date: ${fmt(d(days + 30))}`,
    });
  }
  for (const days of [-80, -50, -20]) {
    push({
      at: days,
      hour: 22,
      from: "Anthropic <billing@mail.anthropic.com>",
      subject: "Your receipt from Anthropic",
      text: `Receipt\n\nClaude Pro plan — monthly\nAmount paid $20.00\nPayment method Visa ending in 4242\nNext billing date ${fmt(d(days + 30))}`,
      links: [["Manage subscription", "https://claude.ai/settings/billing"]],
    });
  }
  for (const days of [-110, -80]) {
    push({
      at: days,
      hour: 6,
      from: "Disney+ <disneyplus@mail.disneyplus.com>",
      subject: "Your Disney+ payment receipt",
      text: `Thank you for your payment.\n\nDisney+ Premium (monthly)\nTotal charged $15.99\nNext billing date ${fmt(d(days + 30))}`,
    });
  }
  push({
    at: -43,
    hour: 19,
    from: "Disney+ <disneyplus@mail.disneyplus.com>",
    subject: "Your subscription has been canceled",
    text: `We're sorry to see you go. Your Disney+ subscription has been canceled. You'll continue to have access until ${fmt(d(-20))}.`,
  });
  push({
    at: -3,
    hour: 11,
    from: "Namecheap <support@namecheap.com>",
    subject: "Domain renewal reminder: akhielesh.com",
    text: `Your domain akhielesh.com is set to auto-renew on ${fmt(d(18))}. The renewal price is $15.98 for 1 year.`,
    links: [["Manage domain", "https://ap.www.namecheap.com/domains/list/"]],
  });
  for (const days of [-93, -63, -33, -3]) {
    push({
      at: days,
      hour: 8,
      from: "Google Payments <payments-noreply@google.com>",
      subject: "Your YouTube Premium receipt",
      text: `Thanks for your purchase.\n\nYouTube Premium (Individual) — monthly membership\nTotal: $13.99\nPayment method: Mastercard •••• 5454\nNext charge: ${fmt(d(days + 30))}`,
      links: [["Manage membership", "https://www.youtube.com/paid_memberships"]],
    });
  }
  for (const days of [-84, -54, -24]) {
    push({
      at: days,
      hour: 3,
      from: "Vercel <invoices@vercel.com>",
      subject: "Your Vercel receipt",
      text: `Receipt for Vercel Pro\n\nPro plan — 1 seat (monthly)\nAmount paid $20.00\nPeriod ends ${fmt(d(days + 30))}`,
    });
  }

  // ── Bills ──────────────────────────────────────────────────────────────────
  push({
    at: -6,
    hour: 12,
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "Your Chase Sapphire statement is ready",
    text: `Your statement for your credit card ending in 4421 is available.\n\nStatement balance: $1,284.37\nMinimum payment due: $40.00\nPayment due date: ${fmt(d(19), "us")}`,
    links: [["Make a payment", "https://www.chase.com/"]],
  });
  push({
    at: -21,
    hour: 12,
    from: "American Express <AmericanExpress@welcome.aexp.com>",
    subject: "Your American Express Gold Card statement is ready",
    text: `Your statement for the account ending in 1005 is now available.\n\nNew balance: $2,108.55\nMinimum payment due: $55.00\nPayment due date: ${fmt(d(-1))}`,
    links: [["View statement", "https://www.americanexpress.com/"]],
  });
  push({
    at: -3,
    hour: 14,
    from: "American Express <AmericanExpress@welcome.aexp.com>",
    subject: "We've received your payment",
    text: `Thank you for your payment of $2,108.55 to your Gold Card account ending in 1005. Your payment has been received and will be applied to your account.`,
  });
  push({
    at: -4,
    hour: 9,
    from: "Verizon <VZWMail@ecrmemail.verizonwireless.com>",
    subject: "Your Verizon bill is ready",
    text: `Your bill is ready.\n\nAmount due: $142.18\nDue date: ${fmt(d(3), "short")}\nAutoPay is scheduled for ${fmt(d(3), "short")} from your account ending in 6610.`,
    links: [["View bill", "https://www.verizon.com/"]],
  });
  push({
    at: -9,
    hour: 10,
    from: "Con Edison <conedison@coned.com>",
    subject: "Your Con Edison bill is ready",
    text: `Your new bill is available.\n\nAccount ending 0042\nAmount due: $86.40\nDue date: ${fmt(d(2))}\n\nPay your bill online to avoid late fees.`,
    links: [["Pay bill", "https://www.coned.com/"]],
  });
  push({
    at: -0.8,
    hour: 17,
    from: "Xfinity <online.communications@alerts.comcast.net>",
    subject: "Your Xfinity payment is past due",
    text: `Your account ending 3391 has a past due balance of $79.99. Please pay by ${fmt(d(4))} to avoid service interruption.`,
    links: [["Pay now", "https://www.xfinity.com/"]],
  });
  push({
    at: -11,
    hour: 9,
    from: "GEICO <geico@email.geico.com>",
    subject: "Your auto insurance renewal is ready",
    text: `Your GEICO auto policy renews soon.\n\nPremium due: $612.00\nDue date: ${fmt(d(12))}\n\nReview your policy and pay online.`,
    links: [["Pay now", "https://www.geico.com/"]],
  });
  push({
    at: -1,
    hour: 8,
    from: "Bilt Rewards <noreply@biltrewards.com>",
    subject: "Your rent payment was received",
    text: `Thank you for your payment. Your rent payment of $3,450.00 has been received and applied to your account.`,
  });

  // ── Money in & out ─────────────────────────────────────────────────────────
  push({
    at: -2,
    hour: 19,
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You made a $412.50 transaction with BEST BUY",
    text: `Chase Sapphire Preferred (...4421)\nA charge of $412.50 at BEST BUY 00123 was made on your card ending in 4421.`,
  });
  push({
    at: -1,
    hour: 23,
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You made a $64.20 transaction with WHOLE FOODS",
    text: `Chase Sapphire Preferred (...4421)\nA charge of $64.20 at WHOLE FOODS MKT was made on your card ending in 4421.`,
  });
  push({
    at: -6,
    hour: 14,
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You made a $17.99 transaction with NETFLIX.COM",
    text: `Chase Sapphire Preferred (...4421)\nA charge of $17.99 at NETFLIX.COM was made on your card ending in 4421.`,
  });
  for (const days of [-30, -16, -2]) {
    push({
      at: days,
      hour: 6,
      from: "Gusto <no-reply@gusto.com>",
      subject: "Your paycheck is ready",
      text: `Hi ${first}, your paycheck from Lumen Labs has been deposited.\n\nNet pay: $4,312.88\nPay date: ${fmt(d(days))}`,
    });
  }
  push({ at: -3, hour: 21, from: "Venmo <venmo@venmo.com>", subject: "Rahul Mehta paid you $45.00", text: `Rahul Mehta paid you $45.00\n"Ramen night 🍜"` });
  push({
    at: -0.15,
    hour: 2,
    from: "Capital One <capitalone@notification.capitalone.com>",
    subject: "Did you make this purchase?",
    text: `We noticed unusual activity on your Venture card ending in 1188.\n\nDid you make this purchase of $1,299.00 at ELECTRONICS HUB? If not, lock your card in the Capital One app.`,
    links: [["Review activity", "https://www.capitalone.com/"]],
  });
  push({
    at: -48,
    hour: 10,
    from: "Robinhood <notifications@robinhood.com>",
    subject: "Your 2025 Form 1099 is ready",
    text: `Your consolidated Form 1099 for tax year 2025 is now available in the Robinhood app.`,
  });
  push({
    at: -4,
    hour: 15,
    from: "Robinhood <notifications@robinhood.com>",
    subject: "Your order to buy NVDA has been executed",
    text: `Your market order to buy 3 shares of NVDA was executed at an average price of $182.41. Trade confirmation is available in the app.`,
  });
  push({
    at: -7,
    hour: 9,
    from: "Credit Karma <notifications@creditkarma.com>",
    subject: "Your credit score changed",
    text: `Good news! Your TransUnion credit score went up 12 points to 781. See what changed in your credit report.`,
  });
  push({
    at: -5,
    hour: 16,
    from: "Amazon.com <return@amazon.com>",
    subject: "Your refund of $34.99 has been issued",
    text: `We've processed your refund of $34.99 for the returned item "Logitech MX Keys Mini". The refund has been issued to your Visa ending in 4242.`,
  });

  // ── Orders & deliveries ────────────────────────────────────────────────────
  push({
    at: -4,
    hour: 18,
    from: "Amazon.com <auto-confirm@amazon.com>",
    subject: "Your Amazon.com order #113-4422918-5530011",
    text: `Thanks for your order, ${first}!\n\nOrder #113-4422918-5530011\nAnker USB-C Charger 65W\nQty: 1\nKindle Paperwhite case\nQty: 1\n\nOrder Total: $89.97`,
    links: [["View or manage order", "https://www.amazon.com/gp/your-account/order-history"]],
  });
  push({
    at: -3,
    hour: 12,
    from: "Amazon.com <shipment-tracking@amazon.com>",
    subject: 'Shipped: "Anker USB-C Charger 65W" and 1 more item',
    text: `Your package is on the way. Arriving ${fmt(d(0), "weekday")}.\nOrder #113-4422918-5530011\nCarrier: UPS 1Z999AA10123456784`,
    links: [["Track package", "https://www.amazon.com/gp/your-account/order-history"]],
  });
  push({
    at: -0.2,
    hour: 7,
    from: "UPS <mcinfo@ups.com>",
    subject: "UPS Update: Your package is out for delivery",
    text: `Your package is out for delivery today and is scheduled to arrive by 7:00 PM.\nTracking Number: 1Z999AA10123456784`,
    links: [["Track package", "https://www.ups.com/track?tracknum=1Z999AA10123456784"]],
  });
  push({
    at: -2,
    hour: 10,
    from: "Apple Store <order_acknowledgment@orders.apple.com>",
    subject: "Your order has shipped",
    text: `Your AirPods Pro 3 are on the way.\nOrder number: W1928374650\nCarrier: FedEx 771234567890\nEstimated delivery: ${fmt(d(2), "weekday")}`,
    links: [["Track shipment", "https://www.fedex.com/fedextrack/?trknbr=771234567890"]],
  });
  push({
    at: -1,
    hour: 16,
    from: "UPS <mcinfo@ups.com>",
    subject: "UPS Update: Package Delivered",
    text: `Your Nike package was delivered at 3:42 PM. Left at: Front Door.\nTracking Number: 1Z4E59A80312548812`,
  });
  push({
    at: -1,
    hour: 1,
    from: "DoorDash <no-reply@doordash.com>",
    subject: "Order confirmation for Ruby's Thai Kitchen",
    text: `Thanks for your order! Your order from Ruby's Thai Kitchen has been received.\n\nPad See Ew\nQty: 1\nTotal: $38.40`,
  });
  push({
    at: -0.4,
    hour: 13,
    from: "FedEx <TrackingUpdates@fedex.com>",
    subject: "Delivery exception: your package is delayed",
    text: `Your FedEx package 394827364512 from IKEA is delayed due to weather. New estimated delivery date: ${fmt(d(3), "weekday")}.`,
  });

  // ── Security ───────────────────────────────────────────────────────────────
  push({
    at: -0.25,
    hour: 6,
    from: "Google <no-reply@accounts.google.com>",
    subject: "Security alert",
    text: `A new sign-in on Windows\n${owner.email}\nWe noticed a new sign-in to your Google Account on a Windows device near Newark, NJ. If this was you, you don't need to do anything. If not, we'll help you secure your account.`,
    links: [["Check activity", "https://myaccount.google.com/notifications"]],
  });
  push({
    at: -0.5,
    hour: 4,
    from: "Instagram <security@mail.instagram.com>",
    subject: "Suspicious login attempt blocked",
    text: `We blocked a suspicious login attempt to your account from Chrome on Android near Lagos, Nigeria. If this wasn't you, secure your account now.`,
    links: [["Secure your account", "https://www.instagram.com/accounts/password/change/"]],
  });
  push({
    at: -2,
    hour: 20,
    from: "GitHub <noreply@github.com>",
    subject: "[GitHub] Your password was changed",
    text: `Hi @${first.toLowerCase()}, the password for your GitHub account was recently changed. If you did this, you can safely disregard this email.`,
  });
  push({
    at: -9,
    hour: 11,
    from: "Have I Been Pwned <noreply@haveibeenpwned.com>",
    subject: "You've been pwned in the TechForum data breach",
    text: `Your email address was found in a data breach. Your information was exposed in the TechForum breach, including email addresses and passwords. Change your password on any site where you reused it.`,
  });
  push({
    at: -0.05,
    hour: 9,
    from: "Microsoft account team <account-security-noreply@accountprotection.microsoft.com>",
    subject: "Microsoft account security code",
    text: `Please use the following security code for the Microsoft account ${owner.email}.\n\nSecurity code: 482913`,
  });

  // ── Travel ─────────────────────────────────────────────────────────────────
  push({
    at: -12,
    hour: 15,
    from: "United Airlines <unitedairlines@united.com>",
    subject: "eTicket Itinerary and Receipt for Confirmation K7QX2P",
    text: `Thank you for choosing United.\nConfirmation Number: K7QX2P\nFlight UA 1549 · New York/Newark (EWR) to San Francisco (SFO)\nDeparture: ${fmt(d(9), "weekday")}, ${d(9).getUTCFullYear()} 7:05 AM\nTotal: $412.40`,
    links: [["View trip", "https://www.united.com/en/us/manageres/mytrips"]],
  });
  push({
    at: -12,
    hour: 16,
    from: "Marriott Bonvoy <reservations@marriott.com>",
    subject: "Reservation Confirmation #81726354 for San Francisco Marriott Marquis",
    text: `Your reservation is confirmed at San Francisco Marriott Marquis.\nCheck-in: ${fmt(d(9), "weekday")}, ${d(9).getUTCFullYear()}\nCheck-out: ${fmt(d(12), "weekday")}, ${d(12).getUTCFullYear()}\n3 nights · 1 room\nTotal: $987.00`,
    links: [["View reservation", "https://www.marriott.com/"]],
  });
  push({
    at: -20,
    hour: 10,
    from: "Delta Air Lines <DeltaAirLines@e.delta.com>",
    subject: "Your trip confirmation — Confirmation code HTR4ZQ",
    text: `Your trip is confirmed.\nConfirmation code: HTR4ZQ\nFlight DL 402 · New York (JFK) to Los Angeles (LAX)\nDeparture: ${fmt(d(1), "weekday")}, ${d(1).getUTCFullYear()} 6:30 PM\nTotal: $289.20`,
  });
  push({
    at: -0.1,
    hour: 18,
    from: "Delta Air Lines <DeltaAirLines@e.delta.com>",
    subject: "It's time to check in for your flight to Los Angeles",
    text: `Check-in is now open for flight DL 402 from JFK to LAX departing ${fmt(d(1), "weekday")} at 6:30 PM. Confirmation code: HTR4ZQ.`,
    links: [["Check in", "https://www.delta.com/mytrips"]],
  });
  push({
    at: -2,
    hour: 23,
    from: "Uber Receipts <noreply@uber.com>",
    subject: "Your Tuesday evening trip with Uber",
    text: `Thanks for riding, ${first}.\n\nTotal $24.10\nTrip from SoHo to Williamsburg`,
  });

  // ── Career ─────────────────────────────────────────────────────────────────
  push({
    at: -14,
    hour: 14,
    from: "Stripe Recruiting <no-reply@us.greenhouse-mail.io>",
    subject: "Thank you for applying to Stripe",
    text: `Hi ${first},\n\nThank you for your interest in Stripe! We've received your application for the Software Engineer, AI Products position and our team is reviewing it.\n\nBest,\nStripe Recruiting`,
  });
  push({
    at: -9,
    hour: 13,
    from: "OpenAI <no-reply@ashbyhq.com>",
    subject: "Thanks for applying to OpenAI",
    text: `Hi ${first},\n\nThanks for applying to OpenAI! We've received your application for the Applied AI Engineer role and will be in touch.\n\nOpenAI Recruiting`,
  });
  push({
    at: -3,
    hour: 17,
    from: "Priya Shah <priya@notion.so>",
    subject: "Interview invitation: Notion — Product Engineer",
    text: `Hi ${first},\n\nThanks for applying to Notion! We'd love to invite you to a technical interview for the Product Engineer role on ${fmt(d(2), "weekday")} at 2:00 PM.\n\nBest,\nPriya`,
    links: [["Join with Google Meet", "https://meet.google.com/abc-defg-hij"]],
  });
  push({
    at: -2,
    hour: 12,
    from: "Linear <no-reply@codesignal.com>",
    subject: "Linear invited you to complete a coding assessment",
    text: `Hi ${first}, Linear has invited you to complete a technical assessment on CodeSignal for the Senior Software Engineer role. Please complete the assessment by ${fmt(d(4))}.`,
    links: [["Start assessment", "https://app.codesignal.com/"]],
  });
  push({
    at: -6,
    hour: 18,
    from: "Figma Careers <no-reply@ashbyhq.com>",
    subject: "Update on your application to Figma",
    text: `Hi ${first}, thank you for taking the time to interview with us. Unfortunately, we have decided to move forward with other candidates whose experience more closely matches our needs right now.`,
  });
  push({
    at: -1,
    hour: 15,
    from: "Jordan Lee <jordan.lee@ramp.com>",
    subject: "AI Engineer role at Ramp",
    text: `Hi ${first},\n\nI'm a technical recruiter at Ramp and came across your profile — your work on AI products really stood out. Would you be open to a quick chat about our Senior AI Engineer role?\n\nThanks,\nJordan`,
  });
  push({
    at: -0.35,
    hour: 16,
    from: "Perplexity Recruiting <recruiting@perplexity.ai>",
    subject: "Your offer from Perplexity",
    text: `Hi ${first},\n\nCongratulations! We're thrilled to extend you an offer to join Perplexity as a Founding Product Engineer. Your offer letter and compensation details are attached. Please let us know your decision by ${fmt(d(7))}.`,
    attachments: [{ filename: "Perplexity Offer Letter.pdf", contentType: "application/pdf", size: 120_000 }],
  });
  push({
    at: -1,
    hour: 5,
    from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
    subject: "12 new jobs for AI Product Engineer",
    text: `Jobs matching AI Product Engineer in New York: Anthropic, Scale AI, Hebbia and 9 more are hiring.`,
    headers: { "list-unsubscribe": "<https://www.linkedin.com/unsub>" },
  });

  // ── Events & health ────────────────────────────────────────────────────────
  push({
    at: -1,
    hour: 14,
    from: "Google Calendar <calendar-notification@google.com>",
    subject: `Invitation: Design review @ ${fmt(d(1), "weekday")} 3pm - 4pm (EDT)`,
    text: `You have been invited to the following event.\nDesign review\nWhen: ${fmt(d(1), "weekday")}, ${d(1).getUTCFullYear()} 3:00 PM\nJoin with Google Meet: https://meet.google.com/xyz-abcd-efg`,
    attachments: [{ filename: "invite.ics", contentType: "text/calendar", size: 2000 }],
  });
  push({
    at: -8,
    hour: 19,
    from: "Eventbrite <noreply@order.eventbrite.com>",
    subject: "Your tickets for AI Engineer Summit",
    text: `Your tickets are confirmed.\nAI Engineer Summit\n${fmt(d(15), "weekday")}, ${d(15).getUTCFullYear()} at 9:00 AM\nOrder total: $299.00`,
  });
  push({
    at: -2,
    hour: 20,
    from: "OpenTable <member_services@opentable.com>",
    subject: "Your reservation at Via Carota is confirmed",
    text: `Your table reservation at Via Carota is confirmed for 2 people on ${fmt(d(2), "weekday")} at 7:30 PM.`,
  });
  push({
    at: -1,
    hour: 11,
    from: "One Medical <noreply@onemedical.com>",
    subject: "Appointment confirmed",
    text: `Your appointment with Dr. Kim is confirmed for ${fmt(d(4), "weekday")}, ${d(4).getUTCFullYear()} at 9:30 AM at our Flatiron office.`,
  });
  push({
    at: -0.5,
    hour: 10,
    from: "CVS Pharmacy <CVSPharmacy@pharmacy.cvs.com>",
    subject: "Your prescription is ready for pickup",
    text: `Your prescription is ready for pickup at CVS Pharmacy, 270 Lafayette St.`,
  });

  // ── People ─────────────────────────────────────────────────────────────────
  push({
    at: -0.3,
    hour: 14,
    from: "Ananya Rao <ananya.rao@gmail.com>",
    subject: "Re: weekend plans",
    text: `Hey ${first},\n\nSaturday works for me! Let's do brunch at 11 and then the Met?\n\nCheers,\nAnanya`,
  });
  push({
    at: -2,
    hour: 1,
    from: "Mom <lakshmi.s@yahoo.com>",
    subject: "Call this weekend?",
    text: `Hi kanna,\n\nAre you free to call on Sunday morning? Dad wants to hear about the new job offers.\n\nLove,\nAmma`,
  });

  // ── Noise: newsletters, promotions, social, product updates ────────────────
  const noise: DemoSpec[] = [
    { at: -1, hour: 12, from: "Lenny's Newsletter <lenny@substack.com>", subject: "How the best PMs prioritize", text: "This week in the newsletter: frameworks for prioritization from top product leaders. Read in app." },
    { at: -4, hour: 12, from: "TLDR AI <dan@tldrnewsletter.com>", subject: "TLDR AI 2026-09: new frontier models, agents in production", text: "Your daily digest of AI research and product news. Read online." },
    { at: -0.7, hour: 11, from: "TLDR AI <dan@tldrnewsletter.com>", subject: "TLDR AI: evals that matter", text: "Your daily digest of AI news. Read online." },
    { at: -2, hour: 13, from: "Morning Brew <crew@morningbrew.com>", subject: "☕ Markets, money and more", text: "Good morning. Here's today's edition of the Brew. Read in browser." },
    { at: -1, hour: 15, from: "Nike <nike@official.nike.com>", subject: "Members only: 25% off running", text: "Limited time. Shop now and save up to 25% on running gear. Free shipping for members." },
    { at: -3, hour: 15, from: "UNIQLO <uniqlo@mail.uniqlo.com>", subject: "New arrivals: fall essentials", text: "Shop new arrivals and best sellers. Limited time offer. Don't miss out." },
    { at: -0.9, hour: 10, from: "Spotify <no-reply@spotify.com>", subject: "Get 3 months of Premium Family for $0", text: "Limited time offer. Try Premium Family free. Offer ends soon. Shop now." },
    { at: -5, hour: 15, from: "Best Buy <BestBuyInfo@emailinfo.bestbuy.com>", subject: "Deals of the week are here", text: "Save big on laptops, TVs and more. Shop now — sale ends Sunday." },
    { at: -2, hour: 8, from: "LinkedIn <notifications-noreply@linkedin.com>", subject: "You appeared in 24 searches this week", text: "You appeared in 24 searches this week. See who's looking at your profile." },
    { at: -0.6, hour: 9, from: "X <notify@x.com>", subject: "Sam Altman and 4 others liked your post", text: "Sam Altman and 4 others liked your post about agent evals." },
    { at: -0.45, hour: 16, from: "Vercel <notifications@vercel.com>", subject: "Failed production deployment on akhielesh-portfolio", text: 'Deployment failed for akhielesh-portfolio (main). Build error: Command "pnpm build" exited with 1.' },
    { at: -6, hour: 10, from: "Cloudflare <noreply@notify.cloudflare.com>", subject: "Updates to our Terms of Service", text: "We're updating our terms of service effective next month. No action is required." },
    { at: -1.5, hour: 7, from: "GitHub <noreply@github.com>", subject: "[akhielesh/portfolio] Dependabot alert: critical vulnerability in next", text: "Dependabot found a critical security vulnerability in a dependency of akhielesh/portfolio." },
  ];
  for (const n of noise) {
    push({ ...n, headers: n.headers ?? (/(newsletter|substack|tldr|brew|nike|uniqlo|best buy|spotify)/i.test(n.from) ? { "list-unsubscribe": "<https://example.com/unsubscribe>" } : {}) });
  }

  return specs
    .map((spec, index) => {
      const date = d(Math.trunc(spec.at), spec.hour ?? 9);
      // Fractional days are hours ago (keeps very recent items in the past).
      const when = spec.at > -1 && spec.at < 0 ? new Date(now.getTime() + spec.at * DAY) : date;
      return {
        providerId: `demo-${index + 1}`,
        threadId: null,
        messageId: `<demo-${index + 1}-${when.getTime()}@adminak.demo>`,
        from: parseFrom(spec.from),
        to: [owner.email],
        subject: spec.subject,
        date: when.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : when,
        text: spec.text,
        html: spec.links?.length ? toHtml(spec.text, spec.links) : null,
        headers: spec.headers ?? {},
        attachments: spec.attachments ?? [],
        labels: ["INBOX"],
      } satisfies IncomingEmail;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
