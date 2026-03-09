/**
 * JustDetox — Zod schemas + domain sanitization utilities.
 *
 * All schemas use `.transform()` and `.refine()` so a single
 * `schema.parse(raw)` call both validates *and* normalizes data.
 */

import { z } from "zod";
import { SETTINGS_VERSION } from "./types";
import { normalizeDomain } from "./domain";

// ─── Domain sanitization ──────────────────────────────────────────────────────

/**
 * Normalize a raw string into a canonical stored hostname.
 *
 * Delegates to `normalizeDomain` from `./domain`, which:
 *  1. Trims whitespace and lowercases
 *  2. Strips protocol (http:// or https://)
 *  3. Strips path, query-string, and fragment
 *  4. Strips port number
 *  5. Strips trailing FQDN dot
 *  6. Strips leading "www." prefix
 *
 * @example
 *   sanitizeDomain("  HTTPS://Twitter.com/home?lang=en  ") → "twitter.com"
 *   sanitizeDomain("www.reddit.com")                       → "reddit.com"
 *   sanitizeDomain("www.youtube.com/watch?v=abc")          → "youtube.com"
 */
export function sanitizeDomain(raw: string): string {
  return normalizeDomain(raw);
}

/**
 * Returns `true` if the string is a valid, sanitized hostname.
 *
 * Accepts:
 *  - Single-label names (e.g. `localhost`) are intentionally rejected
 *    — extensions should only target real hostnames with TLDs.
 *  - Unicode IDN hostnames are not supported; Punycode is fine.
 */
export function isValidDomain(domain: string): boolean {
  // At least two labels separated by dots, alphanumeric + hyphens, no leading/trailing hyphens per label
  const labelRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) => label.length > 0 && labelRe.test(label));
}

// ─── Primitive schemas ────────────────────────────────────────────────────────

/** Sanitizes and validates a domain hostname. */
export const domainSchema = z
  .string()
  .min(1, "Domain must not be empty")
  .transform(sanitizeDomain)
  .refine(isValidDomain, { message: "Invalid domain — must be a valid hostname (e.g. twitter.com)" });

/** Block mode enum. */
export const ruleModeSchema = z.enum(["block", "limit"]);

/** Minutes-per-window constraint: 1 min → 1440 min (24 h). */
export const limitMinutesSchema = z.number().int().min(1).max(1_440);

// ─── Schedule ─────────────────────────────────────────────────────────────────

/**
 * A single schedule window: days of the week + start/end time.
 *
 * Validates:
 *  - `days` must have at least one entry, each 0–6
 *  - `startMinutes` and `endMinutes` must be in range [0, 1439]
 *  - start must not equal end (a zero-duration window is meaningless)
 */
export const scheduleWindowSchema = z
  .object({
    enabled: z.boolean().default(true),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Select at least one day"),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(0).max(1439),
  })
  .refine((s) => s.startMinutes !== s.endMinutes, {
    message: "Start and end time must be different",
    path: ["endMinutes"],
  });

// ─── SiteRule ─────────────────────────────────────────────────────────────────

export const siteRuleSchema = z
  .object({
    domain: domainSchema,
    mode: ruleModeSchema,
    limitMinutes: limitMinutesSchema.optional(),
    enabled: z.boolean().default(true),
    delayEnabled: z.boolean().optional(),
    delaySeconds: z.number().int().min(5).max(60).optional(),
    schedule: z.array(scheduleWindowSchema).optional(),
  })
  .refine((r) => r.mode !== "limit" || r.limitMinutes !== undefined, {
    message: "limitMinutes is required when mode is 'limit'",
    path: ["limitMinutes"],
  });

// ─── SiteGroup ────────────────────────────────────────────────────────────────

export const siteGroupSchema = z
  .object({
    id: z.string().min(1, "Group id must not be empty"),
    name: z.string().min(1).max(100),
    domains: z.array(domainSchema).min(1, "Group must contain at least one domain"),
    mode: ruleModeSchema,
    limitMinutes: limitMinutesSchema.optional(),
    enabled: z.boolean().default(true),
    delayEnabled: z.boolean().optional(),
    delaySeconds: z.number().int().min(5).max(60).optional(),
    schedule: z.array(scheduleWindowSchema).optional(),
  })
  .refine((g) => g.mode !== "limit" || g.limitMinutes !== undefined, {
    message: "limitMinutes is required when mode is 'limit'",
    path: ["limitMinutes"],
  });

// ─── Settings ─────────────────────────────────────────────────────────────────

export const resetWindowSchema = z.object({
  /** 1 h minimum, 168 h (7 days) maximum. */
  intervalHours: z.number().int().min(1).max(168),
});

export const globalDefaultsSchema = z
  .object({
    mode: ruleModeSchema.optional(),
    limitMinutes: limitMinutesSchema.optional(),
  })
  .optional();

export const lockedInSessionSchema = z
  .object({
    active: z.boolean().default(false),
    startTs: z.number().min(0),
    endTs: z.number().min(0),
    allowedDomains: z.array(z.string()).default([]),
    sourceGroupId: z.string().optional(),
  })
  .optional();

