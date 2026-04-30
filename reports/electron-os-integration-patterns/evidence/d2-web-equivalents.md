# Evidence: D2 — Web / browser equivalents + gaps

**Dimension:** For each Electron OS-integration capability, what is the web/browser equivalent (if any)? Map the gaps.

**Date:** 2026-04-23
**Sources:** MDN API docs, caniuse datasets, Web App Manifest spec (accessed 2026-04-22/23)

---

## Parity map (12 Electron APIs surveyed)

| Electron API | Web equivalent | Parity | Evidence |
|---|---|---|---|
| `shell.openPath(file)` | None (`<a href="file://">` blocked; File System Access API returns handle but cannot launch external app) | **none** | CONFIRMED |
| `shell.openExternal(url)` | `<a target="_blank">`, `window.open(url)` | **full** | CONFIRMED |
| `shell.showItemInFolder(path)` | None | **none** | CONFIRMED |
| `shell.trashItem(path)` | `FileSystemDirectoryHandle.removeEntry()` permanently deletes; no trash semantics | **none** | CONFIRMED |
| `dialog.showOpenDialog / showSaveDialog` | `<input type="file">` (full coverage), `showOpenFilePicker`/`showSaveFilePicker` (Chromium-only, returns writable handle) | **partial** | Firefox + Safari limited to `<input>` — no persistent handle, no write-back loop |
| `clipboard.readText/writeText/readImage/writeImage` | `navigator.clipboard.*` (async Clipboard API) | **partial** | Permission model differs per browser; image write support uneven |
| `Notification` | Notifications API (`new Notification(...)`) | **partial** | iOS requires home-screen PWA install (16.4+) |
| `Tray` (menu bar icon) | None | **none** | CONFIRMED |
| `app.setAsDefaultProtocolClient('myapp')` | `navigator.registerProtocolHandler()` + PWA Manifest `protocol_handlers` | **PWA-only** | Scheme must begin `web+` or be safelisted; PWA install required for `protocol_handlers` |
| `powerMonitor` (lock/suspend/resume) | Page Visibility API (page-hidden only) | **none** | No screen-lock / system-suspend signal for web |
| `systemPreferences.getUserDefault` (macOS) | None | **none** | CONFIRMED |
| `webContents.on('will-navigate')` | `beforeunload`, `pagehide` (same-origin only) | **partial** | Cannot intercept hard navigation / external-link clicks |

---

## Key findings

### Finding: 7 of 12 Electron OS APIs have no web equivalent

**Confidence:** CONFIRMED

No-web-equivalent set: `shell.openPath`, `shell.showItemInFolder`, `shell.trashItem`, `Tray`, `powerMonitor`, `systemPreferences.getUserDefault`, `app.setAsDefaultProtocolClient` (PWA-only counterpart is install-gated).

**Implications:** "Reveal in Finder," "Open with OS default app," and "Move to Trash" are first-class Electron-exclusives. No origin-trial path unlocks them for plain-webpage consumption.

### Finding: File System Access API is Chromium-only at 27.32% global availability

