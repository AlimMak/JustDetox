/**
 * FrictionContext — provides `askFriction()` to any component in the options
 * tree without requiring prop drilling.
 *
 * Usage:
 *   const { askFriction } = useFriction();
 *   const ok = await askFriction({ actionType: "delete-site-rule", label: "twitter.com" });
 *   if (!ok) return; // user kept protections
 *   // apply change
 */

import { createContext, useContext } from "react";
import type { FrictionPayload } from "../../../core/friction";

export interface FrictionContextValue {
  /**
   * Call before applying any protected change.
   * Returns a promise that resolves to:
   *   - `true`  if the user confirmed ("Apply change")
   *   - `false` if the user kept protections or friction is disabled
   *
   * If frictionSettings.enabled === false, resolves immediately to `true`.
   */
  askFriction: (payload: FrictionPayload) => Promise<boolean>;
}

export const FrictionContext = createContext<FrictionContextValue>({
  // Default: pass-through (no-op when used outside provider).
  askFriction: () => Promise.resolve(true),
});

/** Hook to consume the friction context. */
export function useFriction(): FrictionContextValue {
  return useContext(FrictionContext);
}
