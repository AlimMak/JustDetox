/**
 * useFrictionGate — manages the FrictionGate modal lifecycle.
 *
 * - Owns the countdown start timestamp (persists across gate re-renders).
 * - Exposes `askFriction(payload)` → Promise<boolean>.
 * - Returns `gateState` (null when closed) for the Options root to render.
 */

import { useCallback, useRef, useState } from "react";
import type { FrictionPayload, FrictionLogEntry } from "../../../core/friction";
import { appendFrictionLog } from "../../../core/friction";
import type { FrictionSettings } from "../../../core/types";
import type { FrictionGateProps } from "../../components/FrictionGate";

export interface ActiveGateState {
  payload: FrictionPayload;
  countdownStartTs: number;
  showReflection: boolean;
  requireReflection: boolean;
}

export interface UseFrictionGateResult {
  /**
   * Call before a protective change.
   * Resolves true = proceed, false = keep protections.
   * When friction is disabled, resolves true immediately.
   */
  askFriction: (payload: FrictionPayload) => Promise<boolean>;
  /** Current gate state — null when gate is closed. */
  gateState: ActiveGateState | null;
  /** Handlers to pass to FrictionGate. */
  gateHandlers: Pick<FrictionGateProps, "onApply" | "onKeep">;
}

export function useFrictionGate(
  frictionSettings: FrictionSettings,
): UseFrictionGateResult {
  const [gateState, setGateState] = useState<ActiveGateState | null>(null);

  // Holds the resolve function for the pending askFriction() promise.
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  // Stores the current payload so handlers can reference it for logging.
  const payloadRef = useRef<FrictionPayload | null>(null);

  const askFriction = useCallback(
    (payload: FrictionPayload): Promise<boolean> => {
      // If friction is globally disabled, let the change through immediately.
      if (!frictionSettings.enabled) return Promise.resolve(true);

      const countdownStartTs = Date.now();
      payloadRef.current = payload;

      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setGateState({
          payload,
          countdownStartTs,
          showReflection: true, // always show reflection step (per spec: default on)
          requireReflection: frictionSettings.requireReflection,
        });
      });
    },
    [frictionSettings.enabled, frictionSettings.requireReflection],
  );

  const closeGate = useCallback(() => {
    setGateState(null);
    payloadRef.current = null;
    resolveRef.current = null;
  }, []);

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
        // Fire-and-forget — logging failure is non-fatal.
        appendFrictionLog(entry).catch(() => {});
      }

      closeGate();
      resolve?.(true);
    },
    [frictionSettings.logReflections, closeGate],
  );

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

  return {
    askFriction,
    gateState,
    gateHandlers: { onApply, onKeep },
  };
}
