---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(editor): asset upload + `![[file.ext]]` wiki-embed surface

Any file drop under `upload.maxBytes` (25 MB default) is accepted by the editor. PDFs, video, audio, archives, and fonts stop hitting the old "Unsupported file type" dead-end. The emit shape is picked by extension × `emitFormat`: images + typed files in `upload.wikiEmbedExtensions` emit as `![[file.ext]]`; opaque files emit as `[name](path)` markdown links.

Obsidian vaults with `![[photo.png]]` refs + `.obsidian/app.json` settings open without manual configuration: the embed tokenizer parses `![[...]]` as a first-class `wikiLinkEmbed` mdast/PM shape, a new in-memory basename index resolves targets Foam-style (shortest-path from the current doc), and `detectObsidianVault` pre-populates `upload.attachmentFolderPath` + `upload.emitFormat` from the vault's `useMarkdownLinks` + `attachmentFolderPath`.

Same-directory sha256 dedup returns existing paths on duplicate drops with a toast (`"Already at <path> — reusing."`). Renaming a doc that contains image refs recomputes the relative path; absolute refs and wiki-embed refs are untouched because the basename index resolves them dynamically.

New HTTP surface on the server:

- `POST /api/upload` — primary upload endpoint. Success response: `{ ok, src, path, deduped }` where `src` is the asset's basename and `path` is the contentDir-relative location (reflects `upload.attachmentFolderPath`). 413 response shape: `{ ok: false, error: 'max-bytes', message, attemptedBytes, maxBytes }`.
- `POST /api/upload-image` — one-release deprecation shim forwarding to `/api/upload`. Note: the 413 response body previously returned `{ error: 'Payload too large' }`; it now returns the same `{ error: 'max-bytes', message, attemptedBytes, maxBytes }` shape as `/api/upload`. Clients matching on the old string must update before the shim is removed in the next minor release.
- `GET /api/upload-config` — exposes the resolved `upload.*` subtree so the client honors operator overrides without a rebuild.

New config surface under `upload.*`: `attachmentFolderPath`, `emitFormat`, `maxBytes`, `dedup.{mode,ui}`, `wikiEmbedExtensions`. Every default mirrors Obsidian's shape so refugees get zero-config parity.

File watcher now emits `asset-create` / `asset-delete` DiskEvents alongside the existing markdown events; CC1 `ch:'files'` signal coalesces both so file-sidebar and basename-index rebuilds piggyback on one broadcast. `sanitizeFilename` preserves Unicode code points (letters, digits, marks, punctuation, emoji) while stripping path separators and control bytes.

Full spec + decision log (D1–D-M): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md). Operator-facing guide: [Assets and embeds](docs/content/guides/assets-and-embeds.mdx).
