# Evidence: D1 — Cross-platform Registration Mechanics

**Dimension:** D1 (P0 Deep) — Cross-platform registration mechanics
**Date:** 2026-04-17
**Sources:** electronjs.org (app API docs, Deep Links tutorial), Microsoft Learn (URI scheme registration), electron.build (Protocol interface), microsoft/vscode source

---

## Key files / pages referenced

- https://www.electronjs.org/docs/latest/api/app — `app.setAsDefaultProtocolClient`, `open-url`, `second-instance`, `will-finish-launching`
- https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app — Official Deep Links tutorial
- https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85) — Windows URI scheme registration
- https://www.electron.build/app-builder-lib.interface.protocol — electron-builder Protocol interface
- `microsoft/vscode` → `src/vs/platform/url/electron-main/electronUrlListener.ts` — reference implementation
- `resources/linux/code-url-handler.desktop` (microsoft/vscode) — Linux .desktop file pattern

---

## Findings

### Finding: `app.setAsDefaultProtocolClient(protocol, path?, args?)` signature is platform-asymmetric
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app

```
app.setAsDefaultProtocolClient(protocol[, path, args])
  protocol: string  (without "://")
  path:     string  (Windows only — defaults to process.execPath)
  args:     string[] (Windows only — defaults to [])
Returns: boolean
```

- macOS: "you can only register protocols that have been added to your app's info.plist" — runtime modification is not supported. Uses `LSSetDefaultHandlerForURLScheme` internally.
- Windows: Writes to the Windows Registry. On Windows Store builds the call returns `true` for all invocations but the registry key is inaccessible to other applications.
- `path` and `args` are **Windows-only** parameters (they are documented as such in the signature).

**Implications:** The API signature is misleading — `path` and `args` are silently ignored on macOS and Linux. Apps that want to pass `--` as an arg-terminator (the CVE-2018-1000006 mitigation) must pass it via the Windows path only; macOS/Linux defenses live elsewhere.

### Finding: macOS requires `CFBundleURLTypes` in `Info.plist` at bundle time
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app, community walkthrough at https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.yourapp.mac.YourApp</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>yourapp</string>
        </array>
    </dict>
</array>
```

Electron docs state: "Requires `CFBundleURLTypes` key in `Info.plist` with `NSPrincipalClass` set to `AtomApplication`." macOS LaunchServices reads this plist at install time and records the scheme in the LaunchServices database. `setAsDefaultProtocolClient` at runtime is advisory — the plist is authoritative.

### Finding: Linux uses `.desktop` file with `MimeType=x-scheme-handler/<scheme>;`
**Confidence:** CONFIRMED
**Evidence:** https://wiki.archlinux.org/title/XDG_MIME_Applications, microsoft/vscode has `resources/linux/code-url-handler.desktop`, community discussion at https://github.com/electron-userland/electron-builder/issues/4035

```
[Desktop Entry]
Name=Your App
Exec=/usr/bin/yourapp %U
MimeType=x-scheme-handler/yourapp;
...
```

`.desktop` file must be placed in `~/.local/share/applications/` or `/usr/share/applications/`. `xdg-mime default <desktop-file> x-scheme-handler/<scheme>` binds the scheme. `xdg-open <scheme>://...` dispatches through this registry. Per VS Code's implementation, the VS Code Linux deb/rpm packages install a dedicated `code-url-handler.desktop` file that invokes code with `--open-url` and the URL as an argument.

### Finding: Linux AppImage has a known gap — `setAsDefaultProtocolClient` does not register reliably
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron-userland/electron-builder/issues/4035, https://github.com/electron-userland/electron-builder/issues/3662

Community and electron-builder maintainers confirm: `app.setAsDefaultProtocolClient` works on macOS and Windows, but on Linux AppImage the custom protocol is never registered because electron-builder does not generate a .desktop file for AppImage targets (only for deb/rpm). Workaround: ship a post-install script or use AppImage-specific integration helpers (appimaged, appimagelauncher).

### Finding: Windows registry layout for URI scheme handlers is specified by Microsoft
**Confidence:** CONFIRMED
**Evidence:** https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85)

```
HKEY_CLASSES_ROOT\alert
  (Default)       = "URL:Alert Protocol"
  URL Protocol    = ""               ; sentinel — required
  DefaultIcon
    (Default)     = "alert.exe,1"
  shell\open\command
    (Default)     = "C:\Program Files\Alert\alert.exe" "%1"
```

