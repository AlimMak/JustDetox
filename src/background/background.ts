/**
 * JustDetox Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Wire up the time-tracking engine (tracker.ts).
 * - Answer CHECK_URL messages from content scripts using the policy engine.
 *
 * Time accumulation is handled entirely by tracker.ts. The old RECORD_TIME
 * message path is kept as a no-op so the existing content script doesn't error.
 */

import { initTracker } from "./tracker";
import { getSettings, getUsage } from "../core/storage";
import { computeBlockedState } from "../core/policy";
import type { ExtensionMessage, CheckUrlResponse } from "../shared/messages";

// ─── Boot ─────────────────────────────────────────────────────────────────────

initTracker();

// ─── Message handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: CheckUrlResponse | null) => void,
  ) => {
    if (message.type === "CHECK_URL") {
      handleCheckUrl(message.hostname).then(sendResponse);
      return true; // keep channel open for async response
    }

    // RECORD_TIME: no-op — tracker.ts handles time accumulation via browser events.
    // Kept for backward compatibility with the current content script.
    if (message.type === "RECORD_TIME") {
      return false;
    }

    return false;
  },
);

// ─── CHECK_URL logic ──────────────────────────────────────────────────────────

async function handleCheckUrl(hostname: string): Promise<CheckUrlResponse> {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);

  const state = computeBlockedState(hostname, usage, settings);

  return {
    blocked: state.blocked,
    // Translate internal RuleMode to the wire-format used by content scripts.
    mode: state.mode === "limit" ? "time-limit" : state.mode,
    remainingSeconds: state.remainingSeconds,
    message: state.message,
  };
}
