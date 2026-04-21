---
title: "Electron Custom URL Schemes: Deep-Linking Mechanics + Security (2026)"
description: "Production-Electron patterns for registering and handling custom URL schemes (foo://) across macOS, Windows, and Linux. Covers registration mechanics, cold-start vs already-running delivery, security (CVE-2018-1000006 and the argv-injection class), packaging, and E2E testing. Surveys VS Code, Cursor, Obsidian, Logseq, GitHub Desktop, Figma, Slack."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Electron
  - URL schemes
  - deep linking
  - VS Code
  - Cursor
  - Obsidian
  - Logseq
  - LaunchServices
topics:
  - custom URL scheme registration
  - deep-link security
  - cold-start URL delivery
  - single-instance coordination
  - electron-builder protocols
---

# Electron Custom URL Schemes: Deep-Linking Mechanics + Security (2026)

**Purpose:** Evidence-backed reference for registering and handling `foo://` custom URL schemes in production Electron apps across macOS, Windows, and Linux. Documents registration mechanics, cold-start vs already-running delivery, the security landscape shaped by CVE-2018-1000006, packaging, and testing. Downstream consumers (e.g., `specs/2026-04-11-electron-desktop-app/`) can derive concrete design decisions from this factual base.

---

## Executive Summary

Registering an `openknowledge://` custom scheme in an Electron desktop app is a solved problem, but the correct implementation is a **triad of separate per-platform mechanisms** rather than a single API. `app.setAsDefaultProtocolClient` looks cross-platform but is effectively a Windows registry writer; on macOS the source of truth is `CFBundleURLTypes` in `Info.plist` (set at packaging time), and on Linux it is a `.desktop` file with `MimeType=x-scheme-handler/<scheme>;` (set at install time, **not reliably generated for AppImage**).

Three distinct delivery paths exist:
- **macOS:** URL arrives via `app.on('open-url')` — which can fire **before** `ready` or `will-finish-launching` on cold-start. VS Code's `ElectronURLListener` solves this with a queue-then-flush pattern (10×500ms retries).
- **Windows/Linux cold-start:** URL arrives as the last element of `process.argv`.
- **Windows/Linux hot-delivery:** URL arrives via `app.on('second-instance', (event, argv, cwd, additionalData))` after the secondary instance calls `requestSingleInstanceLock`. `additionalData` (Electron 14+) is the reliable structured-payload channel; raw `argv` is unreliable (Chromium may append flags).

The security story pivots on **CVE-2018-1000006** — an argv-injection class that affected every Windows Electron app that registered a custom scheme before January 2018. Slack, Skype, Signal, GitHub Desktop, Twitch, and WordPress.com were all publicly named. The initial blacklist fix was bypassed via `host-rules` (Doyensec, May 2018). The durable mitigation is the `--` sentinel pattern visible in VS Code's production source — pass `['--open-url', '--']` as the args array so Chromium stops parsing flags. Beyond that, apps should enforce a strict scheme allowlist on outbound `shell.openExternal` to avoid the adjacent "1-click RCE via OS-native scheme" class documented by Shabarkin (2022).

Playwright can test the cold-start argv flow directly by passing the URL in `electron.launch({ args: [..., url] })`. Triggering `open-url` or `second-instance` events requires `app.evaluate` to dispatch them from within the main process; true OS-integrated flows require packaged-app smoke tests outside Playwright.

**Key Findings:**
- **Registration is three-platform-three-mechanism.** The single API name (`setAsDefaultProtocolClient`) hides real divergence. CONFIRMED.
- **macOS `open-url` can fire before `ready`.** Listener must be registered synchronously at top-of-main; URLs must be queued until a window exists. VS Code implements a 10×500ms retry loop. CONFIRMED via electron/electron#32600 and microsoft/vscode source.
- **CVE-2018-1000006 closed the inbound argv-injection class via the `--` sentinel.** Production code (VS Code) passes `['--open-url', '--']` as args. CONFIRMED.
- **All production apps focus existing windows and route-by-workspace-identifier.** Obsidian requires `vault=`; Logseq requires graph identifier; VS Code routes by project/workspace. CONFIRMED across 5+ apps.
- **AppImage has no native deep-link support.** electron-builder does not emit a .desktop file for AppImage targets and `setAsDefaultProtocolClient` fails. CONFIRMED.
- **Playwright can test cold-start via argv, not the full OS-handler flow.** `open-url` / `second-instance` can be triggered programmatically via `app.evaluate`. CONFIRMED.

