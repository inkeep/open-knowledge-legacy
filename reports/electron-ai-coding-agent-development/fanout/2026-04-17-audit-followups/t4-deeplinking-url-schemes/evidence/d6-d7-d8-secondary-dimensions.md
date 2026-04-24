# Evidence: D6/D7/D8 — Single-Instance Coordination, Fallback UX, E2E Testing

**Dimensions:**
- D6 (P1 Moderate) — Single-instance coordination
- D7 (P1 Moderate) — Fallback UX when protocol unregistered
- D8 (P1 Moderate) — E2E testing

**Date:** 2026-04-17
**Sources:** Electron docs, Playwright docs, community walkthroughs, VS Code implementation

---

## D6: Single-Instance Coordination

### Finding: `app.requestSingleInstanceLock(additionalData?)` is the primary primitive for URL propagation to the primary instance
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app

Signature:
```
app.requestSingleInstanceLock([additionalData])
  additionalData?: Record<any, any>   // JSON-serializable, sent to primary
Returns: boolean                       // true = primary; false = secondary (quit immediately)
```

Canonical usage:
```javascript
const gotLock = app.requestSingleInstanceLock({ url: parseUrlFromArgv(process.argv) })
if (!gotLock) {
    app.quit()   // secondary — payload is now delivered to primary
    return
}

app.on('second-instance', (event, argv, cwd, additionalData) => {
    // additionalData is the structured payload; argv is the raw argv (may be mutated)
    const url = additionalData?.url ?? argv.find(a => a.startsWith('myapp://'))
    focusMainWindow()
    routeToUrl(url)
})
```

### Finding: `argv` in the `second-instance` event is unreliable for exact reproduction
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/app

Direct quote from the API docs:
> "`argv` will not be exactly the same list of arguments as those passed to the second instance. The order might change and additional arguments might be appended"
> "If the second instance is started by a different user than the first, the `argv` array will not include the arguments"
> "Extra command line arguments might be added by Chromium, such as `--original-process-start-time`"

This is why `additionalData` (introduced in Electron 14+) is the recommended channel for structured payloads. The secondary instance computes the URL from its own argv, places it in `additionalData`, and the primary receives the clean value.

### Finding: Multi-window routing is application-level, not Electron-level
**Confidence:** CONFIRMED
**Evidence:** Electron docs, community patterns

Electron does not choose which window receives a deep link — that's application logic. Common patterns:
- **Single-window apps:** focus the (only) window, navigate it to the URL target.
- **Multi-window apps (VS Code, Logseq):** route to the window whose active project/graph/workspace matches the URL's identifier. If no match, either open the project in a new window or prompt the user. Logseq's URL dispatcher takes this approach explicitly (see `url.cljs:local-url-handler` which opens a new window if no existing one holds the target graph).
- **MDI-style apps:** the most recently focused window receives the URL.

VS Code's `windowsMainService` exposes `onDidSignalReadyWindow` and the URL listener waits for any ready window before flushing queued URLs — if no window exists yet, VS Code creates one via the normal open-workspace flow and then routes.

---

## D7: Fallback UX when Protocol Unregistered

### Finding: Browsers silently fail on unregistered schemes (no user error)
**Confidence:** CONFIRMED
**Evidence:** Browser behavior convention, community troubleshooting

When a user clicks an `openknowledge://open?...` link and no app is registered to handle the scheme:
- **Chrome/Edge:** The click silently does nothing. No visible error to the user.
- **Firefox:** A dialog appears asking "Which application to use?" — requires manual selection.
- **Safari:** Shows "Safari cannot open the page" or similar generic error.

This is by design — browsers do not expose "no handler" detection to the page. There is no JavaScript API to test whether a custom scheme is registered, short of launching and timing out.

