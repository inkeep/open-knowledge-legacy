# Evidence: D11 — User-activation forwarding across IPC (Path C 2026-04-23)

**Dimension:** Does Electron (or any OSS Electron app) forward the "this was a real user click" bit across `ipcRenderer.invoke` so the main process can distinguish click-initiated from programmatic/XSS-initiated `shell.openPath` requests?

**Date:** 2026-04-23
**Sources:** Electron docs, Chromium User Activation v2 spec, MDN, Doyensec + Cobalt security research, OSS codebase grep (VSCode, AFFiNE, Zettlr, Logseq).

---

## Summary

- **Electron does NOT forward user activation across IPC.** `IpcMainInvokeEvent` exposes `event.sender`, `event.senderFrame`, `event.frameId` — but no `isTrusted`, `userActivation`, or `hasTransientActivation` field.
- **No OSS Electron app uses a token-based gesture-forwarding pattern.** Surveyed VSCode, AFFiNE, Zettlr, Logseq. Zero implementations.
- **The accepted threat model is "all IPC is renderer-initiated."** Defense is containment (path + extension + protocol allowlist), not gesture provenance.
- **An app-level token scheme degenerates** because XSS runs in the same JS context as the click handler — it can call `requestToken()` then immediately use the token. Only real fix is a new Electron primitive that main-process-observes the click directly.
- **Containment IS the gesture forwarding** in practice — the OSS ecosystem has converged on "path allowlist + extension allowlist + protocol allowlist" as the enforceable layer.

---

## Findings

### Finding: Electron's IPC events carry no user-activation bit

