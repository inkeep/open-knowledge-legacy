# Internal Markdown Links — Spec

**Status:** Draft
**Feature:** md-link-internal
**Branch:** feat/md-link-internal

---

## Problem statement

Standard markdown links `[text](./path.md)` that point to files within the content directory are completely invisible to the backlink graph and render as plain external hyperlinks in WYSIWYG. Wiki-style `[[Page]]` links are the only first-class internal linking mechanism today. Writers who use conventional markdown link syntax miss out on navigation, backlinks, resolved/unresolved status, and the full internal-link product experience.

---

## Goals

- G1: `[text](./page.md)` links to content-directory targets are indexed in the backlink graph (forward + backward)
- G2: Internal markdown links render as resolved/unresolved styled links in WYSIWYG — visually equivalent to wikilinks
- G3: Internal markdown links are clickable in source mode (CodeMirror) — click navigates within the app
- G4: Full status equivalence to wiki-style links across all surfaces (backlinks panel, MCP tools, forward-links, orphans/hubs)
- G5: External links (`https://...`, `./file.pdf`, paths outside content dir) are unaffected

---

## Non-goals

- NG1: Storing internal links as wikilinks — markdown links stay as `[text](./path.md)` on disk
- NG2: Autocomplete / suggestion for markdown link syntax (wikilink `[[` trigger is the authoring UX; this is parsing parity)
- NG3: Rename propagation for markdown links (out of scope — wikilinks handle the managed rename flow)

---

## Requirements

| Priority | Requirement | Acceptance criteria |
|---|---|---|
| Must | Backlink extraction includes markdown links | `[text](./other.md)` in a file produces a forward-link entry `other` and a backward entry on `other`'s backlinks list |
| Must | Only internal links are extracted | Links where the resolved target is outside `contentDir` are ignored |
| Must | WYSIWYG renders internal markdown links with resolved/unresolved styling | A `[text](./existing.md)` link renders with blue chip style; `[text](./missing.md)` renders with red chip style |
| Must | WYSIWYG internal link click navigates within the app | Click routes to `#/<docName>` |
| Must | Source mode: internal markdown links are clickable | `[text](./page.md)` in CodeMirror opens the target page within the app on click |
| Must | External markdown links are unaffected | `[text](https://example.com)` behaves exactly as before |
| Should | Backlinks panel reflects markdown-link backlinks | When page A has `[go to B](./b.md)`, page B's backlinks panel shows A |
| Should | MCP tools return markdown-link-derived graph entries | `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs` include markdown links |

---

## Technical design (confirmed)

### Link internality rule

An href is "internal" if:
1. It does not start with a URI scheme (`http:`, `https:`, `mailto:`, etc.), `//`, `/`, or `#`
2. After resolving relative to `dirname(currentDocName)` and normalizing `../` and `./`, the result does not escape root (no leading `../`)
3. The `.md` extension is stripped for the resolved docName

### Backlink extraction (server — `packages/server/src/backlink-index.ts`)

Add `extractMarkdownLinksFromMarkdown(body: string, docName: string): ExtractedWikiLink[]`:
- Line-by-line, fence-aware (reuse existing fence tracking)
- Inline-code-aware (skip backtick spans)
- Matches `[text](href)` — inline link form only (not reference-style `[text][ref]`)
- Filters to internal hrefs via `resolveMarkdownHref(href, docName)` — pure string arithmetic, no FS
- Returns `{ target: resolvedDocName, snippet }` in the same shape as wiki links

Update `updateDocumentFromMarkdown` to merge both extractors.
Update `rebuildFromDisk` likewise (it already has `docName` in scope).

### WYSIWYG — TipTap mark view (`packages/app/src/editor/extensions/`)

TipTap v3 supports `addMarkView()` on Mark extensions + `ReactMarkViewRenderer` from `@tiptap/react`. `MarkViewContent` renders the editable text inside the mark (equivalent of `NodeViewContent` for marks). No `MarkViewWrapper` needed — use a `<span>`.

App-layer extension `internal-link.ts` extends core `LinkFidelity` with `addMarkView(() => ReactMarkViewRenderer(InternalLinkView))`.

`InternalLinkView.tsx`:
- Reads `href` from `mark.attrs`
- If external: renders `<a href={href} target="_blank"><MarkViewContent /></a>` (unchanged behavior)
- If internal: resolves docName from `href` relative to `window.location.hash` (current doc), checks `pages.has(resolvedDocName)` from `usePageList()`
  - Resolved → sky/blue chip styling around `<MarkViewContent />`
  - Unresolved → red chip styling
  - Cmd/Ctrl+click → `window.location.hash = #/docName`

Swap in `packages/app/src/editor/extensions/shared.ts`: `ext.name === 'link'` → app-layer extension.

### Source mode — CodeMirror (`packages/app/src/editor/plugins/md-link-source.ts`)

Follow `wiki-link-source.ts` pattern exactly:
- Mark decoration over `[text](./internal.md)` spans (sky color)
- Cmd/Ctrl+click: read line text at clicked position, match `[text](href)` regex, resolve to docName, `window.location.hash = #/docName`
- Add to `SourceEditor.tsx` alongside `createWikiLinkSourceExtension()`

### Files touched

| File | Change |
|---|---|
| `packages/server/src/backlink-index.ts` | Add `extractMarkdownLinksFromMarkdown`, update `updateDocumentFromMarkdown` + `rebuildFromDisk` |
| `packages/server/src/backlink-index.test.ts` | Tests for markdown link extraction + graph correctness |
| `packages/app/src/editor/extensions/InternalLinkView.tsx` | New — React mark view |
| `packages/app/src/editor/extensions/internal-link.ts` | New — app-layer LinkFidelity with addMarkView |
| `packages/app/src/editor/extensions/shared.ts` | Swap `link` extension |
| `packages/app/src/editor/plugins/md-link-source.ts` | New — CodeMirror extension |
| `packages/app/src/editor/SourceEditor.tsx` | Add md-link source extension |
