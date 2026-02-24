# Security Policy

## Supported versions

Only the latest release on the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x (current) | ✓ |

---

## Data storage

JustDetox stores data **exclusively in `chrome.storage.local`**, which is:

- Sandboxed to this extension's origin
- Never synced to any remote server
- Never transmitted outside the browser
- Readable only by this extension and the browser itself

No passwords, no credentials, no personally identifiable information are collected or stored. Usage data (time-on-site counters) and your rule configuration never leave your device.

---

## Permissions rationale

| Permission | Why it is needed |
|------------|-----------------|
| `storage` | Persist blocking rules and per-domain usage counters in `chrome.storage.local` |
| `tabs` | Read the active tab's URL to apply rules; open the options/onboarding page on install |
| `alarms` | Trigger the periodic 30-second usage flush and the daily reset window |

The extension requests **no host permissions** and therefore cannot read, modify, or intercept page content via the background service worker. Content-script injection is handled by the manifest `content_scripts` declaration, not dynamic injection.

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
