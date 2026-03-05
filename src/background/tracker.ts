/**
 * JustDetox — Time tracking engine (MV3 service worker).
 *
 * # MV3 constraint
 * Service workers can be suspended after ~30 s of inactivity. `setInterval`
 * won't survive a sleep. This engine uses two mechanisms together:
 *
 *   1. `chrome.alarms` ("jd-tick", 1-min period) — wakes the SW periodically
 *      and flushes accumulated time to chrome.storage.local.
 *
 *   2. `chrome.storage.session` — persists the tracker session across SW sleep.
 *      `chrome.storage.session` is in-memory but survives SW termination;
 *      it is cleared when the browser itself closes.
 *
 * # Counting rule
 * Time is counted only when the domain is in the *active tab* of the
 * *focused browser window*. Any other state sets activeDomain = null.
 *
 * # Reset-window
 * Before each accumulation we check whether the domain's `windowStartTs`
 * is older than `settings.resetWindow.intervalHours`. If so, the counter
 * is zeroed and a new window starts — no separate alarm needed.
 *
 * # Flush cap
 * Each flush is capped at FLUSH_CAP_MS to prevent counting sleep time
 * (e.g. when the laptop lid was closed between alarm ticks).
 */

import { getSettings, getUsage, setUsage, isWindowExpired } from "../core/storage";
import type { DomainUsage, UsageMap } from "../core/types";
import { checkLockedInExpiry } from "./lockedIn";
import { triggerRecalculation } from "../core/dopamine";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALARM_NAME = "jd-tick";
const ALARM_PERIOD_MINUTES = 1;

/**
 * Maximum milliseconds counted in a single flush.
 * 90 s = 1.5× alarm period — absorbs normal timer drift while dropping
 * any gap caused by the computer sleeping or the SW being idle for a long time.
 */
const FLUSH_CAP_MS = 90_000;

// ─── Session state ────────────────────────────────────────────────────────────

/** Persisted in chrome.storage.session — survives SW sleep. */
interface TrackerSession {
  /** Currently tracked hostname, or null when the browser is not focused. */
  activeDomain: string | null;
  /**
   * Unix-ms timestamp of the last flush to chrome.storage.local.
   * 0 means no domain is being tracked.
   */
  lastFlushTs: number;
  /** Tab ID of the tracked tab (null when not tracking). */
  tabId: number | null;
  /** Window ID of the tracked tab's window (null when not tracking). */
  windowId: number | null;
}

const SESSION_KEY = "jd_tracker";
const SESSION_DEFAULTS: TrackerSession = {
  activeDomain: null,
  lastFlushTs: 0,
  tabId: null,
  windowId: null,
};

function sessionGet(): Promise<TrackerSession> {
  return new Promise((resolve) => {
    chrome.storage.session.get(SESSION_KEY, (result) => {
      const stored = result[SESSION_KEY] as TrackerSession | undefined;
      resolve(stored ?? { ...SESSION_DEFAULTS });
    });
  });
}

