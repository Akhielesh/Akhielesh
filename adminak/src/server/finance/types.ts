import type { FinAccountType } from "../../shared/types.js";

/** One account as a bank feed or statement describes it. */
export interface BankAccountInput {
  externalId: string;
  name: string;
  institution: string | null;
  type: FinAccountType;
  subtype?: string | null;
  mask?: string | null;
  currency: string;
  /** Money in the account; for cards and loans, the amount owed (positive). */
  balanceCurrent?: number | null;
  balanceAvailable?: number | null;
  creditLimit?: number | null;
  balanceAt?: string | null;
}

/** One transaction. `amount` is signed from the account holder's view: negative = money left the account. */
export interface BankTxnInput {
  externalId: string;
  accountExternalId: string;
  /** ISO timestamp (date-only values are stored at 12:00 UTC so they don't shift a day in any time zone). */
  date: string;
  amount: number;
  description: string;
  /** The counterparty name when the source provides one (Teller, SimpleFIN payee, Apple Card "Merchant"). */
  merchant?: string | null;
  /** The source's own category, if any. */
  category?: string | null;
  /** The source's transaction type (Teller: card_payment, ach, fee, …). */
  type?: string | null;
  pending?: boolean;
}

export interface BankFetchResult {
  accounts: BankAccountInput[];
  transactions: BankTxnInput[];
  state: Record<string, unknown>;
  /** Earliest date the fetch covered completely, per account (for clearing stale pending rows). */
  windowStart?: string | null;
  warnings?: string[];
}

export interface BankFetchOptions {
  state: Record<string, unknown>;
  since: Date;
  now: Date;
  firstSync: boolean;
}

export interface BankProvider {
  fetch(opts: BankFetchOptions): Promise<BankFetchResult>;
}

/** The bank rejected Adminak's credentials: the connection must be re-linked. */
export class BankAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankAuthError";
  }
}

/** Calendar date (YYYY-MM-DD) → ISO at noon UTC. */
export function dateOnlyIso(ymd: string): string {
  return `${ymd}T12:00:00.000Z`;
}
