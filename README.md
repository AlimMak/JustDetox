# JustDetox

A free, open-source Chrome extension (Manifest V3) that blocks or time-limits websites to help you focus.

---

## Features

- **Block mode** — hard-block a site entirely (overlay shown on every visit)
- **Time-limit mode** — allow N minutes per day; block when the quota is exhausted
- Daily usage resets at midnight (local time, via `chrome.alarms`)
- Minimal permissions: `storage`, `tabs`, `alarms` only — no `<all_urls>` host permissions
- Dark theme UI built with React + TypeScript

---

## How to run (development)

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This outputs the unpacked extension to `/dist`.

### Load unpacked in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this repo
5. The JustDetox icon will appear in your toolbar

---

## Project structure

```
src/
  background/   # Service worker (block checks, alarm-based reset)
  content/      # Content script (overlay injection, time tracking)
  shared/       # Shared types, storage helpers, message contracts
  ui/
    popup/      # Toolbar popup (React)
    options/    # Full settings page (React, opens in a tab)
public/
  manifest.json
  icons/
  blocked.html  # Static blocked-page (no React, web-accessible resource)
dist/           # Built output — load this as unpacked extension
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Production build → `dist/` |
| `npm run dev` | Dev server (Vite HMR — for UI iteration only) |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier format |
| `npm run typecheck` | TypeScript type-check without emitting |

---

## Contributing

PRs welcome. Please keep the dark-only theme and minimal permissions philosophy.

---

## License

MIT