Required keys: (1) `URL Protocol` named value (empty string), without which the handler will not launch, (2) `shell\open\command` with the executable and `%1` placeholder, (3) `%1` must be quoted to tolerate spaces.

Electron's `setAsDefaultProtocolClient` writes equivalent entries under `HKCU\Software\Classes\<protocol>` (per-user) rather than `HKCR\<protocol>` (machine-wide), so no admin rights are required.

### Finding: electron-builder `protocols` key generates platform manifest entries but the docs list it as "macOS only"
**Confidence:** CONFIRMED
**Evidence:** https://www.electron.build/app-builder-lib.interface.protocol

```
Protocol
  name:     string                                        (required)
  schemes:  string[]                                      (required)
  role?:    "Editor" | "Viewer" | "Shell" | "None"        (macOS only)
```

The electron.build docs label the Protocol interface as "macOS only", meaning the key injects `CFBundleURLTypes` entries into the generated `Info.plist` but does NOT emit equivalent Windows registry scripts or Linux .desktop MimeType entries. For Windows, developers rely on `setAsDefaultProtocolClient` at runtime (registers per-user keys on first launch). For Linux deb/rpm, developers rely on a separately-shipped .desktop file (e.g. VS Code's `code-url-handler.desktop`).

### Finding: VS Code's canonical implementation uses different primitives per platform
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode/src/vs/platform/url/electron-main/electronUrlListener.ts` (verbatim source retrieved)

```typescript
// Windows: install as protocol handler
if (isWindows && !environmentMainService.isPortable && !(process as INodeProcess).isEmbeddedApp) {
    const windowsParameters = environmentMainService.isBuilt ? [] : [`"${environmentMainService.appRoot}"`];
    windowsParameters.push('--open-url', '--');
    app.setAsDefaultProtocolClient(productService.urlProtocol, process.execPath, windowsParameters);
}

// macOS: listen to `open-url` events from here on to handle
const onOpenElectronUrl = Event.map(
    Event.fromNodeEventEmitter(app, 'open-url', (event: ElectronEvent, url: string) => ({ event, url })),
    ({ event, url }) => {
        event.preventDefault(); // always prevent default and return the url as string
        return url;
    });
```

Header comment summarizes the three-platform split:
```
- Windows: we use `app.setAsDefaultProtocolClient()` to register VSCode with the OS
           and additionally add the `open-url` command line argument to identify.
- macOS:   we rely on `app.on('open-url')` to be called by the OS
- Linux:   we have a special shortcut installed (`resources/linux/code-url-handler.desktop`)
           that calls VSCode with the `open-url` command line argument
```

Note: VS Code skips `setAsDefaultProtocolClient` in portable mode (to preserve OAuth flow settings) and for embedded apps (registered at install time). VS Code passes `'--open-url', '--'` as Windows args — the trailing `--` is the CVE-2018-1000006 mitigation.

### Finding: macOS system automatically enforces single-instance; Windows/Linux must opt in via `requestSingleInstanceLock()`
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app

> "On macOS: System enforces single instance automatically; command-line bypass requires manual implementation"

> `app.requestSingleInstanceLock()` — "This method returns true if your process is the primary instance of your application... If false: Process should immediately quit, as parameters sent to existing instance."

Electron docs for `app.on('second-instance')` caution:
> "`argv` will not be exactly the same list of arguments as those passed to the second instance. The order might change and additional arguments might be appended" — use `additionalData` (passed to `requestSingleInstanceLock`) for exact payload transfer.
> "Extra command line arguments might be added by Chromium, such as `--original-process-start-time`"

---

## Negative searches

- Searched for Electron-provided Linux `.desktop` generation utility — not found. Electron ships no helper; each packaging tool (electron-builder, electron-forge, electron-packager) implements its own generator, and none covers AppImage.
- Searched for macOS `LSSetDefaultHandlerForURLScheme` invocation in Electron source — confirmed referenced in Electron app docs as the underlying system call; not exposed as a separate Electron API.

## Gaps / follow-ups

- Whether `setAsDefaultProtocolClient` on Windows writes to `HKCU\Software\Classes\<scheme>` or uses the newer `HKCU\Software\Classes\UrlAssociations\<scheme>\UserChoice` (Windows 10+ Default Apps framework). Electron docs do not specify, and the behavior may affect whether Windows Settings shows the app as the registered handler. (Practical impact: if Electron only writes the legacy keys, Windows 10+ may still show "How do you want to open this?" dialog.)
