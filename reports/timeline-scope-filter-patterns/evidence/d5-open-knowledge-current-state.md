# Evidence: D5 — Open Knowledge Current State (1P Catalog)

**Dimension:** Extension points in the existing timeline stack — what scope is bound where, and what would change for file/folder/project filtering.
**Date:** 2026-04-20
**Sources:** Local repo — `/Users/mileskaming-thanassi/open-knowledge/packages/`

---

## Key files / pages referenced

- `packages/server/src/timeline-query.ts` — `getDocumentHistory()` shadow-DAG walker
- `packages/server/src/api-extension.ts:1910-1973` — `handleHistory()` HTTP endpoint
- `packages/app/src/components/TimelinePanel.tsx` — React Sheet UI
- `packages/app/src/components/EditorPane.tsx:27, 183, 218-224` — TimelinePanel mounting
- `packages/cli/src/mcp/tools/get-history.ts` — MCP tool contract
- `packages/core/src/shadow-repo-layout.ts` — shadow ref naming conventions
- `packages/core/src/types/timeline.ts` — `TimelineEntry` shape
- `packages/app/src/components/FileSidebar.tsx`, `FileTree.tsx` — existing folder UI

---

## Findings

### Finding: `docName` is required at every layer — API, MCP, UI
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/api-extension.ts:1927-1930`:

```ts
if (!docName) {
  json(res, 400, { ok: false, error: 'docName query parameter is required' });
  return;
}
```

And `packages/cli/src/mcp/tools/get-history.ts:47`:

```ts
docName: z.string().describe('Document name to query history for'),
```

And `packages/app/src/components/EditorPane.tsx:221`:

```tsx
<TimelinePanel
  open={timelineOpen}
  onOpenChange={setTimelineOpen}
  docName={activeDocName ?? ''}
  ...
/>
```

**Implications:** Multi-scope requires loosening this contract. Either (a) accept a new query param (`path=` or `scope=`) that can describe a file, directory, or project, with `docName` becoming optional, or (b) overload `docName` to accept a dir-style trailing slash (e.g., `docName=specs/` means "history under specs/"). The Zod schema in the MCP tool would need an explicit discriminated-union to avoid agents passing ambiguous values.

---

### Finding: The query layer already uses git pathspec — extending it to folder or all-docs is a path-string change, not a new git invocation
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/timeline-query.ts:128-136`:

```ts
// Build file pathspec so git log only returns commits touching this document.
const normalizedRoot = contentRoot.replace(/^\.\//, '');
const docPath = query.docName
  ? normalizedRoot
    ? `${normalizedRoot}/${query.docName}${getDocExtension(query.docName)}`
    : `${query.docName}${getDocExtension(query.docName)}`
  : undefined;
```

And `timeline-query.ts:332-339`:

```ts
const raw = await sg.raw(
  'log',
  '--full-history',
  '--author-date-order',
  `--format=${GIT_LOG_FORMAT}`,
  ...allStartRefs,
  ...(docPath ? ['--', docPath] : []),
);
```

**Implications:** `docPath` is already conditional — when undefined, git log returns **all commits** on the reachable refs without path restriction. So "project-wide history" is literally "pass `docName: undefined`"; the scaffolding already works. The new work is: (1) accepting a directory as `docName` (no file extension append, trailing slash for pathspec), (2) plumbing `docName: undefined` through the API's required-param guard. Note: git pathspec on a directory (e.g., `specs/` or `specs`) matches all files under it — confirmed by git-scm pathspec docs; no `--` trailing glob required.

---

### Finding: Shadow refs are already writer-scoped, not doc-scoped — refs walk the full project by default
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/shadow-repo-layout.ts:46-52`:

```ts
/**
 * Canonical regex matching the writer-id portion at the end of a ref.
 * ...
 *   refs/wip/<project-branch>/<writer-id>
 */
const WRITER_ID_RE = /^(human-[^/]+|agent-[^/]+|upstream|server)$/;
```

And `timeline-query.ts:256-262`:

```ts
const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', `refs/wip/${branch}/`))
  .trim()
  .split('\n')
  .filter(Boolean);
startRefs.push(...wipRefs);
```

**Implications:** Each writer has **one WIP ref** covering all their commits (all docs they've touched this branch). Walking `refs/wip/<branch>/` already returns the project-wide commit graph; the only thing narrowing it to one doc is the pathspec on `--`. Project-scope is already the "native" shape; file-scope is the constrained case. This is opposite of what it might look like from the UI. No extra ref-enumeration is needed for project scope.

---

### Finding: The existing filter stack (`type`, `author`, `excludeAuthor`) is compositional with scope — scope is orthogonal
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/timeline-query.ts:124-126, 362-373`:

```ts
const typeFilter = toArray(query.type);
const authorFilter = toArray(query.author);
const excludeAuthorFilter = toArray(query.excludeAuthor);
...
if (typeFilter.length > 0) {
  filtered = filtered.filter((e) => typeFilter.includes(e.type));
}
if (authorFilter.length > 0) {
  filtered = filtered.filter((e) => matchesAuthor(e, authorFilter));
}
if (excludeAuthorFilter.length > 0) {
  filtered = filtered.filter((e) => !matchesAuthor(e, excludeAuthorFilter));
}
```

