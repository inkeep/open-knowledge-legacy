# Evidence: D3 — Click-interception patterns

**Dimension:** Where to intercept "open this file/URL" clicks — main-process vs renderer vs hybrid. When each is appropriate.

**Date:** 2026-04-23
**Sources:** Electron docs (webContents events) + cross-app synthesis from D5 case studies.

---

## Five interception surfaces

### 1. Main-process `webContents.on('will-navigate')`

- **Fires when:** Top-level nav commits from user click, `location.href=`, form submit. NOT for programmatic `webContents.loadURL`.
- **Preventable:** Yes — `event.preventDefault()` cancels navigation.
- **Used by:** Standard Notes (`Window.ts:99`), AFFiNE (`security-restrictions.ts`).
- **Appropriate for:** Intercepting ANY click that would cause the main BrowserWindow's webContents to navigate away from the app shell. Catch-all safety net.

### 2. Main-process `webContents.setWindowOpenHandler(fn)`

- **Fires when:** New window requested via `window.open`, `target="_blank"`, shift-click, form `_blank`.
- **Preventable:** Return `{action: 'deny'}` to cancel; `{action: 'allow', overrideBrowserWindowOptions, createWindow}` to customize.
- **Used by:** Standard Notes (`Window.ts:91`), AFFiNE.
- **Appropriate for:** Deny-by-default + route to `shell.openExternal(url)` after scheme validation. **The Electron-docs-recommended default** for external links.

### 3. Main-process app-level opener service (VSCode pattern)

- **Fires when:** Any URL-open request routed through the app's opener abstraction.
- **Preventable:** Yes — the service is the dispatcher.
- **Used by:** VSCode (`openerService.setDefaultExternalOpener` + `matchesSomeScheme`).
- **Appropriate for:** Large apps that want a single choke-point for all URL/file-open decisions. Higher upfront design cost; cleanest for complex scheme routing.

### 4. Renderer-side DOM click listener

- **Fires when:** Any `click` event in the renderer; the listener inspects target, cancels browser default, IPCs to main.
- **Preventable:** Yes — standard `event.preventDefault()` + `event.stopPropagation()`.
- **Used by:** Joplin (renderer detects attachment link clicks → bridges to main `openItem`). AFFiNE (React click handlers).
- **Appropriate for:** When the click target is known renderer-side (e.g. a specific NodeView or chip component) and the app wants fine-grained control over which clicks trigger IPC. Pairs naturally with framework component models (React/Vue).
- **Risk:** Renderer-only interception means `will-navigate` still fires if you miss a case; best combined with main-process safety net.

### 5. Custom IPC command (Zettlr pattern)

- **Fires when:** Explicit renderer action dispatches a command via `ipcRenderer.invoke('open-attachment', key)` — no click-interception per se; the click handler knows to dispatch.
- **Preventable:** Not applicable — there's no default behavior to cancel.
- **Used by:** Zettlr (`open-attachment` command for citation keys).
- **Appropriate for:** Domain-specific actions where the renderer knows the target is a resolved file reference (not a raw href). Tightest coupling to the app's data model.

---

## Cross-app patterns (synthesized from D5)

### P1 — Scheme-allowlist wrappers around `shell.openExternal`

**Evidence:** AFFiNE's [`openExternalSafely`](https://github.com/toeverything/AFFiNE/blob/canary/packages/frontend/apps/electron/src/main/security/open-external.ts:13) (http/https/mailto, `file:` rejected) + VSCode's `matchesSomeScheme` (http/https/mailto/vsls).

Both wrap every call site behind a single validator. `file:` is explicitly rejected — `file:` URIs go through a different code path (editor-open in VSCode, no path in AFFiNE). Consequence: **renderer code cannot accidentally open `file:///etc/passwd` via the external-URL path.**

### P2 — The two-handler web-navigation pattern

**Evidence:** [Standard Notes Window.ts:91,99](https://github.com/standardnotes/app/blob/main/packages/desktop/app/javascripts/Main/Window.ts); AFFiNE `security-restrictions.ts`; VSCode via `openerService`.

All intercept BOTH `setWindowOpenHandler` AND `will-navigate` in the main process, redirecting to `shell.openExternal` after scheme validation. This is the canonical Electron "don't let the renderer navigate away" pattern — recommended by Electron's own security docs.

### P3 — `shell.openPath` is the minority choice; naming is the validation

**Evidence:** VSCode, AFFiNE, Standard Notes: **no `shell.openPath`** on user-file click. GitHub Desktop: one call, inside `UNSAFE_openDirectory` prefix warning. Only Joplin + Zettlr shell-out on click — Joplin with extension-allowlist + user-consent; Zettlr with trusted-citation-source.

**The dominant Electron posture is to avoid `shell.openPath` on click entirely** — prefer in-app viewer (VSCode editor, Docmost-via-Chromium) or download (AFFiNE, Outline). When it IS used, gate behind extreme caller discipline (naming, extension allowlist, trust root).

### P4 — `shell.showItemInFolder` with zero validation is common

**Evidence:** VSCode (`:717`), Logseq (`handler.cljs:63-66`), Joplin (`bridge.ts:331`). All three trust the path directly.

Rationale: `showItemInFolder` opens the file manager to the path's **parent directory**, not the file itself. Attack surface is much lower than `openPath`. The command can still be misused (reveal-in-Finder a sensitive path the renderer shouldn't know about), but no arbitrary-code-execution via OS handler table.

### P5 — Extension allowlists are the app-level gate against "opened a .exe"

**Evidence:** Joplin's `isSafeToOpen` + user-allowlist (`bridge.ts:399-400`).

VSCode sidesteps by never calling `openPath`. Zettlr trusts its citation source. Of the surveyed apps, **only Joplin validates extension before `shell.openPath`.** No surveyed app validates symlink targets or project-root containment — extension allowlist or trusted-source is the de-facto substitute.

---

## Interception-location decision matrix

| Scenario | Recommended interception | Pattern source |
|---|---|---|
| External `https://` link click from renderer content | Main-process `will-navigate` + `setWindowOpenHandler` → `shell.openExternal` after scheme check | Standard Notes, AFFiNE, Electron docs |
| Click on a known-shape NodeView / React component (chip, asset pill) that should trigger a specific action | Renderer-side click handler → IPC `invoke` to main | Joplin, AFFiNE |
| External link safety net (catch any click the renderer handler missed) | `will-navigate` as fallback, denies or redirects | AFFiNE, Standard Notes |
| Command-style action ("open attachment for citation Foo") | Custom IPC command, no interception — explicit dispatch | Zettlr |
| Reveal file in Finder/Explorer | IPC → `shell.showItemInFolder(path)` in main | VSCode, Joplin, Logseq |
| Open with OS default app (opaque type) | IPC → `shell.openPath(canonicalPath)` in main, after containment | Joplin |

---

## Security implications of interception choice

**Main-process interception is stronger than renderer-side** because it catches clicks the renderer missed (e.g., a `<a>` tag the component library didn't anchor a React handler to).

**Renderer-side interception requires main-process safety net** to avoid class-missing bugs. If the renderer handler's scope drifts (a new component doesn't wire the intercept), main-process `will-navigate` catches it.

**`setWindowOpenHandler` should default to deny** — Electron docs explicitly recommend denying all new-window requests by default and only allowing through explicit scheme validation. Reverse-default (allow with blocklist) is a common XSS-to-RCE pivot per [Doyensec 2021](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html).

---

## Sources

- [webContents events | Electron](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- Cross-references to D5 evidence file (per-app call sites)
- [Doyensec — Electron APIs Misuse (2021)](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)
