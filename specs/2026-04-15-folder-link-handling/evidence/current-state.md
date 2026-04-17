# Current State Evidence: Folder Link Handling

## Scope traced

- `packages/app/src/App.tsx`
- `packages/app/src/editor/DocumentContext.tsx`
- `packages/app/src/components/EditorArea.tsx`
- `packages/app/src/components/EditorHeader.tsx`
- `packages/app/src/components/FileTree.tsx`
- `packages/app/src/components/ForwardLinksPanel.tsx`
- `packages/app/src/components/BacklinksPanel.tsx`
- `packages/app/src/components/GraphView.tsx`
- `packages/app/src/components/PageListContext.tsx`
- `packages/core/src/utils/link-targets.ts`
- `packages/core/src/utils/resolve-internal-href.ts`
- `packages/server/src/backlink-index.ts`
- `packages/server/src/api-extension.ts`

## Verified findings

1. **Hash navigation is the single path that opens documents.**
   `App.tsx` reads the hash, extracts a `docName`, and immediately calls `openDocument(docName)`.

2. **`DocumentContext` is doc-only today.**
   `DocumentContext` tracks `activeDocName`, `activeProvider`, and `syncState`, and `openDocument()` always opens a CRDT provider for the given string. There is no typed concept of `folder` vs `doc`.

3. **The page list only knows documents, not folders.**
   `PageListContext` fetches `/api/pages` and stores `pages: Set<string>` of docNames. Folder paths are not represented there.

4. **Internal markdown-link resolution is string/path normalization only.**
   `resolveInternalHref()` converts a relative href into `{ docName, anchor }` but does not check whether the result is a real doc, a folder, or missing.

5. **Folder-like navigation targets fall into two broken buckets today.**
   - Surfaces that navigate directly to a hash (`BacklinksPanel`, `GraphView`, etc.) route folder-like targets into the normal open-document path, producing the phantom blank-doc bug.
   - Surfaces that check `pages.has(target)` (`ForwardLinksPanel`, inline link views) classify folder-like targets as missing pages and offer the wrong creation flow.

6. **The sidebar has folder vocabulary we can reuse.**
   `file-tree-utils.ts` already has `collectFolderPaths()`, `computeAncestors()`, and a tree model with explicit `kind: 'folder' | 'file'`.

7. **Folder creation already canonically uses `index.md`.**
   `composeInlineFolderPath()` and `NewItemDialog` both create folders as `{folder}/index.md` by default. This establishes an existing product precedent for canonical folder landing-note creation.

8. **Folder click behavior in the tree is not navigational.**
   `FileTree.tsx` uses folder rows for expand/collapse only; only file rows become the active selection.

## Architectural implication

The cleanest seam for folder-aware behavior is **between hash parsing and `openDocument()`**. A typed navigation target (for example `doc | folder | missing`) should be resolved once at the app navigation layer, with `DocumentContext` and editor rendering widened accordingly. This avoids re-implementing folder checks independently in every panel.
