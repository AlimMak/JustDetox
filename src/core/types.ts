/**
 * JustDetox — core domain types.
 *
 * These are the authoritative types for all persistent state.
 * Nothing else in the codebase should define its own storage shapes.
 */

// ─── Enums / literals ─────────────────────────────────────────────────────────

/** How a rule reacts when a domain is visited. */
export type RuleMode = "block" | "limit";

/**
 * Supported reset-window lengths in hours.
 * The storage schema accepts any positive integer, but the UI
 * should offer these as the standard options.
 */
export type ResetIntervalHours = 6 | 12 | 24 | 48;

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * A single-site rule.
 *
 * `domain` is always a sanitized hostname (lowercase, no protocol, no path),
 * e.g. `"twitter.com"` or `"www.reddit.com"`.
 */
export interface SiteRule {
  domain: string;
  mode: RuleMode;
  /** Required when mode === "limit". Minutes allowed per reset window. */
  limitMinutes?: number;
  enabled: boolean;
}

// ─── Groups ───────────────────────────────────────────────────────────────────

/**
 * A named group of domains sharing one rule.
 *
 * When mode === "limit", `limitMinutes` is a *shared pool* across all domains
 * in the group — usage is summed at check time.
 */
export interface SiteGroup {
  /** Stable identifier (UUID or user slug). */
  id: string;
  name: string;
  domains: string[];
  mode: RuleMode;
  /** Required when mode === "limit". Shared minutes per reset window. */
  limitMinutes?: number;
  enabled: boolean;
}

// ─── Global settings ──────────────────────────────────────────────────────────

/**
 * Fallback behaviour applied when no SiteRule or SiteGroup matches.
 * If omitted, unmatched domains are always allowed.
 */
export interface GlobalDefaults {
  mode?: RuleMode;
  limitMinutes?: number;
}

/**
 * Configuration for the usage-reset cycle.
 *
 * `intervalHours` — length of one window in hours (default 24).
 * Usage counters are zeroed when `now - windowStartTs >= intervalHours * 3_600_000`.
 * The background service worker checks this lazily on each visit and also
 * via a `chrome.alarms` entry named `"jd-reset"`.
 */
export interface ResetWindowConfig {
  intervalHours: number;
}

// ─── Locked In Mode ───────────────────────────────────────────────────────────

/**
 * A time-bound focus session where only explicitly allowed domains are
 * accessible. All other domains are blocked for the session duration,
 * regardless of normal rules.
 *
 * `active` is set to false when the session ends (either manually or when
 * `now >= endTs`). The background alarm checks expiry every minute.
 */
export interface LockedInSession {
  active: boolean;
  /** Unix ms timestamp when the session was started. */
  startTs: number;
  /** Unix ms timestamp when the session expires. */
  endTs: number;
  /** Normalized hostnames the user may access during this session. */
  allowedDomains: string[];
  /** Group ID if the domains were sourced from an existing group. */
  sourceGroupId?: string;
}

// ─── Friction Layer ───────────────────────────────────────────────────────────

/**
 * Configuration for the Friction Layer — intentional friction on
 * protective-rule changes to slow impulsive edits.
 */
export interface FrictionSettings {
  /** Master toggle — when false, all friction checks pass-through instantly. */
  enabled: boolean;
  /**
   * When true the user *must* enter reflection text before confirming.
   * When false, the reflection field is shown but empty submission is allowed.
   */
  requireReflection: boolean;
  /** When true, reflection entries are persisted to chrome.storage.local. */
  logReflections: boolean;
}

// ─── Protected Settings Gate ──────────────────────────────────────────────────

/**
 * Configuration for the Protected Settings Gate — a stricter barrier than
 * the Friction Layer, requiring a timed cooldown and a typed phrase to confirm
 * any change that reduces protection.
 *
 * When enabled, the Protected Gate supersedes the Friction Layer for all
 * covered protective actions.
 */
