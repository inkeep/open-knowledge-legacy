# Evidence: D12 — Linux XDG Desktop Portal APIs (Path C 2026-04-23)

**Dimension:** What does the Linux XDG Desktop Portal surface offer for sandboxed Electron apps (Flatpak / Snap)? How does it interact with `shell.*`? What changes if an Electron app adds Linux distribution?

**Date:** 2026-04-23
**Sources:** flatpak.github.io docs, Electron PRs + docs, Flathub manifests for VSCode and Obsidian, electron-builder docs.

---

## Portal API surface — Electron equivalents

| Portal interface | Function | Electron equivalent |
|---|---|---|
| `org.freedesktop.portal.OpenURI` | Open file/URI via host-mediated handler | `shell.openPath`, `shell.openExternal` |
| `org.freedesktop.portal.FileChooser` | Sandboxed open/save dialog | `dialog.showOpenDialog`, `dialog.showSaveDialog` |
| `org.freedesktop.portal.Trash` | Move file to trash | `shell.trashItem` |
| `org.freedesktop.portal.Notification` | Sandboxed notifications | `new Notification()` |
| `org.freedesktop.FileManager1` (D-Bus, NOT a portal) | Reveal file in file manager | `shell.showItemInFolder` |
| `org.freedesktop.portal.Screenshot` | Screen capture | `desktopCapturer` |
| `org.freedesktop.portal.ScreenCast` | Screen streaming | `desktopCapturer` (getDisplayMedia) |
| `org.freedesktop.portal.Settings` | Read host theme/color scheme | `nativeTheme` (dark mode detection) |
| `org.freedesktop.portal.GlobalShortcuts` | System-wide shortcut registration | `globalShortcut` |
| `org.freedesktop.portal.Inhibit` | Prevent sleep/idle | `powerSaveBlocker` |
| `org.freedesktop.portal.Background` | Background execution | (no direct equivalent) |