**Implications:** Scope-switching layers cleanly on top of existing filters — all three run as JavaScript filters after the git log returns. The order is (1) git-pathspec scope → (2) post-process type/author filters. Adding a scope-dimension filter is an additive change to the query param set, not a redesign of the filter pipeline.

---

### Finding: TimelinePanel is a right-side Sheet with a single fixed "Timeline" title — no header affordance for scope
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/TimelinePanel.tsx:362-394`:

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent
    side="right"
    className="w-[350px] p-0 flex flex-col overflow-hidden sm:max-w-[350px]"
    showCloseButton
  >
    <SheetHeader className="border-b px-4 py-3 pb-3">
      <div className="flex items-center justify-between">
        <SheetTitle className="text-sm">Timeline</SheetTitle>
        {selectedSha && (<Button ...>Now</Button>)}
      </div>
    </SheetHeader>
    ...
```

**Implications:** The header has ~300px of horizontal space (350px panel minus padding) and currently only the "Timeline" title + contextual "Now" button. A scope selector has two natural homes: (a) inline in the SheetHeader (dropdown or segmented control replacing/augmenting the title), (b) a second row below the header. The 350px width constrains choices — a three-tab control ("File / Folder / Project") is ~200-240px, a dropdown with current-scope label is ~120-180px. Richer filter UIs (dropdown stack, chip rows) would require more vertical height or a wider panel.

---

### Finding: The panel triggers from EditorPane with `activeDocName` hardcoded — no context of "the current folder"
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/EditorPane.tsx:218-224`:

```tsx
<TimelinePanel
  open={timelineOpen}
  onOpenChange={setTimelineOpen}
  docName={activeDocName ?? ''}
  onEntrySelect={handleEntrySelect}
  selectedSha={previewEntry?.sha}
/>
```

**Implications:** There is no "current folder" concept bound to the editor surface. A sidebar-derived folder scope would require EitherChoice: (1) breadcrumb-bound — panel uses the active doc's parent directory as the folder scope; (2) user-selectable — the scope picker lets the user pick a folder orthogonal to which doc is active. Precedent elsewhere in the codebase (EditorActivityPool's active/mount-list split, precedent #18(c)) suggests the scope picker should be independent of the active doc to avoid scope snapping when the user navigates.

---

### Finding: Restore-to-version only targets the active document — cross-doc scope ≠ cross-doc restore
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/EditorPane.tsx:65-78` (handleEntrySelect) and `packages/cli/src/mcp/tools/rollback-to-version.ts` both operate on `activeDocName`. The TimelineEntry shape (`contributors[].docs: string[]`) lists which docs a commit touched, but the preview/restore action is scoped to the active doc's content.

**Implications:** If a user is viewing project-wide timeline and picks a commit that touched a different file, "Restore this version" gets ambiguous — restore what, to where? Three design choices: (a) in multi-doc scope, clicking an entry navigates to the doc(s) in the entry's `contributors[].docs` (not restore), (b) disable restore when scope ≠ file and the commit spans multiple files, (c) let the entry click reveal a secondary doc-picker for which affected doc to preview. This is a genuine new UX design surface, not just a filter extension.

---

### Finding: FileTree already has a ContextMenu on rows — a "Show folder history" entry is a low-friction addition
**Confidence:** CONFIRMED (ContextMenu scaffolding exists; history entry does not)
**Evidence:** `packages/app/src/components/FileTree.tsx:50-58, 411-415`:

```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
...
<ContextMenu>
  <ContextMenuTrigger asChild>
    ...
  </ContextMenuTrigger>
  <ContextMenuContent
```

Grepping the file for `history|timeline` returned zero matches — no existing history entry in the context menu.

**Implications:** Two low-friction entry points for scope-switching exist: (a) adding a ContextMenuItem on folder rows for "Show history for this folder" (opens TimelinePanel with folder scope preset), (b) a project-level affordance in the sidebar header or editor header for "Show project history." The GitHub repo-tree "History" button pattern (see D1 evidence) maps cleanly onto (a).

---

## Gaps / follow-ups

- `FileTree.tsx` context-menu code not fully inspected — full confirmation of the "Show folder history" affordance requires reading the file. INFERRED based on CLAUDE.md description.
- Whether polling `/api/history` every 10s scales to project-wide history when entry count grows (current `limit=100` cap in TimelinePanel:302). At project scope, 100 entries may cover hours vs. weeks for file scope — polling cost grows with git log scan size. Not measured here.
- Shadow repo ref enumeration overhead (`for-each-ref refs/wip/<branch>/`) is O(writers) — irrelevant at typical scale but worth noting if writer count explodes.

---

## Negative searches

- Searched for "folder" / "directory" / "path" in `packages/server/src/timeline-query.ts` → only the pathspec-construction block at line 128-136; no existing folder-level branching logic.
- Searched for "scope" in `TimelinePanel.tsx` → no matches; UI currently has no scope model.
