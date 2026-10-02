import { describe, expect, it } from "vitest";
import type { BankingDTO, ChargeDTO, ImportPreviewDTO, ImportResultDTO, MoneyDTO, OverviewDTO, SubscriptionDTO } from "../src/shared/types.js";
import { parseAmount, parseCsv, parseCsvStatement, parseDate } from "../src/server/finance/csv.js";
import { classifyTransaction, cleanMerchant, merchantKey } from "../src/server/finance/merchant.js";
import { parseOfxStatement } from "../src/server/finance/ofx.js";
import { detectCycle } from "../src/server/finance/recurring.js";
import { claimSetupToken, claimUrlFromToken, parseAccessUrl, SimplefinProvider } from "../src/server/finance/simplefin.js";
import { detectInvert } from "../src/server/finance/store.js";
import { createFinConnection, syncFinConnection } from "../src/server/finance/sync.js";
import { TellerProvider, type TellerTransport } from "../src/server/finance/teller.js";
import { createHarness, setupOwner } from "./helpers.js";

const SIMPLEFIN_HOSTS = ["bridge.simplefin.org", "beta-bridge.simplefin.org"];

describe("merchant cleaning and classification", () => {
  it("turns card descriptors into merchant names", () => {
    expect(cleanMerchant("NETFLIX.COM 866-579-7172 CA")).toBe("Netflix");
    expect(cleanMerchant("SQ *BLUE BOTTLE COFFEE BROOKLYN NY")).toBe("Blue Bottle Coffee");
    expect(cleanMerchant("TRADER JOE S #558 BROOKLYN NY")).toBe("Trader Joe's");
    expect(cleanMerchant("AMZN Mktp US*2K4LM0Q91")).toBe("Amazon");
    expect(cleanMerchant("UBER *EATS PENDING")).toBe("Uber Eats");
    expect(cleanMerchant("DD *DOORDASH RUBYSTHA")).toBe("DoorDash");
    expect(cleanMerchant("TST* PIZZERIA DELFINA SAN FRANCISCOCA")).toBe("Pizzeria Delfina");
    expect(cleanMerchant("LUMEN LABS INC PAYROLL PPD ID: 1234567890")).toBe("Lumen Labs Inc Payroll");
    expect(merchantKey("Trader Joe's")).toBe(merchantKey(cleanMerchant("TRADER JOE S #12 OAKLAND CA")));
  });

  it("separates card payments, transfers, income, refunds and fees from spending", () => {
    const c = (description: string, amount: number, accountType: "checking" | "credit" | "savings" = "checking", extra = {}) =>
      classifyTransaction({ description, merchant: cleanMerchant(description), amount, accountType, ...extra });
    expect(c("CAPITAL ONE MOBILE PYMT", -1284.37).kind).toBe("card_payment");
    expect(c("CAPITAL ONE MOBILE PYMT AUTHORIZED", 1284.37, "credit").kind).toBe("card_payment");
    expect(c("PAYMENT - THANK YOU", 500, "credit").kind).toBe("card_payment");
    expect(c("Withdrawal to 360 Performance Savings XXXXXXX7713", -500).kind).toBe("transfer_out");
    expect(c("Deposit from 360 Checking XXXXXXX6610", 500, "savings").kind).toBe("transfer_in");
    expect(c("Zelle payment to Rahul Mehta", -45).kind).toBe("transfer_out");
    expect(c("LUMEN LABS INC PAYROLL PPD ID: 1234567890", 4312.88)).toMatchObject({ kind: "deposit", spend: "income" });
    expect(c("Monthly Interest Paid", 38.2, "savings")).toMatchObject({ kind: "deposit", spend: "income" });
    expect(c("AMAZON.COM REFUND", 34.99, "credit").kind).toBe("refund");
    expect(c("FOREIGN TRANSACTION FEE", -3.21, "credit").kind).toBe("fee");
    expect(c("OVERDRAFT FEE", -35).kind).toBe("fee");
    expect(c("NETFLIX.COM 866-579-7172 CA", -17.99, "credit", { vendorKind: "streaming" })).toMatchObject({ kind: "subscription", spend: "subscriptions" });
    expect(c("AVALON BAY APARTMENTS RENT WEB PMTS", -3450, "checking", { bankCategory: "home" }).spend).toBe("bills");
    expect(c("SQ *BLUE BOTTLE COFFEE BROOKLYN NY", -5.45, "credit", { bankCategory: "Dining" })).toMatchObject({ kind: "purchase", spend: "food" });
    expect(c("UBER *TRIP HELP.UBER.COM CA", -18.4, "credit", { bankCategory: "transport" }).spend).toBe("transport");
  });

  it("detects card feeds that report purchases as positive", () => {
    expect(detectInvert("credit", [{ amount: 20, description: "NETFLIX" }, { amount: -500, description: "PAYMENT THANK YOU" }])).toBe(true);
    expect(detectInvert("credit", [{ amount: -20, description: "NETFLIX" }, { amount: 500, description: "PAYMENT THANK YOU" }])).toBe(false);
    expect(detectInvert("checking", [{ amount: 20, description: "x" }])).toBe(false);
  });
});

