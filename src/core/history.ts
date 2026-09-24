/** Bounded, local-only daily progress history. */

import { forceFlushStorageQueue, queueStorageReplace, readThrough } from "./storageQueue";
import {
  setDopamineScore,
  setSelfControlData,
  setTemptations,
  setUsage,
} from "./storage";
import { DEFAULT_DOPAMINE_SCORE, DEFAULT_SELF_CONTROL_DATA } from "./types";
import type { DailyProgress } from "./types";
export type { DailyProgress } from "./types";

const KEY_HISTORY = "jd_progress_history";
const HISTORY_DAYS = 30;

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStorage(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(KEY_HISTORY, (result) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(result[KEY_HISTORY]);
    });
  });
}

/** Read at most 30 recent daily records; reject malformed stored entries. */
export async function getProgressHistory(): Promise<DailyProgress[]> {
  const raw = readThrough(KEY_HISTORY) ?? (await readStorage());
  if (!Array.isArray(raw)) return [];

  const today = localDateKey(new Date());
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (HISTORY_DAYS - 1));
  const cutoff = localDateKey(cutoffDate);
  return raw
    .filter((entry): entry is DailyProgress =>
      typeof entry === "object" && entry !== null &&
      typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
      typeof entry.activeSeconds === "number" && Number.isFinite(entry.activeSeconds) && entry.activeSeconds >= 0 &&
      (entry.focusSeconds === undefined ||
        (typeof entry.focusSeconds === "number" && Number.isFinite(entry.focusSeconds) && entry.focusSeconds >= 0)) &&
      typeof entry.blockedAttempts === "number" && Number.isInteger(entry.blockedAttempts) && entry.blockedAttempts >= 0 &&
      (entry.score === null || (typeof entry.score === "number" && Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 100)),
    )
    .filter((entry) => entry.date >= cutoff && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-HISTORY_DAYS);
}

/** Replace history during a validated backup import. */
export function setProgressHistory(history: DailyProgress[]): void {
  queueStorageReplace(KEY_HISTORY, history.slice(-HISTORY_DAYS));
}

// All writers run in the background service worker. Serialize their async
// read/modify/write cycles so near-simultaneous ticks and attempts don't drop
// one another's counts.
let writeChain: Promise<void> = Promise.resolve();

/** Wait for any history read/modify/write work that has not reached the queue. */
export function waitForProgressHistoryUpdates(): Promise<void> {
  return writeChain;
}

function updateToday(update: (entry: DailyProgress) => DailyProgress): Promise<void> {
  const nextWrite = writeChain.then(async () => {
    const date = localDateKey(new Date());
    const history = await getProgressHistory();
    const previous = history.find((item) => item.date === date) ?? {
      date,
      activeSeconds: 0,
      blockedAttempts: 0,
      score: null,
    };
    const entry = update(previous);
    const next = [...history.filter((item) => item.date !== date), entry]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-HISTORY_DAYS);
    setProgressHistory(next);
  });
  writeChain = nextWrite.catch(() => {});
  return nextWrite;
}

export function recordDailyUsage(seconds: number, focusSeconds = 0): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return Promise.resolve();
  return updateToday((entry) => ({
    ...entry,
    activeSeconds: entry.activeSeconds + seconds,
    focusSeconds: (entry.focusSeconds ?? 0) + Math.max(0, Math.min(seconds, focusSeconds)),
  }));
}

export function recordDailyAttempt(): Promise<void> {
  return updateToday((entry) => ({ ...entry, blockedAttempts: entry.blockedAttempts + 1 }));
}

export function recordDailyScore(score: number): Promise<void> {
  if (!Number.isFinite(score) || score < 0 || score > 100) return Promise.resolve();
  return updateToday((entry) => ({ ...entry, score }));
}

/** Clear measurements while retaining the user's blocking rules. Run in the SW. */
export async function clearTrackedData(): Promise<void> {
  await writeChain;
  await forceFlushStorageQueue();
  const now = Date.now();
  setUsage({});
  setTemptations({});
  setDopamineScore({ ...DEFAULT_DOPAMINE_SCORE, windowStartTs: now });
  setSelfControlData({ ...DEFAULT_SELF_CONTROL_DATA, windowStartTs: now });
  setProgressHistory([]);
  await forceFlushStorageQueue();
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove("jd_friction_log", () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