---

## Research Rubric

| Dimension | Priority | Purpose |
|---|---|---|
| D1 — Cross-platform registration mechanics | P0 (Deep) | How does `setAsDefaultProtocolClient` behave per OS? |
| D2 — Cold-start vs already-running delivery | P0 (Deep) | Per-platform timing + event paths |
| D3 — Security: URL payload validation | P0 (Deep) | CVE history + defense patterns |
| D4 — Production-app shapes | P0 (Deep) | URL conventions + hardening in real apps |
| D5 — Packaging configurations | P0 (Deep) | electron-builder + platform-specific |
| D6 — Single-instance coordination | P1 (Moderate) | `requestSingleInstanceLock` + multi-window routing |
| D7 — Fallback UX when unregistered | P1 (Moderate) | First-run, broken LaunchServices, etc. |
| D8 — E2E testing with Playwright | P1 (Moderate) | What can / can't be automated |

**Non-goals:** HTTP universal links / app links (MAS/Play-Store territory); web-intent-style `navigator.registerProtocolHandler`; first-party design details; Claude Desktop's internal MCP `previewUrl` handling.

---

## Detailed Findings

### D1 — Cross-platform registration mechanics [P0]

`app.setAsDefaultProtocolClient(protocol)` is not genuinely cross-platform — it is effectively a Windows registry writer. The `path` and `args` parameters are documented as Windows-only.

| Platform | Source of truth | API role | Registration time |
|---|---|---|---|
| macOS | `CFBundleURLTypes` in `Info.plist` (LaunchServices DB) | Advisory; OS reads plist at install | Packaging + install |
| Windows | `HKCU\Software\Classes\<scheme>\shell\open\command` | Writes these keys on first launch | Runtime |
| Linux | `.desktop` file `MimeType=x-scheme-handler/<scheme>;` in `$XDG_DATA_DIRS/applications/` | Unreliable on AppImage; works on deb/rpm | Install time |

VS Code's production code (`src/vs/platform/url/electron-main/electronUrlListener.ts`) encodes the asymmetry with a platform-specific per-branch implementation.

**Evidence:** [evidence/d1-cross-platform-registration.md](evidence/d1-cross-platform-registration.md)

**Confidence:** CONFIRMED.