function sessionSet(patch: Partial<TrackerSession>): Promise<void> {
  return new Promise((resolve, reject) => {
    sessionGet().then((current) => {
      chrome.storage.session.set({ [SESSION_KEY]: { ...current, ...patch } }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  });
}

// ─── Error logger ─────────────────────────────────────────────────────────────

function logErr(label: string) {
  return (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[JustDetox tracker] ${label}:`, err);
  };
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/**
 * Calculate capped elapsed seconds between two timestamps.
 * Pure function — safe to unit-test without browser APIs.
 *
 * @param lastFlushTs  Unix-ms of the last flush.
 * @param now          Unix-ms of the current moment.
 * @param capMs        Maximum milliseconds to count (default: FLUSH_CAP_MS).
 */
export function computeElapsedSeconds(
  lastFlushTs: number,
  now: number,
  capMs: number = FLUSH_CAP_MS,
): number {
  const raw = now - lastFlushTs;
  if (raw <= 0) return 0;
  return Math.min(raw, capMs) / 1_000;
}

// ─── Core: accumulate ─────────────────────────────────────────────────────────

/**
 * Add `elapsedSeconds` to `domain`'s usage record.
 *
 * Performs a lazy window-expiry check: if `now - windowStartTs >= intervalHours`
 * the record is reset before adding, starting a fresh window.
 *
 * Note: concurrent calls from rapid events share this function but the SW
 * processes messages serially, so races are extremely unlikely in practice.
 */
async function accumulateTime(domain: string, elapsedSeconds: number): Promise<void> {
  if (elapsedSeconds <= 0) return;

  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);
  const intervalHours = settings.resetWindow.intervalHours;
  const now = Date.now();

  const existing = usage[domain];
  const windowExpired = existing !== undefined && isWindowExpired(usage, domain, intervalHours);

  // Start fresh if no record yet, or if the window has expired.
  const base: DomainUsage =
    !existing || windowExpired
      ? { activeSeconds: 0, lastUpdated: now, windowStartTs: now }
      : existing;

  const updated: UsageMap = {
    ...usage,
    [domain]: {
      ...base,
      activeSeconds: base.activeSeconds + elapsedSeconds,
      lastUpdated: now,
    },
  };

  await setUsage(updated);
  triggerRecalculation();
}

// ─── Core: flush ─────────────────────────────────────────────────────────────

/**
 * Calculate elapsed time for the active domain, cap it, and write to storage.
 * Does NOT update `lastFlushTs` — callers must do that after calling this.
 */
async function flushCurrent(now: number): Promise<void> {
  const session = await sessionGet();

  if (!session.activeDomain || session.lastFlushTs === 0) return;

  const elapsedSeconds = computeElapsedSeconds(session.lastFlushTs, now);
  if (elapsedSeconds <= 0) return;

  await accumulateTime(session.activeDomain, elapsedSeconds);
}

// ─── Core: domain switch ─────────────────────────────────────────────────────

/**
 * Flush elapsed time for the current domain, then switch to `newDomain`.
 * Pass `null` for newDomain when the browser is idle / unfocused.
 */
async function switchActiveDomain(
  newDomain: string | null,
  tabId: number | null = null,
  windowId: number | null = null,
): Promise<void> {
  const now = Date.now();
  await flushCurrent(now);
  await sessionSet({
    activeDomain: newDomain,
    lastFlushTs: newDomain !== null ? now : 0,
    tabId: newDomain !== null ? tabId : null,
    windowId: newDomain !== null ? windowId : null,
  });
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true only for trackable http/https URLs.
 * Skips chrome://, chrome-extension://, about:, new-tab, etc.
 */
function isTrackable(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "http:" || protocol === "https:") && hostname.length > 0;
  } catch {
    return false;
  }
}

function hostnameFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

// ─── Tab helpers ─────────────────────────────────────────────────────────────

/** Return the single active tab in the last-focused window, or null. */
async function queryActiveFocusedTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}

// ─── Event handlers ──────────────────────────────────────────────────────────

async function handleTabActivated(info: chrome.tabs.TabActiveInfo): Promise<void> {
  // Only track if the tab's window is currently focused.
  try {
    const win = await chrome.windows.get(info.windowId);
    if (!win.focused) return;
  } catch {
    // Window may already be closed.
    return;
  }

  try {
    const tab = await chrome.tabs.get(info.tabId);
    const domain = isTrackable(tab.url) ? hostnameFrom(tab.url) : null;
    await switchActiveDomain(domain, info.tabId, info.windowId);
  } catch {
    await switchActiveDomain(null);
  }
}

async function handleWindowFocusChanged(windowId: number): Promise<void> {
  // WINDOW_ID_NONE (-1) → the browser lost focus to another app.
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await switchActiveDomain(null);
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    const domain = tab && isTrackable(tab.url) ? hostnameFrom(tab.url) : null;
    const tabId = tab?.id ?? null;
    await switchActiveDomain(domain, tabId, windowId);
  } catch {
    await switchActiveDomain(null);
  }
}

async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
): Promise<void> {
  // We only care about actual URL navigation, not loading/title changes.
  if (!changeInfo.url) return;

  // Only act if this is the active tab in the focused window.
  const active = await queryActiveFocusedTab();
  if (!active || active.id !== tabId) return;

  const domain = isTrackable(changeInfo.url) ? hostnameFrom(changeInfo.url) : null;
  await switchActiveDomain(domain, tabId, active.windowId);
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const session = await sessionGet();
  // Only stop tracking if the removed tab is the one we're tracking.
  if (session.tabId !== tabId) return;
  await switchActiveDomain(null);
}

async function handleWindowRemoved(windowId: number): Promise<void> {
  const session = await sessionGet();
  // Only stop tracking if the removed window contains our tracked tab.
  if (session.windowId !== windowId) return;
  await switchActiveDomain(null);
}

async function handleAlarmTick(): Promise<void> {
  const now = Date.now();
  await flushCurrent(now);

  // Advance lastFlushTs so the next tick measures from now.
  const session = await sessionGet();
  if (session.activeDomain) {
    await sessionSet({ lastFlushTs: now });
  }

  // Expire Locked In Mode session if its endTs has passed.
  await checkLockedInExpiry();
}

// ─── Startup helpers ─────────────────────────────────────────────────────────

/** Create the periodic alarm if it doesn't already exist. */
function ensureAlarm(): void {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Flush any pending time from a previous SW instance, then detect and begin
 * tracking the currently active tab (only if a browser window is focused).
 *
 * Called:
 *  - at top of initTracker() (every SW wake)
 *  - on chrome.runtime.onStartup (after browser restarts)
 *  - on chrome.runtime.onInstalled (install / update)
 */
export async function recoverState(): Promise<void> {
  const now = Date.now();

  // Flush any stale pending time from the previous SW instance.
  // FLUSH_CAP_MS ensures sleep gaps don't inflate counts.
  await flushCurrent(now);

  // Only start tracking if a browser window is currently focused.
  const tab = await queryActiveFocusedTab();
  let domain: string | null = null;
  let tabId: number | null = null;
  let windowId: number | null = null;

  if (tab) {
    try {
      const win = await chrome.windows.get(tab.windowId);
      if (win.focused && isTrackable(tab.url)) {
        domain = hostnameFrom(tab.url);
        tabId = tab.id ?? null;
        windowId = tab.windowId;
      }
    } catch {
      // Window not found — don't start tracking.
    }
  }

  await sessionSet({
    activeDomain: domain,
    lastFlushTs: domain !== null ? now : 0,
    tabId: domain !== null ? tabId : null,
    windowId: domain !== null ? windowId : null,
  });
}

/**
 * Wire up the time tracking engine.
 *
 * Must be called once at the top of background.ts. Safe to call on every
 * SW startup (Chrome deduplicates event listeners per SW instance).
 *
 * Registers:
 *  - chrome.tabs.onActivated
 *  - chrome.windows.onFocusChanged
 *  - chrome.tabs.onUpdated
 *  - chrome.tabs.onRemoved      (flush + stop when tracked tab closes)
 *  - chrome.windows.onRemoved   (flush + stop when tracked window closes)
 *  - chrome.alarms.onAlarm      (jd-tick)
 *  - chrome.runtime.onSuspend   (final flush + advance lastFlushTs before SW sleeps)
 */
export function initTracker(): void {
  ensureAlarm();
  recoverState().catch(logErr("recoverState"));

  chrome.tabs.onActivated.addListener((info) => {
    handleTabActivated(info).catch(logErr("onActivated"));
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    handleWindowFocusChanged(windowId).catch(logErr("onFocusChanged"));
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    handleTabUpdated(tabId, changeInfo).catch(logErr("onUpdated"));
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId).catch(logErr("onTabRemoved"));
  });

  chrome.windows.onRemoved.addListener((windowId) => {
    handleWindowRemoved(windowId).catch(logErr("onWindowRemoved"));
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      handleAlarmTick().catch(logErr("alarm tick"));
    }
  });

  // Best-effort final flush before the SW is terminated.
  // Also advances lastFlushTs so the next wake doesn't double-count.
  chrome.runtime.onSuspend.addListener(() => {
    const now = Date.now();
    flushCurrent(now)
      .then(() => sessionSet({ lastFlushTs: now }))
      .catch(logErr("onSuspend flush"));
  });
}
