/**
 * JustDetox — Locked In Mode background helpers.
 *
 * `checkLockedInExpiry` is called from the tracker's alarm tick (every ~1 min).
 * When the session's endTs has passed it deactivates the session in storage,
 * which causes subsequent CHECK_URL calls to resume normal rule evaluation.
 */

import { getSettings, setSettings } from "../core/storage";

/**
 * Check whether the active Locked In session has expired and, if so,
 * mark it as inactive in storage.
 *
 * Called from the `jd-tick` alarm handler in tracker.ts.
 * No-op when no session is active.
 */
export async function checkLockedInExpiry(): Promise<void> {
  const settings = await getSettings();
  const session = settings.lockedInSession;

  if (!session?.active) return;
  if (Date.now() < session.endTs) return;

  await setSettings({
    ...settings,
    lockedInSession: { ...session, active: false },
  });
}
