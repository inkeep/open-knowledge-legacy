# Evidence: D2 — Cold-start vs Already-running URL Delivery

**Dimension:** D2 (P0 Deep) — Cold-start vs already-running URL delivery semantics
**Date:** 2026-04-17
**Sources:** electronjs.org, electron/electron#32600, electron/electron#40173, microsoft/vscode source, community tutorials

---

## Key files / pages referenced

- https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app — canonical tutorial
- https://github.com/electron/electron/issues/32600 — `open-url` fires before `ready` / `will-finish-launching` (Jan 2022, through at least Electron 16)
- https://github.com/electron/electron/issues/40173 — Deep Links docs unclear on cold-start argv on Windows/Linux
- `microsoft/vscode/src/vs/platform/url/electron-main/electronUrlListener.ts` — reference pattern for queueing initial URLs

---

## Findings

### Finding: macOS delivers cold-start URLs via `app.on('open-url')`, which can fire BEFORE both `ready` and `will-finish-launching`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/issues/32600, https://www.electronjs.org/docs/latest/api/app

Electron docs:
> "be sure to register a listener for the `open-url` event early in your application startup to detect if the application is being opened to handle a URL"
>
> "If you register the listener in response to a `ready` event, you'll miss URLs that trigger the launch of your application"

Issue #32600 (confirmed reproducible from Electron 8.0.0 through at least version 16) reports: the `open-url` event fires before both `ready` AND `will-finish-launching`, which is "confusing event order" — developers must register the `open-url` listener at the top of `main.js`, synchronously, before any `await`, before any `app.whenReady()`.

> "The workaround for this timing issue is to manually collect all URLs received via the `open-url` event until your app is fully initialized and ready to process them."

VS Code follows this pattern — its `ElectronURLListener` constructor accepts an `initialProtocolUrls` parameter, and buffers URLs it cannot yet deliver:
```typescript
if (initialProtocolUrls) {
    this.uris = initialProtocolUrls;  // queue until a ready window exists
}
...
const isWindowReady = windowsMainService.getWindows().filter(w => w.isReady).length > 0;
if (isWindowReady) { this.flush(); }
else { this._register(Event.once(windowsMainService.onDidSignalReadyWindow)(() => this.flush())); }
```

The `flush()` method retries up to 10 times at 500ms intervals if the URL handler reports the URL as unhandled, accommodating async window readiness.

**Implications:** The P0 race for any Electron app with custom scheme on macOS is: (a) listener must be registered at top-of-main synchronously, (b) received URLs must be queued if no window exists yet, (c) queue must flush after window is ready. Missing any of the three breaks cold-start deep-linking.

### Finding: On Windows, cold-start URL arrives as the LAST element of `process.argv`
**Confidence:** CONFIRMED
**Evidence:** https://github.com/electron/electron/issues/40173, https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85)

Microsoft registry spec:
> "If the specified **open** command specified in the registry contains a **%1** parameter, Internet Explorer passes the URI to the registered pluggable protocol handler application."

