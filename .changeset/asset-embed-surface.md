---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(editor): asset upload + `![[file.ext]]` wiki-embed surface

Any file drop is accepted by the editor — there is no user-facing byte cap. PDFs, video, audio, archives, and fonts stop hitting the old "Unsupported file type" dead-end. The emit shape is picked by extension × `emitFormat`: markdown files (`.md` / `.mdx`) emit as `[[basename]]` wiki-links (link-semantic, navigable on Cmd-click, resolved via `fileIndex` — markdown is a first-class OK doc, not an opaque asset); images + typed files in `upload.wikiEmbedExtensions` emit as `![[file.ext]]` wiki-embeds; opaque files emit as `[name](path)` markdown links. Uploads stream to disk end-to-end (memory footprint is O(1), not O(fileSize)), so the only rejection axis is disk fullness (`storage-full` → HTTP 507). See [`reports/streaming-upload-refactor/REPORT.md`](reports/streaming-upload-refactor/REPORT.md) for the refactor rationale.

Obsidian vaults with `![[photo.png]]` refs + `.obsidian/app.json` settings open without manual configuration: the embed tokenizer parses `![[...]]` as a first-class `wikiLinkEmbed` mdast/PM shape, a new in-memory basename index resolves targets Foam-style (shortest-path from the current doc), and `detectObsidianVault` pre-populates `upload.attachmentFolderPath` + `upload.emitFormat` from the vault's `useMarkdownLinks` + `attachmentFolderPath`.

Same-directory sha256 dedup returns existing paths on duplicate drops with a toast (`"Already at <path> — reusing."`). Renaming a doc that contains image refs recomputes the relative path; absolute refs and wiki-embed refs are untouched because the basename index resolves them dynamically.

New HTTP surface on the server:

- `POST /api/upload` — upload endpoint. Success response: `{ ok, src, path, deduped }` where `src` is the asset's basename and `path` is the contentDir-relative location (reflects `upload.attachmentFolderPath`). Error responses carry a typed `error` reason (`malformed-upload` / `storage-full` / `storage-readonly` / `collision-exhaustion` / `storage-error`) plus a human-readable `message`.
- `GET /api/upload-config` — exposes the resolved `upload.*` subtree so the client honors operator overrides without a rebuild.

New config surface under `upload.*`: `attachmentFolderPath`, `emitFormat`, `dedup.{mode,ui}`, `wikiEmbedExtensions`. Every default mirrors Obsidian's shape so refugees get zero-config parity. Legacy `upload.maxBytes` keys parse cleanly (Zod strips unknown keys) and a one-time deprecation WARN surfaces from the CLI loader, Vite dev plugin, and desktop loader so users can clean up `config.yml`.

File watcher now emits `asset-create` / `asset-delete` DiskEvents alongside the existing markdown events; CC1 `ch:'files'` signal coalesces both so file-sidebar and basename-index rebuilds piggyback on one broadcast. `sanitizeFilename` preserves Unicode code points (letters, digits, marks, punctuation, emoji) while stripping path separators and control bytes.

Full spec + decision log (D1–D-M): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md). Operator-facing guide: [Assets and embeds](docs/content/guides/assets-and-embeds.mdx).

**Asset-click dispatcher + OS-integration surface (2026-04-23 amendment).** Click a `![[meeting.pdf]]` embed and the PDF opens predictably — a new browser tab in web, `shell.openPath` in Electron. Previously post-reload clicks routed through the doc-link navigator and failed silently (Gap 3b); Electron drop-time clicks replaced the editor window (Gap 4). Both gaps close.

- `ClassifiedLinkTarget` gains a first-class `{kind: 'asset', url, ext}` variant; `resolveAssetProjectPath` resolves relative hrefs against the source doc's directory.
- Renderer-side dispatcher + empty-at-landing viewer registry at `packages/app/src/editor/asset-dispatch/` — future PRs register PDF.js / image lightbox / video-audio viewers as ~40-60 LOC plugins without modifying the dispatch layer.
- Three new Electron IPC channels (`ok:shell:open-asset`, `ok:shell:reveal-asset`, `ok:shell:show-asset-menu`). Main-process `openAssetSafely` enforces path containment (`realpath` + `isPathWithinProject`), existence, and an executable-extension blocklist (`.exe`/`.sh`/`.html`/`.svg`/…) source-verified from Obsidian 1.12.7. Renderer sends project-relative paths; containment fires at the IPC boundary.
- Right-click any on-disk reference (asset chip, wiki-link chip, image) → native OS menu with Reveal in Finder / Show in Explorer + Open in default app + Copy link. Gesture-attested (main observes the click directly).
- Defense-in-depth: `setWindowOpenHandler` + `will-navigate` on the editor webContents intercept any asset URL that escapes the renderer dispatcher (pasted `<a href>`, plugin content, drop-time `<a target="_blank">`). Same path containment + blocklist enforced on every entry point.

Full amendment (US-A1..A6, FR-A1..A8, NG-A1..A6, D-A1..A12): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) §Post-finalization amendment (2026-04-23). Research: [`reports/electron-os-integration-patterns/`](reports/electron-os-integration-patterns/) + [`reports/editor-asset-embed-patterns-across-universe/`](reports/editor-asset-embed-patterns-across-universe/) D9.
