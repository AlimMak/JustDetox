/**
 * JustDetox Content Script — Blocking Overlay
 *
 * Runs at document_start on every page.
 *
 * Responsibilities:
 *  1. Ask the background whether the current hostname is blocked.
 *  2. Mount a full-screen overlay if blocked; unmount it if not.
 *  3. Re-check on every SPA navigation (YouTube, Twitter, etc.) by
 *     patching the history API before page scripts load.
 *  4. For time-limited sites: schedule a re-check exactly when the
 *     remaining quota expires so the overlay appears without polling.
 *
 * Design constraints:
 *  - No external stylesheet (inline styles only → no CSP issues, no
 *    extra network requests, no stylesheet flash).
 *  - No redirect — overlay covers the page in-place.
 *  - No bypass controls (no close/snooze/allow buttons).
 *  - Time tracking is handled entirely by tracker.ts in the service
 *    worker; this script sends no RECORD_TIME messages.
 */

import type { CheckUrlMessage, CheckUrlResponse } from "../shared/messages";

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERLAY_ID = "justdetox-overlay";

/**
 * Extra buffer added to the scheduled re-check timer to account for clock
 * drift and background alarm granularity.
 */
const RECHECK_BUFFER_MS = 2_000;

// ─── Overlay DOM ──────────────────────────────────────────────────────────────

/**
 * Inject the overlay with the given block message.
 * Idempotent — calling a second time before unmounting is a no-op.
 */
function mountOverlay(message: string): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;

  // Inline styles only. position:fixed + max z-index covers the viewport.
  // pointer-events:all captures every click/touch so nothing bleeds through.
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "#0a0a0a",
    color: "#e5e5e5",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    pointerEvents: "all",
    userSelect: "none",
    WebkitUserSelect: "none",
  });

  const msg = document.createElement("p");
  msg.textContent = message;
  Object.assign(msg.style, {
    margin: "0",
    fontSize: "1.2rem",
    fontWeight: "500",
    letterSpacing: "0.015em",
    textAlign: "center",
    maxWidth: "480px",
    padding: "0 24px",
    color: "#e5e5e5",
  });

  overlay.appendChild(msg);

  // Intercept every interaction at the capture phase so they never reach
  // the underlying page. passive:false lets us call preventDefault().
  const block = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  overlay.addEventListener("click", block, true);
  overlay.addEventListener("contextmenu", block, true);
  overlay.addEventListener("keydown", block, true);
  overlay.addEventListener("keyup", block, true);
  overlay.addEventListener("wheel", block, { capture: true, passive: false });
  overlay.addEventListener("touchmove", block, { capture: true, passive: false });
  overlay.addEventListener("touchstart", block, { capture: true, passive: false });

  // Attach to <html> — available at document_start even before <body> is parsed.
  document.documentElement.appendChild(overlay);

  // Prevent page scroll. If <body> isn't ready yet, apply when it appears.
  applyScrollLock();
}

function unmountOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
  document.documentElement.style.overflow = "";
  if (document.body) document.body.style.overflow = "";
}

function applyScrollLock(): void {
  document.documentElement.style.overflow = "hidden";
  if (document.body) {
    document.body.style.setProperty("overflow", "hidden", "important");
  } else {
    // <body> isn't parsed yet — watch for it.
    const observer = new MutationObserver(() => {
      if (document.body) {
        document.body.style.setProperty("overflow", "hidden", "important");
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentHostname: string = location.hostname;
let isOverlayVisible: boolean = false;
let checkInFlight: boolean = false;
let nextCheckTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Background communication ─────────────────────────────────────────────────

async function checkCurrentUrl(): Promise<void> {
  // Guard against concurrent checks triggered by rapid SPA navigations.
  if (checkInFlight) return;
  checkInFlight = true;

  // Clear any pending scheduled re-check (it will be rescheduled below if needed).
  if (nextCheckTimer !== null) {
    clearTimeout(nextCheckTimer);
    nextCheckTimer = null;
  }

  const hostname = location.hostname;
  const msg: CheckUrlMessage = { type: "CHECK_URL", hostname };

  let response: CheckUrlResponse | null | undefined;
  try {
    response = await chrome.runtime.sendMessage(msg);
  } catch {
    // Extension context may not be ready (just installed) or was invalidated
    // (extension updated). Silently skip — the next navigation will retry.
  } finally {
    checkInFlight = false;
  }

  if (!response) return;

  if (response.blocked && response.message) {
    isOverlayVisible = true;
    mountOverlay(response.message);
  } else {
    isOverlayVisible = false;
    unmountOverlay();

    // For time-limited sites: schedule a re-check at the moment the quota
    // expires, so the overlay appears without needing the user to navigate.
    if (response.mode === "time-limit" && (response.remainingSeconds ?? 0) > 0) {
      const delayMs = (response.remainingSeconds! + RECHECK_BUFFER_MS / 1_000) * 1_000;
      nextCheckTimer = setTimeout(checkCurrentUrl, delayMs);
    }
  }
}

// ─── SPA navigation detection ─────────────────────────────────────────────────

function onUrlChange(): void {
  const newHostname = location.hostname;

  // Always re-check when:
  //  a) the hostname changed (cross-origin SPA nav is impossible, but
  //     re-checking keeps the logic simple and future-proof), OR
  //  b) the overlay is visible (navigating away from the current path on a
  //     blocked domain should re-validate in case path-based rules are added).
  if (newHostname !== currentHostname || isOverlayVisible) {
    currentHostname = newHostname;
    checkCurrentUrl();
  }
}

/**
 * Patch the History API before page scripts run (we're at document_start).
 * This catches single-page navigations on YouTube, Twitter/X, Reddit, etc.
 */
const nativePushState = history.pushState.bind(history);
const nativeReplaceState = history.replaceState.bind(history);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
history.pushState = function (data: any, unused: string, url?: string | URL | null) {
  nativePushState(data, unused, url);
  onUrlChange();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
  nativeReplaceState(data, unused, url);
  onUrlChange();
};

window.addEventListener("popstate", onUrlChange);
window.addEventListener("hashchange", onUrlChange);

// YouTube-specific navigation event (belt-and-suspenders alongside pushState patch).
window.addEventListener("yt-navigate-finish", onUrlChange);

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Immediate check — chrome.runtime is available at document_start.
checkCurrentUrl();

// Also check at DOMContentLoaded to catch cases where the initial check
// failed because the extension context wasn't ready yet.
document.addEventListener("DOMContentLoaded", () => {
  if (!isOverlayVisible) checkCurrentUrl();
}, { once: true });
