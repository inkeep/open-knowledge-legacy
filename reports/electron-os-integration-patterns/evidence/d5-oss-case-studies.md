# Evidence: D5 — OSS Electron app case studies (7 apps)

**Dimension:** Survey how 7 OSS Electron apps use `shell.*` APIs in practice — click-interception location, call sites, path validation, context-menu patterns.

**Date:** 2026-04-23
**Sources:** Primary-source GitHub reads (commits noted inline) + secondary references.

---

## VSCode (microsoft/vscode)

| Property | Value |
|---|---|
| Interception | Main-process. `openerService.setDefaultExternalOpener(...)` in `src/vs/workbench/browser/window.ts` — scheme-based routing, NOT `will-navigate` |
| Call sites | `src/vs/platform/native/electron-main/nativeHostMainService.ts:717` (`shell.showItemInFolder`), `:846` (`shell.openExternal`), `:897` (`shell.trashItem`) |
| Path validation | `showItemInFolder`: **zero validation** — direct wrapper. `openExternal`: validates URL scheme via `matchesSomeScheme()` (http/https/mailto/vsls at `:810`), falls back to clipboard on failure (`:879`). `file:` scheme routed to `EditorOpener` (never shells out) |
| Context menu | `Menu.buildFromTemplate` in `src/vs/platform/menubar/electron-main/menubar.ts` |
| `shell.openPath` usage | **NONE in electron-main layer** |

**Notable pattern:** **VSCode never shells out to OS for a file click.** Everything `file://` goes to the editor, everything else to scheme-validated `openExternal`. This is the maximalist "contain-in-app" posture.

Source read depth: thorough

---

## GitHub Desktop (desktop/desktop)

| Property | Value |
|---|---|
| Interception | None — repo-as-directory model, not file-click |
| Call site | `app/src/main-process/shell.ts:24` — `shell.openPath(pathname)` inside **`UNSAFE_openDirectory`** |
| Path validation | Windows-only trailing-backslash append (`:19-22`) to prevent "same-named-executable-next-to-directory" ambiguity. **That's the entire validation.** Caller discipline enforced by the `UNSAFE_` name prefix |
| Context menu | n/a — Git client, not file viewer |
| `shell.openPath` usage | One call site, naming-gated |

**Notable pattern:** **`UNSAFE_` naming convention** as explicit caller warning. JSDoc: *"This method should never be used to open user-provided or derived paths."* Validation-by-convention.

Source read depth: thorough

---

## Joplin (laurent22/joplin)

| Property | Value |
|---|---|
| Interception | Main-process `openItem(fullPath)` in `packages/app-desktop/bridge.ts:390-435`. Renderer → bridge, no `will-navigate` for assets |
| Call sites | `bridge.ts:331` (`shell.showItemInFolder(toSystemSlashes(fullPath))`), `:386` (`shell.openExternal(url)` for non-file URLs), `:401` + `:430` (two `shell.openPath(fullPath)` branches — safe vs user-consented) |
| Path validation | **Richest of the 7 surveyed.** Six-step gate: |
| | 1. `fileUriToPath(urlDecode(fullPath))` for `file://` URIs (`:391-393`) |
| | 2. `normalize(fullPath)` (`:394`) |
| | 3. `pathExists(fullPath)` — *"intended to mitigate a security issue related to network drives on Windows"* (`:395-397`) |
| | 4. `extname(fullPath)` (`:398`) |
| | 5. Two-layer extension gate: user-allowed list OR `isSafeToOpen()` utility (`:399-400`) |
| | 6. Unknown extension → `dialog.showMessageBox` warning with 3 buttons + "Always open .X files" checkbox (`:406-428`) |
| Context menu | Renderer-side; reveal-in-folder invokes main via bridge |
| `shell.openPath` usage | Two call sites, extensively validated |