### Finding: Production apps fall back to a web URL on the server/public page
**Confidence:** CONFIRMED (pattern observed in multiple apps)
**Evidence:** Figma (https://help.figma.com/hc/en-us/articles/360039824334), Slack, Notion documented behaviors

Common pattern — the "deep link" link is actually a web page with JS that:
1. Immediately attempts `window.location = 'myapp://...'`
2. Sets a timeout (typically 2-3 seconds)
3. If the page is still visible after the timeout, shows "Open in browser" fallback or "Download the app" CTA.

Figma's approach: the canonical `https://www.figma.com/file/...` URL is the permanent link. A "Open in desktop app" toggle/preference triggers the `figma://` scheme only if desktop is installed. The web URL always works regardless.

### Finding: No JS API to verify scheme registration; apps build bridging pages
**Confidence:** CONFIRMED
**Evidence:** Standard browser security model

There is no `navigator.registerProtocolHandler` query API to check if a scheme is registered — and even `navigator.registerProtocolHandler` only covers browser-registered handlers, not OS-level. For OS-registered schemes, apps must build HTTPS "bridge" pages that attempt the redirect and offer a fallback.

VS Code's bridge is https://vscode.dev; Cursor, Obsidian, Slack all have web fallbacks.

---

## D8: E2E Testing

### Finding: Playwright `_electron.launch` supports passing args, including the URL as argv
**Confidence:** CONFIRMED
**Evidence:** https://playwright.dev/docs/api/class-electron, https://til.simonwillison.net/electron/testing-electron-playwright

Basic launch:
```typescript
import { _electron as electron } from 'playwright';

const app = await electron.launch({
    args: ['.', 'myapp://open?project=/tmp/proj&doc=README.md'],
    env: { ...process.env, NODE_ENV: 'test' },
});
```

This tests the **cold-start** path — the URL is the final argv element, which is exactly what Windows/Linux cold-start normally delivers. `process.argv.find(a => a.startsWith('myapp://'))` in the Electron main will see the test URL.

### Finding: The `open-url` event cannot be cleanly triggered from Playwright
**Confidence:** INFERRED
**Evidence:** Playwright Electron API does not expose event emission; community discussions (microsoft/playwright#9867, #19854) confirm absence

Playwright's `_electron` API lets you:
- `app.evaluate(fn)` — execute code in the main process
- `app.firstWindow()` — get BrowserWindow handles
- `app.windows()` — list windows

But there is no built-in way to dispatch Electron events like `open-url` or `second-instance` to the running app. The standard workaround is to have the test itself invoke the event via `app.evaluate`:

```typescript
await app.evaluate(({ app }, url) => {
    app.emit('open-url', { preventDefault: () => {} }, url);
}, 'myapp://open?doc=test.md');
```

This works because Electron's event system is a plain EventEmitter — emitting from the main process reaches the registered listeners. Caveat: this bypasses any OS-level security (CVE-2018-1000006 sentinel, etc.), so it tests listener logic but not the OS-handler flow.

### Finding: The `second-instance` event can be triggered by launching a second Electron process
**Confidence:** CONFIRMED
**Evidence:** Standard pattern in community test suites

```typescript
// Start the primary — it acquires single-instance lock
const primary = await electron.launch({ args: ['.', 'myapp://initial'] });

// Launch a "second instance" — will emit second-instance on primary and exit itself
const { spawn } = require('child_process');
spawn(electronBinary, [appPath, 'myapp://second-delivery']);

// Wait for primary to receive the event
await primary.evaluate(() => new Promise(r => {
    app.once('second-instance', (_, argv) => r(argv));
}));
```

This is closest to real cold-vs-warm behavior but requires access to the Electron binary path. The Electron team's own tests follow this pattern.

### Finding: macOS `open-url` cannot be triggered via OS commands in dev-mode Playwright
**Confidence:** CONFIRMED
**Evidence:** The packaging requirement for macOS scheme registration

`open "myapp://test"` on macOS only works if the scheme is registered in LaunchServices. A `_electron.launch` (unpackaged) process has no LaunchServices entry. The only viable path for unpackaged macOS testing is direct event emission via `app.evaluate`.

For packaged E2E coverage on macOS, tests must launch the full packaged `.app` bundle (not via Playwright — Playwright cannot drive a packaged .app directly) and use `open` CLI to deliver URLs. This is typically done in a separate "packaging smoke test" tier rather than day-to-day Playwright runs.

### Finding: electron-playwright-helpers npm package provides syntactic sugar
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/electron-playwright-helpers

Community package `electron-playwright-helpers` wraps common patterns (menu-item invocation, IPC testing) but does not specifically expose `open-url` / `second-instance` emitters. The `app.evaluate` pattern remains the canonical approach.

### Playwright coverage matrix for deep-link testing

| Scenario | Playwright feasible? | Approach |
|---|---|---|
| Cold-start via argv (Win/Linux) | Yes | `electron.launch({ args: ['.', 'myapp://...'] })` |
| Cold-start via `open-url` (macOS) | Indirectly | `app.evaluate((el, url) => el.app.emit('open-url', ..., url))` |
| Hot-delivery via `second-instance` | Yes | Spawn a second `electron` process; primary receives event |
| Hot-delivery via `open-url` (macOS) | Indirectly | Same `app.evaluate` pattern; real OS flow requires packaged app |
| Full OS-integrated flow | No (in Playwright) | Requires packaged app + OS-native `open` / registry click test harness |

---

## Gaps / follow-ups

- Whether the `electron-playwright-helpers` package adds helpers specifically for protocol-handler testing in its newer versions.
- Detailed comparison of Spectron vs Playwright for deep-link testing (Spectron is end-of-life but was the prior standard).
