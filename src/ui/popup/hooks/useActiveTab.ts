import { useEffect, useState } from "react";

interface ActiveTabState {
  hostname: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the hostname of the currently active tab.
 *
 * Returns null for non-HTTP pages (chrome://, about:, new tab, etc.)
 * because there is no meaningful site to display status for.
 *
 * Runs once on mount — the popup is short-lived, so re-fetching is not needed.
 */
export function useActiveTab(): ActiveTabState {
  const [state, setState] = useState<ActiveTabState>({
    hostname: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        setState({ hostname: null, loading: false, error: chrome.runtime.lastError.message ?? "Unknown error" });
        return;
      }

      const tab = tabs[0];
      if (!tab?.url) {
        setState({ hostname: null, loading: false, error: null });
        return;
      }

      let hostname: string | null = null;
      try {
        const url = new URL(tab.url);
        // Only track http/https pages — no extension/chrome/about pages
        if (url.protocol === "http:" || url.protocol === "https:") {
          hostname = url.hostname;
        }
      } catch {
        // Malformed URL — treat as no hostname
      }

      setState({ hostname, loading: false, error: null });
    });
  }, []);

  return state;
}
