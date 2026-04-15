---
title: Current State - Rename and Internal Link Surfaces
description: Facts about existing rename behavior, backlink indexing, and internal markdown-link support relevant to managed rename spec work.
created: 2026-04-14
last-updated: 2026-04-14
---

## Findings

### F1. Existing sidebar rename is path-oriented, not graph-safe
**Confidence:** CONFIRMED

- `packages/app/src/components/FileTree.tsx` calls `POST /api/rename-path` when a file/folder rename is committed from the sidebar.
- On success, the client updates local document lists and active hash route, but does not perform any backlink-aware rewrite itself.

**Primary sources**
- `packages/app/src/components/FileTree.tsx`
- `packages/app/src/components/file-tree-operations.ts`

### F2. `/api/rename-path` renames files/folders and preserves live contents, but does not rewrite inbound links in other docs
**Confidence:** CONFIRMED

- `handleRenamePath()` validates paths, computes affected doc-name mappings, captures live contents for renamed docs, closes/unloads those docs, runs `renameSync(sourcePath, destinationPath)`, then writes renamed docs back to disk via `syncRenamedDocsToDisk()`.
- No step in this flow queries `BacklinkIndex.backward`, opens referring docs, or patches inbound references.

**Primary sources**
- `packages/server/src/api-extension.ts`
- `packages/server/src/api-file-ops.test.ts`

### F3. `BacklinkIndex.renameDocument()` only updates graph bookkeeping for the renamed doc
**Confidence:** CONFIRMED

- Current implementation:
  - `deleteDocument(oldDocName)`
  - `updateDocumentFromMarkdown(newDocName, markdown)`
- This updates the renamed doc's outbound edges under the new name, but does not mutate any referring documents.

**Primary sources**
- `packages/server/src/backlink-index.ts`

### F4. The backlink index already includes internal inline Markdown links alongside wiki-links
**Confidence:** CONFIRMED

- `BacklinkIndex.updateDocumentFromMarkdown()` extracts:
  - wiki-links via `extractWikiLinksFromMarkdown(body)`
  - Markdown links via `extractMarkdownLinksFromMarkdown(body, docName)`
- The two are merged, with wiki-links taking precedence only for duplicate targets from the same source doc.
- Tests confirm indexing for relative inline Markdown links.

**Primary sources**
- `packages/server/src/backlink-index.ts`
- `packages/server/src/backlink-index.test.ts`

### F5. Current Markdown-link support is narrower than "all Markdown links"
**Confidence:** CONFIRMED

- Extractor supports only inline `[text](href)` links, not reference-style `[text][ref]`.
- It resolves only internal hrefs via `resolveInternalHref()`.
- Explicitly excluded / ignored:
  - external links with URI schemes
  - protocol-relative links
  - absolute-path links
  - anchor-only links (`#section`)
  - image syntax
  - links inside fenced code blocks
  - links inside inline code spans

**Primary sources**
- `packages/server/src/backlink-index.ts`
- `packages/core/src/utils/resolve-internal-href.ts`
- `packages/server/src/backlink-index.test.ts`

### F6. Internal Markdown links are already a user-visible supported surface in the editor
**Confidence:** CONFIRMED

- Source mode (`md-link-source.ts`) highlights internal Markdown links and supports Cmd/Ctrl-click navigation.
- WYSIWYG (`InternalLinkView.tsx`) renders internal relative Markdown links as resolved/unresolved chips matching wiki-link visual semantics.
- The WYSIWYG view is intentionally read-only for link-target editing; authoring/edit UX remains unchanged.

**Primary sources**
- `packages/app/src/editor/plugins/md-link-source.ts`
- `packages/app/src/editor/extensions/InternalLinkView.tsx`

### F7. There is no managed rename MCP tool yet
**Confidence:** CONFIRMED

- Current tool registry includes read/write/history/search/link-analysis tools, but no rename tool.

**Primary sources**
- `packages/cli/src/mcp/tools/`

### F8. Current persistence is per-document atomic on disk, not obviously vault-atomic across many docs
**Confidence:** CONFIRMED

- `persistence.ts:onStoreDocument()` serializes a single doc and writes it with tmp-file + rename atomicity.
- Backlink index persistence is a separate write (`backlinks.json`), also not coordinated as part of a multi-doc transaction.
- This suggests existing primitives are naturally per-doc, not multi-doc.

**Primary sources**
- `packages/server/src/persistence.ts`
- `packages/server/src/backlink-index.ts`

### F9. Folder/path-tree rename is materially harder than page rename for internal Markdown links
**Confidence:** SUPPORTED

- Internal Markdown link resolution depends on the source document path (`resolveInternalHref(href, sourceDocName)`).
- A page rename only changes the target doc name, so referring docs can be patched by target match.
- A folder/path-tree move changes the source path for every moved descendant doc.
- That means graph-safe folder moves may require:
  - inbound rewrites in docs outside the moved subtree that point to moved docs
  - outbound href rewrites inside moved docs whose relative paths now resolve differently from the new location
- This is a broader rewrite problem than page rename, especially for relative Markdown hrefs.

**Primary sources**
- `packages/core/src/utils/resolve-internal-href.ts`
- `packages/core/src/utils/resolve-internal-href.test.ts`
- `stories/wiki-links-next/STORY.md`

### F10. Current runtime offers per-document atomic mutation plus several recovery primitives, but no built-in vault-wide transaction
**Confidence:** CONFIRMED

- Y.Doc mutations are naturally document-scoped via `document.transact(...)`.
- Persistence writes a single document atomically on disk via tmp-file + rename.
- `api-extension.ts` already has a destructive-operation pattern that snapshots pre-action state via `safetyCheckpoint(...)` before rollback.
- The runtime also already persists recovery-oriented state elsewhere (rescue buffers in shadow storage), showing startup / post-failure repair is an accepted architecture pattern.
- No existing primitive was found that atomically commits a coordinated multi-document rename + rewrite as one runtime transaction.

**Primary sources**
- `packages/server/src/agent-sessions.ts`
- `packages/server/src/persistence.ts`
- `packages/server/src/api-extension.ts`
- `packages/server/src/shadow-repo.ts`
- `packages/server/src/standalone.ts`

## Negative searches

### N1. No current implementation of inbound-link rewrite during rename
**Confidence:** CONFIRMED

Searched relevant server/app surfaces and found no current logic that:
- queries inbound refs from `BacklinkIndex.backward`
- rewrites referring docs during rename
- exposes a managed rename endpoint/tool distinct from raw path rename

### N2. No current evidence of reference-style Markdown-link indexing for backlinks
**Confidence:** CONFIRMED

Current extractor comments and tests cover inline links only; no reference-style extraction path was found in the backlink-index implementation.
