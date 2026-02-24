/**
 * JustDetox Service Worker (Manifest V3) — entry point.
 *
 * Kept intentionally minimal: all logic lives in focused modules.
 *   tracker.ts   — time accumulation via tab/window events + chrome.alarms
 *   messages.ts  — content-script message handling (CHECK_URL)
 */

import { initTracker } from "./tracker";
import { registerMessages } from "./messages";

initTracker();
registerMessages();

// ─── First-run onboarding ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.tabs.create({
      url: chrome.runtime.getURL("src/ui/onboarding/onboarding.html"),
    });
  }
});
