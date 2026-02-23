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
