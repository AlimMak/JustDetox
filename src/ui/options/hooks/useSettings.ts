import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, setSettings as persistSettings } from "../../../core/storage";
import { DEFAULT_SETTINGS } from "../../../core/types";
import type { Settings } from "../../../core/types";
import { settingsSchema } from "../../../core/validation";

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
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  const commit = useCallback((value: Settings): Promise<void> => {
    const next = writeChain.current.catch(() => {}).then(() => persistSettings(value));
    writeChain.current = next;
    return next;
  }, []);

  // Initial load
  useEffect(() => {
    getSettings().then((s) => {
      latestRef.current = s;
      setSettingsState(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local" || !changes.jd_settings || timerRef.current) return;
      const parsed = settingsSchema.safeParse(changes.jd_settings.newValue);
      if (!parsed.success) return;
      const next = parsed.data as Settings;
      latestRef.current = next;
      setSettingsState(next);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const reload = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    await writeChain.current.catch(() => {});
    const fresh = await getSettings();
    latestRef.current = fresh;
    setSettingsState(fresh);
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      await commit(latestRef.current);
    } else {
      await writeChain.current;
    }
  }, [commit]);

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
          timerRef.current = null;
          void commit(latestRef.current).catch(() => {
            // Storage errors are non-fatal for UI; ignore silently.
          });
        }, 400);

        return next;
      });
    },
    [commit],
  );

  return { settings, loading, patch, reload, flush };
}
