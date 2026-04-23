---
title: "Electron OS-Integration Patterns: shell.*, click-interception, path containment, and the web-parity gap (2026)"
description: "What OS-integration capabilities Electron offers beyond the web, how 7 OSS Electron apps use shell.openPath / shell.openExternal / showItemInFolder / trashItem in practice, click-interception patterns (will-navigate, setWindowOpenHandler, opener service), path-containment security sketch, CVE shortlist, and IPC shape recommendations. macOS-focused with Win/Linux deltas noted. Informs \"click on a non-inline-viewable asset\" decisions for collaborative markdown editors."
createdAt: 2026-04-23
updatedAt: 2026-04-23
subjects:
  - Electron
  - VSCode
  - Joplin
  - GitHub Desktop
  - Logseq
  - AFFiNE
  - Zettlr
  - Standard Notes
topics:
  - shell API
  - click interception
  - path containment
  - IPC security
  - web platform parity
  - OS integration
---

# Electron OS-Integration Patterns

**Purpose:** Map the OS-integration capability landscape for Electron apps — what's available beyond the web, what patterns OSS apps converge on, and the security model for opening files through the OS. Reader is deciding how/whether to wire click-on-asset behavior that delegates to the OS default app (Obsidian-style `shell.openPath`) in an Electron build.

---

## Executive Summary

Electron's `shell.*` surface gives desktop apps five OS-integration capabilities the web cannot deliver: opening arbitrary files with the OS default app (`shell.openPath`), opening external URLs via the protocol handler (`shell.openExternal`), revealing files in the native file manager (`shell.showItemInFolder`), moving to OS trash (`shell.trashItem`), and registering custom URL schemes (`app.setAsDefaultProtocolClient`). Seven of 12 Electron OS APIs surveyed have **no web equivalent**; four are partial (file pickers, clipboard, notifications, URL-scheme via PWA); only `shell.openExternal` has full web parity via `<a target="_blank">`.

**The dominant OSS pattern for "click on a file" is NOT to call `shell.openPath`.** Five of seven surveyed apps (VSCode, GitHub Desktop, AFFiNE, Standard Notes, Logseq — apart from a UNCERTAIN path) either never call `shell.openPath` on user-activated clicks or gate it behind explicit caller-discipline (`UNSAFE_` naming convention). Only **Joplin** and **Zettlr** shell-out on click — Joplin with a six-step validation gate plus user-consent dialog, Zettlr with a minimal trusted-source model. The canonical pattern for external URLs is the **two-handler intercept** (`will-navigate` + `setWindowOpenHandler`) routing through a scheme-allowlist wrapper like AFFiNE's `openExternalSafely` — `file:` is universally rejected on that path.

**Security posture is caller-driven, not Electron-enforced.** Electron's own docs give a specific recipe for `shell.openExternal` URL validation but are silent on `shell.openPath` — that gap is filled by community research (Doyensec, Cobalt, deepstrike) converging on: resolve to canonical path via `realpath`, prefix-check an allowed root with trailing separator, allowlist extensions before the OS handler dispatch, validate IPC sender origin synchronously. CVE history shows `openExternal` is the recurring exploit class (Jitsi CVE-2020-25019, misc. XSS→RCE pivots); no tracked CVE targets `openPath` specifically, though its attack surface is architecturally similar.

