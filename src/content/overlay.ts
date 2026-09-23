/**
 * JustDetox Content Script — Blocking Overlay
 *
 * Runs at document_start on every page.
 *
 * Responsibilities:
 *  1. Ask the background whether the current hostname is blocked or delayed.
 *  2. Mount a full-screen block overlay if blocked; unmount it if not.
 *  3. Mount a full-screen delay overlay with a countdown when delayed;
 *     after the countdown, re-check and either allow access or block.
 *  4. Re-check on every SPA navigation (YouTube, Twitter, etc.) by
 *     patching the history API before page scripts load.
 *  5. For time-limited sites: schedule a re-check exactly when the
 *     remaining quota expires so the overlay appears without polling.
 *
 * Design constraints:
 *  - No external stylesheet (inline styles only → no CSP issues, no
 *    extra network requests, no stylesheet flash).
 *  - No redirect — overlay covers the page in-place.
 *  - No bypass controls (no close/snooze/allow buttons, no skip on delay).
 *  - Time tracking is handled entirely by tracker.ts in the service
 *    worker; this script sends no RECORD_TIME messages.
 */

import type {
  CheckUrlContext,
  CheckUrlMessage,
  CheckUrlResponse,
  DelayCompletedMessage,
} from "../shared/messages";

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERLAY_ID = "justdetox-overlay";
const DELAY_OVERLAY_ID = "justdetox-delay-overlay";

/**
 * Extra buffer added to the scheduled re-check timer to account for clock
 * drift and background alarm granularity.
 */
const RECHECK_BUFFER_MS = 2_000;

// ─── Shared styles ────────────────────────────────────────────────────────────

const BASE_OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
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
  webkitUserSelect: "none",
};

// ─── Block overlay DOM ────────────────────────────────────────────────────────

/**
 * Inject the block overlay with the given block message and optional subtitle.
 * Idempotent — calling a second time before unmounting is a no-op.
 */
function mountOverlay(
  hostname: string,
  message: string,
  subtitle?: string,
  source?: string,
  nextChangeLabel?: string,
  nextCheckTs?: number,
): void {
  const existing = document.getElementById(OVERLAY_ID);
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-label", `JustDetox blocked ${hostname}`);
  Object.assign(overlay.style, BASE_OVERLAY_STYLE);

  const site = document.createElement("p");
  site.textContent = hostname;
  Object.assign(site.style, {
    margin: "0 0 20px",
    fontSize: "0.8rem",
    color: "#9ca3af",
    letterSpacing: "0.06em",
    overflowWrap: "anywhere",
    maxWidth: "min(90vw, 480px)",
  });
  overlay.appendChild(site);

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

  if (subtitle) {
    const sub = document.createElement("p");
    sub.textContent = subtitle;
    Object.assign(sub.style, {
      margin: "12px 0 0",
      fontSize: "0.75rem",
      fontWeight: "400",
      color: "#6b7280",
      letterSpacing: "0.04em",
      textAlign: "center",
    });
    overlay.appendChild(sub);
  }

  if (source) {
    const reason = document.createElement("p");
    reason.textContent = `Why: ${source}`;
    Object.assign(reason.style, {
      margin: "24px 0 0",
      fontSize: "0.85rem",
      color: "#c4cbd4",
      textAlign: "center",
      padding: "0 24px",
    });
    overlay.appendChild(reason);
  }

  const next = document.createElement("p");
  const validTime = nextCheckTs !== undefined && Number.isFinite(nextCheckTs) && nextCheckTs > Date.now();
  next.textContent = validTime && nextChangeLabel
    ? `${nextChangeLabel}: ${new Date(nextCheckTs).toLocaleString(undefined, {
        weekday: "short", hour: "numeric", minute: "2-digit",
      })}`
    : "No scheduled end. Change this rule in JustDetox settings.";
  Object.assign(next.style, {
    margin: "10px 0 0",
    fontSize: "0.75rem",
    color: "#9ca3af",
    textAlign: "center",
    padding: "0 24px",
  });
  overlay.appendChild(next);

  attachInteractionBlock(overlay);
  if (existing) existing.replaceWith(overlay);
  else document.documentElement.appendChild(overlay);
  applyScrollLock();
}

function unmountOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
  if (!document.getElementById(DELAY_OVERLAY_ID)) releaseScrollLock();
}

// ─── Delay overlay DOM ────────────────────────────────────────────────────────

let delayTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Mount the delay overlay and count down from `seconds`.
 * After the countdown reaches zero the overlay is removed and
 * A completed delay is remembered for this document's hostname so a
 * settings/usage refresh does not restart the countdown.
 *
 * Idempotent — any existing delay overlay (and its timer) is replaced.
 */
function mountDelayOverlay(hostname: string, seconds: number): void {
  unmountDelayOverlay();

  const overlay = document.createElement("div");
  overlay.id = DELAY_OVERLAY_ID;
  Object.assign(overlay.style, BASE_OVERLAY_STYLE);

  // Site hostname (small, muted)
  const siteLabel = document.createElement("p");
  siteLabel.textContent = hostname;
  Object.assign(siteLabel.style, {
    margin: "0 0 24px",
    fontSize: "0.8rem",
    fontWeight: "400",
    letterSpacing: "0.08em",
    color: "#6b7280",
    textTransform: "lowercase",
  });

  // Countdown number (large, monospace)
  const countEl = document.createElement("p");
  countEl.textContent = String(seconds);
  Object.assign(countEl.style, {
    margin: "0 0 20px",
    fontSize: "3.5rem",
    fontWeight: "300",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#e5e5e5",
    letterSpacing: "-0.02em",
    lineHeight: "1",
  });

  // Subtitle
  const subtitle = document.createElement("p");
  subtitle.textContent = "Pause before you proceed.";
  Object.assign(subtitle.style, {
    margin: "0",
    fontSize: "0.75rem",
    fontWeight: "400",
    color: "#6b7280",
    letterSpacing: "0.04em",
  });

  overlay.appendChild(siteLabel);
  overlay.appendChild(countEl);
  overlay.appendChild(subtitle);
  attachInteractionBlock(overlay);
  document.documentElement.appendChild(overlay);
  applyScrollLock();

  let remaining = seconds;

  delayTimer = setInterval(() => {
    remaining--;
    countEl.textContent = String(remaining);

    if (remaining <= 0) {
      clearInterval(delayTimer!);
      delayTimer = null;
      unmountDelayOverlay();
      // Notify background so it can credit the delay-completion bonus.
      const msg: DelayCompletedMessage = { type: "DELAY_COMPLETED" };
      void chrome.runtime.sendMessage(msg);
      delaySatisfiedHost = hostname;
      checkCurrentUrl("refresh");
    }
  }, 1_000);
}

