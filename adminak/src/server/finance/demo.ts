import type { BankAccountInput, BankFetchOptions, BankFetchResult, BankProvider, BankTxnInput } from "./types.js";

// A synthetic Capital One relationship that lines up with the demo inbox: the receipts in the
// demo mail (Netflix, Spotify, ChatGPT, iCloud…) appear here as card transactions a day later, so
// the demo shows email ↔ bank matching, card payments, transfers and bank-only subscriptions.

const DAY = 86400000;

export function demoBankData(now: Date): { accounts: BankAccountInput[]; transactions: BankTxnInput[] } {
  const day = (offset: number) => new Date(now.getTime() + offset * DAY).toISOString().slice(0, 10) + "T12:00:00.000Z";
  const tx: BankTxnInput[] = [];
  let seq = 0;
  const add = (account: string, offset: number, amount: number, description: string, extra: Partial<BankTxnInput> = {}) => {
    if (offset > 0.5) return;
    tx.push({ externalId: `demo-${account}-${++seq}`, accountExternalId: account, date: day(offset), amount, description, pending: offset > -1, ...extra });
  };

  // ── Card (Venture ••1188): receipts from the demo inbox, posted a day later ──
  for (const [d, amt] of [
    [-98, 15.49],
    [-67, 15.49],
    [-37, 15.49],
    [-6, 17.99],
  ] as const)
    add("card", d + 1, -amt, "NETFLIX.COM 866-579-7172 CA", { category: "entertainment" });
  for (const d of [-95, -65, -35, -5]) add("card", d + 1, -11.99, "Spotify USA 877-778-1161 NY", { category: "entertainment" });
  for (const d of [-88, -58, -28]) add("card", d + 1, -20, "OPENAI *CHATGPT SUBSCR OPENAI.COM CA", { category: "software" });
  for (const d of [-100, -70, -40, -10]) add("card", d + 1, -2.99, "APPLE.COM/BILL 866-712-7753 CA", { category: "software" });
  // Bank-only subscription: never emails a receipt.
  for (const d of [-115, -85, -55, -25]) add("card", d, -24.99, "PLANET FITNESS #1123 BROOKLYN NY", { category: "health" });
  for (const d of [-112, -82, -52, -22]) add("card", d, -9.99, "SQ *NYT DIGITAL SUBSCR NEW YORK NY", { category: "general" });
  // Everyday spending.
  const groceries = [-104, -97, -90, -83, -76, -69, -62, -55, -48, -41, -34, -27, -20, -13, -6];
  groceries.forEach((d, i) => add("card", d, -(58.12 + ((i * 7.31) % 41)), i % 2 ? "TRADER JOE S #558 BROOKLYN NY" : "WHOLEFDS BKN 10231 BROOKLYN NY", { category: "groceries" }));
  for (let d = -110; d <= -1; d += 4) add("card", d, -(5.45 + (Math.abs(d) % 3)), "SQ *BLUE BOTTLE COFFEE BROOKLYN NY", { category: "dining" });
  for (const [d, amt] of [
    [-92, 41.2],
    [-71, 63.75],
    [-49, 38.9],
    [-33, 72.4],
    [-12, 54.1],
    [-3, 47.85],
  ] as const)
    add("card", d, -amt, d % 2 ? "UBER *EATS PENDING" : "DD *DOORDASH RUBYSTHA", { category: "dining" });
  for (const [d, amt] of [
    [-86, 18.4],
    [-61, 24.1],
    [-44, 12.75],
    [-18, 31.6],
    [-4, 24.1],
  ] as const)
    add("card", d, -amt, "UBER *TRIP HELP.UBER.COM CA", { category: "transport" });
  // The order and delivery receipts in the demo mail, posted a day later.
  add("card", -3, -89.97, "AMZN Mktp US*2K4LM0Q91", { category: "shopping" });
  add("card", 0, -38.4, "DD *DOORDASH RUBYSTHA", { category: "dining" });
  // The purchase Capital One's fraud alert in the demo mail asks about.
  add("card", -1, -1299, "ELECTRONICS HUB 0042 JERSEY CITY NJ", { category: "electronics" });
  add("card", -15, 34.99, "AMAZON.COM REFUND", { category: "shopping" });
  add("card", -2, -49, "BKLYN BOULDERS GOWANUS BROOKLYN NY", { category: "sport" });
  add("card", -1, -49, "BKLYN BOULDERS GOWANUS BROOKLYN NY", { category: "sport" });
  add("card", -30, -3.21, "FOREIGN TRANSACTION FEE", { type: "fee" });
  add("card", -19, 1284.37, "CAPITAL ONE MOBILE PYMT AUTHORIZED", { type: "payment" });
  add("card", -49, 1102.18, "CAPITAL ONE AUTOPAY PYMT", { type: "payment" });

  // ── Checking (360 ••6610) ──
  for (const d of [-58, -44, -30, -16, -2]) add("checking", d, 4312.88, "LUMEN LABS INC PAYROLL PPD ID: 1234567890", { category: "income" });
  // Rent goes through Bilt (the demo mail has Bilt's receipt for the latest one).
  for (const d of [-61, -31, -1]) add("checking", d, -3450, "BILT RENT AVALON BAY", { category: "home" });
  for (const d of [-80, -50, -20]) add("checking", d, -(132.4 + (Math.abs(d) % 17)), "CON ED OF NY INTELL CK", { category: "utilities" });
  for (const d of [-77, -47, -17]) add("checking", d, -79.99, "VERIZON WIRELESS PAYMENTS", { category: "phone" });
  add("checking", -19, -1284.37, "CAPITAL ONE MOBILE PYMT", { type: "transfer" });
  add("checking", -49, -1102.18, "CAPITAL ONE ONLINE PYMT", { type: "transfer" });
  for (const d of [-57, -29, -1]) add("checking", d, -500, "Withdrawal to 360 Performance Savings XXXXXXX7713", { type: "transfer" });
  add("checking", -3, -45, "Zelle payment to Rahul Mehta", { type: "transfer" });
  add("checking", -40, -60, "ATM WITHDRAWAL 1234 FLATBUSH AVE", { type: "atm" });

  // ── Savings (360 Performance ••7713) ──
  for (const d of [-57, -29, -1]) add("savings", d, 500, "Deposit from 360 Checking XXXXXXX6610", { type: "transfer" });
  for (const d of [-90, -60, -30]) add("savings", d, 38.17 + (Math.abs(d) % 5), "Monthly Interest Paid", { type: "interest" });

  const accounts: BankAccountInput[] = [
    {
      externalId: "checking",
      name: "360 Checking",
      institution: "Capital One",
      type: "checking",
      mask: "6610",
      currency: "USD",
      balanceCurrent: 6842.19,
      balanceAvailable: 6842.19,
      balanceAt: now.toISOString(),
    },
    {
      externalId: "savings",
      name: "360 Performance Savings",
      institution: "Capital One",
      type: "savings",
      mask: "7713",
      currency: "USD",
      balanceCurrent: 18420.55,
      balanceAvailable: 18420.55,
      balanceAt: now.toISOString(),
    },
    {
      externalId: "card",
      name: "Venture Rewards",
      institution: "Capital One",
      type: "credit",
      mask: "1188",
      currency: "USD",
      balanceCurrent: 1937.62,
      balanceAvailable: 8062.38,
      creditLimit: 10000,
      balanceAt: now.toISOString(),
    },
  ];
  return { accounts, transactions: tx.map((t) => ({ ...t, amount: Math.round(t.amount * 100) / 100 })) };
}

export class DemoBankProvider implements BankProvider {
  async fetch(opts: BankFetchOptions): Promise<BankFetchResult> {
    const data = demoBankData(opts.now);
    return { ...data, state: { loaded: true }, windowStart: null };
  }
}