**Implications:** For an `openknowledge://` scheme, the packaging stack must emit all three artifacts:
- macOS `CFBundleURLTypes` (via electron-builder's `protocols` key)
- Windows registry via runtime `setAsDefaultProtocolClient` (or NSIS install script)
- Linux `.desktop` file (via electron-builder's `linux.mimeTypes` for deb/rpm; **broken for AppImage**)

**Remaining uncertainty:** Whether current Electron writes to Windows 10+ `UrlAssociations\UserChoice` framework or only legacy `HKCU\Software\Classes`.

### D2 — Cold-start vs already-running URL delivery [P0]

Each platform has distinct delivery semantics. The biggest pitfall is macOS's `open-url` event, which can fire **before** both `ready` and `will-finish-launching` — meaning listeners registered inside `app.whenReady()` callbacks will miss cold-start URLs.

| Scenario | macOS | Windows | Linux |
|---|---|---|---|
| App NOT running, URL click | OS launches → `open-url`, potentially before `ready` | OS launches → URL is last element of `process.argv` | OS launches → URL is last of `process.argv` |
| App running, URL click | `open-url` on primary | `second-instance(argv, cwd, additionalData)` after `requestSingleInstanceLock` | `second-instance` |
| Dev-mode unpackaged | Does NOT receive URL (LaunchServices prerequisite) | Works (runtime registry write) | Requires manually-installed .desktop |

VS Code's queue-then-flush pattern (`ElectronURLListener.uris` + 10×500ms retries) is the reference pattern:

```typescript
// src/vs/platform/url/electron-main/electronUrlListener.ts (excerpt)
// Register synchronously at top of main:
app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    this.uris.push(url);  // queue
    this.flush();
  });
});

// flush() polls up to 10x at 500ms intervals, sending queued URLs once a window exists
```

All three delivery paths must be installed; missing any one breaks a subset of user flows. `additionalData` (Electron 14+) is the clean channel for structured payloads from secondary-instance to primary; raw `argv` is unreliable (Chromium appends its own flags, order varies, cross-user launches strip args).

**Evidence:** [evidence/d2-cold-start-vs-running-delivery.md](evidence/d2-cold-start-vs-running-delivery.md)

**Confidence:** CONFIRMED.

**Implications:**
- Open Knowledge's Electron main must register `open-url` listener inside `will-finish-launching` (or synchronously at module-top), NOT inside `app.whenReady()`.
- URLs arriving before any BrowserWindow exists must be queued and dispatched when a window is available.
- Use `additionalData` for structured deep-link payloads, not argv parsing.

### D3 — Security: URL payload validation [P0]

CVE-2018-1000006 defined the dominant attack class — argv injection through URL content — and its durable mitigation is the `--` (double-dash) sentinel pattern.

**CVE timeline:**

| CVE | Year | Affected | Mechanism | Fix |
|---|---|---|---|---|
| CVE-2018-1000006 | 2018 | Windows Electron apps registering any `foo://` (Slack, Skype, Signal, GitHub Desktop, Twitch, WordPress.com) | `myapp://foo" --gpu-launcher="calc" --bar='` — argv injects Chromium flags | Electron 1.6.17 / 1.7.12 / 1.8.2-beta.5; blacklist |
| CVE-2018-1000006 bypass | 2018 | Same | `host-rules` flag bypass, MITM + RCE | Electron 1.7.15 / 1.8.7 / 2.0.1; `--` sentinel |
| CVE-2019-6453 | 2019 | mIRC (generalizable) | `irc://? -i\\ATTACKER\config.ini` UNC injection | Per-app |
| "1-click RCE" (Shabarkin 2022) | 2022 | Apps passing untrusted URLs to `shell.openExternal` | `ms-msdt:`, `search-ms:`, `ms-officecmd:` OS-native scheme argv chain | App-level scheme allowlist |

**The `--` sentinel pattern (load-bearing).** VS Code production:
```typescript
windowsParameters.push('--open-url', '--');
app.setAsDefaultProtocolClient(
  productService.urlProtocol,
  process.execPath,
  windowsParameters,
);
```
Trailing `'--'` tells Chromium all subsequent argv elements are positional, defeating the argv-injection class structurally. `--open-url` is a sentinel flag that disambiguates URL-delivered launches from other CLI invocations.

**Production validation patterns:**
1. URI parse with try/catch, silent-drop on failure (VS Code).
2. Scheme allowlist on outbound `shell.openExternal`.
3. Action/parameter allowlists (Obsidian's fixed action set: `open`, `new`, `hook-get-address`, etc.).
4. Path-traversal scrubbing for file-referencing params (`..` rejection, realpath-based containment check).
5. Payload signing (Cursor uses JWT-signed deep links for MCP install — rare but growing).

**Windows encoding pitfall:** Browsers decode URLs inconsistently (Chrome encodes; Firefox/Edge don't). Apps must treat incoming URLs as untrusted and not rely on consistent encoding.

**Evidence:** [evidence/d3-security-url-payload-validation.md](evidence/d3-security-url-payload-validation.md)

**Confidence:** CONFIRMED.

**Implications for openknowledge:// design:**
- `setAsDefaultProtocolClient('openknowledge', process.execPath, ['--open-url', '--'])` — mandatory for Windows.
- URL parsing: `try { new URL(url) } catch { log.warn + silent-drop }`.
- Project path parameter: realpath + containment check (reject paths outside known-roots from Recent Projects list).
- Action allowlist: fixed set (`open`, `focus`, `preview`) — no eval-style arbitrary-handler dispatch.
- Outbound `shell.openExternal` (from D38 bridge) MUST itself allowlist URL schemes to prevent 1-click RCE via chained OS-native handlers.

### D4 — Production-app shapes [P0]

| App | Scheme | URL shape | Trigger | Hardening | Source access |
|---|---|---|---|---|---|
| VS Code | `vscode://` | `vscode://<publisher>.<ext>/<path>?<q>` | Focus existing, queue | `--` sentinel, URI parse try/catch, 10×500ms retry, portable-mode skip | OSS |
| Cursor | `cursor://` | `cursor://<ext>/<action>?<q>` (e.g. MCP install) | Focus existing | **JWT-signed**, base64 config | Closed; public docs |
| Obsidian | `obsidian://` | `obsidian://<action>?vault=&file=&content=` | Focus existing | Fixed action allowlist, vault-scoped paths | Closed; spec |
| Logseq | `logseq://` | `logseq://<graph\|x-callback-url\|new-window>/<id>?<q>` | Focus existing; graph must be pre-linked | Host dispatcher, graph-ID validation | OSS |
| GitHub Desktop | `x-github-client://` | `x-github-client://openRepo?url=&branch=&pr=` | Focus existing | Affected by CVE-2018-1000006; Electron-level fix | OSS |
| Figma | `figma://` | Mirror of web URL | Focus/launch + nav | Not public | Closed |
| Slack | `slack://` | `slack://channel?team=&id=` | Navigate | Patched v3.0.3+ | Closed |
| Discord | `discord://` | `discord://discord.com/channels/<s>/<c>/<m>` | Navigate | Post-2022 unclear | Closed |
| Notion | `notion://` | Web URL mirror | Navigate | Not public | Closed |
| Linear | `linear://` | Issue/view link | Navigate | Not public | Closed |

**Convergences across production apps:**
- **Host-as-action-verb** — `vscode://<action>`, `obsidian://<action>`, `logseq://<action>`. The host segment names what to do; path + query carry parameters.
- **Query-string params** (not positional path) for optional parameters.
- **Required workspace identifier** — `vault=`, graph ID, project/workspace — app refuses to dispatch without it (prevents "which-project" ambiguity).
- **Focus-existing-window default** — no app creates a new window on deep-link; they find the matching existing window and focus + navigate.
- **Silent-drop on parse failure** — no user-visible error dialog for malformed URLs (attack-surface reduction).

**Divergences:**
- Payload signing rare but Cursor's JWT raises the bar for tampering-sensitive flows (MCP-install specifically, because it installs executable code).
- Cold-start-without-workspace handling differs — Logseq errors out, VS Code creates a new window, Obsidian opens and focuses the "no vault" picker.

**Evidence:** [evidence/d4-production-app-shapes.md](evidence/d4-production-app-shapes.md)

**Confidence:** CONFIRMED (OSS sources directly inspected for VS Code, Logseq, GitHub Desktop; others via public docs).

**Implications for `openknowledge://`:**
- URL shape: `openknowledge://open?project=<realpath>&doc=<docName>` — host=action, query=params, required `project` identifier. Matches industry convention.
- Trigger: focus existing BrowserWindow for `project`, navigate to `doc`.
- Silent-drop on parse failure.
- No payload signing needed for v0 (not installing code; just opening docs).

### D5 — Packaging configurations [P0]

electron-builder's `protocols` key emits macOS `CFBundleURLTypes` only. Windows is runtime via `setAsDefaultProtocolClient`; Linux is install-time via `.desktop` file (generated for deb/rpm, NOT AppImage).

```yaml
# electron-builder.yml
protocols:
  - name: Open Knowledge URL
    schemes: [openknowledge]
    role: Editor   # macOS-only
linux:
  target: [deb, rpm]
  mimeTypes:
    - x-scheme-handler/openknowledge
```

| Platform | Packaging-time artifact | Runtime responsibility |
|---|---|---|
| macOS dmg/zip | `CFBundleURLTypes` | `open-url` listener |
| macOS MAS | plist at submission | `open-url` only; **skip `requestSingleInstanceLock`** (crashes on MAS) |
| Windows NSIS/MSI | Nothing by default | `setAsDefaultProtocolClient(execPath, ['--open-url', '--'])` |
| Windows Store | `appxmanifest.xml` protocol extension | No runtime registration (sandbox) |
| Linux deb/rpm | `.desktop` with `MimeType=x-scheme-handler/<scheme>;` | Fallback via `setAsDefaultProtocolClient` |
| Linux AppImage | **Not generated** | Requires `appimaged`/`AppImageLauncher` |
| Linux Snap | snapcraft plugs | Limited (portal-based) |
| Linux Flatpak | Desktop file in flatpak manifest | Sandboxed |

**Evidence:** [evidence/d5-packaging-configurations.md](evidence/d5-packaging-configurations.md)

**Confidence:** CONFIRMED.

**Implications:**
- For our Linux scope (NG4 now Linux-only NOT NOW): AppImage would require a companion `.desktop` install step or migration to deb/rpm/Flatpak if deep-linking matters.
- For MAS (NG2 [NEVER]): irrelevant, we don't ship MAS.
- Primary targets (macOS dmg + Windows NSIS) both work with standard patterns.

### D6 — Single-instance coordination [P1]

`app.requestSingleInstanceLock(additionalData?)` + `app.on('second-instance', handler)` is standard. Key details:
- `additionalData` (Electron 14+) is the clean structured-payload channel; `argv` is unreliable.
- Multi-window routing is entirely application-level — Electron does not choose which window receives a deep link. Common patterns: match-by-workspace-identifier (VS Code, Logseq), most-recently-focused wins, or singleton main window.
- On MAS, `requestSingleInstanceLock` can crash — skip the lock on MAS builds.

**Evidence:** [evidence/d6-d7-d8-secondary-dimensions.md](evidence/d6-d7-d8-secondary-dimensions.md)

**Confidence:** CONFIRMED.

**Implications for our multi-window model:**
- We need `requestSingleInstanceLock` to coordinate URL delivery across windows.
- Main's existing `Map<contentDir, BrowserWindow>` serves as the routing table: parse incoming URL → extract project → lookup window → focus + navigate. If no window for that project, spawn one.

### D7 — Fallback UX when protocol unregistered [P1]

Browsers silently fail on unregistered schemes (no user-visible error). No JavaScript API to test scheme registration. Production apps use HTTPS bridge pages that try the scheme, timeout (~2.5s), and show "Open in browser" / "Download the app" fallback. Figma's model keeps the canonical link as the web URL; `figma://` is a user-preference toggle.

**Confidence:** CONFIRMED.

**Implications for v0:**
- Not a blocker for first release (install the app → scheme auto-registers on Windows at first launch; macOS on install; Linux on deb/rpm install).
- MCP-returned previewUrl is only sent when Electron is the origin (detected via env var); if user doesn't have Electron installed, the URL is the CLI `http://localhost:3000/<docName>` fallback (served by `ok ui`).

### D8 — E2E testing with Playwright [P1]

| Scenario | Playwright feasible? | Approach |
|---|---|---|
| Cold-start via argv (Win/Linux) | Yes (direct) | `electron.launch({ args: ['.', 'openknowledge://...'] })` |
| Cold-start via `open-url` (macOS) | Indirectly | `app.evaluate((_, url) => app.emit('open-url', {preventDefault(){}}, url), url)` |
| Hot-delivery via `second-instance` | Yes | Spawn a second Electron process |
| Hot-delivery via `open-url` (macOS) | Indirectly | Same `app.evaluate` pattern |
| Full OS-integrated flow (real `open` command) | No (in Playwright) | Packaged-app smoke tier |

**Evidence:** [evidence/d6-d7-d8-secondary-dimensions.md](evidence/d6-d7-d8-secondary-dimensions.md)

**Confidence:** CONFIRMED.

**Implications:** Our `test:e2e:packaged` job should include deep-link smoke tests using Playwright's `_electron.launch({ args: [url] })` pattern. True OS-handler integration must wait for packaged-build smoke runs (our existing packaged-app CI cell covers this).

---

## Pitfalls and CVE-class Issues

### CVE history

- **CVE-2018-1000006** — RCE in every Windows Electron app registering a custom protocol. Patched Electron 1.6.17/1.7.12/1.8.2-beta.5. Affected: Slack, Skype, Signal, GitHub Desktop, Twitch, WordPress.com.
- **CVE-2018-1000006 bypass (Doyensec May 2018)** — `host-rules` missing from blacklist → MITM + RCE. Fixed 1.7.15/1.8.7/2.0.1. Durable defense: `--` sentinel.
- **CVE-2019-6453 (mIRC)** — generalizable class: any desktop app registering a URI scheme is exposed if it accepts flag-like args. `irc://?` → `-i\\ATTACKER\config.ini`.
- **"1-click RCE" (Shabarkin 2022)** — Electron apps passing untrusted URLs to `shell.openExternal()` can invoke OS-native schemes (`ms-msdt:`, `search-ms:`, `ms-officecmd:`) whose own argv injection produces RCE. **Defense: allowlist schemes in `shell.openExternal` wrapper.**

### Non-CVE pitfalls

- macOS `open-url` fires before `ready` ([electron/electron#32600](https://github.com/electron/electron/issues/32600)). Queue-then-flush required.
- AppImage protocol registration failure ([electron-userland/electron-builder#4035](https://github.com/electron-userland/electron-builder/issues/4035), #3662).
- Windows browser encoding inconsistency (Microsoft URI scheme docs). Chrome encodes; Firefox/Edge don't.
- `argv` in `second-instance` unreliable — use `additionalData`.
- macOS unpackaged dev does not receive `open-url` (LaunchServices prerequisite).
- MAS + `requestSingleInstanceLock` can crash — skip the lock on MAS builds.

---

## Platform Requirements Matrix

| Feature | macOS | Windows | Linux |
|---|---|---|---|
| Registration source-of-truth | `CFBundleURLTypes` Info.plist (packaging) | `HKCU\Software\Classes\<scheme>` (runtime) | `.desktop` with `MimeType=x-scheme-handler/<scheme>;` (install) |
| electron-builder config | `protocols:` native | No direct key; runtime API | `linux.mimeTypes:` for deb/rpm |
| Cold-start URL delivery | `open-url` (may fire before `ready`) | Last element of `process.argv` | Last element of `process.argv` |
| Hot delivery | `open-url` | `second-instance(argv, cwd, additionalData)` | `second-instance` |
| `will-finish-launching` | Real event (earliest hook) | Alias for `ready` | Alias for `ready` |
| Single-instance | System-enforced (MAS can't use lock) | `requestSingleInstanceLock` required | `requestSingleInstanceLock` required |
| Dev-mode unpackaged | Does NOT work | Works | Works with manual .desktop |
| AppImage support | N/A | N/A | **Broken** |
| `--` sentinel | Not needed | **Required** | Not needed |
| CVE-2018-1000006 | Never affected | Fixed 1.6.17+ | Never affected |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- Whether Electron's `setAsDefaultProtocolClient` writes to Windows 10+ `UrlAssociations\UserChoice` or only legacy keys (minor — defaults still work).
- Closed-source apps (Notion, Linear, Figma, Slack, Discord) hardening specifics not inspectable.

### Out of Scope (per Rubric)
- HTTP universal links; `navigator.registerProtocolHandler`.
- First-party design details (3P research).
- Claude Desktop's `previewUrl` internal handling (not publicly documented).

---

## References

### Evidence Files
- [evidence/d1-cross-platform-registration.md](evidence/d1-cross-platform-registration.md)
- [evidence/d2-cold-start-vs-running-delivery.md](evidence/d2-cold-start-vs-running-delivery.md)
- [evidence/d3-security-url-payload-validation.md](evidence/d3-security-url-payload-validation.md)
- [evidence/d4-production-app-shapes.md](evidence/d4-production-app-shapes.md)
- [evidence/d5-packaging-configurations.md](evidence/d5-packaging-configurations.md)
- [evidence/d6-d7-d8-secondary-dimensions.md](evidence/d6-d7-d8-secondary-dimensions.md)

### External Sources (Primary)
- [Electron app API](https://www.electronjs.org/docs/latest/api/app)
- [Electron Deep Links tutorial](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [Electron Protocol Handler Fix (CVE-2018-1000006 official)](https://www.electronjs.org/blog/protocol-handler-fix)
- [microsoft/vscode electronUrlListener.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/electron-main/electronUrlListener.ts)
- [logseq/logseq url.cljs](https://github.com/logseq/logseq/blob/master/src/electron/electron/url.cljs)
- [Microsoft: Registering an Application to a URI Scheme](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85))
- [electron-builder Protocol interface](https://www.electron.build/app-builder-lib.interface.protocol)

### Security Research
- [Doyensec: CVE-2018-1000006 bypass](https://blog.doyensec.com/2018/05/24/electron-win-protocol-handler-bug-bypass.html)
- [Shabarkin: 1-Click RCE in Electron Applications](https://shabarkin.medium.com/1-click-rce-in-electron-applications-79b52e1fe8b8)
- [Proof of Calc: CVE-2019-6453 mIRC](https://proofofcalc.com/cve-2019-6453-mIRC/)

### Community + Tooling
- [electron/electron#32600 — open-url before ready](https://github.com/electron/electron/issues/32600)
- [electron/electron#40173 — cold-start argv docs gap](https://github.com/electron/electron/issues/40173)
- [electron-builder#4035 — AppImage gap](https://github.com/electron-userland/electron-builder/issues/4035)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [Obsidian URI](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI)
- [Cursor Deeplinks](https://cursor.com/docs/integrations/deeplinks)
- [bloomca.me — Electron Custom Protocols (2025)](https://blog.bloomca.me/2025/07/20/electron-apps-custom-protocols.html)

### Related Research
- [T1 — @napi-rs/keyring in utilityProcess + Keychain UX](../t1-keyring-utility-process/REPORT.md)
- [T2 — Preload bridge patterns](../t2-preload-bridge-patterns/REPORT.md)
- [T3 — Multi-window subprocess lifecycle](../t3-multi-window-subprocess-lifecycle/REPORT.md)