**Confidence:** CONFIRMED
**Evidence:** [caniuse: native-filesystem-api](https://caniuse.com/native-filesystem-api) (access 2026-04-22)

- Chrome: v105+ full
- Edge: v105+ full
- Firefox: **no** (Mozilla standards position: "harmful")
- Safari: **no**

`showSaveFilePicker` returns a `FileSystemFileHandle` that can write back to the user-selected location without re-prompting — functionally equivalent to Electron's `dialog.showSaveDialog` + `fs.writeFile` chain, but only on Chromium. Firefox + Safari users fall back to `<input type="file">` which returns a one-shot `File` blob with no write path.

### Finding: Web Share API reaches 92.81% global availability but is not Baseline

**Confidence:** CONFIRMED
**Evidence:** [caniuse: web-share](https://caniuse.com/web-share), [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) (access 2026-04-22)

- Chrome: v128+
- Edge: v95+
- Firefox: **no** through v153
- Safari: v12.1+ desktop, v12.2+ iOS

`navigator.share({ files: [...] })` accepts files and launches OS share sheets on Android Chrome + iOS Safari + macOS Safari + Windows Edge. Firefox does not implement. Requires transient user activation + secure context + `web-share` Permissions Policy.

### Finding: Notifications reach 93.68% coverage but iOS Safari is PWA-install-gated

**Confidence:** CONFIRMED
**Evidence:** [caniuse: notifications](https://caniuse.com/notifications)

iOS Safari added notifications in 16.4+ but **requires the site to be installed as a home-screen PWA**. A plain webpage cannot fire notifications to iOS users. Desktop platforms (Chrome, Firefox, Safari, Edge) full-support since early versions.

All notification calls require explicit `Notification.requestPermission()` grant — different from Electron where main-process can fire notifications without any permission prompt.

### Finding: Secure-context + transient-user-activation gates constrain web-side feature parity

**Confidence:** CONFIRMED
**Evidence:** MDN pages for File System Access, Clipboard, Web Share, Notifications

- **HTTPS required** for File System Access, Clipboard, Web Share, Notifications.
- **Transient user activation required** for Clipboard read, Web Share.
- **Permission prompt required** for Notifications, Clipboard (Chrome-specific).

Electron main process has none of these constraints — it can fire notifications, open files, read clipboard at any time. This gap is structural: browsers enforce user intent; Electron trusts the app.

### Finding: PWA capability gap — tray, reveal-in-Finder, trash, screen-lock all remain Electron-exclusive

**Confidence:** INFERRED from composite spec reading
**Evidence:** MDN PWA docs, Web App Manifest spec, web.dev/articles/url-protocol-handler (page returned 404 at fetch time; capability documented elsewhere in spec)

Installing as a PWA unlocks:
- `protocol_handlers` Manifest entry (register `web+myapp://`) — install-gated
- iOS push notifications (16.4+, install-gated)
- `launch_handler` file-association (experimental, Chromium)
- Persistent storage promotion (heuristic)

PWA install does NOT unlock: `shell.showItemInFolder`, `shell.trashItem`, `Tray`, `powerMonitor`, `getUserDefault`, arbitrary URL-scheme registration. I could not find an active origin trial for these — marked UNCERTAIN on "active" (origin-trial inventory changes quarterly).

### Finding: `webContents.on('will-navigate')` has no equivalent web intercept

**Confidence:** CONFIRMED

`beforeunload` / `pagehide` only fire on same-origin page leaves; cannot intercept `<a href="cross-origin">` link clicks, cross-origin hard navigation, or redirect chains. Electron's `will-navigate` is a same-process-full-visibility intercept with no web peer.

This is the structural reason Electron can implement "click-on-asset → shell.openPath" while web cannot. Without `will-navigate` (or equivalent), web has no seam to intervene between `<a>` click and browser's default navigation.

---

## Decision guidance for implementers

**Can wait for web-platform parity:**
- Clipboard text, basic notifications, open-in-browser links, file-open via `<input>`, user-initiated share sheet — all reach meaningful coverage today.

**Must be Electron-exclusive (no web path):**
- Tray icon, reveal-in-Finder, trash semantics, screen-lock detection, macOS user-defaults, arbitrary URL-scheme registration without PWA install, silent file rewrites, click-interception.

**Chromium-only partial (acceptable for Chrome/Edge-only audience):**
- Save-file handles, directory handles, image clipboard, Web Share with files on desktop.

---

## Negative searches

- Searched for "active origin trial Tray API" → NOT FOUND (as of 2026-04-22).
- Searched for "File System Access API Firefox enable flag" → Firefox classifies as "harmful," no plans to implement.
- Searched web.dev for url-protocol-handler canonical docs — page returned 404 at fetch time; capability documented in Web App Manifest spec and MDN only.

---

## Gaps / follow-ups

- Origin-trial inventory for Electron-equivalent capabilities changes quarterly — recommend re-checking before major decisions.
- Web Install API (Chromium experimental) may unlock install-gated capabilities from browser context — out of scope here.
- Mobile-browser behavior for File System Access API (Android Chrome specifically) — not audited.
