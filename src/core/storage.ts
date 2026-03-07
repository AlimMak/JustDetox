/**
 * JustDetox — chrome.storage.local wrapper.
 *
 * All reads are validated through Zod on the way out of storage, so callers
 * always receive well-typed, sanitized data even after schema evolution or
 * direct storage edits during development.
 *
 * Two top-level keys are used to keep settings and usage independent:
 *   "jd_settings"  →  Settings
 *   "jd_usage"     →  UsageMap
 *
 * Settings changes are cheap (small object). Usage is written frequently
 * (every 30 s per active tab) and intentionally separated so one write
 * never clobbers the other.
 */

import type { Settings, DomainUsage, UsageMap, TemptationMap, FullExport, DopamineScoreData, SelfControlData } from "./types";
import { invalidateRuleIndex } from "./ruleIndex";
import { queueStorageReplace, readThrough, forceFlushStorageQueue } from "./storageQueue";
import { DEFAULT_SETTINGS, DEFAULT_DOPAMINE_SCORE, DEFAULT_SELF_CONTROL_DATA } from "./types";
import {
  settingsSchema,
  usageMapSchema,
  temptationMapSchema,
  fullExportSchema,
  parseImportJson,
  dopamineScoreDataSchema,
  selfControlDataSchema,
} from "./validation";
import type { ImportResult } from "./validation";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_SETTINGS = "jd_settings";
const KEY_USAGE = "jd_usage";
const KEY_TEMPTATIONS = "jd_temptations";
const KEY_DOPAMINE = "jd_dopamine";
const KEY_SELF_CONTROL = "jd_self_control";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function storageGet<T>(keys: string | string[]): Promise<{ [key: string]: T }> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result as { [key: string]: T });
      }
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Read settings from storage.
 *
 * Falls back to `DEFAULT_SETTINGS` if the key is absent or the stored value
 * fails validation (e.g. corrupted data). Logs a warning in the latter case.
 */
export async function getSettings(): Promise<Settings> {
  const result = await storageGet<unknown>(KEY_SETTINGS);
  const raw = result[KEY_SETTINGS];

  if (raw === undefined || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn("[JustDetox] Settings validation failed — resetting to defaults.\n", parsed.error.format());
    return { ...DEFAULT_SETTINGS };
  }

  return parsed.data as Settings;
}

/** Persist the complete settings object and invalidate the rule index cache. */
export async function setSettings(settings: Settings): Promise<void> {
  await storageSet({ [KEY_SETTINGS]: settings });
  invalidateRuleIndex();
}

/**
 * Apply a shallow patch to settings and persist.
 * Returns the updated settings.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated: Settings = { ...current, ...patch };
  await setSettings(updated);
  return updated;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

/**
 * Read the full usage map from storage.
 *
 * Returns an empty map if absent or invalid.
 */
export async function getUsage(): Promise<UsageMap> {
  // Write-back cache: return the pending value if a write is queued,
  // avoiding read-after-write staleness in the same SW activation.
  const cached = readThrough(KEY_USAGE);
  if (cached !== undefined) return cached as UsageMap;

  const result = await storageGet<unknown>(KEY_USAGE);
  const raw = result[KEY_USAGE];

  if (raw === undefined || raw === null) {
    return {};
  }

  const parsed = usageMapSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn("[JustDetox] Usage data validation failed — resetting.\n", parsed.error.format());
    return {};
  }

  return parsed.data as UsageMap;
}

/**
 * Queue the full usage map for batched persistence.
 * Readable immediately via getUsage() (write-back cache).
 */
export function setUsage(usage: UsageMap): void {
  queueStorageReplace(KEY_USAGE, usage);
}

/**
 * Merge a partial update into a single domain's usage record and persist.
 *
 * If no record exists for the domain, a new one is created with
 * `windowStartTs = Date.now()`.
 */
export async function updateDomainUsage(
  domain: string,
  patch: Partial<DomainUsage>,
): Promise<void> {
  const usage = await getUsage();
  const now = Date.now();
  const existing: DomainUsage = usage[domain] ?? {
    activeSeconds: 0,
    lastUpdated: now,
    windowStartTs: now,
  };

  const updated: UsageMap = {
    ...usage,
    [domain]: { ...existing, ...patch, lastUpdated: now },
  };

  await setUsage(updated);
}

/**
 * Reset usage for a single domain (start a fresh window).
 *
 * Called by the background when it detects the reset interval has elapsed
 * for that domain.
 */
export async function resetDomainUsage(domain: string): Promise<void> {
  const now = Date.now();
  await updateDomainUsage(domain, {
    activeSeconds: 0,
    windowStartTs: now,
    lastUpdated: now,
  });
}

/**
 * Reset usage for ALL domains.
 *
 * Called by the `jd-reset` alarm when the global reset window elapses.
 */
export async function resetAllUsage(): Promise<void> {
  await setUsage({});
}

// ─── Temptations ──────────────────────────────────────────────────────────────

/**
 * Read the full temptation map from storage.
 *
 * Returns an empty map if absent or invalid.
 */
export async function getTemptations(): Promise<TemptationMap> {
  const cached = readThrough(KEY_TEMPTATIONS);
  if (cached !== undefined) return cached as TemptationMap;

  const result = await storageGet<unknown>(KEY_TEMPTATIONS);
  const raw = result[KEY_TEMPTATIONS];

  if (raw === undefined || raw === null) {
    return {};
  }

  const parsed = temptationMapSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn("[JustDetox] Temptation data validation failed — resetting.\n", parsed.error.format());
    return {};
  }

  return parsed.data as TemptationMap;
}

