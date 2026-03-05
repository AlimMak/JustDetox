/**
 * JustDetox Service Worker (Manifest V3) — entry point.
 *
 * Kept intentionally minimal: all logic lives in focused modules.
 *   tracker.ts   — time accumulation via tab/window events + chrome.alarms
 *   messages.ts  — content-script message handling (CHECK_URL)
 */

import { initTracker, recoverState } from "./tracker";
import { registerMessages } from "./messages";

initTracker();
registerMessages();

// ─── Lifecycle hooks ──────────────────────────────────────────────────────────

// Recover state on browser startup (session storage was cleared).
chrome.runtime.onStartup.addListener(() => {
  recoverState().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[JustDetox] onStartup recoverState:", err);
  });
});

// Recover state on install/update (SW context may be fresh).
chrome.runtime.onInstalled.addListener(({ reason }) => {
  recoverState().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[JustDetox] onInstalled recoverState:", err);
  });

  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({
      url: chrome.runtime.getURL("src/ui/onboarding/onboarding.html"),
    });
  }
});
