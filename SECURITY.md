# Security Policy

## Supported versions

Only the latest release on the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.3.x (current) | ✓ |

---

## Data storage

By default, JustDetox stores data in `chrome.storage.local`, which is:

- Sandboxed to this extension's origin
- Readable only by this extension and the browser itself

Usage data, daily history, reflections, and active focus sessions remain local. If you explicitly turn on settings sync, Chrome Sync stores your rules, goals, and focus presets under the browser account; JustDetox has no separate server or telemetry. Exported backup files are handled by your browser and saved where you choose.

---

## Permissions rationale

| Permission | Why it is needed |
|------------|-----------------|
| `storage` | Persist blocking rules, usage counters, and local progress in `chrome.storage.local` |
| `tabs` | Read the active tab's URL to apply rules; open the options/onboarding page on install |
| `alarms` | Trigger the one-minute usage flush and focus-session expiry checks |
| `idle` | Detect screen lock and optional five-minute device inactivity |
| `declarativeNetRequestWithHostAccess` and optional `<all_urls>` host access | Apply pre-load redirects to blocked page and iframe navigations |

Host access is optional and requested only when pre-load blocking is enabled. Content scripts still match `<all_urls>`, so Chrome may display a broad site-access notice. The scripts inspect page URLs and insert blocking overlays or iframe placeholders; the background service worker does not inspect page content.

---

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Instead, use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) for this repository.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You will receive a response within 72 hours. We aim to publish a fix within 14 days of confirmation.

---

## Threat model

JustDetox is a **client-side only** extension. Its threat surface is limited to:

- **Malicious import files** — validated through Zod schemas before any data is written; malformed JSON or schema violations are rejected with user-visible errors.
- **XSS via domain names** — all domain inputs are sanitised through `sanitizeDomain()` and validated via `isValidDomain()` before storage; React's JSX auto-escaping handles display.
- **chrome.storage tampering** — the extension re-validates all data read from storage through Zod schemas on every read; corrupted or externally modified data is rejected and reset to safe defaults.
