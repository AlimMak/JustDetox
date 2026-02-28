/**
 * ProtectedGate — fullscreen modal that guards high-impact protective changes.
 *
 * Requirements:
 *  - Timed cooldown: "Apply change" is disabled until the timer reaches 0
 *    (when requireCooldown is true).
 *  - Typed phrase: user must type the configured phrase (case-insensitive)
 *    before "Apply change" is enabled (when requirePhrase is true).
 *  - Cancel is default-focused and always enabled.
 *  - No Escape key, no backdrop click, no close button.
 *  - Design: monochrome, calm, no gamification.
 */

import { useEffect, useRef, useState } from "react";
import type { FrictionPayload } from "../../core/friction";
import { describeActionType } from "../../core/friction";
import type { ProtectedGateSettings } from "../../core/types";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProtectedGateProps {
  payload: FrictionPayload;
  /** Timestamp (ms) when the cooldown was started — survives re-mounts. */
  countdownStartTs: number;
  gate: ProtectedGateSettings;
  /** Called when the user confirms "Apply change". */
  onApply: () => void;
  /** Called when the user clicks "Cancel". */
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function secondsRemaining(startTs: number, cooldown: number): number {
  return Math.max(0, cooldown - Math.floor((Date.now() - startTs) / 1000));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProtectedGate({
  payload,
  countdownStartTs,
  gate,
  onApply,
  onCancel,
}: ProtectedGateProps) {
  const [remaining, setRemaining] = useState(() =>
    secondsRemaining(countdownStartTs, gate.cooldownSeconds),
  );
  const [phrase, setPhrase] = useState("");

  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cooldownDone = !gate.requireCooldown || remaining === 0;
  const phraseOk =
    !gate.requirePhrase ||
    phrase.trim().toUpperCase() === gate.phrase.toUpperCase();
  const canApply = cooldownDone && phraseOk;

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gate.requireCooldown) return;
    const id = setInterval(() => {
      const r = secondsRemaining(countdownStartTs, gate.cooldownSeconds);
      setRemaining(r);
      if (r === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [countdownStartTs, gate.cooldownSeconds, gate.requireCooldown]);

  // ── Block Escape ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, []);

  // ── Auto-focus Cancel on mount ─────────────────────────────────────────────
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  // ── When cooldown ends, focus the phrase input (if required) ───────────────
  useEffect(() => {
    if (cooldownDone && gate.requirePhrase) {
      inputRef.current?.focus();
    }
  }, [cooldownDone, gate.requirePhrase]);

  // ── Countdown ring ─────────────────────────────────────────────────────────
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const pct = gate.requireCooldown
    ? 1 - remaining / gate.cooldownSeconds
    : 1;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <div
      className="friction-gate"
      role="dialog"
      aria-modal="true"
      aria-label="Protected Settings"
    >
      <div className="friction-gate__box pg-box">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="pg-header">
          <p className="friction-gate__eyebrow">Protected Settings</p>
          <h1 className="friction-gate__headline">
            This change reduces your protection.
          </h1>
        </div>

        {/* ── Context block ──────────────────────────────────────────────── */}
        <div className="friction-gate__context">
          <div className="friction-context-row">
            <span className="friction-context-label">Change</span>
            <span className="friction-context-value">{payload.label}</span>
          </div>
          <div className="friction-context-row">
            <span className="friction-context-label">Why</span>
            <span className="friction-context-value">
              {describeActionType(payload.actionType)}
            </span>
          </div>
          {payload.context && payload.context.length > 0 && (
            <div className="friction-context-row pg-context-list">
              <span className="friction-context-label">Details</span>
              <ul className="pg-reduction-list">
                {payload.context.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Cooldown timer ─────────────────────────────────────────────── */}
        {gate.requireCooldown && (
          <div className="friction-gate__countdown">
            <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
              <circle
                cx="36" cy="36" r={r}
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth="3"
              />
              <circle
                cx="36" cy="36" r={r}
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
                ? `Wait ${remaining}s before applying`
                : "Cooldown complete"}
            </p>
          </div>
        )}

        {/* ── Phrase input ───────────────────────────────────────────────── */}
        {gate.requirePhrase && (
          <div className="pg-phrase-field">
            <label className="pg-phrase-label">
              Type <strong>{gate.phrase}</strong> to confirm
            </label>
            <input
              ref={inputRef}
              className="input pg-phrase-input"
              type="text"
              placeholder={`Type "${gate.phrase}" to confirm`}
              value={phrase}
              autoComplete="off"
              spellCheck={false}
              disabled={gate.requireCooldown && remaining > 0}
              onChange={(e) => setPhrase(e.target.value)}
            />
            {phrase.length > 0 && !phraseOk && (
              <p className="friction-gate__error pg-phrase-error">
                Phrase does not match.
              </p>
            )}
          </div>
        )}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div className="friction-gate__actions">
          <button
            ref={cancelBtnRef}
            className="btn btn-primary friction-gate__keep"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn-ghost friction-gate__apply"
            disabled={!canApply}
            onClick={onApply}
          >
            Apply change
          </button>
        </div>

      </div>
    </div>
  );
}
