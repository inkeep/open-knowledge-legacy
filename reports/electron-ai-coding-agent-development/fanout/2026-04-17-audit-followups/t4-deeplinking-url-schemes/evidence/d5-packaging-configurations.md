# Evidence: D5 — Packaging Configurations

**Dimension:** D5 (P0 Deep) — Packaging configurations for custom URL schemes
**Date:** 2026-04-17
**Sources:** electron.build docs, electron-builder GitHub issues, microsoft/vscode packaging, Arch wiki, community walkthroughs

---

## Key files / pages referenced

- https://www.electron.build/app-builder-lib.interface.protocol — Protocol interface reference
- https://github.com/electron-userland/electron-builder/issues/4035 — AppImage protocol registration gap
- https://github.com/electron-userland/electron-builder/issues/3662 — AppImage .desktop file generation
- https://wiki.archlinux.org/title/XDG_MIME_Applications — Linux MIME registration canonical reference
- https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html — 2025 walkthrough
- `microsoft/vscode/resources/linux/code-url-handler.desktop` — production-grade Linux desktop file

---

## Findings

### Finding: electron-builder `protocols` field — source of truth for macOS, ignored on Windows/Linux
**Confidence:** CONFIRMED
**Evidence:** https://www.electron.build/app-builder-lib.interface.protocol

Interface:
```
Protocol {
  name:    string                                  // "IRC server URL"
  schemes: string[]                                // ["irc", "ircs"]
  role?:   "Editor" | "Viewer" | "Shell" | "None"  // macOS-only, default "Editor"
}
```

package.json example:
```json
{
  "build": {
    "protocols": [
      {
        "name": "my-app-protocol",
        "schemes": ["my-app"]
      }
    ]
  }
}
```

The electron-builder docs explicitly label this interface as "macOS only." The value is injected into the bundled app's `Info.plist` as a `CFBundleURLTypes` entry:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>my-app-protocol</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>my-app</string>
        </array>
    </dict>
</array>
```

### Finding: Windows protocol registration is done at RUNTIME, not at install time, by default
**Confidence:** CONFIRMED
**Evidence:** Electron docs, VS Code implementation, community walkthroughs

Default Windows flow: the NSIS / MSI installer does NOT write protocol registry keys. Instead, the Electron app calls `app.setAsDefaultProtocolClient(scheme)` on first launch, which writes `HKCU\Software\Classes\<scheme>\shell\open\command` entries per-user.

Consequence: the scheme is only registered after the user launches the app once. A freshly-installed app whose first interaction would be an incoming deep link cannot receive it. This is why production apps (VS Code, Slack) register eagerly on every startup — idempotent.

Some installers (NSIS with custom scripts, Inno Setup, WiX MSI) can optionally write the registry keys at install time for immediate availability. electron-builder does not emit these by default; developers add custom NSIS include files via `"nsis.include": "./installer.nsh"`.

### Finding: Linux protocol registration requires a .desktop file with `MimeType=x-scheme-handler/<scheme>;`
**Confidence:** CONFIRMED
**Evidence:** Arch wiki XDG MIME Applications, `microsoft/vscode/resources/linux/code-url-handler.desktop`

Required .desktop file structure:
```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=Your App
Comment=Deep-link handler for your-scheme://
Exec=/usr/bin/yourapp --open-url %U
Icon=yourapp
Terminal=false
StartupNotify=false
NoDisplay=true                                ; hide from app launcher (URL handler only)
MimeType=x-scheme-handler/your-scheme;
```

Placement:
- `~/.local/share/applications/` — per-user
- `/usr/share/applications/` — system-wide (deb/rpm install target)

After placement, the system must be told about the binding:
```bash
update-desktop-database ~/.local/share/applications/    # rebuild desktop index
xdg-mime default your-scheme-handler.desktop x-scheme-handler/your-scheme
```

VS Code ships a dedicated URL handler desktop file separate from the main launcher. This separation allows the URL handler to have different Exec args (`--open-url`) and to be hidden from app launcher search (`NoDisplay=true`).

### Finding: electron-builder does NOT generate .desktop files for AppImage targets
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron-userland/electron-builder/issues/3662, https://github.com/electron-userland/electron-builder/issues/4035

Community-confirmed: "Desktop file for Linux not generated with AppImage" (#3662). "app.setAsDefaultProtocolClient doesn't work on Linux .AppImage" (#4035).

Root cause: AppImage is a single-file bundle; the OS does not know where to find the .desktop file unless the user manually integrates it (via tools like `appimaged` or `AppImageLauncher`). `setAsDefaultProtocolClient` calls on Linux AppImage do not write the XDG registration because there's no fixed install path to reference in the .desktop `Exec` line.

Workarounds:
- Ship a post-install script (custom NSIS-like for AppImage) that integrates the AppImage and writes a .desktop file pointing to its path.
- Use AppImageLauncher which auto-integrates AppImages on first launch.
- Only support deb/rpm targets on Linux (electron-builder DOES generate .desktop files with the `mimeTypes` key for those).

For deb/rpm:
```yaml
# electron-builder.yml
linux:
  target: [deb, rpm]
  mimeTypes:
    - x-scheme-handler/your-scheme
  category: Utility
