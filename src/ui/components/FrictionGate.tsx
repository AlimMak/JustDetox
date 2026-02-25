/**
 * FrictionGate — fullscreen modal that introduces intentional friction before
 * a protective rule is relaxed.
 *
 * Three sequential steps:
 *   1. Pause  — shows context + 10 s countdown; Continue unlocks after countdown.
 *   2. Reflect — short text field for "Why are you making this change?"
 *                (shown by default; skipped when frictionConfig.requireReflection
 *                is false AND the showReflection prop is false — future).
 *   3. Confirm — two buttons: "Keep protections" (default focus) / "Apply change".
 *
 * Security constraints:
 *   - No Escape key close.
 *   - No backdrop click to close.
 *   - No close button.
 *   - Countdown cannot be skipped.
 */

import { useEffect, useRef, useState } from "react";
import type { FrictionPayload, FrictionActionType } from "../../core/friction";
import { describeActionType } from "../../core/friction";
import { getUsage } from "../../core/storage";
import { formatTime } from "../popup/utils/formatTime";

const COUNTDOWN_SECONDS = 10;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FrictionGateProps {
  payload: FrictionPayload;
  /** Timestamp (ms) when the countdown was started — lives outside this
   *  component so it survives re-mounts. */
  countdownStartTs: number;
  /** Whether to show the reflection step. */
  showReflection: boolean;
  /** Whether the user must fill in the reflection field to proceed. */
  requireReflection: boolean;
  /** Called when the user confirms "Apply change". */
  onApply: (reflection: string) => void;
  /** Called when the user clicks "Keep protections". */
  onKeep: () => void;
}

type Step = 1 | 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function secondsRemaining(startTs: number): number {
  return Math.max(0, COUNTDOWN_SECONDS - Math.floor((Date.now() - startTs) / 1000));
}

function actionLabel(actionType: FrictionActionType): string {
  return describeActionType(actionType);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FrictionGate({
  payload,
  countdownStartTs,
  showReflection,
  requireReflection,
  onApply,
  onKeep,
}: FrictionGateProps) {
  const [step, setStep] = useState<Step>(1);
  const [remaining, setRemaining] = useState(() => secondsRemaining(countdownStartTs));
  const [reflection, setReflection] = useState("");
  const [usageSeconds, setUsageSeconds] = useState<number | null>(null);

  const keepBtnRef = useRef<HTMLButtonElement>(null);
  const applyBtnRef = useRef<HTMLButtonElement>(null);

  // ── Load domain usage for context display ──────────────────────────────────
  useEffect(() => {
    if (!payload.domain) return;
    getUsage().then((usage) => {
      const record = usage[payload.domain!];
      if (record) setUsageSeconds(record.activeSeconds);
    }).catch(() => { /* non-fatal */ });
  }, [payload.domain]);

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1) return;
    const id = setInterval(() => {
      const r = secondsRemaining(countdownStartTs);
      setRemaining(r);
      if (r === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [step, countdownStartTs]);

  // ── Block ALL keyboard shortcuts — only allow Tab/Shift+Tab within gate ───
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, []);

  // ── Auto-focus "Keep protections" when step 3 renders ─────────────────────
  useEffect(() => {
    if (step === 3) keepBtnRef.current?.focus();
  }, [step]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleContinueFromStep1 = () => {
    if (remaining > 0) return;
    setStep(showReflection ? 2 : 3);
  };

  const handleContinueFromStep2 = () => {
    setStep(3);
  };

  const handleApply = () => {
    if (requireReflection && reflection.trim() === "") return;
    onApply(reflection);
  };

  // ── Countdown ring ─────────────────────────────────────────────────────────
  const pct = 1 - remaining / COUNTDOWN_SECONDS;
  const circumference = 2 * Math.PI * 28; // r=28
  const strokeDashoffset = circumference * (1 - pct);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="friction-gate"
      role="dialog"
      aria-modal="true"
      aria-label="Friction Gate — protective pause"
    >
      <div className="friction-gate__box">

        {/* ── Step 1: Pause ──────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="friction-step">
            <p className="friction-gate__eyebrow">Pause.</p>
            <h1 className="friction-gate__headline">
              Do you really want to change this?
            </h1>

            {/* Context block */}
            <div className="friction-gate__context">
              <div className="friction-context-row">
                <span className="friction-context-label">Change</span>
                <span className="friction-context-value">{payload.label}</span>
              </div>
              <div className="friction-context-row">
                <span className="friction-context-label">Action</span>
                <span className="friction-context-value">{actionLabel(payload.actionType)}</span>
              </div>
              {usageSeconds !== null && (
                <div className="friction-context-row">
                  <span className="friction-context-label">Usage this window</span>
                  <span className="friction-context-value">{formatTime(usageSeconds)}</span>
                </div>
              )}
            </div>

            {/* Countdown ring + label */}
            <div className="friction-gate__countdown">
              <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                <circle
                  cx="36" cy="36" r="28"
                  fill="none"
                  stroke="var(--surface-3)"
                  strokeWidth="3"
                />
                <circle
                  cx="36" cy="36" r="28"
                  fill="none"
                  stroke={remaining === 0 ? "var(--text-success)" : "var(--border-focus)"}
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
                />
                <text
                  x="36" y="41"
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="600"
                  fill={remaining === 0 ? "var(--text-success)" : "var(--text-1)"}
                  fontFamily="var(--font)"
                >
                  {remaining === 0 ? "✓" : remaining}
                </text>
              </svg>
              <p className="friction-countdown-label">
                {remaining > 0
                  ? `Wait ${remaining}s before continuing`
                  : "You may continue"}
              </p>
            </div>

            <button
              className={`btn btn-secondary friction-gate__continue${remaining === 0 ? "" : " friction-gate__continue--locked"}`}
              disabled={remaining > 0}
              onClick={handleContinueFromStep1}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: Reflect ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="friction-step">
            <p className="friction-gate__eyebrow">Reflect.</p>
            <h1 className="friction-gate__headline">
              Why are you making this change?
            </h1>
            <p className="friction-gate__sub">
              {requireReflection
                ? "A short note is required before continuing."
                : "Optional — your note is stored locally."}
            </p>

            <textarea
              className="friction-gate__textarea"
              placeholder="I need to check something important…"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={4}
              autoFocus
            />

            {requireReflection && reflection.trim() === "" && (
              <p className="friction-gate__error">Please enter a reason before continuing.</p>
            )}

            <div className="friction-gate__actions friction-gate__actions--row">
              <button
                className="btn btn-secondary"
                onClick={handleContinueFromStep2}
                disabled={requireReflection && reflection.trim() === ""}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="friction-step">
            <p className="friction-gate__eyebrow">Confirm.</p>
            <h1 className="friction-gate__headline">
              Are you sure?
            </h1>

            <div className="friction-gate__context">
              <div className="friction-context-row">
                <span className="friction-context-label">Change</span>
                <span className="friction-context-value">{payload.label}</span>
              </div>
            </div>

            <div className="friction-gate__actions">
              <button
                ref={keepBtnRef}
                className="btn btn-primary friction-gate__keep"
                onClick={onKeep}
                autoFocus
              >
                Keep protections
              </button>
              <button
                ref={applyBtnRef}
                className="btn btn-ghost friction-gate__apply"
                onClick={handleApply}
              >
                Apply change
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
