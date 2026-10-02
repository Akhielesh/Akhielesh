import https from "node:https";
import type { FinAccountType } from "../../shared/types.js";
import type { AppConfig } from "../config.js";
import { BankAuthError, dateOnlyIso, type BankAccountInput, type BankFetchOptions, type BankFetchResult, type BankProvider, type BankTxnInput } from "./types.js";

// Teller (teller.io): the user links a bank in Teller Connect (bank login happens inside Teller's
// window; Adminak never sees it) and we receive a read-only access token for that enrollment.
// API calls use mutual TLS with the certificate Teller issues to the app, plus the token as the
// basic-auth username. Capital One is supported directly ("capital_one").

export interface TellerResponse {
  status: number;
  body: unknown;
}

export type TellerTransport = (path: string) => Promise<TellerResponse>;

const MAX_BODY = 25 * 1024 * 1024;

export function tellerTransport(config: NonNullable<AppConfig["teller"]>, accessToken: string): TellerTransport {
  const auth = `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`;
  return (path) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: "api.teller.io",
          path,
          method: "GET",
          cert: config.certificate ?? undefined,
          key: config.privateKey ?? undefined,
          headers: { authorization: auth, accept: "application/json", "user-agent": "Adminak" },
          timeout: 45_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY) req.destroy(new Error("Teller response too large"));
            else chunks.push(chunk);
          });
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let body: unknown = text;
            try {
              body = text ? JSON.parse(text) : null;
            } catch {
              // Keep the text for the error message.
            }
            resolve({ status: res.statusCode ?? 0, body });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("Teller didn't respond in time")));
      req.on("error", reject);
      req.end();
    });
}

interface TellerAccount {
  id: string;
  name: string;
  type: "depository" | "credit" | string;
  subtype: string | null;
  currency: string;
  last_four: string | null;
  enrollment_id: string;
  institution: { id: string; name: string };
  status: string;
}

interface TellerTransaction {
  id: string;
  account_id: string;
  amount: string;
  date: string;
  description: string;
  status: "posted" | "pending" | string;
  type: string;
  details?: { category?: string | null; counterparty?: { name?: string | null; type?: string | null } | null; processing_status?: string };
}

function errorOf(res: TellerResponse): { code: string; message: string } {
  const err = (res.body as { error?: { code?: string; message?: string } } | null)?.error;
  return { code: err?.code ?? `http_${res.status}`, message: err?.message ?? (typeof res.body === "string" ? res.body.slice(0, 200) : `HTTP ${res.status}`) };
}

async function getJson<T>(transport: TellerTransport, path: string): Promise<T> {
  const res = await transport(path);
  if (res.status >= 200 && res.status < 300) return res.body as T;
  const { code, message } = errorOf(res);
  if (res.status === 401 || res.status === 403 || code.startsWith("enrollment.disconnected") || code === "invalid_token") {
    throw new BankAuthError(`The bank connection needs to be re-linked (${message}).`);
  }
  throw new Error(`Teller ${path.split("?")[0]} failed: ${message}`);
}

function accountType(a: TellerAccount): FinAccountType {
  if (a.type === "credit") return "credit";
  if (a.subtype === "savings" || a.subtype === "money_market" || a.subtype === "certificate_of_deposit") return "savings";
  if (a.subtype === "checking") return "checking";
  return a.type === "depository" ? "checking" : "other";
}

export async function tellerAccounts(transport: TellerTransport): Promise<TellerAccount[]> {
  const accounts = await getJson<TellerAccount[]>(transport, "/accounts");
  if (!Array.isArray(accounts)) throw new Error("Teller returned an unexpected account list.");
  return accounts;
}

export class TellerProvider implements BankProvider {
  constructor(private readonly transport: TellerTransport) {}

  async fetch(opts: BankFetchOptions): Promise<BankFetchResult> {
    const accounts = (await tellerAccounts(this.transport)).filter((a) => a.status !== "closed");
    const out: BankAccountInput[] = [];
    const transactions: BankTxnInput[] = [];
    const sinceDay = opts.since.toISOString().slice(0, 10);
    const warnings: string[] = [];
    for (const a of accounts) {
      const type = accountType(a);
      let balance: { ledger?: string | null; available?: string | null } = {};
      try {
        balance = await getJson(this.transport, `/accounts/${encodeURIComponent(a.id)}/balances`);
      } catch (error) {
        if (error instanceof BankAuthError) throw error;
        warnings.push(`Balance for ${a.name} unavailable: ${(error as Error).message}`);
      }
      const ledger = balance.ledger != null ? Number(balance.ledger) : null;
      const available = balance.available != null ? Number(balance.available) : null;
      out.push({
        externalId: a.id,
        name: a.name,
        institution: a.institution?.name ?? null,
        type,
        subtype: a.subtype,
        mask: a.last_four,
        currency: (a.currency || "USD").toUpperCase(),
        balanceCurrent: ledger !== null && Number.isFinite(ledger) ? (type === "credit" ? Math.abs(ledger) : ledger) : null,
        balanceAvailable: available !== null && Number.isFinite(available) ? available : null,
        creditLimit: type === "credit" && ledger !== null && available !== null && Number.isFinite(ledger + available) ? Math.round((Math.abs(ledger) + available) * 100) / 100 : null,
        balanceAt: opts.now.toISOString(),
      });

      // Newest first; page back until we pass the window or run out.
      let fromId: string | null = null;
      for (let page = 0; page < 20; page++) {
        const query: string = `count=250${fromId ? `&from_id=${encodeURIComponent(fromId)}` : ""}`;
        const batch: TellerTransaction[] = await getJson<TellerTransaction[]>(this.transport, `/accounts/${encodeURIComponent(a.id)}/transactions?${query}`);
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const t of batch) {
          if (t.date < sinceDay) continue;
          const amount = Number(t.amount);
          if (!Number.isFinite(amount) || amount === 0) continue;
          transactions.push({
            externalId: t.id,
            accountExternalId: a.id,
            date: dateOnlyIso(t.date),
            amount,
            description: t.description,
            merchant: t.details?.counterparty?.name ?? null,
            category: t.details?.category ?? null,
            type: t.type,
            pending: t.status === "pending",
          });
        }
        if (batch.length < 250 || batch.at(-1)!.date < sinceDay) break;
        fromId = batch.at(-1)!.id;
      }
    }
    return { accounts: out, transactions, state: { lastFetchAt: opts.now.toISOString() }, windowStart: dateOnlyIso(sinceDay), warnings };
  }
}
