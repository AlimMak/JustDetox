/**
 * JustDetox Content Script
 *
 * Runs at document_start on every page, but takes action only when
 * the background reports the current hostname is blocked or time-expired.
 *
 * For time-limited sites, pings the background every 30 s with time spent.
 */

import type { CheckUrlMessage, RecordTimeMessage, CheckUrlResponse } from "../shared/messages";

const hostname = location.hostname;
let sessionStart = Date.now();
let timeReportInterval: ReturnType<typeof setInterval> | null = null;

async function checkCurrentSite() {
  const msg: CheckUrlMessage = { type: "CHECK_URL", hostname };

  let response: CheckUrlResponse;
  try {
    response = await chrome.runtime.sendMessage(msg);
  } catch {
    // Extension context may not be ready yet; silently skip.
    return;
  }

  if (!response) return;

  if (response.blocked) {
    showBlockOverlay(response.mode === "time-limit" ? "time" : "hard");
    stopTimeTracking();
  } else if (response.mode === "time-limit") {
    startTimeTracking();
  }
}

function showBlockOverlay(reason: "hard" | "time") {
  if (document.getElementById("justdetox-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "justdetox-overlay";
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
    fontFamily: "'Inter', system-ui, sans-serif",
    gap: "12px",
  });

  const title = document.createElement("h1");
  title.textContent = reason === "time" ? "Time's up" : "Blocked";
  Object.assign(title.style, { margin: "0", fontSize: "2rem", fontWeight: "600" });

  const sub = document.createElement("p");
  sub.textContent =
    reason === "time"
      ? `You've used your daily limit for ${hostname}.`
      : `${hostname} is blocked by JustDetox.`;
  Object.assign(sub.style, { margin: "0", fontSize: "1rem", color: "#888" });

  overlay.append(title, sub);
  document.documentElement.appendChild(overlay);

  // Prevent the page from rendering behind the overlay.
  document.documentElement.style.overflow = "hidden";
}

function startTimeTracking() {
  if (timeReportInterval !== null) return;

  sessionStart = Date.now();

  timeReportInterval = setInterval(() => {
    const elapsed = (Date.now() - sessionStart) / 1000;
    sessionStart = Date.now();

    const msg: RecordTimeMessage = {
      type: "RECORD_TIME",
      hostname,
      seconds: elapsed,
    };
    chrome.runtime.sendMessage(msg).catch(() => {
      // Extension may have been reloaded; stop tracking.
      stopTimeTracking();
    });

    // Re-check if we've hit the limit.
    checkCurrentSite();
  }, 30_000);
}

function stopTimeTracking() {
  if (timeReportInterval !== null) {
    clearInterval(timeReportInterval);
    timeReportInterval = null;
  }
}

// Run check once the DOM is accessible.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkCurrentSite, { once: true });
} else {
  checkCurrentSite();
}