export const frictionSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  requireReflection: z.boolean().default(false),
  logReflections: z.boolean().default(true),
});

export const protectedGateSchema = z.object({
  enabled: z.boolean().default(true),
  /** 15–300 seconds. */
  cooldownSeconds: z.number().int().min(15).max(300).default(60),
  /** Confirmation phrase, max 20 chars. */
  phrase: z.string().min(1).max(20).default("LOCK IN"),
  requirePhrase: z.boolean().default(true),
  requireCooldown: z.boolean().default(true),
});

export const allowlistModeSchema = z.object({
  enabled: z.boolean().default(false),
  allowedDomains: z.array(domainSchema).default([]),
});

export const settingsSchema = z.object({
  version: z.number().int().min(1).default(SETTINGS_VERSION),
  disabled: z.boolean().default(false),
  siteRules: z.array(siteRuleSchema).default([]),
  groups: z.array(siteGroupSchema).default([]),
  globalBlockList: z.array(domainSchema).default([]),
  globalDefaults: globalDefaultsSchema,
  resetWindow: resetWindowSchema.default({ intervalHours: 24 }),
  friction: frictionSettingsSchema.default({
    enabled: true,
    requireReflection: false,
    logReflections: true,
  }),
  lockedInSession: lockedInSessionSchema,
  protectedGate: protectedGateSchema.default({
    enabled: true,
    cooldownSeconds: 60,
    phrase: "LOCK IN",
    requirePhrase: true,
    requireCooldown: true,
  }),
  defaultDelaySeconds: z.number().int().min(5).max(60).default(15),
  allowlistMode: allowlistModeSchema.default({ enabled: false, allowedDomains: [] }),
});

// ─── Usage ────────────────────────────────────────────────────────────────────

export const domainUsageSchema = z.object({
  activeSeconds: z.number().min(0),
  lastUpdated: z.number().min(0),
  windowStartTs: z.number().min(0),
});

export const usageMapSchema = z.record(z.string(), domainUsageSchema).default({});

// ─── Temptation tracking ──────────────────────────────────────────────────────

export const temptationRecordSchema = z.object({
  attempts: z.number().int().min(0),
  lastAttemptTs: z.number().min(0),
  lockedInAttempts: z.number().int().min(0),
  windowStartTs: z.number().min(0),
});

export const temptationMapSchema = z.record(z.string(), temptationRecordSchema).default({});

// ─── Dopamine Score ────────────────────────────────────────────────────────────

export const dopamineScoreBreakdownSchema = z.object({
  temptationPenalty: z.number().min(0),
  timePenalty: z.number().min(0),
  lockedInBonus: z.number().min(0),
  delayBonus: z.number().min(0),
});

export const dopamineScoreDataSchema = z.object({
  score: z.number().min(0).max(100),
  previousWindowScore: z.number().min(0).max(100),
  scoreBreakdown: dopamineScoreBreakdownSchema,
  windowStartTs: z.number().min(0),
  lockedInSessionsCompleted: z.number().int().min(0),
  lockedInMinutes: z.number().min(0),
  delayCompletions: z.number().int().min(0),
});

// ─── Self-Control Graph ────────────────────────────────────────────────────────

export const selfControlEventTypeSchema = z.enum([
  "blocked",
  "limit_exceeded",
  "locked_in_block",
  "delay_triggered",
]);

export const selfControlEventSchema = z.object({
  ts: z.number().min(0),
  domain: z.string().min(1),
  type: selfControlEventTypeSchema,
});

export const selfControlDataSchema = z.object({
  windowStartTs: z.number().min(0),
  events: z.array(selfControlEventSchema).default([]),
  previousWindowCount: z.number().int().min(0).default(0),
});

// ─── Full export ──────────────────────────────────────────────────────────────

export const fullExportSchema = z.object({
  exportedAt: z.string().optional(),
  settings: settingsSchema,
  usage: usageMapSchema,
  temptations: temptationMapSchema.optional(),
});

// ─── Inferred types (mirror of src/core/types.ts via Zod) ────────────────────
// Used where you want a schema-validated type rather than the hand-written one.

export type ValidatedSettings = z.infer<typeof settingsSchema>;
export type ValidatedSiteRule = z.infer<typeof siteRuleSchema>;
export type ValidatedSiteGroup = z.infer<typeof siteGroupSchema>;
export type ValidatedDomainUsage = z.infer<typeof domainUsageSchema>;
export type ValidatedUsageMap = z.infer<typeof usageMapSchema>;
export type ValidatedFullExport = z.infer<typeof fullExportSchema>;

// ─── Import validation result ─────────────────────────────────────────────────

export type ImportResult =
  | { ok: true; data: ValidatedFullExport }
  | { ok: false; error: string };

/**
 * Parse and validate a raw JSON string as a `FullExport`.
 * Returns a typed result — never throws.
 */
export function parseImportJson(json: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  const result = fullExportSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("\n");
    return { ok: false, error: message };
  }

  return { ok: true, data: result.data };
}
