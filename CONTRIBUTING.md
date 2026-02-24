# Contributing to JustDetox

Thanks for your interest in contributing. JustDetox is a focused, minimal tool — contributions should preserve that spirit.

---

## Design philosophy

- **Minimal permissions** — never request more than `storage`, `tabs`, `alarms`. Justify any addition in the PR description.
- **No telemetry or remote calls** — all data stays in the browser. No analytics, no phone-home, no remote config.
- **Dark theme only** — the UI is intentionally dark monochrome (`#0a0a0a` base). No light mode, no colour themes.
- **Small files, single responsibility** — keep files under ~400 lines. Extract utilities rather than growing existing files.

---

## Getting started

```bash
git clone https://github.com/AlimMak/JustDetox.git
cd JustDetox
npm install
npm run build      # build → dist/
npm test           # run unit tests
```

Load `dist/` as an unpacked extension in Chrome (`chrome://extensions → Load unpacked`).

---

## Before you open a PR

- [ ] `npm run build` completes without errors
- [ ] `npm test` passes (80 tests, ≥ 80 % coverage)
- [ ] `npm run lint` produces no new warnings
- [ ] `npm run typecheck` passes with zero type errors
- [ ] No new `console.log` / `console.debug` added (use `console.warn`/`console.error` for genuine errors only, with `// eslint-disable-next-line no-console`)
- [ ] No new permissions added to `manifest.json` without discussion in the issue/PR

---

## Code conventions

| Area | Convention |
|------|-----------|
| Language | TypeScript strict mode |
| Formatting | Prettier (auto via `npm run format`) |
| Linting | ESLint (`npm run lint`) |
| Immutability | Always spread/copy — never mutate objects in-place |
| Validation | Zod schemas at storage boundaries; `sanitizeDomain` for all user input |
| Tests | Vitest; unit tests in `src/**/__tests__/` co-located with source |

---

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add custom reset interval per group
fix: overlay not dismissed on back-navigation
chore: update dependencies
docs: add manual test checklist
```

---

## Reporting bugs

Open an issue with:
1. Chrome version and OS
2. Extension version (visible in `chrome://extensions`)
3. Steps to reproduce
4. Expected vs actual behaviour

For security vulnerabilities, see [SECURITY.md](SECURITY.md).
