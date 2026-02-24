/**
 * JustDetox — Background message handler.
 *
 * Handles chrome.runtime.onMessage from content scripts.
 * Extracted from background.ts so the service-worker boot file
 * stays minimal and this logic is independently testable.
 */

import { getSettings, getUsage } from "../core/storage";
import { computeBlockedState } from "../core/policy";
import type { ExtensionMessage, CheckUrlResponse } from "../shared/messages";

/**
 * Register all content-script message handlers.
 * Call once at service-worker startup.
 */
export function registerMessages(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: CheckUrlResponse | null) => void,
    ) => {
      if (message.type === "CHECK_URL") {
        handleCheckUrl(message.hostname).then(sendResponse);
        return true; // keep port open for async response
      }

      // RECORD_TIME: time tracking is handled by tracker.ts via browser tab
      // events. This handler is a no-op kept for backward compatibility with
      // the old content script and will be removed in a future cleanup.
      if (message.type === "RECORD_TIME") {
        return false;
      }

      return false;
    },
  );
}

// ─── CHECK_URL ────────────────────────────────────────────────────────────────

async function handleCheckUrl(hostname: string): Promise<CheckUrlResponse> {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);

  // Master kill-switch: extension disabled → never block anything.
  if (settings.disabled) return { blocked: false };

  const state = computeBlockedState(hostname, usage, settings);

  return {
    blocked: state.blocked,
    // Wire-format uses "time-limit"; internal type uses "limit".
    mode: state.mode === "limit" ? "time-limit" : state.mode,
    remainingSeconds: state.remainingSeconds,
    message: state.message,
  };
}