`setAsDefaultProtocolClient` on Windows writes a `shell\open\command` registry entry of the form `"C:\Path\To\App.exe" "%1"` (or with the app's configured `args` array inserted before `%1`). When the OS launches the app, the URL is appended as the final argv element.

The canonical cold-start pattern documented in Electron's official tutorial:
```javascript
app.whenReady().then(() => {
    createWindow()
    // Windows/Linux: read URL from argv on cold start
    const deeplinkUrl = process.argv.find(arg => arg.startsWith('electron-fiddle://'))
})
```

Issue #40173 confirms this cold-start argv path is "undocumented but required" in the official tutorial.

**Implications:** Apps must (1) scan `process.argv` on launch for the scheme prefix, AND (2) install a `second-instance` handler — cold-start and hot-delivery use different code paths.

### Finding: On Windows/Linux, when the app is ALREADY running, the URL arrives via `app.on('second-instance')`
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app, https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app

```javascript
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // commandLine is the argv array of the second instance, sent to primary
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })
}
```

Caveats directly from Electron docs for `app.on('second-instance')`:
- `argv` "will not be exactly the same list of arguments as those passed to the second instance. The order might change and additional arguments might be appended" — use `additionalData` for exact payload.
- "If the second instance is started by a different user than the first, the `argv` array will not include the arguments"
- "Extra command line arguments might be added by Chromium, such as `--original-process-start-time`"
- The event "guaranteed after `ready` event fires"

### Finding: macOS hot-delivery also uses `open-url` (no `second-instance` fallback)
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app, https://github.com/electron/electron/issues/20088

macOS's system-enforced single-instance model means the OS routes both cold-start and hot-delivery URLs through the same `open-url` event — there is no separate "relaunch" code path. This asymmetry means code must be platform-gated:

```javascript
// Install both — macOS uses open-url; Windows/Linux use second-instance
app.on('open-url', (event, url) => { handle(url) })     // macOS
app.on('second-instance', (event, argv) => {            // Win/Linux
    const url = argv.find(a => a.startsWith('myapp://'))
    if (url) handle(url)
})
```

Issue electron#20088 ("'Second-instance' fires instead of 'open-url' in electron on...") documents edge cases where the macOS single-instance enforcement can misfire and fire `second-instance` instead, but this appears to have been fixed in later Electron versions.

### Finding: macOS in dev-mode (unpackaged) does not receive `open-url` from the OS
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app, https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html

Official tutorial:
> "This feature will only work on macOS when your app is packaged. It will not work when launching in development from the command-line."

Blog walkthrough confirms:
> "Limitation: macOS and Linux require proper packaging/installation; Windows supports runtime registration. For dev testing on macOS/Linux, keep the production app closed when launching the dev version."

LaunchServices registers the scheme at app-install time (when the `CFBundleURLTypes` plist is read during the app's first registration). A loose `Electron.app` launched from CLI during development has no entry in the LaunchServices database for the custom scheme, so the OS routes to a different app (usually the packaged production app, if installed).

### Finding: `will-finish-launching` is aliased to `ready` on Windows/Linux
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app

> "On Windows and Linux, the `will-finish-launching` event is the same as the `ready` event"
> "In most cases, you should do everything in the `ready` event handler"

Only on macOS does `will-finish-launching` represent the earlier `applicationWillFinishLaunching` NSNotification — the correct hook for registering `open-url` before any URL delivery.

Tutorial guidance:
```javascript
// Correct — macOS: register open-url inside will-finish-launching OR at top-of-main
app.on('will-finish-launching', () => {
    app.on('open-url', (event, url) => { ... })
})

// Also correct (and simpler) — register open-url synchronously at the top of main.js
// before any await / before app.whenReady()
```

---

## Platform summary matrix

| Scenario | macOS | Windows | Linux |
|---|---|---|---|
| App NOT running, URL click | Launches app → `open-url` fires (possibly before `ready`) | Launches app → URL is last `process.argv` element | Launches app → URL is last `process.argv` element |
| App already running, URL click | `open-url` fires | `second-instance(argv)` fires on primary instance after requestSingleInstanceLock | `second-instance(argv)` fires on primary instance after requestSingleInstanceLock |
| Dev-mode unpackaged | Does not receive URL (scheme not in LaunchServices) | Works if `setAsDefaultProtocolClient` ran (registry written) | Requires manually-installed .desktop file |
| Listener registration timing | Must be synchronous at top-of-main (or in `will-finish-launching`) | Must parse `process.argv` in main, register `second-instance` after `requestSingleInstanceLock` | Same as Windows |

## Gaps / follow-ups

- Exact Electron version where issue #32600 was patched or documented. Electron's official tutorial still (as of the captured content) does not explicitly call out that `open-url` fires before `ready`, leaving the timing expectation implicit.
- Behavior when a user clicks a URL while a modal dialog is open — whether `open-url` still fires and whether the app is responsible for queueing.