**Key Findings:**
- **OS-integration capabilities that are Electron-exclusive (no web path):** `shell.openPath`, `shell.showItemInFolder`, `shell.trashItem`, `Tray`, `powerMonitor`, `systemPreferences` (macOS), arbitrary URL-scheme registration without PWA install. These can't be deferred to "wait for web platform."
- **Most OSS Electron apps actively avoid `shell.openPath` on user-file click.** VSCode's posture (everything `file://` goes to the editor, everything else to scheme-validated `openExternal`) is the strongest "never shell out on click" pattern. AFFiNE's download-only desktop parity with web is the next-strongest.
- **When `shell.openPath` is used, Joplin is the gold standard** — extension allowlist + `pathExists` network-drive mitigation + persistent user-consent dialog with "Always open .X files" checkbox. Zettlr's minimal-validation trusted-source pattern is the outlier.
- **`shell.showItemInFolder` with zero validation is common and considered low-risk** — opens to the *parent* directory, no OS handler dispatch. Reveal-in-Finder is the universally-safe affordance.
- **Two-handler nav intercept is canonical for external URLs** — `setWindowOpenHandler` (new windows) + `on('will-navigate')` (in-page nav) both redirecting to `shell.openExternal` behind a scheme allowlist. Electron's own docs recommend this default.
- **Electron has no API for "open with a specific app (not OS default)"** and no API for "open at line N" — both require spawning platform-specific editor CLIs via `child_process`.
- **`app.setAsDefaultProtocolClient` is silent** — no first-launch user prompt analogous to browser "set as default" UX. Apps must build their own consent flow.

---

## Research Rubric

**Primary question:** What OS-integration capabilities does Electron offer that the web doesn't, how should they be used, and what's the best-practice pattern set across OSS Electron apps for "open this thing in the OS"?

**Reader:** Engineer deciding whether/how to wire `shell.openPath`-on-click and related OS integrations into an Electron build.

**Dimensions (all P0):**

1. **D1 — Electron shell/OS API surface** (Deep): full enumeration with semantics, platform coverage, security model
2. **D2 — Web / browser equivalents + gaps** (Moderate): for each Electron API, what's the web alternative
3. **D3 — Click-interception patterns** (Moderate): main-process vs renderer-side vs hybrid; when each fits
4. **D4 — Path-containment + security patterns** (Moderate): how to safely accept "open this file" from renderer; CVE history
5. **D5 — OSS Electron app case studies** (Deep): 7 apps, file:line citations for call sites and validation
6. **D6 — Best-practice synthesis / rubric** (Deep): what to adopt, what to avoid

**Scope locks:** macOS-primary with Win/Linux deltas inline. OSS only (no Slack/Discord inference). Pattern-level output (no app-specific implementation plan).

**Non-goals:** Tauri / Neutralino alternatives; installer / code-signing (covered by `electron-desktop-app-operations-2025/`); deep-link URL scheme design (covered by `deep-linking-ai-desktop-apps-2026/`); benchmarks.

---

## Detailed Findings

### D1 — Electron shell/OS API surface

**Finding:** Electron exposes 18 OS-integration APIs across `shell`, `app`, `dialog`, `Menu`, `clipboard`, `Notification`, `Tray`, `powerMonitor`, `systemPreferences`, and `webContents`. Seven are the focus for click-and-open scenarios: `shell.{openPath, openExternal, showItemInFolder, trashItem, beep, readShortcutLink, writeShortcutLink}` plus `app.setAsDefaultProtocolClient`, `dialog.{showOpen,showSave}Dialog`. Web-contents events `will-navigate`, `setWindowOpenHandler`, `will-redirect`, and `context-menu` are the click-interception surface.

**Evidence:** [evidence/d1-api-surface.md](evidence/d1-api-surface.md)

**Implications:**
- `shell.openPath` **always resolves** (never rejects) — returns empty string on success, error string on failure. Consumers must check the resolved string, not rely on try/catch.
- `shell.openExternal('file:///…')` is commonly guarded out; file paths go through `shell.openPath`.
- `shell.showItemInFolder` opens to the parent directory — lower-risk than `openPath` (no handler dispatch).
- **No API for "open at line N"** and **no API for "open with specific app"** — both require `child_process` + platform-specific CLI.

