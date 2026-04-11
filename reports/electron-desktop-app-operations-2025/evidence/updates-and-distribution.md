# Evidence: Auto-Update & Distribution

**Dimension:** Auto-Update Infrastructure + Distribution Channels
**Date:** 2026-04-11
**Sources:** electron-builder docs, Electron docs, real app inspection

---

## Key sources
- [electron-builder Auto Update](https://www.electron.build/auto-update.html)
- [Electron Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [GitHub Releases rate limits](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)
- [electron-builder issue #3499 — staged rollouts](https://github.com/electron-userland/electron-builder/issues/3499)
- [ToDesktop](https://www.todesktop.com/)
- [Doyensec ElectronSafeUpdater](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html)

---

## Findings

### Finding: electron-updater is the de facto standard — use it
**Confidence:** CONFIRMED

Built into electron-builder. Cross-platform (including Linux, which the built-in `autoUpdater` doesn't support). Differential downloads via blockmap. Code signature validation. Progress events. Staged rollouts.

```typescript
// main/index.ts
import { autoUpdater } from 'electron-updater'

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify()
  // Default: check on app start, notify user when ready
})
```

### Finding: GitHub Releases is the boring correct choice
**Confidence:** CONFIRMED

- **Free for public repos, unlimited bandwidth** (2 GB per file max)
- Direct `releases/download/...` URLs served from a CDN, not subject to API rate limits for end-users
- Native `github` provider in electron-builder
- No infrastructure to maintain

**Known issue:** Intermittent 403 Forbidden errors on asset downloads documented in July 2025 (community discussion #166304, Azure-side change). electron-updater has retry logic but gets noisy.

**Private repo:** Must set `GH_TOKEN`, all update checks hit authenticated API (5000 req/hr/user). May hit limits at scale.

**For OK:** Public repo → GitHub Releases. No reason to pay for CDN bandwidth. Users don't perceive the difference between GitHub's CDN and CloudFront.

### Finding: Install-on-quit is the pattern that respects users' work
**Confidence:** CONFIRMED

Default electron-updater behavior:
1. Check for updates on launch
2. If update available, download in background
3. When download complete, call `autoUpdater.quitAndInstall()` — immediately quits and installs

**The better pattern (used by Obsidian, Claude Desktop):**
1. Check for updates on launch
2. Download in background silently
3. When download complete, set a flag: "update ready"
4. On app quit (user closes app normally), install the update
5. Next launch = new version, zero interruption

```typescript
// Better pattern
autoUpdater.autoInstallOnAppQuit = true  // default in recent versions
autoUpdater.on('update-downloaded', () => {
  // Don't prompt, don't interrupt. User will get it next time they quit.
})

app.on('before-quit', () => {
  // autoUpdater handles install on quit automatically
})
```

**Anti-pattern:** Slack and VS Code show "Restart now to update" banners. Users hate this. Don't copy it.

### Finding: Staged rollouts via `stagingPercentage` in latest.yml
**Confidence:** CONFIRMED

electron-updater reads `stagingPercentage` from the published manifest:

```yaml
# latest-mac.yml (edit AFTER publishing)
version: 1.2.3
path: OpenKnowledge-1.2.3.dmg
stagingPercentage: 10  # 10% of users receive this
```

Clients hash the user ID (machine ID) and compare against percentage. Same 10% get the update each step — not random churn. You bump from 10 → 50 → 100 over 48 hours based on crash rate telemetry.

**Manual process:** Edit the YAML, re-upload. No dashboard. ToDesktop provides a UI for this ($58+/mo) but for a small user base, manual editing is fine.

### Finding: Fix-forward rule — never rollback a version
**Confidence:** CONFIRMED

If v1.2.3 is broken:
- ❌ Don't: re-upload v1.2.3 with the fix
- ❌ Don't: revert manifest to v1.2.2 (users on v1.2.3 stay there)
- ✅ Do: ship v1.2.4 with the fix, bump version number

Users on the bad version will only update forward. This is a fundamental constraint of electron-updater's version comparison.

### Finding: Known update reliability failure modes
**Confidence:** CONFIRMED

electron-updater has documented issues:
- `net::ERR_CONNECTION_RESET` on dropped wifi → uncaught main-process exceptions
- Progress events stop firing after internal retries
- Windows EBUSY rename errors leave pending folders stuck
- Partial downloads can stall

**Mitigation (Doyensec's ElectronSafeUpdater pattern):**
- Wrap updater calls in try/catch
- Log all updater events to Sentry with dedicated tag
- Fall back from differential to full download on integrity failure
- Exponential backoff with 1-day max
- After N failures, show user-visible "retry download" or "download from website" option

### Finding: Mac App Store is a non-starter for OK
**Confidence:** CONFIRMED

MAS requires `com.apple.security.app-sandbox = true`. Sandboxed apps are restricted to `~/Downloads`, `~/Music`, `~/Pictures`, user-initiated file picker, and app container. **No arbitrary filesystem access**, no `chokidar`/`@parcel/watcher` on arbitrary paths, no `exec`ing external binaries.

OK's architecture requires:
- `@parcel/watcher` recursive on arbitrary `content/` directory
- `simple-git` shelling out to `git` binary
- Arbitrary file read/write

**Cannot work in MAS sandbox.** Follow VS Code, Obsidian, Discord, Cursor, Claude Desktop pattern: skip MAS entirely, ship direct download.

### Finding: Distribution channels for OK (priority order)
**Confidence:** CONFIRMED

1. **Direct DMG from website** — Day 1, table stakes
2. **GitHub Releases** — Day 1, auto-update backend
3. **Homebrew Cask** — Week 2, free dev-community discovery
4. **`.deb` / `.rpm` / AppImage** — Month 1, free from electron-builder for Linux coverage
5. **Microsoft Store (MSIX)** — Optional, enterprise gate
6. **Snap** — Optional, classic confinement needed for filesystem access (store review)
7. **Flatpak** — Let community maintain
8. **Mac App Store** — SKIP (sandbox is a ceiling)

**For OK:** Ship direct DMG + NSIS + GitHub Releases on day 1. Add Homebrew Cask week 2. Linux formats are free — ship them all. Skip everything else until asked.
