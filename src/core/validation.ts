/**
 * JustDetox — Zod schemas + domain sanitization utilities.
 *
 * All schemas use `.transform()` and `.refine()` so a single
 * `schema.parse(raw)` call both validates *and* normalizes data.
 */

import { z } from "zod";
import { SETTINGS_VERSION } from "./types";

// ─── Domain sanitization ──────────────────────────────────────────────────────

/**
 * Normalize a raw string into a plain hostname.
 *
 * Steps:
 *  1. Trim whitespace
 *  2. Lowercase
 *  3. Strip protocol (http:// or https://)
 *  4. Strip path, query-string, and fragment
 *  5. Strip port number
 *
 * The `www.` prefix is preserved — matching logic in the background
 * handles subdomain comparison so that `twitter.com` also covers
 * `www.twitter.com`.
 *
 * @example
 *   sanitizeDomain("  HTTPS://Twitter.com/home?lang=en  ") → "twitter.com"
 *   sanitizeDomain("www.reddit.com")                       → "www.reddit.com"
 */
export function sanitizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");   // strip protocol
  d = d.split("/")[0];                  // strip path
  d = d.split("?")[0];                  // strip query
  d = d.split("#")[0];                  // strip fragment
  d = d.split(":")[0];                  // strip port
  return d;
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

// ─── SiteRule ─────────────────────────────────────────────────────────────────

export const siteRuleSchema = z
  .object({
    domain: domainSchema,
    mode: ruleModeSchema,
    limitMinutes: limitMinutesSchema.optional(),
    enabled: z.boolean().default(true),
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

export const frictionSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  requireReflection: z.boolean().default(false),
  logReflections: z.boolean().default(true),
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
});

// ─── Usage ────────────────────────────────────────────────────────────────────

export const domainUsageSchema = z.object({
  activeSeconds: z.number().min(0),
  lastUpdated: z.number().min(0),
  windowStartTs: z.number().min(0),
});

export const usageMapSchema = z.record(z.string(), domainUsageSchema).default({});

// ─── Full export ──────────────────────────────────────────────────────────────

export const fullExportSchema = z.object({
  exportedAt: z.string().optional(),
  settings: settingsSchema,
  usage: usageMapSchema,
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