Other portals exist (Account, Camera, Clipboard, Documents, Email, Print, Wallpaper, Location, Secret, USB, etc.) — see [flatpak.github.io/xdg-desktop-portal/docs/](https://flatpak.github.io/xdg-desktop-portal/docs/).

---

## Findings

### Finding: Electron's `shell.showItemInFolder` already uses `FileManager1` D-Bus on Linux

**Confidence:** CONFIRMED
**Evidence:** [Electron PR #25087](https://github.com/electron/electron/pull/25087)

Invokes `org.freedesktop.FileManager1.ShowItems` D-Bus with xdg-open fallback. **No app code needed** — works out of the box for reveal-in-file-manager. This is why every surveyed app (D5) calls `showItemInFolder` without any Linux-specific validation.

### Finding: `shell.openPath` / `shell.openExternal` work via xdg-open, with known Flatpak-sandbox edge cases

**Confidence:** CONFIRMED
**Evidence:** [xdg-desktop-portal issue #78](https://github.com/flatpak/xdg-desktop-portal/issues/78), issues #592 and #594

- `shell.openPath` resolves to `xdg-open` under Flatpak's bubblewrap sandbox. Known broken cases:
  - Bare paths without `file://` prefix
  - Paths in `/var/data` or other non-shared directories
- `shell.openExternal` (http/https/mailto) works reliably for well-formed URIs via xdg-open + portal mediation.

**Implication for OK if it ships Flatpak:** existing `shell.openPath(absolutePath)` calls need the `file://` prefix in Flatpak, OR need explicit `org.freedesktop.portal.OpenURI` fallback. Low-effort but not zero.

### Finding: File dialogs use Chromium's xdg-portal integration when available

**Confidence:** CONFIRMED
**Evidence:** [Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)

- Controlled by `--xdg-portal-required-version` flag (default 3)
- Falls back to GTK/KDE dialogs when portal unavailable
- `--enable-features=UseXdgDesktopPortal` — UNCERTAIN whether current Electron enables by default; Chromium uses it for file dialogs but not reliably for all `shell.*` calls

### Finding: Electron apps in Flatpak commonly need `--no-sandbox`

**Confidence:** CONFIRMED
**Evidence:** [Electron - Flatpak documentation](https://docs.flatpak.org/en/latest/electron.html)

Because `CLONE_NEWUSER` + setuid conflict with bubblewrap's existing user namespace. Standard workaround: pass `--no-sandbox` to Electron in the Flatpak manifest. Trade-off: renderer sandbox is disabled; `contextIsolation: true` becomes the only defense. Every Flatpak'd Electron app surveyed runs this way.

### Finding: OSS apps shipping Flatpak opt OUT of portal sandboxing via broad filesystem permissions

**Confidence:** CONFIRMED
**Evidence:** [VSCode Flathub manifest](https://github.com/flathub/com.visualstudio.code), [Obsidian Flathub manifest](https://github.com/flathub/md.obsidian.Obsidian)

- **VSCode:** `--filesystem=host` (unrestricted), `--share=network`, `--share=ipc`, `--socket={wayland,fallback-x11,pulseaudio,ssh-auth}`, `--device=all`, `--allow=devel`. Talks to `org.freedesktop.{Notifications, secrets, Flatpak}`, `com.canonical.AppMenu.Registrar*`. Notably declares `--filesystem=host` — **opts out of FileChooser portal mediation entirely.**
- **Obsidian:** `--filesystem=home`, `/media`, `/mnt`, `/run/media`, plus `--share=ipc`, `--share=network`, `--socket={wayland,x11,ssh-auth}`, `--device=dri`, `--talk-name=org.freedesktop.portal.Fcitx`. Similar: broad filesystem via `--filesystem=home` rather than portal mediation.

**Implication:** the dominant OSS posture is "we need broad filesystem access anyway (we're a file editor), so just ask for it in the manifest and skip the FileChooser portal dance." Portal-based sandboxing is architecturally cleaner but rare in shipping editor apps.

### Finding: Snap default plugs cover `shell.*` without portal explicit calls

**Confidence:** CONFIRMED
**Evidence:** [electron-builder Snap options](https://www.electron.build/snap.html)

electron-builder's default plug set: `desktop`, `desktop-legacy`, `home`, `x11`, `wayland`, `unity7`, `browser-support`, `network`, `gsettings`, `audio-playback`, `pulseaudio`, `opengl`. No automatic portal interface; `shell.*` routed through AppArmor-mediated xdg-open.

`showItemInFolder` may need the `desktop` plug (included by default).

### Finding: No dedicated Electron portal wrapper library

**Confidence:** INFERRED (negative search)

No `electron-portal` npm package, no standard wrapper library. Apps needing explicit portal calls use `dbus-next` or `node-dbus` directly. Portal integration is manual when needed; most apps avoid it entirely by opting out via broad Flatpak permissions (VSCode/Obsidian pattern).

---

## Implications for Open Knowledge

**Today (macOS M1/M2 focus):** Linux portals are **NOT-NOW work**. Zero impact on current architecture.

**If OK adds Linux distribution later:**

| Distribution format | Work required |
|---|---|
| `.deb` / `.rpm` / `AppImage` | None. `shell.*` works via xdg-open + FileManager1 D-Bus automatically. |
| Flatpak | Choose VSCode/Obsidian posture: `--filesystem=host` or `--filesystem=home` + standard permission set (`--share=ipc`, `--share=network`, `--socket=wayland`, etc.). Add `--talk-name=org.freedesktop.Notifications` + `--talk-name=org.freedesktop.FileManager1` so existing `shell.*` keeps working. Expect `--no-sandbox` flag. |
| Snap | electron-builder defaults sufficient for `shell.openPath` + `showItemInFolder`. |

**No app-side portal code required for typical editor use cases.** Chromium's existing portal integration + `FileManager1` D-Bus in Electron's `shell` implementation cover the `shell.*` equivalents for the dominant OSS posture.

The work becomes **mechanical packaging** ("do it when Linux matters") rather than **architectural** ("bake portal integration into main-process code today"). Appropriate verdict for OK's roadmap: park until Linux is a distribution target.

---

## Sources

- [XDG Desktop Portal documentation](https://flatpak.github.io/xdg-desktop-portal/docs/)
- [Electron - Flatpak documentation](https://docs.flatpak.org/en/latest/electron.html)
- [Electron PR #25087 — FileManager1 D-Bus for showItemInFolder](https://github.com/electron/electron/pull/25087)
- [VSCode Flathub manifest](https://github.com/flathub/com.visualstudio.code)
- [Obsidian Flathub manifest](https://github.com/flathub/md.obsidian.Obsidian)
- [electron-builder Snap options](https://www.electron.build/snap.html)
- [xdg-desktop-portal OpenURI local-paths issue #78](https://github.com/flatpak/xdg-desktop-portal/issues/78)
- [Electron command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)

---

## Gaps / follow-ups

- Exact Chromium version that enabled XDG portal file dialog integration by default — not pinned here.
- Whether `--xdg-portal-required-version` needs bumping for newer portal-only APIs.
- Snap plugs for `shell.openPath` to arbitrary paths (as opposed to xdg-open of http URIs) — default `home` plug covers `~/` but not `/media` etc.
