/**
 * Message types for communication between content scripts and background.
 */

export type MessageType = "CHECK_URL" | "RECORD_TIME" | "GET_STORAGE";

export interface CheckUrlMessage {
  type: "CHECK_URL";
  hostname: string;
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

export type ExtensionMessage = CheckUrlMessage | RecordTimeMessage | GetStorageMessage;

export interface CheckUrlResponse {
  blocked: boolean;
  mode?: "block" | "time-limit";
  remainingSeconds?: number;
  /** Human-readable block reason shown by the content-script overlay. */
  message?: string;
  /** True when the site is accessible but Delay Mode requires a countdown first. */
  delayed?: boolean;
  /** Countdown duration in seconds; only set when delayed === true. */
  delaySeconds?: number;
}
