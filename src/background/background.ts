/**
 * JustDetox Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Wire up the time-tracking engine (tracker.ts).
 * - Answer CHECK_URL messages from content scripts using the core data model.
 *
 * Time accumulation is now handled entirely by tracker.ts via tab/window
 * event listeners and a 1-minute chrome.alarm. The old RECORD_TIME message
 * path is kept as a no-op so the existing content script doesn't error.
 */

import { initTracker } from "./tracker";
import { getSettings, getUsage } from "../core/storage";
import type { ExtensionMessage, CheckUrlResponse } from "../shared/messages";

// ─── Boot ─────────────────────────────────────────────────────────────────────
// initTracker() registers all event listeners and the jd-tick alarm.
// It runs every time the service worker starts — Chrome deduplicates listeners
// within a single SW instance, so this is safe to call unconditionally.

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

    // RECORD_TIME: time tracking is now handled by tracker.ts via browser
    // events. This handler is kept so the content script doesn't receive an
    // error and will be removed when the content script is updated.
    if (message.type === "RECORD_TIME") {
      return false;
    }

    return false;
  },
);

// ─── CHECK_URL logic ──────────────────────────────────────────────────────────

async function handleCheckUrl(hostname: string): Promise<CheckUrlResponse> {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);

  // 1. Per-site rules (highest priority).
  for (const rule of settings.siteRules) {
    if (!rule.enabled) continue;
    if (!hostnameMatches(hostname, rule.domain)) continue;

    if (rule.mode === "block") {
      return { blocked: true, mode: "block" };
    }

    // limit mode — compare activeSeconds against the per-window allowance.
    const usedSeconds = usage[rule.domain]?.activeSeconds ?? 0;
    const limitSeconds = (rule.limitMinutes ?? 0) * 60;
    const remaining = Math.max(0, limitSeconds - usedSeconds);
    return { blocked: remaining <= 0, mode: "time-limit", remainingSeconds: remaining };
  }

  // 2. Group rules.
  for (const group of settings.groups) {
    if (!group.enabled) continue;
    const matchedDomain = group.domains.find((d) => hostnameMatches(hostname, d));
    if (!matchedDomain) continue;

    if (group.mode === "block") {
      return { blocked: true, mode: "block" };
    }

    // Shared pool: sum activeSeconds across all domains in the group.
    const totalUsed = group.domains.reduce(
      (sum, d) => sum + (usage[d]?.activeSeconds ?? 0),
      0,
    );
    const limitSeconds = (group.limitMinutes ?? 0) * 60;
    const remaining = Math.max(0, limitSeconds - totalUsed);
    return { blocked: remaining <= 0, mode: "time-limit", remainingSeconds: remaining };
  }

  // 3. Global block list.
  if (settings.globalBlockList.some((d) => hostnameMatches(hostname, d))) {
    return { blocked: true, mode: "block" };
  }

  // 4. Global defaults fallback.
  if (settings.globalDefaults?.mode === "block") {
    return { blocked: true, mode: "block" };
  }
  if (settings.globalDefaults?.mode === "limit") {
    const limitSeconds = (settings.globalDefaults.limitMinutes ?? 0) * 60;
    const usedSeconds = usage[hostname]?.activeSeconds ?? 0;
    const remaining = Math.max(0, limitSeconds - usedSeconds);
    return { blocked: remaining <= 0, mode: "time-limit", remainingSeconds: remaining };
  }

  return { blocked: false };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns true if `pageHost` is exactly `configuredHost` or a subdomain of it.
 *
 * Examples:
 *   hostnameMatches("www.twitter.com", "twitter.com")  → true
 *   hostnameMatches("twitter.com",     "twitter.com")  → true
 *   hostnameMatches("nottwitter.com",  "twitter.com")  → false
 */
function hostnameMatches(pageHost: string, configuredHost: string): boolean {
  return pageHost === configuredHost || pageHost.endsWith(`.${configuredHost}`);
}
