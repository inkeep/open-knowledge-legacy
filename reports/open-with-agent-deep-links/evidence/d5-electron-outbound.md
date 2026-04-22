# Evidence: D5 — Electron outbound protocol-handler invocation

**Dimension:** Calling out to other apps' URL schemes and CLIs from an Electron app
**Date:** 2026-04-21
**Sources:** electronjs.org/docs, Electron GitHub, Microsoft Learn, benjamin-altpeter.de, Node.js docs

---

## Key files / pages referenced

- https://www.electronjs.org/docs/latest/api/shell — `shell.openExternal` API
- https://github.com/electron/electron/blob/main/docs/api/shell.md — canonical source for Shell API
- https://github.com/electron/electron/pull/16176 — async split of `openExternal`
- https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app — **inbound** deep-link tutorial (scope clarifier)
- https://www.electronjs.org/docs/latest/tutorial/security — Electron security guide
- https://benjamin-altpeter.de/shell-openexternal-dangers/ — pragmatic `openExternal` gotchas
- https://nodejs.org/api/child_process.html — `spawn` / `exec` semantics
- https://learn.microsoft.com/en-us/windows/win32/sysinfo/hkey-classes-root-key — Windows URL-scheme registration
- https://learn.microsoft.com/en-us/archive/blogs/ieinternals/url-length-limits — Windows ShellExecute URL length
- In-repo reference: `packages/desktop/src/main/shell-allowlist.ts` — existing outbound-scheme allowlist pattern

---

## Findings

### Finding: `shell.openExternal(url)` returns `Promise<void>`, works for arbitrary schemes OS-registered elsewhere, no Electron-level allowlist
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/api/shell, Electron PR #16176

Signature: `shell.openExternal(url[, options]) → Promise<void>` since Electron 5 (`openExternalSync` removed).

- **Arbitrary custom schemes:** works. The OS default-handler machinery is invoked. If the target app registered `cursor://` / `vscode://` / `claude://` at install time, the scheme resolves the same way as `mailto:`. Electron itself does nothing scheme-specific.
- **Platform resolution:**
  - macOS → LaunchServices (`LSOpenCFURLRef`-equivalent) consults bundle `CFBundleURLSchemes`.
  - Windows → `ShellExecuteExW` consults `HKEY_CLASSES_ROOT\<scheme>\shell\open\command` (merged HKCU > HKLM; user-level needs no admin).
  - Linux → xdg-open via GIO or the `xdg-open` binary; `.desktop` files declare `MimeType=x-scheme-handler/<scheme>`.
- **Async + return:** Resolves when OS call completes — does NOT indicate the target app actually launched, only that the handoff succeeded. Rejection is rare — common case is silent resolution even if no handler is registered.
- **URL length:** 2081 chars on Windows (official Electron docs), enforced by ShellExecute's `INTERNET_MAX_URL_LENGTH`.
- **No built-in scheme allowlist.** Electron ships no `shell.openExternal` allowlist — app developers implement their own. This repo's `packages/desktop/src/main/shell-allowlist.ts` is the reference pattern (`https:`, `http:`, `mailto:`, `openknowledge:`).

### Finding: Outbound protocol-handler invocation does NOT require registering the scheme in our app
**Confidence:** CONFIRMED
**Evidence:** https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app (scope is inbound only)

`app.setAsDefaultProtocolClient(scheme)` and the `protocol` module are **inbound** — they register our Electron app as the handler for incoming URLs. Calling OUT via `shell.openExternal("cursor://...")` invokes the OS default-handler resolution for the target scheme, which depends on Cursor having registered itself at install time — not on our Electron app doing anything.

**User's intuition confirmed:** we do NOT need to do anything in our app for `openWithAgent` to fire `cursor://`, `claude://`, or `vscode://`. The existing `shell-allowlist.ts` in this repo would need these schemes added to the allowlist (currently only `openknowledge:` is there besides the built-ins) — but that's a list of what we're willing to CALL OUT to, not what we register to receive.

### Finding: Spawn vs openExternal decision matrix
**Confidence:** CONFIRMED (mapping), MEDIUM (terminal-wrap reliability)
**Evidence:** Electron docs + Node.js child_process + community patterns

| Target type | Target has URL scheme? | Best pattern | Notes |
|---|---|---|---|
| GUI app with scheme | Yes | `shell.openExternal("cursor://...")` | Path of least resistance. |
| GUI app without scheme | No | macOS: `spawn("open", ["-a", "App Name", "--args", ...])`; Windows: `spawn("cmd", ["/c", "start", "", appPath, ...args])`; Linux: `spawn("xdg-open", [path])` or direct binary spawn | `open -a ... --args` does not reliably pass CLI args to the target; many apps ignore them. |
| CLI in terminal (claude, codex) | No | Hand-rolled per-platform — spawn a terminal emulator wrapping the CLI | No stable cross-platform npm package. |
| CLI headless (background) | N/A | `spawn("claude", ["-p", prompt], { cwd: dir, shell: false })` | `shell: false` + argv array = injection-safe. |

### Finding: `shell.openExternal` Promise resolution ≠ target-app launch success
**Confidence:** CONFIRMED
**Evidence:** https://benjamin-altpeter.de/shell-openexternal-dangers/

> "`shell.openExternal` uses fire-and-forget OS APIs on all platforms. The returned Promise resolves when the OS call completes, not when the target app confirms. 'No handler registered' typically resolves silently rather than rejecting."

Implications for `openWithAgent`:
- **Do not rely on Promise resolution as success signal.** Cannot show "Opened in Cursor ✓" confirmation based solely on openExternal success.
- For user-visible success, either (a) let the target app surface its own UI ("Open link in Cursor?" system dialog), or (b) pair the openExternal with a pre-check: does the target app's binary/bundle exist on this machine? — see LaunchServices / `Get-AppxPackage` / `which` / `xdg-mime query default`.

---

## Negative searches (NOT FOUND)

- Searched Electron docs for "outbound scheme allowlist" → only inbound registration docs. Confirms no built-in allowlist.
- Searched for a stable cross-platform npm package for "spawn CLI inside user's default terminal" → none maintained. `electron-terminal-open` (9y stale), `open-terminal` (5y stale). Prevailing approach is hand-rolled per-platform.

---

## Gaps / follow-ups

- **Target-app-presence detection:** before calling `openExternal("cursor://...")`, ideally we check "is Cursor installed on this machine?" so we can fall back to a graceful "Cursor not installed" UI instead of relying on the OS's system dialog. Per-platform probe shape (exact bundle IDs / registry keys need empirical verification per agent):
  - macOS: `mdfind "kMDItemCFBundleIdentifier == '<bundle-id>'"` or LaunchServices API (`NSWorkspace.urlForApplication(withBundleIdentifier:)`).
  - Windows: registry read of `HKCR\<scheme>\shell\open\command`.
  - Linux: `xdg-mime query default x-scheme-handler/<scheme>`.
- **`shell.openExternal` rejection modes:** specific rejection cases (malformed URL, etc.) should be catalogued for `openWithAgent` error handling.