```

### Finding: macOS LaunchServices caching can stale-out during development
**Confidence:** CONFIRMED
**Evidence:** Apple docs, community troubleshooting

macOS's LaunchServices database caches URL scheme registrations. During development, replacing or re-bundling an app with changed `CFBundleURLTypes` may not register until LaunchServices is explicitly refreshed:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
```

Or per-app:
```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/YourApp.app
```

Production users rarely hit this; developers frequently do.

### Finding: Windows Store / MAS builds treat protocol registration differently
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app, community walkthroughs

- **Windows Store:** `setAsDefaultProtocolClient` "Returns true for all calls, but registry key is inaccessible to other applications" — Windows Store apps must declare protocols in `appxmanifest.xml` at packaging time. Runtime calls are no-ops under the sandbox.
- **Mac App Store (MAS):** `CFBundleURLTypes` works, but `app.requestSingleInstanceLock()` can crash under MAS sandbox restrictions. Community walkthrough notes: "Mac App Store builds can crash if requesting the single-instance lock — handle this case separately." macOS's system-enforced single-instance means MAS apps can often skip the lock entirely and rely on `open-url` alone.

### Finding: Canonical packaging flow per platform

| Platform | Packaging tool responsibility | Runtime responsibility |
|---|---|---|
| macOS (dmg, zip) | electron-builder → Info.plist `CFBundleURLTypes` | `app.on('open-url')` listener; `setAsDefaultProtocolClient` is advisory/optional |
| macOS (MAS) | App Store submission → plist. Sandbox-safe. | `open-url` only; skip `requestSingleInstanceLock` |
| Windows (NSIS / MSI) | Nothing by default. Optional: custom NSIS script writes `HKCU\Software\Classes\<scheme>` | `setAsDefaultProtocolClient` called on startup (per-user HKCU registration) |
| Windows (Store / appx) | `appxmanifest.xml` `<Extension Category="windows.protocol">` | No runtime registration — sandbox blocks it |
| Linux (deb/rpm) | electron-builder `linux.mimeTypes` → .desktop file with `MimeType=x-scheme-handler/<scheme>;` installed to `/usr/share/applications/` | `setAsDefaultProtocolClient` works as a fallback if not registered at install |
| Linux (AppImage) | Not generated by electron-builder. Manual .desktop integration required. | `setAsDefaultProtocolClient` is unreliable on AppImage |
| Linux (Snap) | snapcraft.yaml `apps.<name>.plugs` | Limited — see forum.snapcraft.io#17644 ("Xdg-open path doesn't get passed through to app") |
| Linux (Flatpak) | `com.example.Yourapp.desktop` in flatpak manifest | Sandboxed; scheme must be declared |

### Finding: electron-forge equivalent — `makers` + platform-specific config keys
**Confidence:** INFERRED (based on the documented pattern)
**Evidence:** Various community walkthroughs referenced but not directly loaded in this pass

electron-forge uses a different config shape but the same underlying manifests. macOS uses `@electron-forge/maker-dmg` + `packagerConfig.protocols` (identical structure to electron-builder's `protocols`). Windows uses Squirrel-based installers that do not typically write protocol entries — same runtime `setAsDefaultProtocolClient` pattern applies.

---

## Gaps / follow-ups

- Exact syntax for writing Windows registry keys from an NSIS custom include file — useful when install-time registration is required (e.g. for apps that receive deep links from first-run onboarding flows).
- Whether Snap confinement (strict vs classic) changes protocol-registration feasibility.
- Whether Flatpak's portal system requires a different approach for deep-link delivery (Flatpak apps usually need `--filesystem=host` or equivalent permission for URLs that reference local file paths).
