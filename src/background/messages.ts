/**
 * JustDetox — Background message handler.
 *
 * Handles chrome.runtime.onMessage from content scripts.
 * Extracted from background.ts so the service-worker boot file
 * stays minimal and this logic is independently testable.
 */

import { exportAll, getSettings, getUsage, importAll } from "../core/storage";
import { computeBlockedState } from "../core/policy";
import { incrementAttempt } from "../core/temptation";
import { onDelayCompleted } from "../core/dopamine";
import { recordEvent } from "../core/selfControl";
import { clearTrackedData } from "../core/history";
import { resetTrackingBaseline } from "./tracker";
import type {
  ExtensionMessage,
  CheckUrlResponse,
  CheckUrlContext,
  ClearTrackedDataResponse,
  ExportAllResponse,
} from "../shared/messages";

function isOptionsSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL("src/ui/options/options.html");
}

/**
 * Register all content-script message handlers.
 * Call once at service-worker startup.
 */
export function registerMessages(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (
        response: CheckUrlResponse | ClearTrackedDataResponse | ExportAllResponse | null,
      ) => void,
    ) => {
      if (message.type === "CHECK_URL") {
        handleCheckUrl(message.hostname, message.context ?? "navigation")
          .then(sendResponse)
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("[JustDetox] CHECK_URL handler failed:", err);
            sendResponse({ blocked: false });
          });
        return true; // keep port open for async response
      }

      if (message.type === "CLEAR_TRACKED_DATA") {
        if (!isOptionsSender(sender)) {
          sendResponse({ ok: false, error: "This action is only available in Settings." });
          return false;
        }
        resetTrackingBaseline()
          .then(() => clearTrackedData())
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("[JustDetox] CLEAR_TRACKED_DATA handler failed:", err);
            sendResponse({ ok: false, error: "Could not clear tracked data." });
          });
        return true;
      }

      if (message.type === "IMPORT_ALL") {
        if (!isOptionsSender(sender)) {
          sendResponse({ ok: false, error: "This action is only available in Settings." });
          return false;
        }
        resetTrackingBaseline()
          .then(() => importAll(message.json))
          .then((result) => sendResponse(result.ok
            ? { ok: true }
            : { ok: false, error: result.error }))
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("[JustDetox] IMPORT_ALL handler failed:", err);
            sendResponse({ ok: false, error: "Could not import backup." });
          });
        return true;
      }

      if (message.type === "EXPORT_ALL") {
        if (!isOptionsSender(sender)) {
          sendResponse({ ok: false, error: "This action is only available in Settings." });
          return false;
        }
        exportAll()
          .then((json) => sendResponse({ ok: true, json }))
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error("[JustDetox] EXPORT_ALL handler failed:", err);
            sendResponse({ ok: false, error: "Could not export backup." });
          });
        return true;
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

async function handleCheckUrl(
  hostname: string,
  context: CheckUrlContext,
): Promise<CheckUrlResponse> {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);

  // Master kill-switch: extension disabled → never block anything.
  if (settings.disabled) return { blocked: false };

  const state = computeBlockedState(hostname, usage, settings);

  // Record a temptation attempt whenever an overlay will be shown.
  if (state.blocked && context === "navigation") {
    // Fire-and-forget: do not delay the CHECK_URL response on storage writes.
    void incrementAttempt(hostname, state.lockedIn ?? false);

    // Record self-control event for the graph.
    // Allowlist-mode blocks (state.allowlist === true) are recorded as "blocked"
    // — visiting a site outside the focus environment is a temptation event,
    // and merging it with hard-block events keeps the graph schema stable.
    const scEventType = state.lockedIn
      ? "locked_in_block"
      : state.mode === "limit"
        ? "limit_exceeded"
        : "blocked";
    void recordEvent({ domain: hostname, type: scEventType });
  }

  // Record delay_triggered event when a Delay Mode countdown is shown.
  if (state.delayed && context === "navigation") {
    void recordEvent({ domain: hostname, type: "delay_triggered" });
  }

  return {
    blocked: state.blocked,
    // Wire-format uses "time-limit"; internal type uses "limit".
    mode: state.mode === "limit" ? "time-limit" : state.mode,
    remainingSeconds: state.remainingSeconds,
    message: state.message,
    subtitle: state.subtitle,
    delayed: state.delayed,
    delaySeconds: state.delaySeconds,
    source: state.source,
    nextCheckTs: state.nextCheckTs,
    nextChangeLabel: state.nextChangeLabel,
  };
}
