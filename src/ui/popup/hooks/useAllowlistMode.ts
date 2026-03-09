import { useEffect, useState } from "react";
import { getSettings } from "../../../core/storage";
import type { AllowlistMode } from "../../../core/types";
import { DEFAULT_ALLOWLIST_MODE } from "../../../core/types";

/**
 * Read-only hook that loads the Allowlist Mode state from storage.
 * Suitable for the popup, which only displays status and navigates to Settings
 * for editing (no writes from popup).
 */
export function useAllowlistMode(): { allowlistMode: AllowlistMode; loading: boolean } {
  const [allowlistMode, setAllowlistMode] = useState<AllowlistMode>(DEFAULT_ALLOWLIST_MODE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setAllowlistMode(s.allowlistMode ?? DEFAULT_ALLOWLIST_MODE);
      })
      .catch(() => {
        // Storage unavailable — fall back to default (mode stays disabled).
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { allowlistMode, loading };
}
