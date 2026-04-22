# Evidence: Per-Editor Findings

**Dimension:** All 8 dimensions × 14 editors
**Date:** 2026-04-16
**Sources:** OSS repo source reading + GitHub web fetches

---

## Key files referenced

### Tier 1
- `~/.claude/oss-repos/blocksuite/packages/framework/store/src/transformer/assets.ts` — AssetsManager, dedup logic
- `~/.claude/oss-repos/blocksuite/packages/affine/shared/src/adapters/attachment.ts` — attachment block adapter
- `~/.claude/oss-repos/blocksuite/packages/affine/widgets/linked-doc/src/transformers/zip.ts` — centralized `assets/` in export
- `~/.claude/oss-repos/outline/shared/editor/nodes/Attachment.tsx:286-292` — `toMarkdown` emits `[title size](href)`
- `~/.claude/oss-repos/outline/shared/editor/commands/insertFiles.ts:77-102,189` — 3-way MIME dispatch
- `~/.claude/oss-repos/outline/shared/editor/rules/links.ts:21-94` — markdown-it rule detecting attachment URLs

### Tier 2
- `~/.claude/oss-repos/logseq/deps/common/src/logseq/common/config.cljs:36` — `defonce local-assets-dir "assets"` hardcoded
- `~/.claude/oss-repos/logseq/src/main/frontend/handler/db_based/import.cljs:75` — Obsidian importer constructs assets-dir path
- `~/.claude/oss-repos/logseq/src/main/frontend/format/mldoc.cljs:1-50` — delegates `![[...]]` parsing to external mldoc Wasm
- `~/.claude/oss-repos/foam/packages/foam-vscode/src/core/services/attachment-provider.ts:47-52` — non-images render as `### filename`
- `~/.claude/oss-repos/foam/packages/foam-vscode/src/features/preview/wikilink-embed.ts:22-80` — `![[target]]` regex + modifier parser
- `~/.claude/oss-repos/foam/packages/foam-vscode/src/features/refactor.ts:60-80` — rename rewrites wikilinks
- `~/.claude/oss-repos/foam/packages/foam-vscode/src/settings.ts:36-40` — `foam.files.attachmentExtensions` config (no folder)

### Tier 2B + 3
- `~/.claude/oss-repos/dendron/packages/plugin-core/src/commands/PasteFile.ts:49-115` — drops land in per-vault `assets/`
- `~/.claude/oss-repos/dendron/packages/unified/src/remark/noteRefsV2.ts:44,76-85,1031-1054` — `![[note#anchor]]` + portal rendering
- `~/.claude/oss-repos/dendron/packages/unified/src/remark/transformLinks.ts:16-46` — rename rewrites `WIKI_LINK` + `REF_LINK_V2`
- `~/.claude/oss-repos/fumadocs/packages/obsidian/src/remark/remark-wikilinks.ts:15,105,156-223` — `!?\[\[...\]\]` regex + isEmbed dispatch
- `~/.claude/oss-repos/fumadocs/packages/obsidian/src/build-resolver.ts:28-69` — VaultResolver with dual name+path index + alias support
- `~/.claude/oss-repos/fumadocs/packages/obsidian/src/build-storage.ts:35-68` — ParsedContentFile/ParsedMediaFile/ParsedDataFile

### Tier 6
- `~/.claude/oss-repos/blocknote/packages/core/src/extensions/FileHandler/handleFileInsertion.ts:71-196` — `fileBlockAccept[]` schema-aware dispatch
- `~/.claude/oss-repos/blocknote/packages/core/src/blocks/FileBlockContent/block.ts:70` — `fileBlockAccept: ["*/*"]` generic fallback
- `~/.claude/oss-repos/tiptap/extensions/file-handler/src/FileHandlePlugin.ts:1-80` — 158-LOC total plugin
- `~/.claude/oss-repos/milkdown/plugin-upload/src/upload.ts:21-65` — UploadOptions with uploader + widgetFactory + getInsertPos
- `~/.claude/oss-repos/milkdown/plugin-upload/src/default-uploader.ts:29-47` — default uploader is image-only
- `~/.claude/oss-repos/plate/packages/media/src/lib/image/BaseImagePlugin.ts:33-62` — image-only plugin
- `~/.claude/oss-repos/tinacms/packages/toolkit/core/media-store.default.ts:16-455` — MediaStore + cloud/local dual-mode

