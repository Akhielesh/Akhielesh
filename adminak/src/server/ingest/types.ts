import type { IncomingEmail } from "../intel/types.js";

export interface FetchOptions {
  state: Record<string, unknown>;
  since: Date;
  maxMessages: number;
  isKnown: (providerId: string) => boolean;
  onBatch: (emails: IncomingEmail[]) => Promise<void> | void;
  onProgress: (phase: string, done: number, total: number) => void;
}

export interface FetchResult {
  state: Record<string, unknown>;
  fetched: number;
  backfillDone: boolean;
}

export interface MailProvider {
  fetch(opts: FetchOptions): Promise<FetchResult>;
  /** Applies Adminak labels inside the mailbox (Gmail only). */
  applyLabels?(items: { providerId: string; labels: string[] }[]): Promise<void>;
  close?(): Promise<void>;
}

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export interface ImapSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  folders?: string[];
  backfillDays?: number;
  applyLabels?: boolean;
}

export interface GmailSettings {
  scopes?: string[];
  backfillDays?: number;
  applyLabels?: boolean;
  labelIds?: Record<string, string>;
}

export interface GmailSecret {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
}

export interface ImapSecret {
  password: string;
}
