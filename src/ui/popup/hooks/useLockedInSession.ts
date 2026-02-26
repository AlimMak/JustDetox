/**
 * Returns the active Locked In session from storage, or null if no session
 * is running (either inactive or expired by timestamp).
 *
 * Runs once on mount — the popup is short-lived so a single read suffices.
 */

import { useEffect, useState } from "react";
import { getSettings } from "../../../core/storage";
import type { LockedInSession } from "../../../core/types";

export interface UseLockedInSessionResult {
  session: LockedInSession | null;
  loading: boolean;
}

export function useLockedInSession(): UseLockedInSessionResult {
  const [session, setSession] = useState<LockedInSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((s) => {
        const ls = s.lockedInSession;
        if (ls?.active && Date.now() < ls.endTs) {
          setSession(ls);
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return { session, loading };
}