function unmountDelayOverlay(): void {
  if (delayTimer !== null) {
    clearInterval(delayTimer);
    delayTimer = null;
  }
  document.getElementById(DELAY_OVERLAY_ID)?.remove();
  if (!document.getElementById(OVERLAY_ID)) releaseScrollLock();
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Attach capture-phase handlers to prevent all interaction through the overlay. */
function attachInteractionBlock(el: HTMLElement): void {
  const block = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  el.addEventListener("click", block, true);
  el.addEventListener("contextmenu", block, true);
  el.addEventListener("keydown", block, true);
  el.addEventListener("keyup", block, true);
  el.addEventListener("wheel", block, { capture: true, passive: false });
  el.addEventListener("touchmove", block, { capture: true, passive: false });
  el.addEventListener("touchstart", block, { capture: true, passive: false });
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

function releaseScrollLock(): void {
  document.documentElement.style.overflow = "";
  if (document.body) document.body.style.overflow = "";
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentHostname: string = location.hostname;
let isOverlayVisible: boolean = false;
let isDelayOverlayVisible: boolean = false;
let checkInFlight: boolean = false;
let pendingCheck: CheckUrlContext | null = null;
let nextCheckTimer: ReturnType<typeof setTimeout> | null = null;
let delaySatisfiedHost: string | null = null;

// ─── Background communication ─────────────────────────────────────────────────

function scheduleNextCheck(response: CheckUrlResponse): void {
  const now = Date.now();
  const candidates: number[] = [];
  if (response.nextCheckTs !== undefined && response.nextCheckTs > now) {
    candidates.push(response.nextCheckTs - now + 100);
  }
  if (response.mode === "time-limit" && !response.blocked &&
      (response.remainingSeconds ?? 0) > 0) {
    candidates.push(response.remainingSeconds! * 1_000 + RECHECK_BUFFER_MS);
  }
  if (candidates.length > 0) {
    nextCheckTimer = setTimeout(() => checkCurrentUrl("refresh"), Math.min(...candidates));
  }
}

async function performCheck(context: CheckUrlContext): Promise<void> {
  // Clear any pending scheduled re-check; this response will schedule a new one.
  if (nextCheckTimer !== null) {
    clearTimeout(nextCheckTimer);
    nextCheckTimer = null;
  }

  const hostname = location.hostname;
  const msg: CheckUrlMessage = { type: "CHECK_URL", hostname, context };

  let response: CheckUrlResponse | null | undefined;
  try {
    response = await chrome.runtime.sendMessage(msg);
  } catch {
    // Extension context may not be ready (just installed) or was invalidated
    // (extension updated). Silently skip — the next navigation will retry.
  }

  if (!response) return;
  if (hostname !== location.hostname) {
    pendingCheck = "navigation";
    return;
  }
  scheduleNextCheck(response);

  // ── Delay Mode ──────────────────────────────────────────────────────────────
  if (response.delayed && response.delaySeconds && delaySatisfiedHost !== hostname) {
    // Site is accessible but requires a countdown first.
    if (isDelayOverlayVisible) return; // retain the countdown already in progress
    isDelayOverlayVisible = true;
    isOverlayVisible = false;
    unmountOverlay();
    mountDelayOverlay(hostname, response.delaySeconds);
    return;
  }

  // ── Block overlay ───────────────────────────────────────────────────────────
  if (response.blocked && response.message) {
    isDelayOverlayVisible = false;
    isOverlayVisible = true;
    unmountDelayOverlay();
    mountOverlay(
      hostname,
      response.message,
      response.subtitle,
      response.source,
      response.nextChangeLabel,
      response.nextCheckTs,
    );
    return;
  }

  // ── Access allowed ──────────────────────────────────────────────────────────
  isDelayOverlayVisible = false;
  isOverlayVisible = false;
  unmountDelayOverlay();
  unmountOverlay();
}

/** Serialize checks so rapid changes cannot leave an old response on screen. */
function checkCurrentUrl(context: CheckUrlContext = "refresh"): void {
  if (checkInFlight) {
    if (pendingCheck !== "navigation") pendingCheck = context;
    return;
  }
  checkInFlight = true;
  void performCheck(context)
    .catch(() => {})
    .finally(() => {
      checkInFlight = false;
      if (pendingCheck !== null) {
        const next = pendingCheck;
        pendingCheck = null;
        checkCurrentUrl(next);
      }
    });
}

// ─── SPA navigation detection ─────────────────────────────────────────────────

function onUrlChange(): void {
  const newHostname = location.hostname;

  // Re-check when:
  //  a) the hostname changed, OR
  //  b) either overlay is visible (navigating on a blocked/delayed domain
  //     should re-validate).
  if (newHostname !== currentHostname || isOverlayVisible || isDelayOverlayVisible) {
    if (newHostname !== currentHostname) delaySatisfiedHost = null;
    currentHostname = newHostname;
    checkCurrentUrl("navigation");
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

// Rule edits and usage updates should affect a tab that is already open.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.jd_settings || changes.jd_usage)) {
    checkCurrentUrl("refresh");
  }
});

// Timers can be throttled while the tab is hidden or restored from back/forward
// cache. Recheck when it becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkCurrentUrl("refresh");
});
window.addEventListener("pageshow", () => checkCurrentUrl("refresh"));

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Immediate check — chrome.runtime is available at document_start.
checkCurrentUrl("navigation");

// Also check at DOMContentLoaded to catch cases where the initial check
// failed because the extension context wasn't ready yet.
document.addEventListener("DOMContentLoaded", () => {
  if (!isOverlayVisible && !isDelayOverlayVisible) checkCurrentUrl("refresh");
}, { once: true });
