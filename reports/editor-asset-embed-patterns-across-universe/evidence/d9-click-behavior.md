# Evidence: D9 — Click behavior / open semantics (web vs Electron)

**Dimension:** Click behavior when a user activates an asset reference — web-build vs Electron/desktop-build divergence, renderable vs opaque handling, `shell.openPath` delegation patterns.

**Date:** 2026-04-23
**Sources:** github.com source trees + official docs + community forums (access dates inline).

---

## Key files / pages referenced

- **Zettlr** — [`source/app/service-providers/commands/open-attachment.ts`](https://github.com/Zettlr/Zettlr/blob/96ef480b/source/app/service-providers/commands/open-attachment.ts) — `shell.openPath` call sites at lines 87 and 127 (only places in the repo).
- **AFFiNE** — [`packages/frontend/apps/electron/src/main/security-restrictions.ts`](https://github.com/toeverything/AFFiNE/blob/2caf3c86/packages/frontend/apps/electron/src/main/security-restrictions.ts) — `will-navigate` + `setWindowOpenHandler` interceptors.
- **AFFiNE** — [`packages/frontend/apps/electron/src/main/security/open-external.ts`](https://github.com/toeverything/AFFiNE/blob/2caf3c86/packages/frontend/apps/electron/src/main/security/open-external.ts) — scheme allowlist for `shell.openExternal`.
- **Docmost** — [DeepWiki attachment controller 9.1](https://deepwiki.com/docmost/docmost/9.1-attachment-controller-and-services) — extension-gated `Content-Disposition` dispatch.
- **HedgeDoc** — [GHSA-x74j-jmf9-534w](https://github.com/hedgedoc/hedgedoc/security/advisories/GHSA-x74j-jmf9-534w) — security advisory that pushed HedgeDoc to `attachment` for all uploads.
- **Outline** — [getoutline.com/changelog/file-attachments](https://www.getoutline.com/changelog/file-attachments) — S3 signed-URL download model.
- **Obsidian forum** — [t/42918](https://forum.obsidian.md/t/one-click-pdf-files-opening-in-default-system-app/42918), [t/28874](https://forum.obsidian.md/t/allow-user-to-change-default-behaviour-so-that-clicking-on-the-link-to-a-pdf-attachment-opens-the-system-pdf-app/28874) — long-running FRs for "left-click → default app."
- **Logseq forum** — [t/6203](https://discuss.logseq.com/t/clicking-on-asset-link-such-as-a-pdf-doesnt-open-the-pdf-with-default-app/6203), [t/22775](https://discuss.logseq.com/t/let-user-choose-to-open-a-asset-or-reveal-in-finder/22775) — community reports of MIME bugs + reveal-in-folder requests.
- **SilverBullet** — [v1.silverbullet.md/Attachments](https://v1.silverbullet.md/Attachments) — relative-URL serving model.
- **Zettlr docs** — [docs.zettlr.com/en/reference/settings/](https://docs.zettlr.com/en/reference/settings/) — "Open with" internal-vs-external toggle.

---

## Findings

### Finding: Four distinct behavior clusters across 10 editors surveyed

**Confidence:** CONFIRMED (primary source + community forums, access 2026-04-22/23)

**Cluster 1 — Browser-native pass-through.** Docmost, SilverBullet, HedgeDoc. Server sets `Content-Disposition` per extension; Chromium's built-in PDF viewer handles inline, others download. Zero custom click logic. Web↔desktop parity is automatic because desktop is a WebView.

**Cluster 2 — OS-delegation via `shell.openPath`.** Zettlr (only). Native-only Electron editor. Renderable types (image, PDF) get in-app viewers; opaque types shell-out. Only cluster that differentiates renderable vs opaque at click-time.

**Cluster 3 — Inline-preview-first, opt-in OS delegation.** Obsidian. Main process does NOT auto-delegate — PDF renders in a bundled viewer, and `shell.openPath` is right-click-only. Strong user demand for a "left-click to default app" toggle (top forum FRs 2021-2024); not shipped.

**Cluster 4 — Download-only.** Outline, AFFiNE, HedgeDoc. Multi-tenant web products. Click = download. No in-editor viewer for opaque types; no OS delegation because there's no OS (or, in AFFiNE desktop's case, desktop reuses the web download path).

**Implications for OK:** the dominant Electron pattern is NOT `shell.openPath` — it's "reuse web behavior in a WebView." Only Zettlr (single-user native editor) intercepts click for OS-default. Obsidian — the closest peer to OK in terms of shape (local-first, markdown-canonical, wiki-embed-native) — explicitly does NOT delegate to OS on click, and users are requesting they do.

### Finding: Zettlr is the only Electron editor that calls `shell.openPath` on asset click

**Confidence:** CONFIRMED
**Evidence:** [Zettlr open-attachment.ts](https://github.com/Zettlr/Zettlr/blob/96ef480b/source/app/service-providers/commands/open-attachment.ts) — lines 87 + 127. Searched AFFiNE, Logseq (main/), and desktop builds of other candidates for `shell.openPath` call sites; only Zettlr's `open-attachment.ts` matches.

```text
# Zettlr open-attachment.ts:87, 127 (only call sites in repo)
shell.openPath(filePath)
```

**Implications:** this is a minority pattern. Adopting it would put OK closer to Zettlr than to any editor in the same category (collaborative markdown, Obsidian-compatible `![[...]]` syntax). The closest-shape peer (Obsidian) explicitly rejects it.

### Finding: Docmost's pattern — `Content-Disposition` gated by extension — is the cleanest web-and-desktop unification

**Confidence:** CONFIRMED via DeepWiki synthesis of Docmost source (access 2026-04-23)
**Evidence:** [DeepWiki 9.1](https://deepwiki.com/docmost/docmost/9.1-attachment-controller-and-services)

Docmost's attachment controller responds with `Content-Disposition: inline` for `.jpg/.png/.jpeg/.pdf/.mp4/.mov` and `Content-Disposition: attachment` for every other extension. Renderable types preview in-tab via Chromium's native handlers; opaque types force download. Desktop build embeds the same web app, so desktop parity is free.

**Implications for OK:** OK's dev plugin already has a sirv middleware serving `CONTENT_DIR`. Adding extension-gated `Content-Disposition` is a small server-side change that unifies web and Electron behavior — no click interceptor needed, no new IPC surface.

### Finding: HedgeDoc's all-attachment policy was security-driven (GHSA-x74j-jmf9-534w)

**Confidence:** CONFIRMED
**Evidence:** [GHSA-x74j-jmf9-534w](https://github.com/hedgedoc/hedgedoc/security/advisories/GHSA-x74j-jmf9-534w)

HedgeDoc switched all uploads to `Content-Disposition: attachment` after a stored-XSS advisory. This informs OK's D-M accept-all posture: we already serve scripted-document extensions with `Content-Disposition: attachment` via the plugin's `SCRIPTED_DOC_EXTS` guard (`hocuspocus-plugin.ts:633-650`). Extending this to "always attachment for non-renderable" would match HedgeDoc. Narrowing it to "inline for renderable" would match Docmost.

### Finding: VSCode-extension editors (Foam, Dendron) are architecturally different

**Confidence:** CONFIRMED
**Evidence:** [Foam marketplace page](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode); [DeepWiki Foam 2.3](https://deepwiki.com/foambubble/foam/2.3-vs-code-extension)

Foam and Dendron ship as VSCode extensions with no standalone Electron or web builds. Asset clicks go through VSCode's link provider (`vscode.env.openExternal` or file reveal), not through the extension's own code. Not directly applicable to OK's architecture — documented here so the Path C reader doesn't expect findings for those builds.

---

## Negative searches

- Searched AFFiNE `electron/src/main/` for `shell.openPath` → NOT FOUND (only `shell.openExternal` for URLs).
- Searched Logseq `src/main/frontend/` for `shell.openPath` on asset click → partial; community forum reports MIME/default-app bugs (t/6203) suggesting the Electron build does delegate, but I could not find the call site in a quick inspection — left as UNCERTAIN.
- Searched Outline for any in-app viewer code → NOT FOUND (confirmed download-only per changelog).

---

## Gaps / follow-ups

- Logseq's exact call site for "open with default app" was not located in the main/frontend tree. A deeper read could confirm whether it uses `shell.openPath` or spawns a child process. Not load-bearing for the recommendation.
- Mobile behavior (Obsidian Mobile, Logseq Mobile) out of scope here. OK does not ship mobile.
