/**
 * JustDetox Service Worker (Manifest V3)
 *
 * Responsibilities:
 * - Answer CHECK_URL messages from content scripts
 * - Track time spent on time-limited sites (via RECORD_TIME messages)
 * - Reset daily usage at midnight via chrome.alarms
 */

import type { ExtensionMessage, CheckUrlResponse } from "../shared/messages";
import { readStorage, writeStorage } from "../shared/storage";

const ALARM_DAILY_RESET = "daily-reset";

// ─── Alarm setup ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  scheduleDailyReset();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_DAILY_RESET) {
    resetDailyUsage();
    scheduleDailyReset();
  }
});

function scheduleDailyReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);

  chrome.alarms.create(ALARM_DAILY_RESET, {
    when: nextMidnight.getTime(),
  });
}

async function resetDailyUsage() {
  await writeStorage({
    usedToday: {},
    lastReset: new Date().toISOString(),
  });
}

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

    if (message.type === "RECORD_TIME") {
      handleRecordTime(message.hostname, message.seconds);
      return false;
    }

    return false;
  },
);

async function handleCheckUrl(hostname: string): Promise<CheckUrlResponse> {
  const storage = await readStorage();
  const site = storage.blockedSites.find((s) => hostnameMatches(hostname, s.hostname));

  if (!site) return { blocked: false };

  if (site.mode === "block") {
    return { blocked: true, mode: "block" };
  }

  // time-limit mode
  const limitSeconds = (site.dailyLimitMinutes ?? 0) * 60;
  const usedSeconds = (storage.usedToday[site.hostname] ?? 0) * 60;
  const remaining = Math.max(0, limitSeconds - usedSeconds);

  return {
    blocked: remaining <= 0,
    mode: "time-limit",
    remainingSeconds: remaining,
  };
}

async function handleRecordTime(hostname: string, seconds: number) {
  const storage = await readStorage();
  const site = storage.blockedSites.find((s) => hostnameMatches(hostname, s.hostname));
  if (!site || site.mode !== "time-limit") return;

  const currentMinutes = storage.usedToday[site.hostname] ?? 0;
  const updatedUsedToday = {
    ...storage.usedToday,
    [site.hostname]: currentMinutes + seconds / 60,
  };

  await writeStorage({ usedToday: updatedUsedToday });
}

/** Simple hostname matching: exact or subdomain of configured host. */
function hostnameMatches(pageHost: string, configuredHost: string): boolean {
  return pageHost === configuredHost || pageHost.endsWith(`.${configuredHost}`);
}
