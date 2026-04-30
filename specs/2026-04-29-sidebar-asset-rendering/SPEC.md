---
title: Sidebar Asset Rendering
description: Product and technical spec for showing referenced assets in the file sidebar without opening them as CRDT documents.
tags:
  - spec
---
# Sidebar Asset Rendering

## Problem

The file sidebar currently treats the document list as markdown-only: `/api/documents` returns document-shaped entries keyed by `docName`, the app maps those entries to `.md`/`.mdx` tree paths, and selecting a file opens the CRDT editor. That is correct for editable documents, but it hides local assets that authors reference from markdown or MDX, such as `![alt](./diagram.png)`, `[mockup](./mockup.jpg)`, `![[photo.png]]`, `<img src="./photo.png" />`, and video-style assets. The result is that assets used by the knowledge base are invisible in the primary navigation surface even though they are part of the authored content.

## Goals

- Keep the editor document surface limited to `.md` and `.mdx` files.
- Show local referenced assets in the sidebar when a tracked markdown/MDX document references them.
- Support image assets first (`.png`, `.jpg`, `.jpeg`) and keep the design extensible for video assets such as `.mp4`.
- When a rendered asset is clicked in the sidebar, open a standalone file preview instead of trying to open it as a CRDT document.
- Preserve existing file operations and markdown document behavior for `.md` and `.mdx` files.

## Non-Goals

- Do not make arbitrary unreferenced assets appear in the sidebar.
- Do not make assets editable through the TipTap/CodeMirror document editor.
- Do not add an in-sidebar preview popover in this ship run; asset rows may use ordinary file-tree rows plus a standalone preview on click.
- Do not change storage-layer markdown fidelity or sanitize asset references.

## Existing System Notes

- `packages/server/src/content-filter.ts` already imports `ASSET_EXTENSIONS` and has a sibling-asset allowlist rule, but `packages/server/src/file-watcher.ts` classifies and seeds only supported document files through `isSupportedDocFile()`.
- `GET /api/documents` in `packages/server/src/api-extension.ts` serializes file-index entries as document entries with `docName`, `docExt`, size, modified, and symlink metadata.
- `packages/app/src/components/FileTree.tsx` maps those document entries into `@pierre/trees` paths and uses selection to call `navigateToWithPulse(treePathToAppPath(selected))`, which opens editor navigation.
- `packages/app/src/components/file-tree-adapter.ts` currently strips only `.md`/`.mdx` extensions when converting a file-tree path to an app path.

## Requirements

### R1 Asset Discovery

The server must discover local asset references from tracked markdown and MDX document content. Asset references include:

- CommonMark images: `![alt](./file.png)`.
- Markdown links to asset files: `[preview](./file.jpg)`.
- Open Knowledge wiki links and embeds to asset files: `[[file.jpg]]` and `![[file.png]]`.
- HTML or MDX image tags with `src`: `<img src="./file.png" />` and `<image src="./file.png" />` where supported by the parser/string scanner.
- Video-style tags or links to allowlisted video extensions may be represented by the same asset model, even if only image rendering is shipped first.

Only local, content-dir-relative assets should be included. Remote URLs, `data:` URLs, anchors-only links, and unsafe traversal paths must be ignored.

### R2 Asset List API Shape

`GET /api/documents` must continue returning markdown document rows for existing consumers. It may add asset rows in the same `documents` array if those rows are explicitly typed, or introduce an adjacent field such as `assets`; the client must parse it in a backward-compatible way.

Each asset row needs enough data for the sidebar to render and open it:

- workspace-relative path including extension,
- file extension or media kind,
- size and modified time when available,
- reference metadata sufficient for future UI affordances, such as the referencing `docName`.

### R3 Sidebar Rendering

The sidebar must render `.md`/`.mdx` documents and referenced assets in one tree so assets appear next to their folder context. Document rows continue to use the current CRDT document navigation path. Asset rows use a distinct target path and must not be passed to document prewarm, document close, rename-as-doc, or handoff logic.

### R4 Standalone Asset Preview

Clicking a renderable asset row opens a standalone file preview route or panel. For this ship run, image preview for `.png`, `.jpg`, and `.jpeg` is required. The preview must show the actual image using a server-served local asset URL, with basic filename/path context. Unsupported asset kinds may show a non-editable fallback with file metadata.

### R5 Link Click Behavior

Existing editor link behavior should not be broadened in this ship run. Markdown links to image files can remain links unless they already have a safe internal handling path. The sidebar behavior is the required asset-opening path.

### R6 Safety and Invariants

- The server must reject or ignore asset paths that resolve outside `contentDir`.
- Asset serving must set an appropriate content type and `X-Content-Type-Options: nosniff`.
- Existing `isSystemDoc()` protections for document-keyed subsystems remain unchanged.
- File watcher changes must not cause non-document assets to enter CRDT persistence or observer bridges.

## Acceptance Criteria

- A markdown document that references `./photo.png` causes `photo.png` to appear in the sidebar after `/api/documents` refreshes.
- A markdown document that references `![[photo.png]]` causes `photo.png` to appear in the sidebar after `/api/documents` refreshes.
- An unreferenced `photo.png` in the same workspace does not appear solely because it exists.
- Clicking `photo.png` opens a standalone image preview and does not open a Hocuspocus document named `photo`.
- Existing `.md` and `.mdx` sidebar rows still open the editor and preserve current rename/delete/create behavior.
- Unit tests cover asset reference extraction, unsafe path rejection, `/api/documents` serialization, and file-tree path conversion for document versus asset rows.
- At least one app/component test covers asset-row selection dispatching to the standalone preview route.

## Technical Direction

1. Add a small server-side asset-reference extractor that scans markdown source for local asset references and resolves them relative to the referencing document directory.
2. Track referenced assets in server memory alongside the existing file index; this should be derived state, not CRDT state.
3. Extend `/api/documents` with typed entries or an adjacent asset list. Prefer typed rows if it keeps the sidebar tree model simpler.
4. Extend the app sidebar data model from `DocEntry` to a file entry union: document entries and asset entries.
5. Add a lightweight standalone asset preview target to navigation. Avoid putting assets into `ProviderPool`.
6. Add `/api/asset?path=...` or equivalent for safe local asset serving.

## Open Questions

- Whether assets referenced only through reference definitions, e.g. `[img]: ./photo.png`, should ship now or in a follow-up.
- Whether video previews should be fully rendered in this ship run or listed with metadata only.
- Whether context menu operations for assets should be limited to copy/reveal/delete, with rename deferred.