describe("statement parsing", () => {
  it("parses CSV fields, amounts and dates", () => {
    expect(parseCsv('a,b,c\r\n"x, y","he said ""hi""",3\n')).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "3"],
    ]);
    expect(parseAmount("$1,234.56")).toBe(1234.56);
    expect(parseAmount("(12.34)")).toBe(-12.34);
    expect(parseAmount("12.34-")).toBe(-12.34);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("")).toBeNull();
    expect(parseDate("09/30/26")).toBe("2026-09-30");
    expect(parseDate("2026-09-30")).toBe("2026-09-30");
    expect(parseDate("Sep 3, 2026")).toBe("2026-09-03");
    expect(parseDate("31/01/2026")).toBe("2026-01-31");
  });

  it("reads a Capital One credit card export", () => {
    const csv = [
      "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
      "2026-09-28,2026-09-29,1188,NETFLIX.COM,Entertainment,17.99,",
      "2026-09-27,2026-09-27,1188,CAPITAL ONE MOBILE PYMT,Payment/Credit,,1284.37",
      "2026-09-25,2026-09-26,1188,SQ *BLUE BOTTLE COFFEE,Dining,5.45,",
      "2026-09-25,2026-09-26,1188,SQ *BLUE BOTTLE COFFEE,Dining,5.45,",
    ].join("\n");
    const s = parseCsvStatement(csv);
    expect(s.format).toBe("capital_one_card");
    expect(s.account).toMatchObject({ type: "credit", mask: "1188", institution: "Capital One" });
    expect(s.transactions.map((t) => t.amount)).toEqual([-17.99, 1284.37, -5.45, -5.45]);
    // Two identical coffees are two transactions with distinct, stable ids.
    expect(new Set(s.transactions.map((t) => t.externalId)).size).toBe(4);
    expect(parseCsvStatement(csv).transactions.map((t) => t.externalId)).toEqual(s.transactions.map((t) => t.externalId));
  });

  it("reads a Capital One 360 export with a debit/credit column", () => {
    const csv = [
      "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance",
      "6610,LUMEN LABS INC PAYROLL,09/30/26,Credit,4312.88,9000.00",
      "6610,AVALON BAY APARTMENTS RENT,09/28/26,Debit,3450.00,4687.12",
    ].join("\n");
    const s = parseCsvStatement(csv);
    expect(s.format).toBe("capital_one_360");
    expect(s.account.type).toBe("checking");
    expect(s.transactions.map((t) => [t.date.slice(0, 10), t.amount])).toEqual([
      ["2026-09-30", 4312.88],
      ["2026-09-28", -3450],
    ]);
  });

  it("guesses columns for unknown exports and infers the sign convention", () => {
    const csv = ["My Bank export", "", "Date,Payee,Amount", "09/01/2026,Corner Store,23.10", "09/02/2026,Online Payment Thank You,-400.00", "09/03/2026,Gas Station,41.00"].join("\n");
    const s = parseCsvStatement(csv);
    expect(s.format).toBe("generic_csv");
    expect(s.mapping).toMatchObject({ date: 0, description: 1, amount: 2, positiveIsOut: true });
    expect(s.transactions.map((t) => t.amount)).toEqual([-23.1, 400, -41]);
  });

  it("reads OFX (SGML) downloads", () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Capital One<FID>1001</FI></SONRS></SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>USD<CCACCTFROM><ACCTID>XXXXXXXXXXXX1188</CCACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260928120000[-5:EST]<TRNAMT>-17.99<FITID>abc1<NAME>NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260927<TRNAMT>1284.37<FITID>abc2<NAME>PAYMENT &amp; THANK YOU</STMTTRN></BANKTRANLIST>
<LEDGERBAL><BALAMT>-1937.62<DTASOF>20260930</LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const s = parseOfxStatement(ofx);
    expect(s.account).toMatchObject({ type: "credit", mask: "1188", balanceCurrent: 1937.62 });
    expect(s.transactions).toHaveLength(2);
    expect(s.transactions[1]).toMatchObject({ externalId: "ofx:abc2", amount: 1284.37, description: "PAYMENT & THANK YOU" });
  });
});

