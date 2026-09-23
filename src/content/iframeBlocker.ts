/**
 * JustDetox Content Script — Embedded Content (iframe) Blocker
 *
 * Runs at document_idle on every page.
 *
 * Responsibilities:
 *  1. Scan all <iframe> elements present in the DOM on load.
 *  2. For each iframe, extract its src hostname and ask the background
 *     whether that domain is blocked (reusing the existing CHECK_URL flow).
 *  3. Replace blocked iframes with a styled placeholder element.
 *  4. Watch for dynamically added iframes (JS frameworks, lazy-load) via
 *     MutationObserver and apply the same check.
 *  5. Watch for src attribute changes on existing iframes and re-check.
 *  6. Re-check live embeds when rules or usage change, and restore embeds
 *     when they become allowed again.
 *
 * Design constraints:
 *  - Inline styles only (same as overlay.ts) — no CSP issues, no flash.
 *  - No cross-origin DOM access — only the iframe.src attribute is read.
 *  - Delay mode iframes are blocked immediately (never show countdown for
 *    embedded content; per spec requirement §10).
 *  - The CHECK_URL message is reused — no new message type needed.
 */

import type { CheckUrlMessage, CheckUrlResponse } from "../shared/messages";

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCKED_FRAME_CLASS = "justdetox-blocked-frame";

/**
 * Data attribute set on iframes once they have been checked.
 * The in-memory frame state prevents duplicate requests while allowing
 * settings and usage changes to re-check an existing embed.
 */
const CHECKED_ATTR = "data-jd-checked";

interface TrackedFrame {
  placeholder: HTMLDivElement | null;
  checkedSrc: string | null;
  generation: number;
}

/** Keep the original iframe so a lifted block can restore it. */
const trackedFrames = new Map<HTMLIFrameElement, TrackedFrame>();

// ─── Domain extraction ────────────────────────────────────────────────────────

/**
 * Extract the hostname from an iframe src URL.
 *
 * Returns `null` for non-HTTP schemes (blob:, javascript:, about:, data:, etc.)
 * or for malformed/empty URLs — these are safe to leave alone.
 *
 * Does NOT strip www. — the background's computeBlockedState handles
 * normalization internally (via normalizeHostname), so the raw hostname
 * is the correct input for CHECK_URL.
 *
 * @example
 *   extractIframeDomain("https://www.youtube.com/embed/abc") → "www.youtube.com"
 *   extractIframeDomain("blob:https://example.com/uuid")     → null
 *   extractIframeDomain("about:blank")                       → null
 *   extractIframeDomain("")                                  → null
 */
export function extractIframeDomain(src: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname || null;
  } catch {
    return null;
  }
}

// ─── Placeholder DOM ──────────────────────────────────────────────────────────

/**
 * Build a styled placeholder <div> that replaces a blocked iframe.
 * Matches the monochrome design language used by the main block overlay.
 *
 * Dimensions are preserved from the original iframe when available so that
 * page layout is not disrupted.
 */
export function buildBlockedPlaceholder(width: number, height: number): HTMLDivElement {
  const div = document.createElement("div");
  div.className = BLOCKED_FRAME_CLASS;

  Object.assign(div.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: width > 0 ? `${width}px` : "100%",
    height: height > 0 ? `${height}px` : "120px",
    background: "#000",
    color: "#aaa",
    padding: "16px",
    fontSize: "13px",
    textAlign: "center",
    border: "1px solid #222",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    userSelect: "none",
    webkitUserSelect: "none",
  });

  const msg = document.createElement("span");
  msg.textContent = "Embedded content blocked.";
  div.appendChild(msg);

  const sub = document.createElement("span");
  sub.textContent = "Lock back in.";
  Object.assign(sub.style, {
    display: "block",
    marginTop: "6px",
    fontSize: "11px",
    color: "#666",
    letterSpacing: "0.04em",
  });
  div.appendChild(sub);

  return div;
}

// ─── Background check ─────────────────────────────────────────────────────────

/**
 * Ask the background service worker whether `hostname` should be blocked.
 *
 * Reuses the existing CHECK_URL message — the background applies the full
 * rule engine including allowlist mode, locked-in mode, schedules, etc.
 *
 * Per requirement §10: delay mode → block immediately for embedded content.
 * A `delayed` response is treated as `blocked` here.
 */
