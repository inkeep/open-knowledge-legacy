# Evidence: D1 — Electron shell/OS API surface

**Dimension:** Enumerate Electron's OS-integration API surface with semantics, platform coverage (macOS primary, Win/Linux deltas), and security model. Also webContents events that enable click-interception.

**Date:** 2026-04-23
**Sources:** Electron official docs (accessed 2026-04-22); Doyensec Electron security writeups; electron/electron GitHub PRs and issues.

---

## API surface table

| API | Purpose | macOS | Win/Linux deltas | Security/consent | Common misuse |
|---|---|---|---|---|---|
| `shell.openPath(path)` → `Promise<string>` | Open a file with OS-default app | Uses LaunchServices; `activate:true` foregrounds | Win: `workingDirectory`, `logUsage` options; Linux: xdg-open | No renderer sandbox; empty string = success, non-empty = error msg (never rejects) | Treating as reject-on-failure; passing unresolved relative paths |
| `shell.openExternal(url, options?)` → `Promise<void>` | Open URL (`http:`, `https:`, `mailto:`, custom schemes) via default protocol handler | `activate` option; 2081 char limit on Win | — | No renderer sandbox | Passing untrusted URLs without allowlist — XSS-to-RCE pivot ([Doyensec](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)); `file://` URLs should be rejected |
| `shell.showItemInFolder(fullPath)` → `void` (sync) | Reveal file/dir in native file manager | Finder reveal + select | Win bug: Explorer can open in background on 22H2 ([electron #36765](https://github.com/electron/electron/issues/36765)) | No docs on missing-path error behavior | Passing relative paths |
| `shell.trashItem(path)` → `Promise<void>` | Move to OS trash | NSFileManager → `~/.Trash` | Win Recycle Bin via IFileOperation; Linux XDG Trash via gio/gvfs | Rejects on failure | Using deprecated `moveItemToTrash` (removed v12) |
| `shell.beep()` → `void` | System beep | NSBeep | Win MessageBeep; Linux desktop-env-specific | — | — |
| `shell.readShortcutLink` / `writeShortcutLink` | Read/write `.lnk` | N/A | **Windows only** | — | Calling without Win guard |
| `app.setAsDefaultProtocolClient(proto, path?, args?)` → `boolean` | Register custom URL scheme | Requires `CFBundleURLTypes` in `Info.plist` at build; API call writes LaunchServices DB | Win: registry write + `path`/`args`; Linux: xdg-mime + `.desktop` file | **Silent, no prompt** | Forgetting `Info.plist` entry on macOS (silent failure); not handling `open-url` event |
| `app.isDefaultProtocolClient(proto, …)` → `boolean` | Check registration | LaunchServices query | Registry/xdg-mime query | — | — |
| `dialog.showOpenDialog(win?, opts)` → `Promise<{canceled, filePaths, bookmarks?}>` | Native file/dir picker | Sheet-style when window passed; `securityScopedBookmarks` for MAS sandbox | Win/Linux: can't combine file+dir picker; Linux pre-v4 portal: `defaultPath` ignored | User-mediated → grants sandbox file access | Using sync variant (blocks UI); ignoring `canceled` |
| `dialog.showSaveDialog(win?, opts)` → `Promise<{canceled, filePath, bookmark?}>` | Native save-as picker | Recommended async on macOS (sheet race) | Win `dontAddToRecent`; Linux `showOverwriteConfirmation` | — | Treating empty `filePath` as path instead of cancel |
| `dialog.showMessageBox(win?, opts)` → `Promise<{response, checkboxChecked}>` | Modal alert | Native sheet; `textWidth` macOS-only | Win auto-applies question-type icon | Consent pattern via `checkboxLabel` | Using sync variant; ignoring `cancelId` |
| `dialog.showErrorBox(title, content)` → `void` | Pre-`ready` error alert | Standalone window | Linux: stderr fallback if no GUI | Safe before `app.ready` | — |
| `Menu` (`setApplicationMenu`, `buildFromTemplate`) | App menu bar + context menus | Menu bar in OS bar; first menu = app menu | Win/Linux: per-window menu bar | — | Ignoring macOS-required roles (`appMenu`, `editMenu`) |
| `clipboard.*` | System clipboard | Multiple pasteboards | Linux `'selection'` clipboard (X11 primary) | No consent | — |
| `Notification` | Native notification | NSUserNotificationCenter; signed app + bundle ID | Win: AppUserModelID; Linux: libnotify | User can disable | Silent failure on unsigned macOS builds |
| `Tray(iconPath)` | Menu-bar / system tray icon | Template images for dark/light; `setTitle` | Win tooltip + balloon; Linux KDE/GNOME variance | — | PNG not template-image on macOS |
| `powerMonitor` | Power events (`suspend`, `resume`, `on-ac`, `on-battery`, `lock-screen`, `unlock-screen`, `user-did-become-active`) | Full event set | Linux: subset via logind | Requires main process | — |
| `systemPreferences` | OS prefs query | `getMediaAccessStatus('microphone'\|'camera'\|'screen')`, `askForMediaAccess` | Win: subset; Linux: near-empty | macOS media-access APIs **do** prompt | — |

---

## webContents event table (click-interception surface — feeds D3)

| Event | Fires when | `preventDefault()` possible? | Usage | Security note |
|---|---|---|---|---|
| `will-navigate` | Before top-level nav commits — user click, `location.href=`, form submit. NOT for programmatic `webContents.loadURL` | **Yes** — cancels nav | Intercept external-origin clicks; route `file://` vs `http://localhost` differently | Primary external-URL gate; pair with `setWindowOpenHandler` |
| `will-redirect` | Server-side 3xx during active nav | Yes | Detect/stop open redirects | — |
| `did-navigate` | After main-frame nav commits | No (informational) | Update UI, record history | — |
| `before-input-event` | Before keydown/keyup to page | **Yes** — blocks page + menu shortcuts | Intercept shortcuts globally | Can disable security-critical shortcuts |
| `context-menu` | Right-click / native context invocation | Not documented as preventable — informational | Build custom context menu from `params` (linkURL, mediaURL, editable, selection, spelling) | `params.linkURL` lets app decide open-behavior without inspecting href |
| `setWindowOpenHandler(fn)` | Before new window from `window.open`, `target="_blank"`, shift-click, form `_blank` | Return `{action:'deny'}` to cancel; `{action:'allow', overrideBrowserWindowOptions, createWindow}` to customize | Replaces deprecated `new-window` event | Recommended default: deny + route to `shell.openExternal` after scheme allowlist |

---

## Critical findings

### Finding: `shell.openPath` resolves (never rejects) with empty-string-on-success, error-string-on-failure

**Confidence:** CONFIRMED
**Evidence:** [shell docs](https://www.electronjs.org/docs/latest/api/shell); [PR #20682 (openPath conversion from openItem)](https://github.com/electron/electron/pull/20682)

- Accepts a filesystem path string (platform separators, must be resolved via `path.resolve()`)
- File or directory only — NOT URL schemes
- Returns `Promise<string>`: empty = success, non-empty = error description
- Does not function in sandboxed renderer
- No app-associated → non-empty error string

**Implication:** Consumers must check the resolved string, not rely on try/catch.

### Finding: `shell.openPath` vs `shell.openExternal` split on scheme

**Confidence:** CONFIRMED (surface); INFERRED (`file://` guard recommendation from Doyensec)

- `openPath` is for local filesystem paths routed through OS "open with default app"
- `openExternal` is for URLs routed through the default protocol handler (including `mailto:`, `tel:`, custom schemes)
- Rule: has a URL scheme → `openExternal`; is a filesystem path → `openPath`
- Calling `openExternal('file:///…')` is undefined/unsafe — commonly gated out

### Finding: `shell.showItemInFolder` accepts files AND directories; missing-path behavior undocumented

**Confidence:** UNCERTAIN (missing-path branch)
**Evidence:** [electron/electron #36765](https://github.com/electron/electron/issues/36765) (Win 22H2 background-window bug)

Missing-path likely silent no-op on macOS. Windows has a known 22H2 bug where Explorer can open behind the app window.

### Finding: No API for "open at line N"

**Confidence:** CONFIRMED (negative search)

`shell.openPath` is path-only. Line-addressing requires spawning editor CLI with bespoke arguments:
- `code -g file:42` (VSCode)
- `subl file:42:10` (Sublime)
- `vim +42 file` (vim)

Must use `child_process.spawn` — Electron does not provide this natively.

### Finding: No API for "open with specific app (not OS default)"

**Confidence:** CONFIRMED (negative search)

`shell.openPath` is LaunchServices-only; no handler override. Platform workarounds require `child_process`:
- macOS: `open -a 'App Name' file`
- Windows: `start "" "appname" "file"`
- Linux: `gtk-launch`/`xdg-open`

### Finding: `app.setAsDefaultProtocolClient` is silent — no user prompt

**Confidence:** CONFIRMED

- macOS: requires build-time `CFBundleURLTypes` in `Info.plist`; API only updates LaunchServices. Launches delivered via `open-url` event (register before `ready`).
- Win/Linux: launches delivered via `process.argv` on launch; canonical pattern is `app.requestSingleInstanceLock()` + `second-instance` event for funneling subsequent launches into the existing process.

No first-launch "Set as default" prompt analogous to browsers — app must build its own consent UI.

### Finding: Link click default behavior depends on page origin + scheme

**Confidence:** INFERRED (combining will-navigate semantics + webSecurity defaults; Electron docs lack a single canonical click-behavior table)

- `<a href="file:///path">` in a BrowserWindow loaded via `file://` may navigate the webContents to that file URL (subject to `webSecurity` + `allowFileAccessFromFileURLs`).
- `<a href="file:///path">` in an `http://`-loaded page typically fails with scheme-mismatch error.
- `<a href="http://localhost:port/path">` navigates the webContents to the localhost URL and fires `will-navigate` (preventable).

Either path can be intercepted via `will-navigate` + `setWindowOpenHandler` and rerouted through `shell.openPath` / `shell.openExternal` / IPC.

---

## Negative searches

- **No "open at line N" API** — confirmed negative.
- **No "open with specific app (not OS default)"** — confirmed negative.
- **No documented rejection for `shell.openPath` missing path** — docs silent; resolves with error string.
- **No prompt/consent on `setAsDefaultProtocolClient`** — no first-launch confirmation UI.
- **No preventable `context-menu`** — treat as informational; build your own menu from `params`.
- **No documented behavior for `showItemInFolder` with nonexistent path.**
- **No `shell.openPathWith(path, bundleId)`** — OS-default only.

---

## Sources

- [shell | Electron](https://www.electronjs.org/docs/latest/api/shell)
- [app | Electron](https://www.electronjs.org/docs/latest/api/app)
- [dialog | Electron](https://www.electronjs.org/docs/latest/api/dialog)
- [webContents | Electron](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron APIs Misuse — Doyensec](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)
- [shell.openPath openItem conversion PR #20682](https://github.com/electron/electron/pull/20682)
- [showItemInFolder Win 22H2 bug #36765](https://github.com/electron/electron/issues/36765)
