/**
 * JustDetox — Background message handler.
 *
 * Handles chrome.runtime.onMessage from content scripts.
 * Extracted from background.ts so the service-worker boot file
 * stays minimal and this logic is independently testable.
 */

import { getSettings, getUsage } from "../core/storage";
import { computeBlockedState } from "../core/policy";
import { incrementAttempt } from "../core/temptation";
import { onDelayCompleted } from "../core/dopamine";
import { recordEvent } from "../core/selfControl";
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

      if (message.type === "DELAY_COMPLETED") {
        onDelayCompleted().catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[JustDetox] DELAY_COMPLETED handler failed:", err);
        });
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

  // Record a temptation attempt whenever an overlay will be shown.
  if (state.blocked) {
    // Fire-and-forget: do not delay the CHECK_URL response on storage writes.
    void incrementAttempt(hostname, state.lockedIn ?? false);

    // Record self-control event for the graph.
    const scEventType = state.lockedIn
      ? "locked_in_block"
      : state.mode === "limit"
        ? "limit_exceeded"
        : "blocked";
    void recordEvent({ domain: hostname, type: scEventType });
  }

  // Record delay_triggered event when a Delay Mode countdown is shown.
  if (state.delayed) {
    void recordEvent({ domain: hostname, type: "delay_triggered" });
  }

  return {
    blocked: state.blocked,
    // Wire-format uses "time-limit"; internal type uses "limit".
    mode: state.mode === "limit" ? "time-limit" : state.mode,
    remainingSeconds: state.remainingSeconds,
    message: state.message,
    delayed: state.delayed,
    delaySeconds: state.delaySeconds,
  };
}