---

## Findings by Editor

### AFFiNE (via BlockSuite) — MIT, 67K★, block-WYSIWYG + Yjs + SQLite

- **D1 Non-image drop:** Typed block nodes (`affine:attachment`, `affine:image`, `affine:video`) created via `AttachmentAdapter.toSliceSnapshot()` with sourceId → `AssetsManager` mapping. Markdown export serializes attachment as `[title size](href)` resembling Outline. **CONFIRMED** from `blocksuite/.../adapters/attachment.ts:97-126`.
- **D2 Wiki-link embed:** Not parsed. BlockSuite uses block flavours (`flavour: 'affine:attachment'`), not markdown embed syntax. **NOT FOUND**.
- **D3 Embed UX:** Attachment block renders with file icon + filename + optional PDF preview; custom rename modal (`RenameModal`, `rename-model.ts:11-95`). **INFERRED**.
- **D4 Asset dedup:** Name-based conflict resolution. `makeNewNameWhenConflict()` appends ` (1).ext`, ` (2).ext` on collision (`assets.ts:10-19`, used at lines 68-76). No content-hash dedup. Silent (no warn). **CONFIRMED**.
- **D5 Vault import:** No Obsidian/Logseq config readers found. Generic Transformer+Adapter pattern supports `.bs.zip` (BlockSuite's own format), markdown, notion-html. **NOT FOUND**.
- **D6 Basename index:** `_pathBlobIdMap: Map<string, string>` in AssetsManager (`assets.ts:38,53-55`) + `_names: Set<string>` for dedup tracking. Ephemeral (per-transformer-job). **CONFIRMED**.
- **D7 Image-ref rewrite on rename:** Local attachment rename updates block props but no back-reference update (`rename-model.ts:40-52`). **UNCERTAIN**.
- **D8 Asset folder:** Centralized `assets/` in zip export/import (`zip.ts:44`). No per-doc co-location. Not configurable. **CONFIRMED**.

### Docmost — AGPL, 19.6K★, self-hosted Confluence alternative (CLOSED via 2026-04-16 source read)

- **D1 Non-image drop:** `handleFileDrop()` at `editor-paste-handler.tsx:219-242` chains `uploadImageAction`, `uploadVideoAction`, `uploadPdfAction`, `uploadAttachmentAction` per file. `ATTACHMENT_NODE_TYPES` at line 13-21: `["image","video","audio","pdf","attachment","excalidraw","drawio"]` — typed Tiptap nodes, NOT markdown link. `Attachment` node at `packages/editor-ext/src/lib/attachment/attachment.ts:42-86` has attrs `url, name, mime, size, attachmentId`, renders as `<div data-type="attachment" data-attachment-url="..." data-attachment-name="...">`. **CONFIRMED**.
- **D2 Wiki-link embed:** NOT supported. Uses `@mention` extension for internal page links (`Mention` node with `@` prefix), not `[[...]]`. Grep for `\[\[` returned only unrelated code. **CONFIRMED NOT FOUND**.
- **D3 Embed UX:** Mantine `Paper` attachment pill (icon + filename + size + download button + loading spinner); optional "Embed as PDF" action for `.pdf` (`attachment-view.tsx:10-87`, line 69-74). Dedicated Video/PDF/Image views with inline players. **CONFIRMED**.
- **D4 Asset dedup:** UUID v7 (time-sorted). Optional `attachmentId` param for in-place overwrites (diagram saves) at `attachment.service.ts:44-141` lines 62-82. No hash-based dedup; no counter suffix — each upload gets fresh UUID. File path includes UUID: `${workspaceFolder}/${attachmentId}/${fileName}`. **CONFIRMED**.
- **D5 Vault import:** Confluence (HTML/ZIP) import only via `import-attachment.service.ts:49-70`. NO Obsidian, NO `.obsidian/app.json` reader. **CONFIRMED NOT FOUND**.
- **D6 Basename index:** NONE. Attachments keyed by UUID, not basename. References use `/api/files/${attachmentId}/${fileName}` (`attachment.controller.ts:167-211` — filename is cosmetic; fileId is authoritative). **CONFIRMED no basename index**.
- **D7 Image-ref rewrite on rename:** NOT NEEDED by architecture. URLs embed UUID (`attachmentId`), not page slug, so page rename cannot invalidate refs. `page.service.ts:374-489` `movePageToSpace()` updates attachment `spaceId` foreign key only; URLs stable. **CONFIRMED — architectural immunity via UUID stability**.
- **D8 Asset folder:** Server-managed global storage per workspace. Attachments in database with `workspace_id, space_id, page_id` FKs (`20240324T086700-attachments.ts`). Files at `${workspaceFolder}/${attachmentId}/${fileName}`. Not co-located with page markdown. **CONFIRMED**.

### Outline — BSL, 37.9K★, self-hosted team wiki (ProseMirror + markdown)

- **D1 Non-image drop:** 3-way dispatch via `FileHelper.isImage/isVideo` (regex). Image → image node; Video → video node with `<video controls>`; Everything else → attachment node. **Attachment `toMarkdown`: `[${title} ${size}](${href})\n\n`. Video `toMarkdown`: `[${title} ${width}x${height}](${src})\n\n`.** **CONFIRMED** (see INV4 evidence file).
- **D2 Wiki-link embed:** Not parsed. Uses markdown-it `attachmentsRule` (`links.ts:21-37,67-94`) that scans URL patterns (`/api/attachments.redirect`, `/api/files.get`, S3 presigned) to convert `[title size](url)` back into attachment/video nodes at parse time. **CONFIRMED no `![[...]]`**.
- **D3 Embed UX:** Inline image; attachment as block widget with download icon + file size; PDF opt-in preview (`<PdfViewer>` at `Attachment.tsx:130-139`). **CONFIRMED**.
- **D4 Asset dedup:** UUID-based (`uuidv4()` at `insertFiles.ts:94`). No client-side content-hash dedup; server-side unclear. **UNCERTAIN**.
- **D5 Vault import:** `/app/scenes/Settings/Import.tsx:43-107` offers Markdown zip, JSON, Confluence only. No Obsidian importer. **NOT FOUND**.
- **D6 Basename index:** No client-side basename resolver; server-managed via attachment IDs. **UNCERTAIN (likely server-side)**.
- **D7 Rename rewrite:** No editor-level attachment rename UI; doc-rename not observable in client. **UNCERTAIN**.
- **D8 Asset folder:** Server-managed via `/api/attachments.redirect` endpoints. No client-observable folder layout. **CONFIRMED server-managed**.

### Logseq (file-mode) — AGPL, 36K+★, outliner PKM over plain files

- **D1 Non-image drop:** Paste/drop handler processes markdown blocks; assets stored in flat `./assets/` via paste handler + DB sync (`paste.cljs:1-80`, `dnd.cljs:1-59`). Emit likely standard `[name](./assets/file.ext)` markdown. **CONFIRMED**.
- **D2 Wiki-link embed:** YES — `![[filename]]` parsed by external mldoc (Rust/Wasm) library (`mldoc.cljs:1-50`). Block transclusion + page transclusion supported. **CONFIRMED** (delegation; algorithm not in repo).
- **D3 Embed UX:** Inline transclusion/expansion of blocks or pages within the current outliner view; images render inline. **INFERRED** (no explicit render code in Clojure handlers).
- **D4 Asset dedup:** No content-hash dedup. `assets.cljs:22-100` checks size but not hash. **CONFIRMED**.
- **D5 Vault import:** YES — Obsidian vault importer explicitly present (`import.cljs:75` constructs `assets-dir` during import). **CONFIRMED** (reads Obsidian config).
- **D6 Basename index:** DataScript/SQLite graph DB via `logseq.db.frontend.asset`; auto-refresh on FS events. **CONFIRMED**.
- **D7 Rename rewrite:** Manual — no automatic rewrite on asset rename. **INFERRED**.
- **D8 Asset folder:** Global `./assets/` hardcoded via `local-assets-dir`. Not configurable; no co-location. **CONFIRMED**.

### SilverBullet — MIT, ~3-4K, self-hosted markdown notebook (Go + TS) (CLOSED via 2026-04-16 source read)

- **D1 Non-image drop:** CodeMirror 6 editor intercepts `drop` at `client/codemirror/editor_paste.ts:118-130` → calls `processFileTransfer()`. Upload via `plugs/editor/upload.ts:21-117` `saveFile()` with `isValidPath()` check + collision prompt + user path prompt. **CONFIRMED**.
- **D2 Wiki-link embed:** **YES — supports `![[file.ext]]`.** `client/markdown_parser/parser.ts:26-86` defines WikiLink parser that checks for `[` (91) OR `!` (33). When `!` prefix detected, wraps result in `Image` elt (`allElts = cx.elt("Image", pos, endPos, [allElts])`). Regex at `client/markdown_parser/constants.ts:1-2`: `/(?<leadingTrivia>!?\[\[)(?<stringRef>.*?)(?:\|(?<alias>.*?))?(?<trailingTrivia>\]\])/g`. **Supports both `[[page]]` + `![[file.ext]]` + alias form `[[x|title]]`**. **CONFIRMED** (**correction: prior INFERRED no was wrong**).
- **D3 Embed UX:** CodeMirror 6 widgets. `client/markdown_renderer/markdown_render.ts:265-297` `Image` case calls `parseTransclusion(text)` then `createMediaElement(transclusion)` — returns `<img>` or `<iframe>`. Transclusion parser at `plug-api/lib/transclusion.ts:71-103` supports **dimension modifiers** `|200x300` (lines 33-65). Dedicated `plugs/image-viewer/viewer.ts:1-109` with Panzoom pan/zoom. **CONFIRMED**.
- **D4 Asset dedup:** Timestamp-based naming (`editor_paste.ts:209-212`: `2026-04-16_14-30-45` from `localDateString`). No sha256. `saveFile()` at line 225-307 prompts user for path, checks existing, offers replace/rename. **CONFIRMED no hash dedup**.
- **D5 Vault import:** NO Obsidian/Roam/Logseq importers. Zero references to `.obsidian`, `vault`, `app.json` across codebase. **CONFIRMED NOT FOUND**.
- **D6 Basename index:** Lua-based query engine. Links indexed with type `"page" | "file" | "url"` at `plugs/index/link.ts:30-44`. `plug-api/lib/ref.ts` has `getNameFromPath()` for basename extraction. Pages indexed via `plugs/index/page.ts:22-74` with metadata `name, lastModified, tags, aliases` (Obsidian-style frontmatter aliases supported). Lookups via Lua expressions: `_.name == pageName`. **CONFIRMED Lua-indexed**.
- **D7 Image-ref rewrite on rename:** **FULL backlink update AND co-located document relocation.** `plugs/index/refactor.ts:432-498` `updateBacklinks()` iterates all backlinks, sorts by position descending, rewrites `[[oldName]] → [[newName]]` + handles markdown link relative-path resolution. Lines 254-265: documents co-located with a renamed page MOVE with it via `batchRenameDocuments`. **CONFIRMED — joins Foam + Dendron in rename-rewrite + goes further (asset relocation)**.
- **D8 Asset folder:** Relative-path-based, effectively co-located. `plug-api/lib/resolve.ts:41-63` `resolveMarkdownLink()` handles absolute (`/`-prefix) vs relative. `plugs/editor/upload.ts:45-49` prompts user with default path suggestion relative to current page's folder. On rename, documents in same folder move with page. **CONFIRMED**.

### Foam — MIT, ~16K, VS Code extension over plain folder

- **D1 Non-image drop:** No native drop — relies on VS Code file explorer. `AttachmentResourceProvider` synthesizes markdown for any file: non-image → `### filename` header; image → markdown image (`attachment-provider.ts:47-52`). **CONFIRMED**.
- **D2 Wiki-link embed:** YES — `WIKILINK_EMBED_REGEX` at `wikilink-embed.ts:22` handles `![[target]]` with modifier prefixes (`full|content-inline|content-card`) via `WIKILINK_EMBED_REGEX_GROUPS`. **CONFIRMED**.
- **D3 Embed UX:** Rendered in VS Code preview via markdown-it plugin. Modifiers control layout. Not-found falls back to raw `![[target]]`. Cyclic detection with warning (`wikilink-embed.ts:69-80`). **CONFIRMED**.
- **D4 Asset dedup:** None. URI-keyed; same bytes in different paths stored separately. **CONFIRMED**.
- **D5 Vault import:** No explicit `.obsidian/app.json` reader. Syntax-compatible with Obsidian wikilinks (shortest-path resolver from INV2). **CONFIRMED no config reader** (syntax compat only).
- **D6 Basename index:** TrieMap (`mnemonist/trie-map`) keyed by reversed lowercase POSIX path. `getShortestIdentifier()` greedy elimination. In-memory, rebuild-on-workspace-reload, no persistence. **CONFIRMED** (INV2).
- **D7 Rename rewrite:** YES — `refactor.ts:60-80` computes edits via future-state workspace; updates wikilinks globally. **CONFIRMED**.
- **D8 Asset folder:** No convention. `foam.files.attachmentExtensions` config lists allowed extensions (e.g. `'pdf doc zip'`) but no folder path. **CONFIRMED no folder convention**.

### Dendron — Apache, ~6K, VS Code hierarchical notes

- **D1 Non-image drop:** `PasteFile.ts:49-115` drops land in per-vault `assets/` as kebab-cased filename, inserts `[filename](assets/kebab-name.ext)`. **CONFIRMED**.
- **D2 Wiki-link embed:** YES — richest syntax surveyed. `![[vaultName/fname#anchorStart,offset:#anchorEnd|alias]]` (`noteRefsV2.ts:44,76-85`). Block anchors (`^id`), header anchors, list-item anchors, wildcard line/list slicing. **CONFIRMED**.
- **D3 Embed UX:** "Portal" rendering with backlink header + nesting limit 3 (`noteRefsV2.ts:1031-1054`, `MAX_REF_LVL = 3`). MD output preserves source syntax; HTML output renders portal. **CONFIRMED**.
- **D4 Asset dedup:** N/A (compile-time, not a runtime editor). **N/A**.
- **D5 Vault interop:** Multi-vault with explicit `vaultName/` prefix; no Obsidian interop. **CONFIRMED**.
- **D6 Basename index:** `notesByFname` dict with vault filter + `duplicateNoteBehavior` config for collision (`noteRefsV2.ts:414-430,469-501`). **CONFIRMED**.
- **D7 Rename rewrite:** YES — `transformLinks.ts:16-46` traverses AST updating `WIKI_LINK` + `REF_LINK_V2` fname matches. Case-insensitive. Preserves alias unless it matches old fname. **CONFIRMED**.
- **D8 Asset folder:** Per-vault `assets/` (`PasteFile.ts:81`). Vault-root-relative. No global pool. **CONFIRMED**.

### Zettlr — GPL, ~10K, CodeMirror 6 desktop academic editor (CLOSED via 2026-04-16 source read)

- **D1 Non-image drop:** Drop handler at `source/common/modules/markdown-editor/plugins/md-paste-drop-handlers.ts:184-281`. Branches (lines 235-250): **images** (regex `imageRE = /\.(?:png|jpe?g|gif|bmp|svg|tiff?)$/i` at line 27) → save + insert ref; **markdown/code files** (hasMdOrCodeExt) → open in editor via IPC; **everything else** → silently ignored. **PDFs are NOT specially handled for academic citation drop — surprising gap**. **CONFIRMED**.
- **D2 Wiki-link embed:** `[[wikilinks]]` parsed via `source/common/modules/markdown-editor/parser/zkn-link-parser.ts:37-90` with optional pipe for title. Supports `[[link|title]]` (default) or `[[title|link]]` (config-toggled GitHub-style). **`![[embeds]]` NOT supported** — regex search for `!\[\[` returns zero matches. Zettlr uses standard markdown `![alt](path)` only. **CONFIRMED**.
- **D3 Embed UX:** CodeMirror 6 decoration widgets. `source/common/modules/markdown-editor/renderers/render-images.ts:78-150` `ImageWidget extends WidgetType` creates `<figure>` + `<img>` with user-configurable `imagePreviewHeight`/`imagePreviewWidth`. Right-click context menu via `linkImageMenu()`. Wikilinks render as plain text with link decoration (no inline transclusion). **CONFIRMED**.
- **D4 Asset dedup:** None. `md-paste-drop-handlers.ts:57-82` `saveImageFromClipboard()` calls IPC, gets absolute path, converts to relative. No hash/checksum. Saving same image twice with different names creates duplicates. **CONFIRMED no dedup**.
- **D5 Vault import:** `source/app/service-providers/commands/importer/index.ts:30-100`: Markdown files copy as-is; TextBundle/.textpack special import; Pandoc-supported formats via conversion profile. **NO Obsidian, NO Roam, NO Logseq** importer. Migration is file conversion + copy only. **CONFIRMED NOT FOUND**.
- **D6 Basename index:** Dual-index resolver. `source/app/service-providers/links/index.ts:32-122`: `_idDatabase: Map<string, string>` (file ID from config regex) + `_fileLinkDatabase: Map<string, string[]>` (file path → outbound links). `findExact()` at lines 102-122 resolves query by **three strategies in order**: (1) ID regex match → lookup by ID, (2) `.md` extension → lookup by filename, (3) basename lookup. `[[note-id]]`, `[[Note.md]]`, `[[Note]]` all resolve. **CONFIRMED**.
- **D7 Image-ref rewrite on rename:** YES. `source/app/service-providers/commands/file-rename.ts:136-181`: before rename, retrieves inbound links; after rename, **prompts user** (lines 158-166) to confirm update; calls `replaceLinks()` at `source/common/util/replace-links.ts:35-75` which parses markdown to AST, extracts ZettelkastenLink nodes, replaces oldTarget with newTarget, writes back. Handles both `[[filename.md]]` and `[[filename]]`. **CONFIRMED with user-prompt**.
- **D8 Asset folder:** Workspace-level, user-managed. `source/pinia/workspace-store.ts:93-100` opens entire directories as workspace (not per-project). Images stored relative to note; no enforced per-project/per-note subdirectory. User organizes by convention. **CONFIRMED no enforced convention**.

### HedgeDoc — AGPL, ~5K, collaborative markdown pad (OT)

- **D1 Non-image drop:** Not a primary feature; images uploaded via UI to S3/MinIO/GCS. Non-image drop not supported natively. **INFERRED**.
- **D2 Wiki-link embed:** NO — markdown-only (HackMD lineage). **CONFIRMED by design scope**.
- **D3 Embed UX:** Standard inline markdown image. **INFERRED**.
- **D4 Asset dedup:** Backend-delegated. **INFERRED**.
- **D5 Vault import:** Not supported (collaborative editor scope). **CONFIRMED no**.
- **D6 Basename index:** None (slug-based doc IDs, not graph-like). **CONFIRMED**.
- **D7 Rename rewrite:** Not supported by design (URLs immutable). **CONFIRMED**.
- **D8 Asset folder:** Global backend bucket (S3/MinIO/GCS). **INFERRED**.

### Fumadocs — MIT, 11.4K, Next.js docs framework

- **D1 Non-image drop:** N/A (build-time framework). **N/A**.
- **D2 Wiki-link embed:** **YES — most thorough** surveyed. `RegexWikilink = /!?\[\[(?<content>([^\]]|\\])+)]]/g` (`remark-wikilinks.ts:15`). `isEmbed = result[0].startsWith('!')` (line 105). Dispatch: embed + image → mdast `image` node (lines 189-193); embed + content file → `<include>` JSX wrapper (lines 170-184, "not supported yet"); no embed → `link` with `isWikiLink` data flag (lines 211-223). Heading anchors via `getHeadingHash`. **CONFIRMED**.
- **D3 Embed UX:** Images render via standard mdast image; content embeds wrapped in `<include>` (explicit "use at your own risk" warning). **CONFIRMED**.
- **D4 Asset dedup:** N/A (build-time). **N/A**.
- **D5 Vault import:** **YES — deep integration**. `buildStorage()` (`build-storage.ts:35-68`) parses Obsidian vault into ParsedContentFile/ParsedMediaFile/ParsedDataFile. Extracts frontmatter, indexes aliases (lines 44-48), slugifies paths (github-slugger). **CONFIRMED**.
- **D6 Basename index:** `buildResolver()` (`build-resolver.ts:28-69`) creates dual `nameToFile` (by `.name` no-ext + `.base` with-ext + frontmatter aliases) and `pathToFile` (both with/without extension). `resolveAny(name, fromPath)` tries relative `./ ../`, then absolute, then name lookup. **CONFIRMED**.
- **D7 Rename rewrite:** N/A (build-time). **N/A**.
- **D8 Asset folder:** Co-located with content (each directory holds its media). **CONFIRMED**.

### BlockNote — MPL, ~7K, Notion-style block editor on TipTap

- **D1 Non-image drop:** `fileBlockAccept[]` **schema-aware MIME/extension dispatch**. `handleFileInsertion.ts:111-133` iterates all block specs for matching `fileBlockAccept` (`"image/*"`, `"video/*"`, `"audio/*"`, `"*/*"` fallback). Creates block of matched type; calls `editor.uploadFile(file, blockId)` → URL or PartialBlock (lines 182). Rich: image/video/audio/file typed blocks. **CONFIRMED**.
- **D2 Wiki-link embed:** Not shipped. Consumer extensions could add. **NOT FOUND**.
- **D3 Embed primitives:** `createFileBlockWrapper()` resizable or plain NodeView; markdown round-trips via `<figure>` + caption or `<a>` for generic. **CONFIRMED**.
- **D4-D8:** N/A at library level (consumer owns storage/config/rename). **N/A**.

### TipTap FileHandler — MIT, ~25K (core), extension-file-handler is 158 LOC

- **D1 Non-image drop:** Minimal plugin exposing `onDrop(editor, files, pos)` + `onPaste(editor, files, html)` callbacks with optional `allowedMimeTypes[]` prefilter. Format-agnostic; consumer owns all storage. **CONFIRMED**.
- **D2-D8:** N/A (library-level surface only). **N/A**.

### Milkdown plugin-upload — MIT, ~9K

- **D1 Non-image drop:** `UploadOptions.uploader(files, schema, ctx, pos)` returns `Promise<Fragment | Node | Node[]>`. Widget factory for in-flight placeholder decoration. Optional `getInsertPos()` for custom positioning. **Default uploader is image-only** (filters `file.type.includes('image')`, silently drops non-images). **CONFIRMED**.
- **D2 Wiki-link embed:** Not shipped. **NOT FOUND**.
- **D3 Embed primitives:** ProseMirror `Decoration.widget()` for upload placeholder. **CONFIRMED**.
- **D4-D8:** N/A (consumer-controlled). **N/A**.

### Plate media plugin — MIT, ~14K, Slate-based

- **D1 Non-image drop:** `BaseImagePlugin` + `uploadImage(dataUrl) => URL`. `insertImageFromFiles`: reads files as base64, calls uploadImage, inserts image node. **Image-only filter** (`if (mime === 'image')` at `insertImageFromFiles.ts:13`). Non-image files silently dropped. **CONFIRMED**.
- **D2-D8:** N/A. **N/A**.

### BlockSuite AssetsManager — MIT (covered above under AFFiNE)

- See AFFiNE entry. Formalization: `transformer/assets.ts:21-105` — `AssetsManager` class with `_assetsMap`, `_names`, `_pathBlobIdMap`, `uploadingAssetsMap`, `readFromBlob()`, `writeToBlob()`. Blob-ID convention keys (SHA-256 by default per `adapter/assets.ts:30`). `mapInto(blobId)` callback per uploading asset.

### TinaCMS — Apache, ~12K, git-backed visual editor

- **D1 Non-image drop:** `TinaMediaStore` with dual-mode persist: cloud (S3 signed URL → poll `getRequestStatus`) vs local (FormData POST to `/media/upload`). **Default `accept`: "*.gif,*.jpg,*.jpeg,*.png,*.svg,*.webp" — image-only** (line 55 or so). **CONFIRMED**.
- **D2 Wiki-link embed:** Not shipped (content-driven SSG pattern). **NOT FOUND**.
- **D3 Embed primitives:** Thumbnail generation for cloud (3 sizes: 75x75, 400x400, 1000x1000); Media list UI. **CONFIRMED**.
- **D4 Storage routing:** Cloud persist path = `https://assets.tina.io/{clientId}/{path}`. Local persist path = filesystem-relative. **CONFIRMED**.
- **D5-D8:** `mediaRoot: "/public"` convention (line config). No foreign-config import. Opinionated S3 or filesystem backends. **CONFIRMED**.

---

## Gaps / follow-ups

- **Zettlr** unverified for all dimensions — OSS repo not locally available; WebFetch insufficient for handler-level detail.
- **Docmost** — web-only access incomplete for D3-D8; requires deeper source read via GitHub tree browsing.
- **Logseq** block transclusion rendering (D3) inferred from architecture, not traced in Clojure source.
- **SilverBullet** plug ecosystem not inspected — default behavior assumed.
- **Obsidian** (proprietary) — we have schema confirmed via INV1; end-user UX patterns secondary-sourced only.
- **Notion** (proprietary) — not investigated in this pass; paste-image-from-URL behavior would be useful signal.