/** Queue the full temptation map for batched persistence. */
export function setTemptations(temptations: TemptationMap): void {
  queueStorageReplace(KEY_TEMPTATIONS, temptations);
}

/**
 * Reset all temptation counts.
 *
 * Called when the global usage window resets.
 */
export async function resetAllTemptations(): Promise<void> {
  await setTemptations({});
}

// ─── Export / Import ──────────────────────────────────────────────────────────

/**
 * Serialise all settings + usage to a pretty-printed JSON string.
 *
 * Intended for the "Export backup" button in the options page.
 * The caller is responsible for triggering the browser download.
 */
export async function exportAll(): Promise<string> {
  // Flush any queued writes so the export reflects the latest state.
  await forceFlushStorageQueue();

  const [settings, usage, temptations] = await Promise.all([
    getSettings(),
    getUsage(),
    getTemptations(),
  ]);

  const payload: FullExport = {
    exportedAt: new Date().toISOString(),
    settings,
    usage,
    temptations,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Parse, validate, and import a JSON backup produced by `exportAll()`.
 *
 * On success: overwrites both settings and usage in storage.
 * On failure: storage is left untouched and an error description is returned.
 *
 * @param json  Raw file content from the user's upload.
 */
export async function importAll(json: string): Promise<ImportResult> {
  const result = parseImportJson(json);

  if (!result.ok) {
    return result;
  }

  // Re-validate with the full schema to ensure Zod defaults are applied.
  const validated = fullExportSchema.safeParse(result.data);
  if (!validated.success) {
    return {
      ok: false,
      error: validated.error.issues.map((i) => i.message).join("; "),
    };
  }

  // Drain any stale queued writes before overwriting with imported data.
  await forceFlushStorageQueue();

  // setSettings writes immediately; setUsage/setTemptations queue their writes.
  await setSettings(validated.data.settings as Settings);
  setUsage((validated.data.usage ?? {}) as UsageMap);
  setTemptations((validated.data.temptations ?? {}) as TemptationMap);

  // Flush queued usage + temptation writes before returning success.
  await forceFlushStorageQueue();

  return { ok: true, data: validated.data };
}

// ─── Dopamine Score ────────────────────────────────────────────────────────────

/**
 * Read the Dopamine Score data from storage.
 *
 * Returns the default (score = 100, no counters) if absent or invalid.
 */
export async function getDopamineScore(): Promise<DopamineScoreData> {
  const cached = readThrough(KEY_DOPAMINE);
  if (cached !== undefined) return cached as DopamineScoreData;

  const result = await storageGet<unknown>(KEY_DOPAMINE);
  const raw = result[KEY_DOPAMINE];

  if (raw === undefined || raw === null) {
    return { ...DEFAULT_DOPAMINE_SCORE, windowStartTs: Date.now() };
  }

  const parsed = dopamineScoreDataSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn("[JustDetox] Dopamine score data validation failed — resetting.\n", parsed.error.format());
    return { ...DEFAULT_DOPAMINE_SCORE, windowStartTs: Date.now() };
  }

  return parsed.data as DopamineScoreData;
}

/**
 * Queue the full Dopamine Score data for batched persistence.
 * Readable immediately via getDopamineScore() (write-back cache).
 */
export function setDopamineScore(data: DopamineScoreData): void {
  queueStorageReplace(KEY_DOPAMINE, data);
}

// ─── Self-Control Graph ────────────────────────────────────────────────────────

/**
 * Read the Self-Control event log from storage.
 *
 * Returns an empty log with windowStartTs = now if absent or invalid.
 */
export async function getSelfControlData(): Promise<SelfControlData> {
  const cached = readThrough(KEY_SELF_CONTROL);
  if (cached !== undefined) return cached as SelfControlData;

  const result = await storageGet<unknown>(KEY_SELF_CONTROL);
  const raw = result[KEY_SELF_CONTROL];

  if (raw === undefined || raw === null) {
    return { ...DEFAULT_SELF_CONTROL_DATA, windowStartTs: Date.now() };
  }

  const parsed = selfControlDataSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn("[JustDetox] Self-control data validation failed — resetting.\n", parsed.error.format());
    return { ...DEFAULT_SELF_CONTROL_DATA, windowStartTs: Date.now() };
  }

  return parsed.data as SelfControlData;
}

/**
 * Queue the full Self-Control event log for batched persistence.
 * Readable immediately via getSelfControlData() (write-back cache).
 */
export function setSelfControlData(data: SelfControlData): void {
  queueStorageReplace(KEY_SELF_CONTROL, data);
}

// ─── Reset-window utility ─────────────────────────────────────────────────────

/**
 * Returns `true` if the tracking window for `domain` has expired
 * given the provided `intervalHours`.
 *
 * Does NOT mutate storage — call `resetDomainUsage(domain)` if you want
 * to act on the result.
 */
export function isWindowExpired(
  usage: UsageMap,
  domain: string,
  intervalHours: number,
): boolean {
  const record = usage[domain];
  if (!record) return false; // no record → nothing to expire

  const windowMs = intervalHours * 3_600_000;
  return Date.now() - record.windowStartTs >= windowMs;
}