**Confidence:** CONFIRMED
**Evidence:** [Electron ipcMain API](https://www.electronjs.org/docs/latest/api/ipc-main); [Chromium User Activation v2](https://developer.chrome.com/blog/user-activation/); [MDN UserActivation](https://developer.mozilla.org/en-US/docs/Web/API/UserActivation)

- `IpcMainInvokeEvent` exposes `event.sender`, `event.senderFrame`, `event.frameId` — no `isTrusted`, no `userActivation`, no `hasTransientActivation`.
- Chromium's User Activation v2 (`navigator.userActivation.isActive`) lives in the **renderer** process; the activation bit is renderer-local and does not cross the process boundary to the browser/main process.
- Electron exposes gesture state in one direction only: `contents.executeJavaScript(code, userGesture=true)` lets main process **assert** a gesture to the renderer (for `requestFullscreen`, etc.). No inbound primitive.

Closest adjacent work in electron/electron: PR #48170 (fileSystem), #45377 (clipboard), #30702 (displayMedia) — all gate on session-level permission handlers, not per-click provenance. No issue/RFC filed for gesture forwarding at time of search (negative result).

### Finding: No OSS Electron app implements token-based gesture forwarding

**Confidence:** CONFIRMED (via direct codebase reads)
**Evidence:** Local clones + GitHub code search across VSCode, AFFiNE, Zettlr, Logseq

**VS Code:** `hasUserGesture` pattern absent. The closest hit is `userGesture: boolean` as an IPC argument in `src/vs/platform/accessibilitySignal/browser/accessibilitySignalService.ts:64` — **but this is a UX signal** ("this save was explicit, play the sound"), not a security token. Renderer self-reports; main trusts. A parallel `userInitiated: boolean` appears in the terminal service (`src/vs/platform/terminal/common/terminal.ts:358`, `ptyService.ts:383,745`) for identical UX purposes. `shell.openExternal` at `src/vs/platform/native/electron-main/nativeHostMainService.ts:638-697` runs **no gesture check** — handler validates `windowId` and delegates.

**AFFiNE:** `packages/frontend/apps/electron/src/main/security/open-external.ts` validates **protocol allowlist** (`http:`, `https:`, `mailto:`) via `isAllowedExternalUrl`. IPC dispatcher at `main/handlers.ts:91-107` goes `ipcMain.handle` → `handleIpcMessage(e, ...args)` with a `checkSource(e)` hop (origin check, not gesture).

**Zettlr:** ~15 `shell.openPath` call sites — none validate gesture; all validate path/extension.

**Logseq:** No gesture pattern surfaced in grep.

### Finding: The XSS-in-renderer threat model is well-documented; gesture forwarding is NOT the proposed fix

**Confidence:** CONFIRMED
**Evidence:** Doyensec + Cobalt + deepstrike security research; documented CVEs

- **[DeepChat openExternal RCE via XSS](https://blog.securelayer7.net/deepchat-openexternal-rce-via-xss-in-electron/)** (2023-2024) — preload's `openExternal` "accepted any arbitrary URL string and forwarded it unconditionally to Electron's `shell.openExternal()`." XSS payload could call `window.api.openExternal('file:///...')` silently with no click.
- **[CVE-2026-39846](https://cvereports.com/reports/CVE-2026-39846)** (SiYuan) — Stored XSS in table captions → unauthenticated RCE.
- **[CVE-2020-16608](https://sghosh2402.medium.com/cve-2020-16608-8cdad9f4d9b4)** — XSS-to-RCE via IPC surface.

Doyensec and Cobalt guidance ([Modern Alchemy: Turning XSS into RCE](https://blog.doyensec.com/2017/08/03/electron-framework-security.html), [Hunting Common Misconfigurations](https://www.cobalt.io/blog/common-misconfigurations-electron-apps-part-1)) is unanimous: **the defense is containment** — protocol allowlist, path allowlist, extension allowlist, `contextIsolation: true`, validate `event.sender.getURL()`. **None** propose gesture forwarding.

The failure pattern: when containment has any bug (path traversal via `..`, symlink escape, extension-sniff bypass, or DeepChat's unconditional-passthrough class), `shell.openPath` / `openExternal` fires with zero user involvement. Main process never had signal to distinguish click-from-synthetic.

### Finding: App-level token schemes don't actually work against XSS

**Confidence:** INFERRED (from threat model reasoning; no published analysis specifically on this point)

What a token scheme would look like:
1. Preload exposes `requestOpenToken()` returning a short-lived (~3s) random UUID nonce
2. DOM handler bound to a real click reads `navigator.userActivation.isActive` in renderer, requests token, includes in `openPath` IPC call
3. Main validates: token exists, not expired, not replayed (consume-on-use)

**Fundamental weakness:** XSS in renderer runs in the same JS context as the click handler. It can call `requestOpenToken()` then immediately use the token → scheme degenerates to "rate-limited open" rather than "user-gesture-attested open."

**Real attestation requires** the main process to **observe** the click directly: (a) route UI through native `Menu.buildFromTemplate` where click handlers fire in main, (b) use a `BrowserView` overlay owned by main, or (c) an unshipped Electron primitive (`event.senderFrame.hasTransientActivation()` on `IpcMainInvokeEvent`).

### Finding: Containment IS the gesture forwarding in practice

**Confidence:** CONFIRMED (by convergence across all surveyed OSS apps + all security research)

The OSS ecosystem has accepted that containment (path/extension/protocol allowlist) is the only enforceable layer. This is the design implication of the missing primitive:

- Any `shell.openPath` IPC path that "relies on only firing on user click" as a security property will regress the moment containment has a bug.
- The path allowlist + extension allowlist is **not redundant** with gesture forwarding — it **is** the gesture forwarding, because the ecosystem has decided provenance cannot be enforced.

**Implication for OK:** if OK adds `shell.openPath` on Electron, containment is load-bearing. There's no escape hatch "but we only fire on click so we're safe" — the click bit doesn't make it to main. Path + extension allowlist + protocol validation are the complete defense.

---

## Design-space table

| Option | Technical reality | Security value |
|---|---|---|
| **Do nothing** — trust renderer to only call `openPath` on real clicks | Accepted by every OSS app | Zero — XSS bypasses |
| **App-level token scheme** — preload mints short-lived nonces | Implementable today | Near-zero — XSS runs in same context, can mint + use token |
| **Native-menu routing** — right-click → `Menu.buildFromTemplate` in main | Implementable today | HIGH for right-click-originated actions; main observes click directly |
| **Electron primitive** — expose `senderFrame.hasTransientActivation()` on IPC event | Not shipped; no RFC filed | Would be load-bearing; renderer's User Activation v2 bit forwarded |
| **BrowserView overlay owned by main** | Implementable today but architecturally heavy | HIGH; main observes DOM events directly |

**Practical recommendation:** for right-click "Reveal in Finder" / "Open in default app" UX, use native `Menu.buildFromTemplate` — main observes the click directly. For renderer-button-triggered actions, rely on containment + accept the threat model.

---

## Sources

- [Electron webContents API](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron ipcMain API](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Making user activation consistent across APIs (Chrome for Developers)](https://developer.chrome.com/blog/user-activation/)
- [UserActivation (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/UserActivation)
- [Electron Security docs](https://www.electronjs.org/docs/latest/tutorial/security)
- [Doyensec — Electron APIs Misuse](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)
- [Doyensec — Modern Alchemy: Turning XSS into RCE](https://blog.doyensec.com/2017/08/03/electron-framework-security.html)
- [Deepstrike — Penetration Testing of Electron-based Applications](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [SecureLayer7 — DeepChat openExternal RCE via XSS](https://blog.securelayer7.net/deepchat-openexternal-rce-via-xss-in-electron/)
- [Cobalt — Hunting Common Misconfigurations in Electron Apps](https://www.cobalt.io/blog/common-misconfigurations-electron-apps-part-1)
- [CVE-2020-16608 writeup](https://sghosh2402.medium.com/cve-2020-16608-8cdad9f4d9b4)
- [CVE-2026-39846 (SiYuan)](https://cvereports.com/reports/CVE-2026-39846)
- Local OSS: VSCode `src/vs/platform/accessibilitySignal/browser/accessibilitySignalService.ts`, `src/vs/platform/native/electron-main/nativeHostMainService.ts`; AFFiNE `packages/frontend/apps/electron/src/main/security/open-external.ts`, `main/handlers.ts`; Zettlr `source/app/service-providers/documents/index.ts`

---

## Gaps / follow-ups

- No RFC/issue filed against `electron/electron` for `senderFrame.hasTransientActivation()` exposure on IPC events. Filing this would be a concrete next step for anyone motivated — Chromium already tracks the bit on the frame.
- Mobile browsers / React Native / Tauri equivalents not surveyed — out of scope for Electron-primary research.
