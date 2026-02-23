/**
 * Shared types used across background, content scripts, and UI.
 */

export type BlockMode = "block" | "time-limit";

export interface BlockedSite {
  /** Hostname, e.g. "twitter.com" — no protocol, no trailing slash */
  hostname: string;
  mode: BlockMode;
  /** For time-limit mode: daily allowance in minutes */
  dailyLimitMinutes?: number;
}

export interface StorageSchema {
  blockedSites: BlockedSite[];
  /** ISO date string of last reset (midnight UTC) */
  lastReset?: string;
  /** Map of hostname → minutes used today */
  usedToday: Record<string, number>;
}

export const STORAGE_DEFAULTS: StorageSchema = {
  blockedSites: [],
  usedToday: {},
};
