/**
 * JustDetox — Dopamine Score core module.
 *
 * Computes a single discipline metric (0–100) reflecting focus behavior
 * within the current reset window. Lower scores indicate more distraction;
 * higher scores indicate sustained focus.
 *
 * Score formula:
 *   Start at 100.
 *   Subtract:
 *     - 1 pt per temptation attempt
 *     - 0.5 pts per minute spent on time-limited sites
 *     - 5 pts per site that hit its time limit
 *   Add:
 *     - 2 pts per Locked In Mode session completed
 *     - 0.2 pts per minute spent in Locked In Mode
 *     - 1 pt per successful Delay Mode completion
 *   Clamped to [0, 100].
 *
 * Recalculation is debounced (DEBOUNCE_MS) to avoid excessive writes.
 * Window resets follow the same intervalHours as usage stats.
 */

import { getSettings, getUsage, getTemptations, getDopamineScore, setDopamineScore } from "./storage";
import type { DopamineScoreData } from "./types";
import { DEFAULT_DOPAMINE_SCORE } from "./types";
import { sumUsageUnder } from "./match";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 2_000;

// ─── In-memory debounce ───────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Public: score status ─────────────────────────────────────────────────────

/**
 * Map a numeric score to a short status label.
 * No color, no emoji — reads like a performance metric.
 */
export function getScoreStatus(score: number): string {
  if (score >= 90) return "Locked.";
  if (score >= 70) return "Focused.";
  if (score >= 50) return "Drifting.";
  return "Dopamine heavy.";
}

// ─── Pure calculation ─────────────────────────────────────────────────────────

interface ScoreInputs {
  totalTemptationAttempts: number;
  totalLimitedMinutes: number;
  limitHitCount: number;
  lockedInSessionsCompleted: number;
  lockedInMinutes: number;
  delayCompletions: number;
}

interface ScoreResult {
  score: number;
  breakdown: DopamineScoreData["scoreBreakdown"];
}

/**
 * Pure function — computes score and breakdown from raw inputs.
 * No storage reads. Exported for testing.
 */
export function calculateScore(inputs: ScoreInputs): ScoreResult {
  const temptationPenalty = inputs.totalTemptationAttempts * 1;
  const timePenalty = inputs.totalLimitedMinutes * 0.5 + inputs.limitHitCount * 5;
  const lockedInBonus = inputs.lockedInSessionsCompleted * 2 + inputs.lockedInMinutes * 0.2;
  const delayBonus = inputs.delayCompletions * 1;

  const raw = 100 - temptationPenalty - timePenalty + lockedInBonus + delayBonus;
  const score = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));

  return {
    score,
    breakdown: { temptationPenalty, timePenalty, lockedInBonus, delayBonus },
  };
}

// ─── Core: compute from storage and persist ────────────────────────────────────

async function computeAndSave(): Promise<void> {
  const [settings, usage, temptations, current] = await Promise.all([
    getSettings(),
    getUsage(),
    getTemptations(),
    getDopamineScore(),
  ]);

  const intervalMs = settings.resetWindow.intervalHours * 3_600_000;
  const now = Date.now();

  // Lazy window reset — same pattern as per-domain usage reset.
  const windowExpired = current.windowStartTs > 0 && now - current.windowStartTs >= intervalMs;
  const base: DopamineScoreData = windowExpired
    ? {
        ...DEFAULT_DOPAMINE_SCORE,
        previousWindowScore: current.score,
        windowStartTs: now,
      }
    : current;

  // Total temptation attempts across all domains this window.
  const totalTemptationAttempts = Object.values(temptations).reduce(
    (sum, t) => sum + t.attempts,
    0,
  );

  // Seconds on time-limited site rules.
  const limitedRuleSeconds = settings.siteRules
    .filter((r) => r.mode === "limit" && r.enabled)
    .reduce((sum, r) => sum + sumUsageUnder(r.domain, usage), 0);

  // Seconds on time-limited groups.
  const limitedGroupSeconds = settings.groups
    .filter((g) => g.mode === "limit" && g.enabled)
    .reduce(
      (sum, g) => sum + g.domains.reduce((s, d) => s + sumUsageUnder(d, usage), 0),
      0,
    );

  const totalLimitedMinutes = (limitedRuleSeconds + limitedGroupSeconds) / 60;

  // Count site rules that have hit their limit.
  const limitHitCount = settings.siteRules
    .filter(
      (r) =>
        r.mode === "limit" && r.enabled && r.limitMinutes !== undefined,
    )
    .filter((r) => sumUsageUnder(r.domain, usage) >= r.limitMinutes! * 60)
    .length;

  const { score, breakdown } = calculateScore({
    totalTemptationAttempts,
    totalLimitedMinutes,
    limitHitCount,
    lockedInSessionsCompleted: base.lockedInSessionsCompleted,
    lockedInMinutes: base.lockedInMinutes,
    delayCompletions: base.delayCompletions,
  });

  await setDopamineScore({ ...base, score, scoreBreakdown: breakdown });
}

// ─── Public: trigger recalculation (debounced) ────────────────────────────────

/**
 * Schedule a debounced recalculation of the Dopamine Score.
 *
 * Safe to call from any background module after a relevant state change.
 * Multiple rapid calls within DEBOUNCE_MS collapse into one write.
 */
export function triggerRecalculation(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    computeAndSave().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[JustDetox dopamine] recalculation failed:", err);
    });
  }, DEBOUNCE_MS);
}

// ─── Public: bonus event hooks ────────────────────────────────────────────────

/**
 * Called when a Locked In Mode session ends naturally (timer expired).
 * Increments the completed-session counter and accrues the time bonus.
 */
export async function onLockedInSessionCompleted(
  startTs: number,
  endTs: number,
): Promise<void> {
  const current = await getDopamineScore();
  const durationMinutes = (endTs - startTs) / 60_000;

  await setDopamineScore({
    ...current,
    lockedInSessionsCompleted: current.lockedInSessionsCompleted + 1,
    lockedInMinutes: current.lockedInMinutes + durationMinutes,
  });

  triggerRecalculation();
}

/**
 * Called when a Delay Mode countdown completes without the user refreshing.
 * Increments the delay-completion counter.
 */
export async function onDelayCompleted(): Promise<void> {
  const current = await getDopamineScore();

  await setDopamineScore({
    ...current,
    delayCompletions: current.delayCompletions + 1,
  });

  triggerRecalculation();
}
