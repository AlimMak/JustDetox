import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings as persistSettings } from "../../../core/storage";
import { DEFAULT_SETTINGS } from "../../../core/types";
import type { Settings } from "../../../core/types";

/**
 * Load settings from storage on mount, keep them in React state, and
 * debounce writes back to storage.
 *
 * State updates are synchronous (responsive UI); the chrome.storage.local
 * write is deferred 400 ms after the last change so we don't hammer storage.
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Mutable ref to always hold the latest settings value for the debounced save.
  const latestRef = useRef<Settings>(DEFAULT_SETTINGS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    getSettings().then((s) => {
      latestRef.current = s;
      setSettingsState(s);
      setLoading(false);
    });
  }, []);

  /**
   * Apply a shallow patch and schedule a debounced save.
   * Accepts either a partial object or an updater function.
   */
  const patch = useCallback(
    (update: Partial<Settings> | ((prev: Settings) => Settings)) => {
      setSettingsState((prev) => {
        const next =
          typeof update === "function"
            ? update(prev)
            : { ...prev, ...update };

        latestRef.current = next;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          persistSettings(latestRef.current).catch(() => {
            // Storage errors are non-fatal for UI; ignore silently.
          });
        }, 400);

        return next;
      });
    },
    [],
  );

  return { settings, loading, patch };
}
