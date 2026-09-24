import { buildPreloadRules, nextPreloadBoundary, PRELOAD_RULE_ID_END, PRELOAD_RULE_ID_START } from "../core/preloadRules";
import { getSettings, getUsage } from "../core/storage";

let timer: ReturnType<typeof setTimeout> | null = null;
let updateChain: Promise<void> = Promise.resolve();
const BOUNDARY_ALARM = "jd-preload-boundary";

async function refreshRules(): Promise<void> {
  const existing = (await chrome.declarativeNetRequest.getDynamicRules())
    .filter((rule) => rule.id >= PRELOAD_RULE_ID_START && rule.id <= PRELOAD_RULE_ID_END);
  const [granted, settings, usage] = await Promise.all([
    chrome.permissions.contains({ origins: ["<all_urls>"] }), getSettings(), getUsage(),
  ]);
  let next: chrome.declarativeNetRequest.Rule[] = [];
  try {
    if (granted && settings.preloadBlocking && !settings.disabled) {
      next = buildPreloadRules(settings, usage, Date.now(), chrome.runtime.getURL("blocked.html"));
    }
  } catch (error) {
    // Never leave older browser rules active when a changed policy cannot be compiled.
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((rule) => rule.id) });
    await chrome.alarms.clear(BOUNDARY_ALARM);
    throw error;
  }
  if (JSON.stringify(existing) !== JSON.stringify(next)) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((rule) => rule.id),
        addRules: next,
      });
    } catch (error) {
      // An invalid browser rule must fall back to the content-script blocker.
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((rule) => rule.id) });
      throw error;
    }
  }
  await chrome.alarms.clear(BOUNDARY_ALARM);
  if (granted && settings.preloadBlocking && !settings.disabled) {
    const boundary = nextPreloadBoundary(settings, usage);
    if (boundary !== undefined) {
      chrome.alarms.create(BOUNDARY_ALARM, { when: Math.max(Date.now() + 1_000, boundary + 100) });
    }
  }
}

function queueRefresh(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    updateChain = updateChain.then(refreshRules).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[JustDetox] Pre-load rule update failed:", error);
    });
  }, 250);
}

export function initPreloadBlocking(): void {
  queueRefresh();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.jd_settings || changes.jd_usage)) queueRefresh();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "jd-tick" || alarm.name === BOUNDARY_ALARM) queueRefresh();
  });
  chrome.permissions.onAdded.addListener(queueRefresh);
  chrome.permissions.onRemoved.addListener(queueRefresh);
}