**Decision triggers:**
- If a click target is a URL with a scheme, route through `shell.openExternal`. Otherwise `shell.openPath`.
- If Windows 22H2 users report foregrounding issues with reveal-in-Finder, see [electron #36765](https://github.com/electron/electron/issues/36765).

### D2 — Web / browser equivalents + gaps

**Finding:** Of 12 Electron OS APIs mapped, 1 has full web parity (`shell.openExternal` ≡ `<a target="_blank">`), 4 are partial (file pickers, clipboard, notifications, URL-scheme via PWA), and **7 have no web equivalent**. File System Access API reaches ~27% global availability (Chromium-only; Firefox position "harmful," Safari no impl). Web Share API reaches ~93% but Firefox doesn't implement.

**Evidence:** [evidence/d2-web-equivalents.md](evidence/d2-web-equivalents.md)

**Implications:**
- **Electron-exclusive capabilities:** `shell.openPath`, `shell.showItemInFolder`, `shell.trashItem`, `Tray`, `powerMonitor`, `systemPreferences.getUserDefault`, arbitrary URL-scheme without PWA install. No web path to these — they're structurally Electron-only.
- **Secure-context + user-gesture gates** constrain all web-side candidates — browsers enforce user intent; Electron trusts the app.
- `webContents.on('will-navigate')` has **no web equivalent** — the structural reason Electron can intercept link clicks for `shell.openPath` routing and web cannot.

**Decision triggers:**
- If the feature needs `shell.openPath` / `shell.showItemInFolder` / `Tray` / screen-lock detection, wait-for-web is not an option. Electron is structurally the only path.

### D3 — Click-interception patterns

**Finding:** Five distinct interception surfaces exist — main-process `will-navigate`, main-process `setWindowOpenHandler`, main-process app-level opener service (VSCode), renderer-side DOM click listener, and explicit IPC command dispatch (Zettlr). The canonical pattern for external URLs is the **two-handler intercept** (`will-navigate` + `setWindowOpenHandler`) routing to `shell.openExternal` behind a scheme allowlist.

**Evidence:** [evidence/d3-click-interception-patterns.md](evidence/d3-click-interception-patterns.md)

**Implications:**
- Main-process interception is stronger than renderer-side because it catches clicks the renderer missed (new components that don't wire a handler).
- Renderer-side interception requires main-process safety net. AFFiNE + Joplin both layer renderer click handlers over main-process `will-navigate` as fallback.
- `setWindowOpenHandler` should **default to deny** — Electron docs explicitly recommend deny + scheme-validated allow. Reverse-default is a documented XSS-to-RCE pivot per Doyensec 2021.

**Decision triggers:**
- If the click target is a well-known shape (NodeView / React chip / specific component) → renderer handler + IPC, with main-process `will-navigate` as safety net.
- If the click target could be any rendered `<a>` → main-process intercept is mandatory.

### D4 — Path-containment + security patterns

**Finding:** Electron's own docs provide a specific recipe for `shell.openExternal` URL validation (scheme allowlist, `https:` conservative default) but are **silent on `shell.openPath`**. Community research converges on a four-step pattern: (1) reject absolute paths + traversal at IPC boundary, (2) resolve against a main-process-owned trusted root, (3) `realpath` to canonical path (follows symlinks + normalizes), (4) prefix-check with trailing separator. Extension allowlist gates the OS handler dispatch. CVE history shows `openExternal` is the recurring exploit class (Jitsi CVE-2020-25019; various XSS→RCE pivots); no CVE targets `openPath` directly, though attack-surface is architecturally similar.

**Evidence:** [evidence/d4-security-patterns.md](evidence/d4-security-patterns.md) — includes 20-line path-containment code sketch.

**Implications:**
- **IPC baseline:** `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` are all required. `contextBridge.exposeInMainWorld` with minimal named verbs (no `ipcRenderer.invoke` leakage). `ipcMain.handle` over `ipcMain.on` for request/reply. Synchronous `event.senderFrame` access for origin validation.
- **Renderer sends project-relative paths, not absolute.** Main process owns the trust root.
- **Executable extensions** (`.exe`, `.bat`, `.app`, `.desktop`, `.command`, `.scpt`, `.sh`, `.ps1`) should NEVER round-trip through `openPath` from an IPC path. Blocklist at extension step.
- **User-gesture signals do NOT survive IPC.** Electron does not forward the "this came from a user click" bit across `ipcRenderer.invoke`. Treat every IPC-arriving `openPath` request as renderer-initiated.

**Decision triggers:**
- If the app accepts user-controlled paths for OS-open → full four-step containment is required.
- If the path comes from a trusted-source protocol (Zettlr: Citeproc / BBT) → thin validation acceptable (but the trust model must be explicit).

### D5 — OSS Electron app case studies

**Finding:** Surveyed 7 apps (VSCode, GitHub Desktop, Joplin, Logseq, AFFiNE, Zettlr, Standard Notes). **5 of 7 either never call `shell.openPath` or gate it behind extreme caller discipline.** Only Joplin and Zettlr shell-out on user-activated click — Joplin with the richest validation (6-step gate + consent dialog), Zettlr with a minimal trusted-source model. `shell.openExternal` is always behind a scheme-allowlist wrapper (AFFiNE `openExternalSafely`, VSCode `matchesSomeScheme`). `shell.showItemInFolder` is called directly with no validation across VSCode, Logseq, Joplin — considered low-risk because it opens to the parent directory.

**Evidence:** [evidence/d5-oss-case-studies.md](evidence/d5-oss-case-studies.md) — per-app tables with file:line citations.

**Cross-app summary:**

| App | `openPath` on click? | Validation posture |
|---|---|---|
| VSCode | Never | `file://` → editor; `openExternal` scheme-gated |
| GitHub Desktop | Yes (1, `UNSAFE_` prefixed) | Naming-as-validation |
| Joplin | Yes (2 sites) | 6-step gate + user consent |
| Logseq | UNCERTAIN (not found in tree; forum reports suggest delegation) | — |
| AFFiNE | Never | Download-only desktop |
| Zettlr | Yes (2 sites) | Trusted-source (Citeproc/BBT) |
| Standard Notes | Never | Two-handler intercept only |

**Implications:**
- The VSCode pattern ("never `openPath` on click") is viable for markdown-heavy apps that have a renderer capable of displaying everything the user would want — VSCode's editor handles every `file://` target.
- The AFFiNE pattern ("download-only desktop, reuse web path") is viable for web-first apps with an Electron wrapper.
- The Joplin pattern ("extension allowlist + consent dialog") is the right fit when the app intentionally wants OS-delegation but needs security discipline.
- The Zettlr pattern is viable only with a trusted-source model the user cannot inject into (citation management).

### D6 — Best-practice synthesis

**Finding:** Four architectural decisions cluster the surveyed apps:

1. **"In-app viewer or download" vs "delegate to OS"** — VSCode/AFFiNE sit at one extreme (never delegate on click); Joplin/Zettlr sit at the other (always delegate, with different validation levels). Obsidian (closed-source, see [separate report](../editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md)) also delegates for non-renderable types. **The split is driven by product shape:** single-user local-first editors (Joplin, Zettlr, Obsidian) tend to delegate; multi-tenant or web-primary apps (AFFiNE, Outline, Standard Notes) tend to keep-in-app.

2. **Scheme-allowlist wrapper for `openExternal`** — universal across surveyed apps that use `openExternal`. **Default to `https:` only** (Jitsi CVE-2020-25019 fix) and allow `mailto:` / `http:` explicitly. Never allow `file:`.

3. **Two-handler navigation intercept** — `setWindowOpenHandler` (deny + route to `openExternal`) + `will-navigate` (redirect external origins). Electron-docs canonical. Not all apps implement both, but the pattern is called out by the docs themselves.

4. **`showItemInFolder` is the universally-safe affordance** — opens to the parent, no handler dispatch, no validation needed. Every surveyed app that has a file-system UX ships "Reveal in Finder/Explorer" via `showItemInFolder`.

**Best-practice rubric (pattern-level, not OK-specific):**

| Decision | Recommendation | Rationale |
|---|---|---|
| "Click on external URL" | Main-process `will-navigate` + `setWindowOpenHandler` → `shell.openExternal(url)` after scheme allowlist (`https:`, `http:`, `mailto:` default; `file:` reject) | Electron docs + AFFiNE + Standard Notes + VSCode converge |
| "Click on a file we can render inline" | Render inline, no OS delegation | VSCode + AFFiNE + Obsidian-for-renderables |
| "Click on a file we cannot render inline" | **Choose product-shape:** download (AFFiNE pattern, also web-parity) OR OS-delegate with Joplin-style 6-step gate + consent. Do NOT pick Zettlr's minimal pattern without a trusted-source model. | Joplin is gold standard for delegation; AFFiNE for download |
| "Reveal in Finder/Explorer" | `shell.showItemInFolder(path)` directly, no validation required | VSCode + Joplin + Logseq all do this |
| "Move to trash" | `shell.trashItem(path)` with main-process validation (path containment) | Less common but well-supported |
| "Register custom URL scheme" | `app.setAsDefaultProtocolClient` + `Info.plist` (macOS) + single-instance lock + `second-instance` event + `open-url` event handler | See [deep-linking-ai-desktop-apps-2026/](../deep-linking-ai-desktop-apps-2026/) for schema design |
| "Context menu for asset" | `webContents.on('context-menu')` in main, inspect `params.linkURL` + editable status, build `Menu.buildFromTemplate` with "Reveal in Finder" + optional "Open in default app" | Joplin precedent + Electron docs |
| "IPC shape for open-this-file requests" | Named channel (`ok:open-asset` not `exec`), `ipcMain.handle`, synchronous sender origin validation, type-guard payload, resolve-then-validate in main, explicit result envelope `{ok: boolean, error?: string}` | Doyensec 2019 + Electron docs |
| "Baseline hardening" | `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`; fuses: `runAsNode=false`, `nodeOptions=false`, `nodeCliInspect=false` in packaged builds | Electron docs security checklist |

---

## Cross-Editor Convergences

1. **`openExternal` always behind a scheme-allowlist wrapper.** AFFiNE `openExternalSafely`, VSCode `matchesSomeScheme`. Both reject `file:` explicitly.
2. **Two-handler navigation intercept is the documented default** (Electron docs + Standard Notes + AFFiNE + VSCode-via-opener).
3. **`showItemInFolder` is zero-validation and universal.** Opens to parent dir, no handler dispatch.
4. **Electron-docs-recommended fuses are consistently flipped off** in packaged builds (`runAsNode`, `nodeOptions`, `nodeCliInspect`).
5. **`contextIsolation` + `sandbox` are table stakes.** Electron 12+ defaults; all surveyed apps opt in.

## Cross-Editor Divergences

1. **Left-click on opaque file diverges sharply** — keep-in-app (VSCode, AFFiNE, Standard Notes) vs OS-delegate (Joplin, Zettlr; also Obsidian per D9 of the editor-asset-embed-patterns report).
2. **Validation richness for `shell.openPath`** ranges from Joplin's 6-step gate to Zettlr's trusted-source-only to GitHub Desktop's naming-as-validation.
3. **Whether the app owns a file-open opener service** (VSCode's `openerService`) vs scatters shell calls across handlers (everyone else).

## Unclaimed Territory

- **No surveyed app implements full TOCTOU-closed path validation** (O_NOFOLLOW + fd-based handoff). All accept the TOCTOU window between `realpath` and `openPath`.
- **No surveyed app distinguishes user-initiated clicks from renderer-initiated IPC for `openPath` requests.** Electron doesn't forward user-activation across IPC. Apps accept this limitation.
- **No general-purpose "open-with-specific-app" UX** in any surveyed OSS app. All fall back to OS-default.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Logseq `shell.openPath` call site** — community forums suggest the Electron build delegates on PDF click, but the call site was not located in the main-process tree in this pass. UNCERTAIN.
- **Standard Notes URL scheme validation** — the two-handler intercept passes `url` through unchanged; whether an upstream scheme allowlist exists was not verified.
- **Closed-source apps (Obsidian, Notion Desktop, Slack Desktop, Discord, Linear Desktop)** — excluded per scope lock. Obsidian's behavior for non-renderable types is documented in [editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md](../editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md) (they delegate via `shell.openPath` automatically).

### Out of scope (per rubric)

- Tauri / Neutralino / Wails.
- Code-signing / auto-update / distribution (see `electron-desktop-app-operations-2025/`).
- Deep-link URL scheme design (see `deep-linking-ai-desktop-apps-2026/`).
- Benchmarks.
- App-specific implementation plans (user chose pattern-level only).

---

## References

### Evidence Files
- [evidence/d1-api-surface.md](evidence/d1-api-surface.md) — Electron shell/OS API surface enumeration
- [evidence/d2-web-equivalents.md](evidence/d2-web-equivalents.md) — Web platform parity map
- [evidence/d3-click-interception-patterns.md](evidence/d3-click-interception-patterns.md) — Interception surfaces + cross-app patterns
- [evidence/d4-security-patterns.md](evidence/d4-security-patterns.md) — Attack classes, CVEs, path-containment sketch, IPC shape
- [evidence/d5-oss-case-studies.md](evidence/d5-oss-case-studies.md) — 7-app survey with file:line citations

### External Sources

**Electron docs:**
- [shell](https://www.electronjs.org/docs/latest/api/shell)
- [app](https://www.electronjs.org/docs/latest/api/app)
- [dialog](https://www.electronjs.org/docs/latest/api/dialog)
- [webContents](https://www.electronjs.org/docs/latest/api/web-contents)
- [Security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)

**Security research:**
- [Doyensec — Electron APIs Misuse (2021)](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)
- [Doyensec — Subverting Electron Apps via Insecure Preload (2019)](https://blog.doyensec.com/2019/04/03/subverting-electron-apps-via-insecure-preload.html)
- [Benjamin Altpeter — Many paths to RCE via openExternal](https://benjamin-altpeter.de/shell-openexternal-dangers/)
- [Benjamin Altpeter — CVE-2020-25019 Jitsi writeup](https://benjamin-altpeter.de/jitsi-meet-electron-rce-shell-openexternal/)
- [Cobalt — Common Misconfigurations in Electron Apps Part 1](https://www.cobalt.io/blog/common-misconfigurations-electron-apps-part-1)
- [muffin.ink — Bananatron: state of Electron app security](https://muffin.ink/blog/bananatron/)
- [Electronegativity OPEN_EXTERNAL_JS_CHECK](https://github.com/doyensec/electronegativity/wiki/OPEN_EXTERNAL_JS_CHECK)

**CVEs:**
- [CVE-2020-25019 (Jitsi Meet Electron)](https://benjamin-altpeter.de/jitsi-meet-electron-rce-shell-openexternal/)
- [CVE-2020-16608](https://sghosh2402.medium.com/cve-2020-16608-8cdad9f4d9b4)
- [Electron security advisories](https://github.com/electron/electron/security/advisories)

**Related Research:**
- [editor-asset-embed-patterns-across-universe/](../editor-asset-embed-patterns-across-universe/) — Click behavior per-editor (D9 of that report deepens Obsidian/Logseq/Zettlr specifics for the editor class)
- [electron-desktop-app-operations-2025/](../electron-desktop-app-operations-2025/) — Distribution, code-signing, auto-update
- [deep-linking-ai-desktop-apps-2026/](../deep-linking-ai-desktop-apps-2026/) — Custom URL scheme design
