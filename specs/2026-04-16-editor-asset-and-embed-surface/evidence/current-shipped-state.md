---
name: Current shipped state (editor asset + embed surface)
description: File:line citations for what's in main as of baseline 2ad0177a — upload, wiki-link, config, rename-rewrite
created: 2026-04-16
sources:
  - packages/server/src/api-extension.ts
  - packages/core/src/markdown/wiki-link-micromark.ts
  - packages/core/src/constants/upload.ts
  - packages/cli/src/config/schema.ts
  - packages/server/src/managed-rename-rewrite.ts
  - packages/app/src/editor/extensions/shared.ts
  - packages/app/src/editor/image-upload/index.ts
  - packages/server/src/cc1-broadcast.ts
  - packages/server/src/content-filter.ts
---

# Current Shipped State

All file:line citations re-verified at commit `2ad0177a` on 2026-04-21 during Session 2 finalize re-verification. Citations in this file supersede any earlier draft numbers. The Session 1 baseline was `432a834b`; most upload-handler citations drifted by +30-235 lines between `432a834b` and `2ad0177a` (intervening PRs touched the handler's surroundings). For archaeology against the earlier baseline, use `git show 432a834b:<path>`.

## Upload endpoint: `POST /api/upload-image`

**Handler:** `packages/server/src/api-extension.ts:3014-3129` (inner function `handleUploadImage` declared at line 3014)
**Transport:** multipart + busboy via `readUploadBody` starting at `api-extension.ts:211` (function body; `writeUploadAtomic` helper at `api-extension.ts:181`)
**FormData fields:**
- `file` — the binary
- `parentDocName` — relative path (e.g., `docs/guide.md`) required

**Size limits:**
- `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (10MB) hardcoded at `api-extension.ts:167`

**MIME allowlist:**
- Source of truth: `ALLOWED_IMAGE_MIME_TYPES` in `packages/core/src/constants/upload.ts:1-7`
- Values: `{image/jpeg, image/png, image/gif, image/webp, image/svg+xml}`
- Server at `api-extension.ts:3095` checks `!ALLOWED_MIME_TYPES.has(detectedMime)` and returns 400 "Unsupported file type" (also guards against missing `detectedMime` / `detectedExt`)
- Client at `packages/app/src/editor/extensions/shared.ts:32-44` pins FileHandler's `allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES]`

**MIME detection:**
- `file-type@22.0.1` (per `packages/server/package.json` + `bun.lock`; package exports `fileTypeFromBuffer`, imported at `api-extension.ts:40`) magic-byte sniff invoked at `api-extension.ts:3084`
- Client-supplied mimeType **ignored entirely**
- SVG detected manually by checking `head.startsWith('<svg')` or `<?xml...<svg` at `api-extension.ts:3088-3093` — this one-off extension/content-sniff fallback is LOAD-BEARING for shipped SVG support and must be preserved under D-A strict-magic-byte
- Result: if no `detectedMime`, reject

**Filename sanitization:**
- `sanitizeFilename` at `api-extension.ts:172-179`: regex `/[^a-zA-Z0-9_\-.]/g` (without `+` quantifier) replaces each disallowed char with `_`
- ASCII-only; destroys CJK/Arabic/Cyrillic (F9 absorbed — NFR-3 + §13)
- Fallback stem `'upload'` if empty

**Paste-name detection:**
- `GENERIC_PASTE_NAMES` regex at `api-extension.ts:170`: `/^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i`
- On match: synthesize `pasted-YYYYMMDD-HHMMSS.{ext}` (inside the handler, post-sanitization)

**Storage:**
- `destDir = resolve(resolvedContentDir, dirname(parentDocName))` at `api-extension.ts:3054`
- Co-located: image dropped in `docs/guide.md` lands at `docs/<filename>`
- `writeUploadAtomic(destDir, finalFilename, buffer)` call site at `api-extension.ts:3120`; helper definition at `api-extension.ts:181`
- Collision: atomic suffix loop `original.png → original-1.png → … → original-99.png → error`

**Path-escape guards:**
- `api-extension.ts:3054-3069`
- Reject: `\x00`, `..`, leading `/`
- `isWithinContentDir(destDir, resolvedContentDir)` check
- Realpath symlink-escape check via `realpathSync`

**Response:**
- Success: `{ ok: true, src: destFilename }` — basename only for sibling (api-extension.ts:3123)
- Client uses `src` directly as image node's `src` attr (`image-upload/index.ts:178`)

## Client-side upload orchestration

**`uploadAndInsert()`:** `packages/app/src/editor/image-upload/index.ts:104-181`
- `parentDocName = ${currentDocName}.md` (line 109)
- Widget decoration placeholder via `uploadDecorationPlugin` (lines 27-79)
- FormData POST to `/api/upload-image`
- On 4xx/5xx: `showError` removes decoration + shows toast (lines 139-149)
- On success: decoration removed + image node inserted at mapped position

**`shortestImageRef(assetPath, mdPath)`:** `image-upload/index.ts:91-96`
- Same parent dir → basename only
- Cross-dir → `/absolute-path` (F8 absorbed as algorithmic rewrite to 4-case relative — see FR-1a + §13)

## Wiki-link tokenizer

**File:** `packages/core/src/markdown/wiki-link-micromark.ts`
**Entry:** `start` state at line 42: `if (code !== CODE_LBRACKET) return nok(code);` — only matches `[` (91)
**Zero `!` prefix branch.** `CODE_BANG (33)` not referenced anywhere in this file.
**Produces:** `wikiLink` mdast node with `data.target/anchor/alias`
**Handlers:**
- `enterWikiLink` starts at line 154; `exitWikiLink` ends near line 197
- Serializer: `wikiLinkHandler` at lines 211-220 emits `[[target(#anchor)?(|alias)?]]`
- **Idempotent attacher pattern (precedent #15):** module-level singleton `MICROMARK_EXT = wikiLinkSyntax()` at line 238; identity-dedup checks at lines 259, 265, 270. FR-3a must preserve this pattern.

**Consequence:** `![[photo.png]]` parses as text `!` + wikiLink `[[photo.png]]`, not as embed.

## Managed rename rewrite

**File:** `packages/server/src/managed-rename-rewrite.ts`
**Functions:**
- `rewriteWikiLinksForDocumentRename(markdown, oldDocName, newDocName)` at line 270 — handles `[[...]]` links
- `rewriteMarkdownLinksForDocumentRename(markdown, sourceDocName, oldDocName, newDocName)` at line 302 — handles `[text](link)` links

**Exclusion guard:** `rewriteMarkdownLinksInLine` at line 243:
```
if (line[idx] === '[' && line[idx - 1] !== '!') {
  const markdownLink = readMarkdownLink(line, idx);
  ...
}
```

**Consequence:** Image refs `![alt](src)` are explicitly excluded. When a doc containing an image ref moves, the ref is NOT rewritten.

**Regex for markdown link:** `readMarkdownLink` at line 77 (regex at line 88): `/^\[([^\]\n]*)\]\(.../` — starts with `\[`, not `!\[`. Even without the exclusion guard, the regex wouldn't match image refs.

## Config schema

**File:** `packages/cli/src/config/schema.ts`
**Sections exposed:**
- `content.dir/include/exclude`
- `server.port/host`
- `persistence.debounceMs/maxDebounceMs`
- `mcp.tools.read_document.historyDepth`
- `mcp.tools.search.maxResults`

**Upload config:** None (at baseline `2ad0177a`).
- `MAX_UPLOAD_BYTES` hardcoded in `api-extension.ts:167`
- `ALLOWED_IMAGE_MIME_TYPES` hardcoded in `core/src/constants/upload.ts:1-7`
- Asset location not configurable (implicit: `dirname(parentDocName)`)
- The `ConfigSchema` also contains `github.*`, `sync.*`, `preview.*`, and `folders[]` sections post-baseline; FR-5 `upload.*` is disjoint from all of them.

## CC1 broadcaster

**File:** `packages/server/src/cc1-broadcast.ts`
**Channel semantics:** `ch:'files'` fires on DiskEvents of type `create | delete | rename` (from CLAUDE.md §CC1 push-over-awareness — needs inline verification that asset-only events fire, see Q-INV6).
**Debounce:** 100ms trailing-edge per channel.
**No consumer currently for asset/basename index.**

## ContentFilter asset admission

**File:** `packages/server/src/content-filter.ts` — `ASSET_EXTENSIONS.has(ext)` sibling-asset check at line 204.
**Rule:** Assets (PNG/JPG/JPEG/GIF/WebP/SVG extensions, imported from `@inkeep/open-knowledge-core` at `content-filter.ts:11`) admitted iff sibling dir has ≥1 included `.md`.
**Refcount map:** `dirCount: Map<string, number>` declared at line 175.
**Lifecycle:** `incrementMdDir()` / `decrementMdDir()` methods at lines 229-240 on md create/delete.

**Consequence for FR-5:** widening `allowedMimeTypes` to include PDF/MP4/etc. requires widening `ASSET_EXTENSIONS` in ContentFilter too, OR those files won't serve via sirv.

## Obsidian vault interop

**Zero references** to `.obsidian`, `app.json`, `attachmentFolderPath`, `newLinkFormat`, `useMarkdownLinks`, `alwaysUpdateLinks` across `packages/`. Verified via `grep -rn` returning only report/spec markdown hits.

## Content state

**`packages/content/`** contains zero image/asset files (verified via `find packages/content -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.gif" -o -name "*.webp" -o -name "*.svg" -o -name "*.pdf" \) | wc -l` → `0`).
**Zero image refs** in current `.md` content (verified via `grep -rcE '!\[[^]]*\]\('`).
**Consequence:** Old spec D2's "1-way door" concern (markdown refs commit to path layout) is **not yet traversed**. Default asset-location choice is reversible via config migration + ref rewrite script.
