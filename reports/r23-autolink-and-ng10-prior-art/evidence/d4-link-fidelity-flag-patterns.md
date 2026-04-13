# Evidence: D4 — Link fidelity-flag patterns in markdown-to-ProseMirror bridges

**Dimension:** D4 — What conventions exist for marking link nodes as "originally autolink" form? Where is the flag stored? What's it named?
**Date:** 2026-04-13
**Sources:** prosemirror-markdown, Milkdown, BlockNote, Plate, @handlewithcare/remark-prosemirror, mdast-util-gfm-autolink-literal, mdast spec

---

## Key files / pages referenced

- `~/.claude/oss-repos/prosemirror-remark/src/syntax-extensions/LinkExtension.ts` — PM link extension; stores `{href, title}` only
- `~/.claude/oss-repos/milkdown/packages/plugins/preset-commonmark/src/mark/link.ts` — Milkdown link mark; `{href, title}` attrs only
- `packages/core/src/markdown/to-markdown-handlers.ts` — current project uses `node.data.*` for source-form preservation (emphasis, strong, thematicBreak)
- [ProseMirror/prosemirror-markdown#32](https://github.com/ProseMirror/prosemirror-markdown/issues/32) — canonical PM-markdown link handling uses heuristic (content === href → emit autolink form)
- [mdast-util-gfm-autolink-literal](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal) — "no interfaces added to mdast; reuses existing Link interface"
- [micromark-extension-gfm-autolink-literal](https://github.com/micromark/micromark-extension-gfm-autolink-literal)
- [mdast spec](https://github.com/syntax-tree/mdast)

---

## Findings

### Finding: Standard mdast `link` node has NO variant/fidelity field
**Confidence:** CONFIRMED
**Evidence:** [mdast spec](https://github.com/syntax-tree/mdast) Link interface:

```typescript
interface Link extends Parent {
  type: 'link'
  url: string
  title?: string | null
  children: PhrasingContent[]
}
```

Both `<scheme:uri>` autolinks and `[text](url)` resource links are represented IDENTICALLY. Any fidelity preservation must use the `data` extension field (guaranteed by unist to never conflict with spec).

### Finding: mdast-util-gfm-autolink-literal explicitly declines to extend Link
**Confidence:** CONFIRMED
**Evidence:** [syntax-tree/mdast-util-gfm-autolink-literal](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal) README:

> "There are no interfaces added to mdast by this utility, as it reuses the existing Link interface."

**Implications:** The upstream canonical pattern is: the mdast tree is shape-uniform for all link variants. Serialize-side logic must infer or be told which form to emit.

### Finding: prosemirror-markdown uses CONTEXT-AWARE serialization (no stored flag)
**Confidence:** CONFIRMED
**Evidence:** [ProseMirror/prosemirror-markdown#32](https://github.com/ProseMirror/prosemirror-markdown/issues/32) + source code

Marijn Haverbeke's prosemirror-markdown link serializer checks: if `href === linkText` → emit `<url>` autolink form; otherwise emit `[text](url)` resource form. No `sourceStyle` attr on PM link mark.

**Implications:** One valid design is HEURISTIC-based (no stored flag). But this only works when authoring-form autolink has `linkText === url`. Our pipeline produces text nodes with `<url>` literal text, so this heuristic could work — but it's brittle (what if user manually edits the text of an autolink?).

### Finding: Milkdown, BlockNote, Plate follow the same minimal-attrs convention
**Confidence:** CONFIRMED
**Evidence:** Source of Milkdown preset-commonmark, BlockNote schema, Plate link plugin

All three store only `{href, title}` on their PM link mark. None track authoring form on the PM side. Any autolink-form preservation would be up to the custom serialization handler to detect.

### Finding: The current codebase already uses `node.data.*` for source-form preservation on OTHER node types
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/markdown/position-slice.ts:64-213` (data.sourceDelimiter, data.sourceFenceChar, data.sourceRaw, data.sourceStyle for heading/break)

Our project convention is:
- Fidelity metadata lives in `mdast node.data.*`
- PM schema attrs may mirror these (e.g., `linkStyle: 'inline'` on link mark)
- Serialize-side handlers read PM attr → emit source form

`linkStyle: 'inline' | 'autolink' | 'shortcut' | 'collapsed' | 'full'` is a natural extension of the existing `linkStyle` attr on the link mark (see `packages/core/src/extensions/link-fidelity.ts:46`).

### Finding: No library uses a sentinel-title (e.g., `title === 'autolink'`) pattern
**Confidence:** CONFIRMED via negative search

Searched prosemirror-markdown, Milkdown, BlockNote, Plate, slate-markdown, remark plugins. None use `title` or any other user-facing attr as a sentinel.

**Implications:** Sentinel-title was a candidate idea that would have collided with real user titles. Avoiding that approach is consistent with ecosystem practice.

---

## Negative searches

- Searched mdx-js/mdx, remarkjs/remark-gfm, syntax-tree issues for "link sourceStyle" or "link authoring form" → no established pattern beyond `data.*`.
- Searched prosemirror-markdown for "autolink attr" → only Issue #32 (heuristic-based), no attr-based implementation.

---

## Gaps / follow-ups

- None. Ecosystem pattern is clear: use `mdast node.data.*` for fidelity metadata; PM schema attrs can mirror via custom handler.

---

## Implications for the refactor

1. **Naming: `data.sourceStyle: 'autolink'`** is the right convention — matches existing project pattern (`data.sourceDelimiter`, `data.sourceFenceChar`, etc.) and is consistent with mdast's `data` extension hook.
2. **PM-side: extend the existing `linkStyle` attr values** to include `'autolink'`. Schema accepts any string (no validator), so this is additive and zero-risk.
3. **Serialize-side: custom link handler** checks `mark.attrs.linkStyle === 'autolink'` and emits `<url>` form. Mirrors prosemirror-markdown's heuristic approach but explicit rather than inferred.
4. **Preserve the convention already used for 5+ other fidelity attrs** — no new pattern, just additive application to link mark.
