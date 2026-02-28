/**
 * JustDetox — Friction Layer core module.
 *
 * Provides types and storage helpers for the Friction Layer feature.
 * The actual UI gate (FrictionGate) is in src/ui/components/FrictionGate.tsx.
 *
 * Storage key: "jd_friction_log" → FrictionLogEntry[]
 * Only written when frictionSettings.logReflections === true.
 */

// ─── Action types ──────────────────────────────────────────────────────────────

/**
 * The class of protective change being attempted.
 * Used to label the gate screen and to categorize log entries.
 */
export type FrictionActionType =
  | "disable-extension"
  | "delete-site-rule"
  | "delete-group"
  | "rule-block-to-limit"
  | "group-block-to-limit"
  | "disable-site-rule"
  | "disable-group"
  | "rule-limit-increase"
  | "group-limit-increase"
  | "remove-domain"
  | "import-reduces-protection";

// ─── Payload ──────────────────────────────────────────────────────────────────

/**
 * Data passed to `askFriction()` describing the pending change.
 * Used to populate the gate's context panel.
 */
export interface FrictionPayload {
  /** Category of change being made. */
  actionType: FrictionActionType;
  /**
   * Human-readable label shown on the gate, e.g.
   * "twitter.com — block rule" or "Social Media group — disable".
   */
  label: string;
  /**
   * Optional domain hostname — if provided, the gate will load
   * current usage seconds from storage to display as context.
   */
  domain?: string;
  /**
   * Optional list of additional context lines shown in the Protected Gate.
   * Used by the import flow to enumerate every protection reduction.
   */
  context?: string[];
}

// ─── Log entries ──────────────────────────────────────────────────────────────

/** A single persisted reflection entry. */
export interface FrictionLogEntry {
  /** Unix timestamp (ms) when the gate was confirmed or cancelled. */
  ts: number;
  actionType: FrictionActionType;
  /** The label from FrictionPayload. */
  label: string;
  /** Text entered in the reflection field (may be empty string). */
  reflection: string;
  /** Whether the user applied the change or kept their protections. */
  outcome: "applied" | "kept";
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const KEY_FRICTION_LOG = "jd_friction_log";
const MAX_LOG_ENTRIES = 500;

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result[key] as T | undefined);
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

/** Read all persisted friction log entries. Returns [] if none exist. */
export async function getFrictionLog(): Promise<FrictionLogEntry[]> {
  const raw = await storageGet<unknown>(KEY_FRICTION_LOG);
  if (!Array.isArray(raw)) return [];
  return raw as FrictionLogEntry[];
}

/**
 * Append a new entry to the friction log.
 * Silently caps log size at MAX_LOG_ENTRIES (oldest entries dropped).
 */
export async function appendFrictionLog(entry: FrictionLogEntry): Promise<void> {
  const existing = await getFrictionLog();
  const next = [...existing, entry].slice(-MAX_LOG_ENTRIES);
  await storageSet({ [KEY_FRICTION_LOG]: next });
}

// ─── Human-readable labels ────────────────────────────────────────────────────

/** Returns a short description of the action type for display in the gate. */
export function describeActionType(actionType: FrictionActionType): string {
  switch (actionType) {
    case "disable-extension":    return "Disable the extension";
    case "delete-site-rule":     return "Remove a blocked site";
    case "delete-group":         return "Remove a block group";
    case "rule-block-to-limit":  return "Change rule from block → time limit";
    case "group-block-to-limit": return "Change group from block → time limit";
    case "disable-site-rule":    return "Disable a site rule";
    case "disable-group":        return "Disable a group";
    case "rule-limit-increase":         return "Increase a time limit";
    case "group-limit-increase":        return "Increase a time limit";
    case "remove-domain":               return "Remove a domain from a rule";
    case "import-reduces-protection":   return "Import settings that reduce protection";
  }
}