async function shouldBlockDomain(hostname: string): Promise<boolean | null> {
  const msg: CheckUrlMessage = { type: "CHECK_URL", hostname, context: "iframe" };
  try {
    const response: CheckUrlResponse | null | undefined =
      await chrome.runtime.sendMessage(msg);
    if (!response) return null;
    // Delay mode: block embedded content instead of showing a countdown.
    return response.blocked || (response.delayed ?? false);
  } catch {
    // Keep the current state when the extension context is unavailable.
    return null;
  }
}

// ─── Iframe processing ────────────────────────────────────────────────────────

/**
 * Check a single iframe and replace it with a blocked placeholder if the
 * background says its domain should be blocked.
 *
 * Idempotent — iframes are marked with CHECKED_ATTR after the first check
 * to prevent duplicate async requests from concurrent observer callbacks.
 */
export async function processIframe(iframe: HTMLIFrameElement, force = false): Promise<void> {
  const src = iframe.getAttribute("src") ?? iframe.src ?? "";
  let state = trackedFrames.get(iframe);
  if (!state) {
    state = { placeholder: null, checkedSrc: null, generation: 0 };
    trackedFrames.set(iframe, state);
  }
  if (!force && state.checkedSrc === src) return;
  state.checkedSrc = src;
  const generation = ++state.generation;
  iframe.setAttribute(CHECKED_ATTR, "1");

  const hostname = extractIframeDomain(src);
  if (!hostname) {
    if (state.placeholder?.parentNode) {
      state.placeholder.parentNode.replaceChild(iframe, state.placeholder);
      state.placeholder = null;
    }
    return;
  }

  const blocked = await shouldBlockDomain(hostname);
  // An older response must not replace an iframe whose src changed meanwhile.
  if (blocked === null || state.generation !== generation ||
      (iframe.getAttribute("src") ?? iframe.src ?? "") !== src) return;

  if (!blocked) {
    if (state.placeholder?.parentNode) {
      state.placeholder.parentNode.replaceChild(iframe, state.placeholder);
      state.placeholder = null;
    }
    return;
  }
  if (state.placeholder?.parentNode || !iframe.parentNode) return;

  // Capture dimensions before removing the element from the DOM.
  const width = iframe.offsetWidth > 0
    ? iframe.offsetWidth
    : parseInt(iframe.getAttribute("width") ?? "0", 10);
  const height = iframe.offsetHeight > 0
    ? iframe.offsetHeight
    : parseInt(iframe.getAttribute("height") ?? "0", 10);

  const placeholder = buildBlockedPlaceholder(width, height);
  iframe.parentNode.replaceChild(placeholder, iframe);
  state.placeholder = placeholder;
}

/** Recheck live embeds when rules or the active time budget change. */
export function recheckTrackedFrames(): void {
  for (const [iframe, state] of trackedFrames) {
    if (!iframe.isConnected && !state.placeholder?.isConnected) {
      trackedFrames.delete(iframe);
      continue;
    }
    void processIframe(iframe, true);
  }
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

/**
 * Scan a subtree root for iframe elements and process each one.
 * Also checks the root itself if it is an iframe.
 */
function scanSubtree(root: Element): void {
  if (root.tagName === "IFRAME") {
    void processIframe(root as HTMLIFrameElement);
  }
  root.querySelectorAll("iframe").forEach((el) => {
    void processIframe(el as HTMLIFrameElement);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Start the iframe blocker:
 *  1. Scan all existing iframes in the document.
 *  2. Observe the DOM for new iframes (childList + subtree).
 *  3. Observe src attribute changes on any element (attributeFilter: ["src"]).
 */
export function initIframeBlocker(): void {
  // Initial scan.
  document.querySelectorAll("iframe").forEach((el) => {
    void processIframe(el as HTMLIFrameElement);
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          scanSubtree(node as Element);
        }
      } else if (
        mutation.type === "attributes" &&
        mutation.attributeName === "src"
      ) {
        const target = mutation.target;
        if (
          target.nodeType === Node.ELEMENT_NODE &&
          (target as Element).tagName === "IFRAME"
        ) {
          void processIframe(target as HTMLIFrameElement);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.jd_settings || changes.jd_usage)) {
      recheckTrackedFrames();
    }
  });

  // A schedule may change while a tab is hidden and no usage write occurs.
  // Check again when the page returns to view or from the back-forward cache.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recheckTrackedFrames();
  });
  window.addEventListener("pageshow", recheckTrackedFrames);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

// Guard: only auto-init in a browser context (not in unit tests / Node.js).
if (typeof document !== "undefined") {
  initIframeBlocker();
}
