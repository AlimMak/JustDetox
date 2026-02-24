import { useEffect, useState } from "react";
import { getSettings, getUsage } from "../../../core/storage";
import { computeBlockedState, resolveEffectivePolicy } from "../../../core/policy";
import { deriveStatus } from "../utils/deriveStatus";

export type SiteMode = "blocked" | "time-limited" | "unrestricted";

export interface SiteStatus {
  loading: boolean;
  error: string | null;
  mode: SiteMode;
  blocked: boolean;
  remainingSeconds: number | null;
  /** Aggregate seconds used in the current window (across configured domain + subdomains). */
  activeSeconds: number;
}

const IDLE_STATUS: SiteStatus = {
  loading: false,
  error: null,
  mode: "unrestricted",
  blocked: false,
  remainingSeconds: null,
  activeSeconds: 0,
};

/**
 * Loads settings + usage from storage and computes the block/limit status for
 * the given hostname. Re-runs whenever the hostname changes.
 */
export function useSiteStatus(hostname: string | null): SiteStatus {
  const [status, setStatus] = useState<SiteStatus>({ ...IDLE_STATUS, loading: hostname !== null });

  useEffect(() => {
    if (hostname === null) {
      setStatus({ ...IDLE_STATUS });
      return;
    }

    setStatus((prev) => ({ ...prev, loading: true, error: null }));

    Promise.all([getSettings(), getUsage()])
      .then(([settings, usage]) => {
        // Master kill-switch: show unrestricted when extension is disabled.
        if (settings.disabled) {
          const activeSeconds = usage[hostname]?.activeSeconds ?? 0;
          setStatus({ loading: false, error: null, mode: "unrestricted", blocked: false, remainingSeconds: null, activeSeconds });
          return;
        }

        const state = computeBlockedState(hostname, usage, settings);
        const policy = resolveEffectivePolicy(hostname, settings);
        const derived = deriveStatus(hostname, state, policy, usage, settings);

        setStatus({ loading: false, error: null, ...derived });
      })
      .catch((err: unknown) => {
        setStatus({
          ...IDLE_STATUS,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load status",
        });
      });
  }, [hostname]);

  return status;
}
