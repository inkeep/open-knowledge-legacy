# Evidence: Telemetry, Bundle/CDN, Developer Experience

**Dimension:** Telemetry + Bundle/CDN + DX
**Date:** 2026-04-11
**Sources:** Sentry, PostHog, VS Code/Obsidian privacy docs, electron-vite docs

---

## Key sources
- [Sentry Electron docs](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [Sentry pricing](https://sentry.io/pricing/)
- [Electron crashReporter docs](https://www.electronjs.org/docs/latest/api/crash-reporter)
- [PostHog Electron tutorial](https://posthog.com/tutorials/electron-analytics)
- [Obsidian privacy policy](https://obsidian.md/privacy)
- [electron-vite HMR docs](https://electron-vite.org/guide/hmr-and-hot-reloading)

---

## Telemetry Findings

### Finding: @sentry/electron is the standard — covers JS + native crashes in both processes
**Confidence:** CONFIRMED

Single SDK for main + renderer. Automatically captures JS errors, breadcrumbs, and **native crashes via Crashpad minidumps**. Claude Desktop uses `@sentry/electron ^7.0.0`.

```typescript
// main/index.ts
import * as Sentry from '@sentry/electron/main'

Sentry.init({
  dsn: 'https://...',
  enableNative: true,  // Crashpad integration
  beforeSend(event) {
    // Strip document content, file paths, user identifiers
    return sanitize(event)
  }
})
```

**Pricing:**
- Free: 5K errors/mo (covers early beta)
- Team: $26/mo annual (50K errors, 50 replays, 5M spans)

### Finding: Obsidian model = zero telemetry by default
**Confidence:** CONFIRMED

Obsidian's privacy policy: "Obsidian does not collect any telemetry data." Only network call is an update check, which is disableable. Third-party plugins are contractually prohibited from client-side telemetry.

**This aligns with OK's local-first positioning.** Privacy-forward, matches the AGPL philosophy.

### Finding: VS Code model = opt-out by default, GDPR-contested
**Confidence:** CONFIRMED

VS Code uses `telemetry.telemetryLevel: all | error | crash | off` — opt-out by default, pseudonymized. GDPR compliance is contested (IP addresses are personal data in EU case law).

**For OK:** Don't copy this. Obsidian model is cleaner and aligns with OK's values.

### Finding: Recommended telemetry stance for OK
**Confidence:** INFERRED from OK's positioning

**Tier 1 (ships day 1):** Nothing. Zero telemetry. First-run dialog offers opt-in for:
- Crash reports (Sentry + Crashpad)
- Anonymous usage analytics (PostHog)

**Tier 2 (opt-in, default off):** Session replay with content redaction — only if user explicitly enables for support purposes.

**Never measure:** keystrokes, document content, file paths, clipboard content, collaborator identities.

---

## Bundle & CDN Findings

### Finding: Realistic Electron DMG sizes
**Confidence:** CONFIRMED

| App | DMG size |
|-----|---------:|
| Slack | 287 MB |
| VS Code | 374 MB |
| Codex Desktop | 442 MB |
| Obsidian | 482 MB |
| Claude Desktop | 623 MB |
| Cursor | 804 MB |

Electron baseline (runtime only): ~200 MB. App code adds 50-600 MB depending on dependencies and whether you ship bundled models/fonts.

**For OK:** 250-320 MB target. Users don't feel the difference between 250 MB and 320 MB after first download — both fit in a coffee-break download on modern connections.

**Irrelevant marginal optimizations (skip these):**
- Aggressive minification beyond electron-builder defaults
- Tree-shaking node_modules beyond what webpack does
- Stripping fonts, icons
- Custom Electron builds without unused Chromium features

These save KB-to-MB for massive engineering cost and users cannot tell.

### Finding: CDN cost at OK's scale is ~$0
**Confidence:** CONFIRMED

| Provider | 3 TB/mo cost |
|----------|:------------:|
| GitHub Releases (public repo) | **$0** |
| Cloudflare R2 | ~$15 |
| Bunny CDN | ~$10-30 |
| S3 + CloudFront | ~$261 |

**Users cannot perceive latency difference between CDNs** for single-file DMG downloads from reputable providers. GitHub Releases is the boring correct choice.

### Finding: Differential updates via blockmap
**Confidence:** CONFIRMED

electron-builder generates `.blockmap` alongside each release. Updater downloads only changed blocks. **Realistic savings: 70-90%** — a minor version bump downloads 20-80 MB instead of 300 MB.

electron-delta offers true binary diffing for single-digit MB patches but adds build complexity. **For OK:** blockmap is good enough. Users don't feel the difference between a 30 MB update download and a 5 MB update download when they're downloading in the background.

---

## DX Findings

### Finding: electron-vite gives near-Vite HMR speed
**Confidence:** CONFIRMED

- **Renderer: <500ms HMR** (native Vite)
- Preload: 1-2s window reload
- Main: 2-4s full app restart

**Implication for OK code structure:** Keep main process thin (IPC handlers + native API bridges only). Most edits should only trigger renderer HMR.

### Finding: Main process debugging via --inspect=9229
**Confidence:** CONFIRMED

```bash
electron --inspect=9229 .
```

VS Code launch.json:
```json
{
  "type": "node",
  "request": "attach",
  "port": 9229,
  "name": "Attach to Electron Main"
}
```

Renderer debugging: standard Chrome DevTools via `webContents.openDevTools()`.

### Finding: Post-package smoke test catches production-only bugs
**Confidence:** CONFIRMED

Bugs that only appear in packaged builds, not `electron-vite dev`:
1. ASAR path differences
2. Fuses rejecting post-signing modifications
3. Native `.node` addon signing
4. Hardened runtime restrictions

**Must run a packaged-app smoke test in CI.** Not just unit tests.

### Finding: DevTools in production — env flag escape hatch
**Confidence:** CONFIRMED

```typescript
// Production: DevTools disabled by default
if (process.env.OK_DEBUG === '1' || app.isPackaged === false) {
  mainWindow.webContents.openDevTools()
}

// Support: user runs `OK_DEBUG=1 /Applications/Open\ Knowledge.app/Contents/MacOS/open-knowledge`
// Or: create ~/.open-knowledge/debug sentinel file
```

Keeps security surface small while preserving support escape hatch.
