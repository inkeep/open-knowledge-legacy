---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": minor
"@inkeep/open-knowledge-desktop": minor
---

feat(editor): asset upload + `![[file.ext]]` wiki-embed surface

Any file drop is accepted by the editor — there is no user-facing byte cap. PDFs, video, audio, archives, and fonts stop hitting the old "Unsupported file type" dead-end. The emit shape is picked by extension × `emitFormat`: images + typed files in `upload.wikiEmbedExtensions` emit as `![[file.ext]]`; opaque files emit as `[name](path)` markdown links. Uploads stream to disk end-to-end (memory footprint is O(1), not O(fileSize)), so the only rejection axis is disk fullness (`storage-full` → HTTP 507). See [`reports/streaming-upload-refactor/REPORT.md`](reports/streaming-upload-refactor/REPORT.md) for the refactor rationale.

Obsidian vaults with `![[photo.png]]` refs + `.obsidian/app.json` settings open without manual configuration: the embed tokenizer parses `![[...]]` as a first-class `wikiLinkEmbed` mdast/PM shape, a new in-memory basename index resolves targets Foam-style (shortest-path from the current doc), and `detectObsidianVault` pre-populates `upload.attachmentFolderPath` + `upload.emitFormat` from the vault's `useMarkdownLinks` + `attachmentFolderPath`.

Same-directory sha256 dedup returns existing paths on duplicate drops with a toast (`"Already at <path> — reusing."`). Renaming a doc that contains image refs recomputes the relative path; absolute refs and wiki-embed refs are untouched because the basename index resolves them dynamically.

New HTTP surface on the server:

- `POST /api/upload` — upload endpoint. Success response: `{ ok, src, path, deduped }` where `src` is the asset's basename and `path` is the contentDir-relative location (reflects `upload.attachmentFolderPath`). Error responses carry a typed `error` reason (`malformed-upload` / `storage-full` / `storage-readonly` / `collision-exhaustion` / `storage-error`) plus a human-readable `message`.
- `GET /api/upload-config` — exposes the resolved `upload.*` subtree so the client honors operator overrides without a rebuild.

New config surface under `upload.*`: `attachmentFolderPath`, `emitFormat`, `dedup.{mode,ui}`, `wikiEmbedExtensions`. Every default mirrors Obsidian's shape so refugees get zero-config parity. Legacy `upload.maxBytes` keys parse cleanly (Zod strips unknown keys) and a one-time deprecation WARN surfaces from the CLI loader, Vite dev plugin, and desktop loader so users can clean up `config.yml`.

File watcher now emits `asset-create` / `asset-delete` DiskEvents alongside the existing markdown events; CC1 `ch:'files'` signal coalesces both so file-sidebar and basename-index rebuilds piggyback on one broadcast. `sanitizeFilename` preserves Unicode code points (letters, digits, marks, punctuation, emoji) while stripping path separators and control bytes.

Full spec + decision log (D1–D-M): [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md). Operator-facing guide: [Assets and embeds](docs/content/guides/assets-and-embeds.mdx).
