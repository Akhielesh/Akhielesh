import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * AES-256-GCM envelope for secrets at rest (mailbox passwords, OAuth refresh tokens,
 * webhook URLs, push subscriptions). Key is derived from APP_SECRET with HKDF.
 */
export class Vault {
  private readonly key: Buffer;
  readonly signingKey: Buffer;

  constructor(secret: string) {
    if (secret.length < 16) throw new Error("APP_SECRET must be at least 16 characters");
    const ikm = Buffer.from(secret, "utf8");
    this.key = Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.from("adminak-vault"), Buffer.from("aes-256-gcm v1"), 32));
    this.signingKey = Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.from("adminak-sign"), Buffer.from("hmac v1"), 32));
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${Buffer.concat([iv, tag, body]).toString("base64url")}`;
  }

  decrypt(payload: string): string {
    if (!payload.startsWith("v1.")) throw new Error("Unsupported secret format");
    const raw = Buffer.from(payload.slice(3), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(payload: string | null | undefined, fallback: T): T {
    if (!payload) return fallback;
    try {
      return JSON.parse(this.decrypt(payload)) as T;
    } catch {
      return fallback;
    }
  }

  sign(value: string): string {
    return crypto.createHmac("sha256", this.signingKey).update(value).digest("base64url");
  }

  verify(value: string, signature: string): boolean {
    return safeEqual(this.sign(value), signature);
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Resolves APP_SECRET from env, or generates and persists one in the data directory. */
export function resolveAppSecret(dataDir: string, fromEnv: string | undefined): { secret: string; generated: boolean } {
  if (fromEnv) return { secret: fromEnv, generated: false };
  const file = path.join(dataDir, "secret.key");
  if (fs.existsSync(file)) return { secret: fs.readFileSync(file, "utf8").trim(), generated: false };
  fs.mkdirSync(dataDir, { recursive: true });
  const secret = randomToken(32);
  fs.writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return { secret, generated: true };
}