describe("recurring detection", () => {
  const at = (d: string, amount: number) => ({ occurred_at: `${d}T12:00:00.000Z`, amount });
  it("finds steady monthly charges and ignores irregular ones", () => {
    expect(detectCycle([at("2026-06-03", 24.99), at("2026-07-03", 24.99), at("2026-08-02", 24.99), at("2026-09-02", 24.99)])).toEqual({ cycle: "monthly", amount: 24.99 });
    expect(detectCycle([at("2026-06-03", 24.99), at("2026-06-20", 24.99), at("2026-08-02", 24.99)])).toBeNull();
    expect(detectCycle([at("2026-06-03", 10), at("2026-07-03", 60), at("2026-08-02", 12)])).toBeNull();
  });
});

describe("SimpleFIN", () => {
  const token = (url: string) => Buffer.from(url).toString("base64");

  it("only follows setup tokens to trusted https hosts", () => {
    expect(claimUrlFromToken(token("https://beta-bridge.simplefin.org/simplefin/claim/abc"), SIMPLEFIN_HOSTS).host).toBe("beta-bridge.simplefin.org");
    expect(() => claimUrlFromToken(token("https://169.254.169.254/latest/meta-data"), SIMPLEFIN_HOSTS)).toThrow(/isn't a SimpleFIN Bridge host/);
    expect(() => claimUrlFromToken(token("http://beta-bridge.simplefin.org/claim"), SIMPLEFIN_HOSTS)).toThrow(/https/);
    expect(() => claimUrlFromToken(token("https://evil.example/simplefin.org"), SIMPLEFIN_HOSTS)).toThrow();
    expect(() => claimUrlFromToken(token("https://beta-bridge.simplefin.org:8443/claim"), SIMPLEFIN_HOSTS)).toThrow(/port/);
    expect(() => parseAccessUrl("https://user:pw@internal.local/simplefin", SIMPLEFIN_HOSTS)).toThrow();
  });

  it("claims a token and reads accounts with the stored credentials", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/claim/")) return new Response("https://u1:p%402@beta-bridge.simplefin.org/simplefin", { status: 200 });
      return Response.json({
        errors: [],
        accounts: [
          {
            org: { name: "Capital One", domain: "capitalone.com" },
            id: "ACT-1",
            name: "Quicksilver (1234)",
            currency: "USD",
            balance: "-420.50",
            "available-balance": "4579.50",
            "balance-date": 1790000000,
            transactions: [{ id: "T1", posted: 1789900000, amount: "-12.00", description: "SPOTIFY USA", pending: false }],
          },
        ],
      });
    };
    const access = await claimSetupToken(token("https://beta-bridge.simplefin.org/simplefin/claim/xyz"), SIMPLEFIN_HOSTS, fetcher);
    expect(access).toEqual({ url: "https://beta-bridge.simplefin.org/simplefin", username: "u1", password: "p@2" });
    const result = await new SimplefinProvider(access, fetcher).fetch({ state: {}, since: new Date("2026-08-01"), now: new Date("2026-10-01"), firstSync: true });
    // Credentials go in a header, never in the URL.
    expect(calls[1]!.url).toMatch(/^https:\/\/beta-bridge\.simplefin\.org\/simplefin\/accounts\?start-date=\d+&pending=1$/);
    expect((calls[1]!.init!.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("u1:p@2").toString("base64")}`);
    expect(result.accounts[0]).toMatchObject({ type: "credit", mask: "1234", balanceCurrent: 420.5, creditLimit: 5000, institution: "Capital One" });
    expect(result.transactions[0]).toMatchObject({ amount: -12, description: "SPOTIFY USA" });
  });
});

describe("banking end-to-end", async () => {
  const h = createHarness({ now: new Date("2026-10-01T14:00:00Z") });
  await setupOwner(h);
  const demo = await h.json<{ inserted: number; matched: number }>("POST", "/api/demo");

  it("loads the demo bank alongside the demo inbox and matches receipts", () => {
    expect(demo.status).toBe(200);
    expect(demo.body.matched).toBeGreaterThanOrEqual(10);
  });

  it("summarizes balances, net worth and history", async () => {
    const res = await h.json<BankingDTO>("GET", "/api/banking");
    expect(res.status).toBe(200);
    const bank = res.body.connections.find((c) => c.provider === "demo")!;
    expect(bank.accounts.map((a) => a.type).sort()).toEqual(["checking", "credit", "savings"]);
    expect(res.body.summary).toMatchObject({ cash: 25262.74, owed: 1937.62, creditLimit: 10000 });
    expect(res.body.summary!.netWorth).toBeCloseTo(25262.74 - 1937.62, 2);
    expect(res.body.summary!.matchedReceipts).toBeGreaterThanOrEqual(10);
    const card = bank.accounts.find((a) => a.type === "credit")!;
    expect(card.history.length).toBeGreaterThan(80);
    expect(card.history.at(-1)!.balance).toBe(1937.62);
    expect(res.body.netWorthHistory.length).toBeGreaterThan(80);
  });

  it("counts a purchase once when both the receipt and the bank transaction exist", async () => {
    const all = await h.json<ChargeDTO[]>("GET", "/api/charges?all=1&q=netflix&limit=100");
    const receipts = all.body.filter((c) => c.source === "email" && c.amount === 17.99);
    const bank = all.body.filter((c) => c.source === "bank" && c.amount === 17.99);
    expect(bank).toHaveLength(1);
    expect(receipts.some((r) => r.supersededBy === bank[0]!.id)).toBe(true);
    expect(bank[0]!.receipt).not.toBeNull();
    expect(bank[0]!.subscriptionId).not.toBeNull();
    // The default list hides the superseded receipt.
    const visible = await h.json<ChargeDTO[]>("GET", "/api/charges?q=netflix&limit=100");
    expect(visible.body.filter((c) => c.amount === 17.99 && c.direction === "out")).toHaveLength(1);
    // Netflix's subscription isn't double counted either.
    const subs = await h.json<{ items: SubscriptionDTO[] }>("GET", "/api/subscriptions");
    const netflix = subs.body.items.find((s) => s.name.toLowerCase().includes("netflix"))!;
    expect(netflix.chargeCount).toBe(4);
  });

  it("keeps card payments and transfers out of spending and income", async () => {
    const money = await h.json<MoneyDTO>("GET", "/api/money");
    const charges = await h.json<ChargeDTO[]>("GET", "/api/charges?source=bank&limit=500");
    const payments = charges.body.filter((c) => c.kind === "card_payment");
    expect(payments).toHaveLength(4);
    expect(charges.body.filter((c) => c.kind === "transfer_out" && c.account?.mask === "6610").length).toBeGreaterThanOrEqual(3);
    const overview = await h.json<OverviewDTO>("GET", "/api/overview");
    const spend = overview.body.kpis.spendThisMonth.find((t) => t.currency === "USD")?.amount ?? 0;
    expect(spend).toBeLessThan(4000);
    expect(money.body.topMerchants.some((m) => /capital one/i.test(m.name))).toBe(false);
  });

  it("finds bank-only subscriptions, fees and double charges", async () => {
    const subs = await h.json<{ items: SubscriptionDTO[] }>("GET", "/api/subscriptions");
    expect(subs.body.items.some((s) => s.name === "Planet Fitness" && s.cycle === "monthly")).toBe(true);
    const alerts = await h.json<{ type: string; title: string }[]>("GET", "/api/alerts?status=all&limit=200");
    const types = alerts.body.map((a) => a.type);
    expect(types).toContain("finance.duplicate_charge");
    expect(types).toContain("subscription.new");
  });

  it("recategorizes a transaction and remembers the merchant", async () => {
    const charges = await h.json<ChargeDTO[]>("GET", "/api/charges?q=boulders&limit=10");
    const first = charges.body[0]!;
    const res = await h.json<{ charge: ChargeDTO; applied: number }>("PATCH", `/api/charges/${first.id}`, { spendCategory: "health", applyToMerchant: true });
    expect(res.status).toBe(200);
    expect(res.body.charge).toMatchObject({ spendCategory: "health", categorySource: "user" });
    expect(res.body.applied).toBeGreaterThanOrEqual(1);
    const again = await h.json<ChargeDTO[]>("GET", "/api/charges?q=boulders&limit=10");
    expect(again.body.every((c) => c.spendCategory === "health")).toBe(true);
    // A refresh keeps the user's choice.
    const conn = h.ctx.db.prepare("SELECT id FROM fin_connections WHERE provider = 'demo'").get() as { id: number };
    await syncFinConnection(h.ctx, conn.id, "manual");
    const after = await h.json<ChargeDTO[]>("GET", "/api/charges?q=boulders&limit=10");
    expect(after.body.every((c) => c.spendCategory === "health")).toBe(true);
    const del = await h.json("DELETE", `/api/charges/${first.id}`);
    expect(del.status).toBe(409);
  });

  it("previews and imports a statement, deduplicating re-imports", async () => {
    const csv = [
      "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
      "2026-09-20,2026-09-21,4421,BLUE APRON,Merchandise,59.99,",
      "2026-09-22,2026-09-23,4421,SHELL OIL 5744,Gas/Automotive,42.10,",
      "2026-09-25,2026-09-25,4421,PAYMENT - THANK YOU,Payment/Credit,,300.00",
    ].join("\n");
    const preview = await h.json<ImportPreviewDTO>("POST", "/api/banking/import/preview", { filename: "transactions.csv", content: csv });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ format: "capital_one_card", count: 3, totalOut: 102.09, totalIn: 300 });
    const first = await h.json<ImportResultDTO>("POST", "/api/banking/import", { filename: "transactions.csv", content: csv });
    expect(first.body).toMatchObject({ inserted: 3, duplicates: 0 });
    const second = await h.json<ImportResultDTO>("POST", "/api/banking/import", { filename: "transactions.csv", content: csv, finAccountId: first.body.accountId });
    expect(second.body).toMatchObject({ inserted: 0, duplicates: 3 });
    const bad = await h.json("POST", "/api/banking/import/preview", { filename: "x.csv", content: "hello,world\n1,2" });
    expect(bad.status).toBe(422);
  });

  it("rejects SimpleFIN tokens for untrusted hosts and Teller without configuration", async () => {
    const res = await h.json<{ error: string }>("POST", "/api/banking/simplefin", { setupToken: Buffer.from("https://127.0.0.1/claim").toString("base64") });
    expect(res.status).toBe(422);
    const teller = await h.json("POST", "/api/banking/teller", { accessToken: "token_abcdefgh", enrollmentId: "enr_1" });
    expect(teller.status).toBe(409);
  });

  it("removing the bank restores the email receipts", async () => {
    const before = await h.json<OverviewDTO>("GET", "/api/overview");
    const bank = (await h.json<BankingDTO>("GET", "/api/banking")).body.connections.find((c) => c.provider === "demo")!;
    const res = await h.json("DELETE", `/api/banking/connections/${bank.id}`);
    expect(res.status).toBe(200);
    const left = h.ctx.db.prepare("SELECT COUNT(*) AS n FROM charges WHERE superseded_by IS NOT NULL").get() as { n: number };
    expect(left.n).toBe(0);
    const subs = await h.json<{ items: SubscriptionDTO[] }>("GET", "/api/subscriptions");
    expect(subs.body.items.some((s) => s.name === "Planet Fitness")).toBe(false);
    expect(subs.body.items.find((s) => s.name.toLowerCase().includes("netflix"))!.chargeCount).toBe(4);
    expect(before.status).toBe(200);
  });
});

describe("Teller provider", () => {
  it("pages transactions, maps balances and flags revoked enrollments", async () => {
    const pages: Record<string, unknown> = {
      "/accounts": [
        { id: "acc_1", name: "Venture", type: "credit", subtype: "credit_card", currency: "USD", last_four: "1188", enrollment_id: "enr_1", institution: { id: "capital_one", name: "Capital One" }, status: "open" },
      ],
      "/accounts/acc_1/balances": { ledger: "1937.62", available: "8062.38" },
      "/accounts/acc_1/transactions?count=250": Array.from({ length: 250 }, (_, i) => ({
        id: `txn_${i}`,
        account_id: "acc_1",
        amount: "-5.00",
        date: `2026-09-${String(28 - (i % 20)).padStart(2, "0")}`,
        description: "COFFEE",
        status: "posted",
        type: "card_payment",
      })),
      "/accounts/acc_1/transactions?count=250&from_id=txn_249": [
        { id: "txn_old", account_id: "acc_1", amount: "-9.00", date: "2026-08-15", description: "OLD", status: "posted", type: "card_payment", details: { category: "dining", counterparty: { name: "Old Cafe" } } },
      ],
    };
    const transport: TellerTransport = async (path) => (path in pages ? { status: 200, body: pages[path] } : { status: 404, body: { error: { code: "not_found", message: path } } });
    const result = await new TellerProvider(transport).fetch({ state: {}, since: new Date("2026-08-01"), now: new Date("2026-10-01"), firstSync: true });
    expect(result.accounts[0]).toMatchObject({ type: "credit", mask: "1188", balanceCurrent: 1937.62, creditLimit: 10000 });
    expect(result.transactions).toHaveLength(251);
    expect(result.transactions.at(-1)).toMatchObject({ merchant: "Old Cafe", category: "dining" });

    const revoked: TellerTransport = async () => ({ status: 403, body: { error: { code: "enrollment.disconnected.credentials_invalid", message: "Credentials invalid" } } });
    const h = createHarness();
    const id = createFinConnection(h.ctx, { provider: "teller", label: "Capital One", secret: { accessToken: "x" } });
    const outcome = await syncFinConnection(h.ctx, id, "manual", new TellerProvider(revoked));
    expect(outcome.ok).toBe(false);
    const row = h.ctx.db.prepare("SELECT status FROM fin_connections WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("error");
    const alert = h.ctx.db.prepare("SELECT type FROM alerts WHERE type = 'system.bank_error'").get();
    expect(alert).toBeTruthy();
  });
});
