import type { FinAccountType } from "../../shared/types.js";
import { BankAuthError, type BankAccountInput, type BankFetchOptions, type BankFetchResult, type BankProvider, type BankTxnInput } from "./types.js";

// SimpleFIN Bridge (beta-bridge.simplefin.org): the user links banks on the Bridge's site and
// gets a one-time setup token. The token is base64 of a claim URL; POSTing to it returns an
// access URL with embedded credentials, which is all Adminak stores (encrypted).
//
// The setup token is user input that decodes to a URL we call, so both URLs must be https and
// on an allow-listed host (SIMPLEFIN_HOSTS), never an arbitrary or internal address.

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface SimplefinAccess {
  /** https://host/path (no credentials). */
  url: string;
  username: string;
  password: string;
}

function checkUrl(raw: string, allowedHosts: string[], what: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`The ${what} isn't a valid URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`The ${what} must use https.`);
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new Error(`The ${what} points at ${host}, which isn't a SimpleFIN Bridge host Adminak trusts. Set SIMPLEFIN_HOSTS to allow it.`);
  }
  if (url.port && url.port !== "443") throw new Error(`The ${what} uses an unexpected port.`);
  return url;
}

/** Decodes a setup token to its claim URL (validated). */
export function claimUrlFromToken(token: string, allowedHosts: string[]): URL {
  const cleaned = token.trim().replace(/\s+/g, "");
  if (!cleaned) throw new Error("Paste the setup token from SimpleFIN Bridge.");
  let decoded: string;
  try {
    decoded = Buffer.from(cleaned, "base64").toString("utf8");
  } catch {
    throw new Error("That setup token isn't valid base64.");
  }
  if (!/^https?:\/\//i.test(decoded)) throw new Error("That doesn't look like a SimpleFIN setup token (it should decode to a claim URL).");
  return checkUrl(decoded, allowedHosts, "setup token");
}

export function parseAccessUrl(raw: string, allowedHosts: string[]): SimplefinAccess {
  const url = checkUrl(raw, allowedHosts, "access URL");
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!username || !password) throw new Error("SimpleFIN returned an access URL without credentials.");
  url.username = "";
  url.password = "";
  return { url: url.toString().replace(/\/+$/, ""), username, password };
}

/** Exchanges a one-time setup token for an access URL. The token can be claimed only once. */
export async function claimSetupToken(token: string, allowedHosts: string[], fetcher: Fetcher = fetch): Promise<SimplefinAccess> {
  const claim = claimUrlFromToken(token, allowedHosts);
  const res = await fetcher(claim.toString(), { method: "POST", headers: { "content-length": "0" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (res.status === 403) throw new Error("SimpleFIN says this setup token was already used or has expired. Create a new one on the Bridge.");
  if (!res.ok) throw new Error(`SimpleFIN claim failed (HTTP ${res.status}).`);
  const body = (await res.text()).trim();
  return parseAccessUrl(body, allowedHosts);
}

interface SfinAccount {
  org?: { name?: string; domain?: string; "sfin-url"?: string; id?: string };
  id: string;
  name: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  transactions?: { id: string; posted: number; amount: string; description: string; payee?: string; memo?: string; transacted_at?: number; pending?: boolean }[];
}

function inferType(name: string, balance: number): FinAccountType {
  if (/\b(credit|card|visa|mastercard|amex|quicksilver|venture|savor|platinum|sapphire|freedom|discover it|rewards)\b/i.test(name)) return "credit";
  if (/\b(saving|savings|money market|360 performance|high yield|cd\b|certificate)\b/i.test(name)) return "savings";
  if (/\b(loan|mortgage|auto|student)\b/i.test(name)) return "loan";
  if (/\b(brokerage|ira|401k|roth|invest)\b/i.test(name)) return "investment";
  if (/\b(checking|360 checking|spend)\b/i.test(name)) return "checking";
  return balance < 0 ? "credit" : "checking";
}

const DAY = 86400000;

export class SimplefinProvider implements BankProvider {
  constructor(
    private readonly access: SimplefinAccess,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async fetch(opts: BankFetchOptions): Promise<BankFetchResult> {
    // The Bridge serves at most ~90 days per request; ask for less on routine refreshes.
    const start = new Date(Math.max(opts.since.getTime(), opts.now.getTime() - 89 * DAY));
    const url = `${this.access.url}/accounts?start-date=${Math.floor(start.getTime() / 1000)}&pending=1`;
    const res = await this.fetcher(url, {
      headers: { authorization: `Basic ${Buffer.from(`${this.access.username}:${this.access.password}`).toString("base64")}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 401 || res.status === 403) throw new BankAuthError("SimpleFIN rejected the access credentials. Create a new setup token and reconnect.");
    if (res.status === 402) throw new BankAuthError("Your SimpleFIN Bridge subscription needs attention (payment required).");
    if (!res.ok) throw new Error(`SimpleFIN request failed (HTTP ${res.status}).`);
    const data = (await res.json()) as { errors?: string[]; accounts?: SfinAccount[] };
    const accounts: BankAccountInput[] = [];
    const transactions: BankTxnInput[] = [];
    for (const a of data.accounts ?? []) {
      const balance = Number(a.balance);
      const type = inferType(a.name, balance);
      const owedSide = type === "credit" || type === "loan";
      const available = a["available-balance"] !== undefined ? Number(a["available-balance"]) : null;
      accounts.push({
        externalId: a.id,
        name: a.name,
        institution: a.org?.name ?? a.org?.domain ?? null,
        type,
        mask: /(\d{4})\D*$/.exec(a.name)?.[1] ?? null,
        currency: /^[A-Z]{3}$/.test(a.currency ?? "") ? a.currency : "USD",
        // SimpleFIN signs balances like transactions: a card balance owed is negative.
        balanceCurrent: Number.isFinite(balance) ? (owedSide ? -balance : balance) : null,
        balanceAvailable: available !== null && Number.isFinite(available) ? available : null,
        creditLimit: owedSide && available !== null && Number.isFinite(available) && Number.isFinite(balance) ? Math.round((available - balance) * 100) / 100 : null,
        balanceAt: a["balance-date"] ? new Date(a["balance-date"] * 1000).toISOString() : opts.now.toISOString(),
      });
      for (const t of a.transactions ?? []) {
        const amount = Number(t.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const when = new Date(((t.transacted_at ?? t.posted) || Math.floor(opts.now.getTime() / 1000)) * 1000);
        transactions.push({
          externalId: t.id,
          accountExternalId: a.id,
          date: `${when.toISOString().slice(0, 10)}T12:00:00.000Z`,
          amount,
          description: t.description || t.payee || t.memo || "Transaction",
          merchant: t.payee ?? null,
          pending: !!t.pending || !t.posted,
        });
      }
    }
    return {
      accounts,
      transactions,
      state: { lastFetchAt: opts.now.toISOString() },
      windowStart: start.toISOString(),
      warnings: (data.errors ?? []).map((e) => String(e).slice(0, 300)),
    };
  }
}
