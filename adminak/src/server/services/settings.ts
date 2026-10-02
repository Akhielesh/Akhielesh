import { z } from "zod";
import type { Settings, SettingsPatch } from "../../shared/types.js";
import { CATEGORIES, SEVERITIES } from "../../shared/types.js";
import { isValidTimeZone } from "../../shared/time.js";
import type { DB } from "../db/index.js";
import { parseJson } from "../db/index.js";

const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");
const severity = z.enum(SEVERITIES);

const sectionSchemas = {
  profile: z
    .object({
      name: z.string().max(80),
      timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
      currency: z
        .string()
        .length(3)
        .transform((v) => v.toUpperCase()),
      locale: z.string().min(2).max(20),
    })
    .partial(),
  scanning: z
    .object({
      intervalMinutes: z.number().int().min(1).max(1440),
      backfillDays: z.number().int().min(1).max(3650),
      maxBackfillMessages: z.number().int().min(50).max(50000),
      storeBodies: z.boolean(),
      bodyRetentionDays: z.number().int().min(7).max(3650),
      ignoreSenders: z.array(z.string().max(200)).max(500),
    })
    .partial(),
  notifications: z
    .object({
      instantMinSeverity: z.union([severity, z.literal("off")]),
      quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
      digest: z.object({ enabled: z.boolean(), time: hhmm }),
      weekly: z.object({ enabled: z.boolean(), day: z.number().int().min(0).max(6), time: hhmm }),
      monthly: z.object({ enabled: z.boolean(), time: hhmm }),
      reminders: z.object({
        renewalDays: z.number().int().min(0).max(30),
        annualRenewalDays: z.number().int().min(0).max(60),
        trialDays: z.number().int().min(0).max(30),
        billDays: z.number().int().min(0).max(30),
      }),
      largeTransactionThreshold: z.number().min(0).max(1_000_000),
      loginAlerts: z.boolean(),
      typeOverrides: z.record(z.string(), z.object({ enabled: z.boolean().optional(), severity: severity.optional() })),
    })
    .partial(),
  ai: z
    .object({
      enabled: z.boolean(),
      mode: z.enum(["smart", "all"]),
      dailyLimit: z.number().int().min(0).max(5000),
      briefing: z.boolean(),
    })
    .partial(),
  gmail: z
    .object({
      applyLabels: z.boolean(),
      labelPrefix: z
        .string()
        .min(1)
        .max(40)
        .regex(/^[\w .&-]+$/, "Letters, numbers, spaces, dots, dashes only"),
    })
    .partial(),
} as const;

export const SettingsPatchSchema = z
  .object({
    profile: sectionSchemas.profile,
    scanning: sectionSchemas.scanning,
    notifications: sectionSchemas.notifications,
    ai: sectionSchemas.ai,
    gmail: sectionSchemas.gmail,
  })
  .partial();

export function defaultTimeZone(): string {
  const fromEnv = process.env.TZ;
  if (fromEnv && isValidTimeZone(fromEnv)) return fromEnv;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function defaultSettings(opts: { syncIntervalMinutes: number; aiAvailable: boolean }): Settings {
  return {
    profile: { name: "", timezone: defaultTimeZone(), currency: "USD", locale: "en-US" },
    scanning: {
      intervalMinutes: opts.syncIntervalMinutes,
      backfillDays: 120,
      maxBackfillMessages: 3000,
      storeBodies: true,
      bodyRetentionDays: 365,
      ignoreSenders: [],
    },
    notifications: {
      instantMinSeverity: "high",
      quietHours: { enabled: true, start: "22:30", end: "07:30" },
      digest: { enabled: true, time: "08:00" },
      weekly: { enabled: true, day: 1, time: "08:30" },
      monthly: { enabled: true, time: "09:00" },
      reminders: { renewalDays: 3, annualRenewalDays: 7, trialDays: 3, billDays: 3 },
      largeTransactionThreshold: 250,
      loginAlerts: true,
      typeOverrides: {},
    },
    ai: { enabled: opts.aiAvailable, mode: "smart", dailyLimit: 150, briefing: true },
    gmail: { applyLabels: false, labelPrefix: "Adminak" },
  };
}

export class SettingsService {
  private cache: Settings | null = null;

  constructor(
    private readonly db: DB,
    private readonly defaults: Settings,
  ) {}

  get(): Settings {
    if (this.cache) return this.cache;
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, parseJson<Record<string, unknown>>(r.value, {})]));
    const merged = structuredClone(this.defaults) as unknown as Record<string, Record<string, unknown>>;
    for (const section of Object.keys(merged)) {
      const value = stored[section];
      if (value && typeof value === "object") merged[section] = { ...merged[section], ...value };
    }
    this.cache = merged as unknown as Settings;
    return this.cache;
  }

  patch(patch: SettingsPatch): Settings {
    const parsed = SettingsPatchSchema.parse(patch);
    const current = this.get();
    const upsert = this.db.prepare(
      "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    this.db.transaction(() => {
      for (const [section, values] of Object.entries(parsed)) {
        if (!values) continue;
        const next = { ...(current[section as keyof Settings] as object), ...values };
        upsert.run(section, JSON.stringify(next));
      }
    })();
    this.cache = null;
    return this.get();
  }

  invalidate(): void {
    this.cache = null;
  }
}

export const KNOWN_CATEGORIES = new Set<string>(CATEGORIES);
