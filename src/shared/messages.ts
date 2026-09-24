/**
 * Message types for communication between content scripts and background.
 */

export type MessageType = "CHECK_URL" | "RECORD_TIME" | "GET_STORAGE" | "DELAY_COMPLETED" | "CLEAR_TRACKED_DATA" | "IMPORT_ALL" | "EXPORT_ALL" | "GET_SYNC_STATUS" | "SYNC_ACTION";

export type CheckUrlContext = "navigation" | "refresh" | "iframe";

export interface CheckUrlMessage {
  type: "CHECK_URL";
  hostname: string;
  /** Only an intentional top-level navigation can count as a temptation. */
  context?: CheckUrlContext;
}

export interface RecordTimeMessage {
  type: "RECORD_TIME";
  hostname: string;
  /** Seconds spent on this hostname since last ping */
  seconds: number;
}

export interface GetStorageMessage {
  type: "GET_STORAGE";
}

export interface DelayCompletedMessage {
  type: "DELAY_COMPLETED";
}

export interface ClearTrackedDataMessage {
  type: "CLEAR_TRACKED_DATA";
}

export interface ImportAllMessage {
  type: "IMPORT_ALL";
  json: string;
}

export interface ExportAllMessage {
  type: "EXPORT_ALL";
}

export interface GetSyncStatusMessage { type: "GET_SYNC_STATUS" }
export interface SyncActionMessage {
  type: "SYNC_ACTION";
  action: "upload" | "download" | "disable";
  revision?: number | null;
}

export type ExtensionMessage = CheckUrlMessage | RecordTimeMessage | GetStorageMessage | DelayCompletedMessage | ClearTrackedDataMessage | ImportAllMessage | ExportAllMessage | GetSyncStatusMessage | SyncActionMessage;

export interface ClearTrackedDataResponse {
  ok: boolean;
  error?: string;
}

export type ImportAllResponse = ClearTrackedDataResponse;

export type ExportAllResponse = { ok: true; json: string } | { ok: false; error: string };

export interface CheckUrlResponse {
  blocked: boolean;
  mode?: "block" | "time-limit";
  remainingSeconds?: number;
  /** Human-readable block reason shown by the content-script overlay. */
  message?: string;
  /** Optional secondary line shown below message in the block overlay. */
  subtitle?: string;
  /** True when the site is accessible but Delay Mode requires a countdown first. */
  delayed?: boolean;
  /** Countdown duration in seconds; only set when delayed === true. */
  delaySeconds?: number;
  /** Rule or mode responsible for a blocked response. */
  source?: string;
  /** Unix timestamp when the decision should next be checked. */
  nextCheckTs?: number;
  /** Human-readable description of that upcoming change. */
  nextChangeLabel?: string;
}