**Notable pattern:** **Gold standard for "opening user-supplied files is a security decision."** Extension-allowlist + persistent user-consent capture + "Learn more" link to [docs on unknown-filetype warning](https://joplinapp.org/help/apps/attachments#unknown-filetype-warning) at `:420`.

Source read depth: thorough

---

## Logseq (logseq/logseq)

**Path C 2026-04-23:** earlier UNCERTAIN resolved. Logseq does NOT call `shell.openPath`; it wraps the third-party [`open`](https://www.npmjs.com/package/open) npm package (Sindre Sorhus) which shells out to platform-native openers (`open` on macOS, `start` on Windows, `xdg-open` on Linux) internally.

| Property | Value |
|---|---|
| Interception | Main process `open-default-app!` handler at `src/electron/electron/window.cljs:88-106`. `:openFileInFolder` IPC handler at `src/electron/electron/handler.cljs:63-66`. No `will-navigate` in `core.cljs` |
| Renderer click dispatch | `src/main/frontend/components/block.cljs` calls `js/window.apis.openPath` which IPCs to `open-default-app!` in main |
| Call sites | `window.cljs:88-106` (`open-default-app!` main handler) → `src/electron/electron/utils.cljs` (`open` wrapping npm `open` package). `handler.cljs:63-66` (`shell.showItemInFolder`). `core.cljs:253, :260, :290` (`shell.openExternal` to hardcoded docs.logseq.com URLs) |
| Path validation | **Three layers:** (a) URL-parse gate (`try (URL. url)`) rejects malformed; (b) protocol branch — `http(s):/mailto:` go to `shell.openExternal`, everything else falls to confirmation; (c) **synchronous modal `electron.dialog.showMessageBoxSync`** ("Do you want to open this link?") with Cancel/OK before `default-open` fires. No path-traversal containment |
| Context menu | `core.cljs:set-app-menu!` via Electron's template API. Asset-click context menu is renderer-side (ClojureScript) |
| `shell.openPath` usage | **NONE — confirmed negative.** Uses `open` npm package + confirmation dialog instead. |
| Asset render vs delegate | Images → inline `<img>` + Lightbox; audio/video → inline HTML5; PDF → Logseq's built-in viewer (`state/set-current-pdf!`); generic non-media → `window.apis.openPath` → confirmation → `open` npm |

**Notable pattern:** **Consent-before-open via modal dialog.** One of only two surveyed apps (with Joplin) that requires user confirmation before shelling out. The forum-reported "default app" bugs ([discuss.logseq.com/t/6203](https://discuss.logseq.com/t/clicking-on-asset-link-such-as-a-pdf-doesnt-open-the-pdf-with-default-app/6203)) likely reflect limitations of the `open` package's platform commands (e.g., macOS LaunchServices MIME routing) rather than an Electron API choice. Issue [#10210](https://github.com/logseq/logseq/issues/10210) ("Option to open files and images in external app") was closed "Not planned" — Logseq team declined parity between `.md` and asset behavior.

Source read depth: thorough (Path C 2026-04-23)

---

## AFFiNE (toeverything/AFFiNE)

| Property | Value |
|---|---|
| Interception | Both. Main-process `will-navigate` + `setWindowOpenHandler` in `packages/frontend/apps/electron/src/main/security-restrictions.ts`. IPC handler `openExternal(_, url)` at `ui/handlers.ts:227` routes to `openExternalSafely` |
| Call site | `main/security/open-external.ts:13` — `shell.openExternal(rawUrl)` — the **only** `shell.*` call for URLs |
| Path validation | `isAllowedExternalUrl(rawUrl, additionalProtocols)` gates the call (`:7-10`). Default scheme allowlist: `http:`, `https:`, `mailto:`. **`file:` explicitly rejected.** Console-logs `[security] Blocked attempt...` on reject |
| Context menu | Renderer-side (React). No main-process context menu for asset files |
| `shell.openPath` usage | **NONE in main-process tree** |

**Notable pattern:** **Download-only for assets** — desktop reuses the web download path rather than shelling out. `openExternalSafely` is the single-choke-point wrapper worth emulating.

Source read depth: thorough

---

## Zettlr (Zettlr/Zettlr)

| Property | Value |
|---|---|
| Interception | None on asset click — renderer dispatches explicit `open-attachment` command to main when a citation-key attachment is clicked |
| Call sites | `source/app/service-providers/commands/open-attachment.ts:84` (BibTex path), `:145` (Zotero BBT JSON-RPC PDF path) — both `shell.openPath(attachments[0])` |
| Path validation | **Thin.** Library path absolute via `path.isAbsolute` + `path.resolve` (`:46-47`). Extension filter `.endsWith('.pdf')` only on Zotero path (`:133`). **No symlink resolution, no project-root containment, no realpath.** Trust delegated to citation data source (Citeproc / BetterBibTeX API) |
| Context menu | n/a |
| `shell.openPath` usage | Two call sites, trusted-source model |

**Notable pattern:** **Minimal validation because of trusted-source model.** Zettlr treats the BibTex/Zotero payload as trusted. Only surveyed app that dispatches `shell.openPath` on user-activated attachment click with this little gating.

Source read depth: thorough

---

## Standard Notes (standardnotes/app)

| Property | Value |
|---|---|
| Interception | Main-process. `packages/desktop/app/javascripts/Main/Window.ts` — `setWindowOpenHandler` at line 127 and `on('will-navigate')` at line 142 (Path C 2026-04-23 correction — earlier cited lines 91/99 were from an older revision) |
| Call sites | Two `shell.openExternal(url)` sites, both GATED by the `shouldOpenUrl` predicate defined at `Window.ts:83` |
| Path validation | **CONFIRMED strict allowlist via `shouldOpenUrl = (url) => url.startsWith('http') \|\| url.startsWith('mailto')`** (Window.ts:83). Covers `http:`, `https:`, `mailto:`. Everything else falls through to `deny` (setWindowOpenHandler) or silent `event.preventDefault()` (will-navigate) — no `openExternal` call fires for `file:`, `javascript:`, `smb:`, custom schemes |
| Defense in depth | `setWindowOpenHandler` returns `{action: 'deny'}` as baseline; `will-navigate` calls `event.preventDefault()` unconditionally after the guard; `fileUrlsAreEqual(url, appState.startUrl)` short-circuit prevents `window.reload()` from tripping the guard |
| Context menu | Renderer-side, not visible in `Main/` |
| `shell.openPath` usage | Not found |

**Notable pattern:** **Deny-by-default two-handler pattern with a strict `startsWith('http') \|\| startsWith('mailto')` allowlist.** No history of CVE advisories on `openExternal` — the guard appears to be preventive engineering rather than CVE-driven remediation.

Source read depth: thorough (Path C 2026-04-23 closed the earlier UNCERTAIN)

---

## Summary table

| App | Has `shell.openPath`? | Has `shell.openExternal`? | Has `showItemInFolder`? | Validation richness | Strongest pattern |
|---|---|---|---|---|---|
| VSCode | NO | Yes (scheme-allowlist) | Yes (zero val) | scheme-allowlist for openExternal; never openPath | Never-shell-out-on-click |
| GitHub Desktop | Yes (`UNSAFE_` naming) | — | — | Minimal; naming-gated | Naming-as-validation |
| Joplin | Yes (2 sites) | Yes | Yes | Six-step gate + consent | Extension allowlist + user consent |
| Logseq | NOT FOUND | Yes (hardcoded URLs) | Yes | Platform normalize | Unknown asset-click path |
| AFFiNE | NO | Yes (`isAllowedExternalUrl`) | — | Scheme allowlist + `file:` reject | Single-choke-point wrapper |
| Zettlr | Yes (2 sites, trusted source) | — | — | Minimal; trusted-source | Citation-trusted fallback |
| Standard Notes | NO | Yes | — | UNCERTAIN | Two-handler navigation intercept |

**5 of 7 apps either never call `shell.openPath` or gate it behind extreme caller discipline.** Only Joplin + Zettlr shell out on user-activated click — and Joplin does it with far more validation than Zettlr.

---

## Sources

- [VSCode: nativeHostMainService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/native/electron-main/nativeHostMainService.ts)
- [VSCode: window.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/window.ts)
- [GitHub Desktop: shell.ts](https://github.com/desktop/desktop/blob/development/app/src/main-process/shell.ts)
- [Joplin: bridge.ts](https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/bridge.ts)
- [Joplin: Unknown filetype warning docs](https://joplinapp.org/help/apps/attachments#unknown-filetype-warning)
- [Logseq: handler.cljs](https://github.com/logseq/logseq/blob/master/src/electron/electron/handler.cljs)
- [Logseq: core.cljs](https://github.com/logseq/logseq/blob/master/src/electron/electron/core.cljs)
- [Logseq forum #6203 (MIME/default-app)](https://discuss.logseq.com/t/clicking-on-asset-link-such-as-a-pdf-doesnt-open-the-pdf-with-default-app/6203)
- [AFFiNE: open-external.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/src/main/security/open-external.ts)
- [AFFiNE: handlers.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/src/main/ui/handlers.ts)
- [AFFiNE: security-restrictions.ts](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/src/main/security-restrictions.ts)
- [Zettlr: open-attachment.ts](https://github.com/Zettlr/Zettlr/blob/master/source/app/service-providers/commands/open-attachment.ts)
- [Standard Notes: Window.ts](https://github.com/standardnotes/app/blob/main/packages/desktop/app/javascripts/Main/Window.ts)
