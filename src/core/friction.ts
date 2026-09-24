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
  | "import-reduces-protection"
  | "disable-focus-environment"
  | "weaken-focus-environment"
  | "remove-always-blocked"
  | "weaken-protected-gate"
  | "end-locked-in-session"
  | "rule-schedule-reduction"
  | "group-schedule-reduction"
  | "weaken-site-rule"
  | "weaken-group-rule"
  | "clear-tracked-data"
  | "shorten-reset-window"
  | "weaken-friction-layer"
  | "pause-tracking-when-idle"
  | "disable-preload-blocking";

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
    case "disable-focus-environment": return "Disable Focus Environment";
    case "weaken-focus-environment": return "Change Focus Environment access";
    case "remove-always-blocked": return "Remove an always-blocked site";
    case "weaken-protected-gate": return "Weaken the Protected Gate";
    case "end-locked-in-session": return "End a Locked In session early";
    case "rule-schedule-reduction": return "Reduce a site rule's schedule";
    case "group-schedule-reduction": return "Reduce a group's schedule";
    case "weaken-site-rule": return "Weaken a site rule";
    case "weaken-group-rule": return "Weaken a group rule";
    case "clear-tracked-data": return "Clear tracked data and reset limits";
    case "shorten-reset-window": return "Shorten the usage reset window";
    case "weaken-friction-layer": return "Weaken the Friction Layer";
    case "pause-tracking-when-idle": return "Pause tracking while the device is idle";
    case "disable-preload-blocking": return "Turn off pre-load blocking";
  }
}
