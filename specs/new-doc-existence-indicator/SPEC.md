# New Document Existence Indicator

## Problem

Navigating to a non-existent document (via direct URL, pasted hash link, or programmatic navigation) opens a blank editor with no visual distinction from an empty *existing* document. The blank canvas is ambiguous: it could mean "empty file," "new file," "failed to load," or "slow connection." Users hesitantly start typing without knowing whether they're creating something new or editing something real.

The write-to-create mechanic is intentional and elegant — this spec does NOT change it. The goal is to reduce the UX ambiguity with minimal, well-placed signals.

## What the system already knows

`PageListContext` maintains a live `Set<string>` of known docNames (synced via CC1 push, updated within a few seconds of file creation). `pages.has(docName)` is already used by `WikiLinkView` to distinguish resolved from broken wiki links. The infrastructure exists — it just isn't surfaced to the editor.

## Solution

Three targeted changes:

### 1. "New file" badge in EditorHeader

Show a small "New file" badge next to the filename in the header when `!loading && !pages.has(activeDocName)`. Disappears naturally after the file is created and CC1 propagates the update.

- Styling: `text-muted-foreground text-xs` — muted, not alarming
- Guard: `!loading && !!activeDocName && !pages.has(activeDocName)`
- Lives inside `EditorHeader`, which calls `usePageList()` directly

### 2. TipTap Placeholder extension (WYSIWYG mode)

`@tiptap/extension-placeholder` is already a dependency (`^3.22.3`). The CSS for `.ProseMirror p.is-empty::before` already exists in `globals.css`. Just needs wiring.

- When doc doesn't exist (`isNewDoc`): `"Start writing to create this page…"`
- When doc exists but is empty: `"Start writing…"`
- Dynamic: uses a ref so the placeholder text updates if `isNewDoc` flips (e.g., after first write creates the file)
- `isNewDoc` prop flows: `EditorArea` → `TiptapEditor`

### 3. CodeMirror `placeholder()` extension (source mode)

`@codemirror/view` is already installed and exports a `placeholder()` factory. A `Compartment` makes it reactive (same pattern as `themeCompartment` in `SourceEditor`).

- When doc doesn't exist: `"Start writing to create this page…"`
- When doc exists but is empty: `"Start writing…"`
- `placeholder` string prop flows: `EditorArea` → `SourceEditor`

## Acceptance criteria

- AC1: When navigating to a non-existent docName, the EditorHeader shows a "New file" badge next to the filename
- AC2: The badge disappears after the file is created (pages set updates)
- AC3: The badge is NOT shown for existing documents (even empty ones)
- AC4: In WYSIWYG mode with an empty new doc, the editor shows placeholder text "Start writing to create this page…"
- AC5: In WYSIWYG mode with an empty existing doc, the editor shows placeholder text "Start writing…"
- AC6: The TipTap placeholder text disappears as soon as the user starts typing
- AC7: In source mode with an empty new doc, the CodeMirror editor shows "Start writing to create this page…"
- AC8: In source mode with an empty existing doc, the CodeMirror editor shows "Start writing…"
- AC9: `bun run check` passes (lint + typecheck + unit + integration)

## Technical design

### Component changes

**`EditorHeader.tsx`**
- Add `usePageList()` call
- Derive `isNewDoc = !loading && !!activeDocName && !pages.has(activeDocName)`
- Render badge: `{isNewDoc && <span className="rounded-sm border border-muted-foreground/30 px-1.5 py-0.5 text-xs text-muted-foreground">New file</span>}` next to the filename span

**`EditorArea.tsx`**
- Add `usePageList()` call
- Derive `isNewDoc = !loading && !!activeDocName && !pages.has(activeDocName)`
- Pass `isNewDoc` to `TiptapEditor`
- Derive `placeholder = isNewDoc ? 'Start writing to create this page…' : 'Start writing…'`
- Pass `placeholder` to `SourceEditor`

**`TiptapEditor.tsx`**
- Add `isNewDoc?: boolean` to `TiptapEditorProps`
- Import `Placeholder` from `@tiptap/extension-placeholder`
- Add `isNewDocRef = useRef(isNewDoc ?? false)` + `useEffect` to sync ref on prop change
- Add `Placeholder.configure({ placeholder: () => isNewDocRef.current ? 'Start writing to create this page…' : 'Start writing…' })` to `useEditor` extensions

**`SourceEditor.tsx`**
- Add `placeholder?: string` to `SourceEditorProps`
- Import `placeholder as cmPlaceholder` from `@codemirror/view`
- Add `const placeholderCompartment = new Compartment()` at module level (same pattern as `themeCompartment`)
- In setup `useEffect`, include `placeholderCompartment.of(cmPlaceholder(placeholder ?? ''))` in extensions
- Add reactive `useEffect([viewRef, placeholder])` that calls `view.dispatch({ effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder ?? '')) })`

### Non-goals

- No changes to the write-to-create mechanic
- No changes to the broken wiki link → NewItemDialog flow
- No placeholder text for non-empty documents
- No animation or transition on badge appearance/disappearance (CSS transition is acceptable but not required)