export interface ProtectedGateSettings {
  /** Master toggle. When false all gate checks pass through instantly. */
  enabled: boolean;
  /**
   * Seconds the user must wait before "Apply change" becomes clickable.
   * Clamped to 15–300. Default: 60.
   */
  cooldownSeconds: number;
  /**
   * Exact phrase the user must type to confirm (case-insensitive).
   * Max 20 characters. Default: "LOCK IN".
   */
  phrase: string;
  /** When true the phrase input must match before Apply is enabled. */
  requirePhrase: boolean;
  /** When true the cooldown must elapse before Apply is enabled. */
  requireCooldown: boolean;
}

/** Top-level user settings persisted in chrome.storage.local. */
export interface Settings {
  /** Schema version — used for future migrations. */
  version: number;
  /**
   * Master kill-switch. When true, no sites are blocked and the extension
   * behaves as if no rules exist. Only configurable from the Settings panel.
   */
  disabled: boolean;
  siteRules: SiteRule[];
  groups: SiteGroup[];
  /**
   * A quick-add list of domains that are always hard-blocked
   * regardless of any rule or group. Processed after rules/groups
   * to allow explicit allow-list overrides in future milestones.
   */
  globalBlockList: string[];
  globalDefaults?: GlobalDefaults;
  resetWindow: ResetWindowConfig;
  friction: FrictionSettings;
  /** Active Locked In Mode session, if any. Absent when no session has ever been started. */
  lockedInSession?: LockedInSession;
  /** Protected Settings Gate configuration. */
  protectedGate: ProtectedGateSettings;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

/**
 * Usage record for a single domain within the current reset window.
 *
 * The background updates this on every RECORD_TIME message.
 * When `now - windowStartTs >= resetWindow.intervalHours * 3_600_000`
 * the record is reset: `activeSeconds = 0`, `windowStartTs = now`.
 */
export interface DomainUsage {
  /** Cumulative active seconds in the current window. */
  activeSeconds: number;
  /** Timestamp of last write (unix ms). */
  lastUpdated: number;
  /** Timestamp when the current window started (unix ms). */
  windowStartTs: number;
}

/** Full usage map — keyed by sanitized domain hostname. */
export type UsageMap = Record<string, DomainUsage>;

// ─── Temptation tracking ──────────────────────────────────────────────────────

/**
 * Counts how many times a user attempted to access a blocked domain
 * within the current reset window.
 *
 * Attempts are debounced: multiple triggers within 3 s count as one.
 * `lockedInAttempts` tracks attempts that occurred during a Locked In session.
 */
export interface TemptationRecord {
  /** Total blocked-overlay triggers (debounced) this window. */
  attempts: number;
  /** Unix ms timestamp of the last recorded attempt. */
  lastAttemptTs: number;
  /** Subset of `attempts` that occurred during a Locked In session. */
  lockedInAttempts: number;
  /** Timestamp when the current window started (unix ms). */
  windowStartTs: number;
}

/** Full temptation map — keyed by sanitized domain hostname. */
export type TemptationMap = Record<string, TemptationRecord>;

// ─── Export / Import container ────────────────────────────────────────────────

/** Shape of a JSON backup produced by `exportAll()`. */
export interface FullExport {
  /** ISO-8601 timestamp of when the export was created. */
  exportedAt: string;
  settings: Settings;
  usage: UsageMap;
  temptations?: TemptationMap;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const SETTINGS_VERSION = 1;

export const DEFAULT_RESET_WINDOW: ResetWindowConfig = {
  intervalHours: 24,
};

export const DEFAULT_FRICTION_SETTINGS: FrictionSettings = {
  enabled: true,
  requireReflection: false,
  logReflections: true,
};

export const DEFAULT_PROTECTED_GATE: ProtectedGateSettings = {
  enabled: true,
  cooldownSeconds: 60,
  phrase: "LOCK IN",
  requirePhrase: true,
  requireCooldown: true,
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  disabled: false,
  siteRules: [],
  groups: [],
  globalBlockList: [],
  resetWindow: { ...DEFAULT_RESET_WINDOW },
  friction: { ...DEFAULT_FRICTION_SETTINGS },
  protectedGate: { ...DEFAULT_PROTECTED_GATE },
};
