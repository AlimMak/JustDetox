/**
 * useFrictionGate — manages the gate modal lifecycle.
 *
 * Routes to the correct gate based on settings:
 *   - protectedGate.enabled → Protected Gate (60 s countdown + phrase)
 *   - friction.enabled       → Friction Gate  (10 s countdown + reflection)
 *   - neither enabled        → pass-through (resolves true immediately)
 *
 * Exposes `askFriction(payload)` → Promise<boolean>.
 * Returns `gateState` (null when closed) for the Options root to render.
 */

import { useCallback, useRef, useState } from "react";
import type { FrictionPayload, FrictionLogEntry } from "../../../core/friction";
import { appendFrictionLog } from "../../../core/friction";
import type { FrictionSettings, ProtectedGateSettings } from "../../../core/types";
import type { FrictionGateProps } from "../../components/FrictionGate";

// ─── Gate kind discriminator ──────────────────────────────────────────────────

export type GateKind = "friction" | "protected";

// ─── Active gate state ────────────────────────────────────────────────────────

export interface ActiveGateState {
  /** Which modal to render. */
  kind: GateKind;
  payload: FrictionPayload;
  /** Timestamp (ms) when the countdown started — kept outside the component. */
  countdownStartTs: number;

  // Friction Gate–specific
  showReflection: boolean;
  requireReflection: boolean;
}

export interface UseFrictionGateResult {
  /**
   * Call before a protective change.
   * Resolves true = proceed, false = keep protections.
   * Resolves true immediately when both gates are disabled.
   */
  askFriction: (payload: FrictionPayload) => Promise<boolean>;
  /** Current gate state — null when gate is closed. */
  gateState: ActiveGateState | null;
  /** Handlers for both gate components. */
  gateHandlers: Pick<FrictionGateProps, "onApply" | "onKeep"> & {
    /** Used by ProtectedGate which has no reflection text. */
    onApplyProtected: () => void;
  };
}

export function useFrictionGate(
  frictionSettings: FrictionSettings,
  protectedGateSettings: ProtectedGateSettings,
): UseFrictionGateResult {
  const [gateState, setGateState] = useState<ActiveGateState | null>(null);

  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const payloadRef = useRef<FrictionPayload | null>(null);

  const askFriction = useCallback(
    (payload: FrictionPayload): Promise<boolean> => {
      // Protected Gate takes precedence over Friction Layer.
      if (protectedGateSettings.enabled) {
        const countdownStartTs = Date.now();
        payloadRef.current = payload;
        return new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setGateState({
            kind: "protected",
            payload,
            countdownStartTs,
            showReflection: false,
            requireReflection: false,
          });
        });
      }

      if (frictionSettings.enabled) {
        const countdownStartTs = Date.now();
        payloadRef.current = payload;
        return new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setGateState({
            kind: "friction",
            payload,
            countdownStartTs,
            showReflection: true,
            requireReflection: frictionSettings.requireReflection,
          });
        });
      }

      // Both gates disabled — pass through immediately.
      return Promise.resolve(true);
    },
    [
      protectedGateSettings.enabled,
      frictionSettings.enabled,
      frictionSettings.requireReflection,
    ],
  );

  const closeGate = useCallback(() => {
    setGateState(null);
    payloadRef.current = null;
    resolveRef.current = null;
  }, []);

  /** Friction Gate: user applied the change (with reflection text). */
  const onApply = useCallback(
    (reflection: string) => {
      const resolve = resolveRef.current;
      const payload = payloadRef.current;

      if (payload && frictionSettings.logReflections) {
        const entry: FrictionLogEntry = {
          ts: Date.now(),
          actionType: payload.actionType,
          label: payload.label,
          reflection,
          outcome: "applied",
        };
        appendFrictionLog(entry).catch(() => {});
      }

      closeGate();
      resolve?.(true);
    },
    [frictionSettings.logReflections, closeGate],
  );

  /** Friction Gate: user kept protections. */
  const onKeep = useCallback(() => {
    const resolve = resolveRef.current;
    const payload = payloadRef.current;

    if (payload && frictionSettings.logReflections) {
      const entry: FrictionLogEntry = {
        ts: Date.now(),
        actionType: payload.actionType,
        label: payload.label,
        reflection: "",
        outcome: "kept",
      };
      appendFrictionLog(entry).catch(() => {});
    }

    closeGate();
    resolve?.(false);
  }, [frictionSettings.logReflections, closeGate]);

  /** Protected Gate: user confirmed "Apply change" (no reflection text). */
  const onApplyProtected = useCallback(() => {
    const resolve = resolveRef.current;
    closeGate();
    resolve?.(true);
  }, [closeGate]);

  return {
    askFriction,
    gateState,
    gateHandlers: { onApply, onKeep, onApplyProtected },
  };
}
