# Evidence: D1 — @tiptap/markdown Round-Trip Measurement

**Dimension:** D1 — @tiptap/markdown round-trip measurement
**Date:** 2026-04-07
**Sources:** @tiptap/markdown v3.22.2 source code and live tests, prosemirror-markdown v1.13.4 source code and live tests

---

## Key files referenced

- `@tiptap/markdown/src/MarkdownManager.ts` — core parse/serialize engine (uses `marked` v17.0.6)
- `@tiptap/markdown/src/Extension.ts` — TipTap extension wrapper
- `prosemirror-markdown/src/from_markdown.ts` — parser (uses `markdown-it` v14)
- `prosemirror-markdown/src/to_markdown.ts` — serializer
- `prosemirror-markdown/src/schema.ts` — default CommonMark schema with `tight` attribute on lists
- `tiptap-markdown/src/Markdown.js` — community package (also uses `markdown-it` + `prosemirror-markdown` serializer)

---

## Findings

### Finding: @tiptap/markdown v3.22.2 passes 14 of 27 test cases byte-identical through round-trip
**Confidence:** CONFIRMED
**Evidence:** Live test run, `/private/tmp/tiptap-roundtrip-test/tiptap-official-test.mjs`

Test matrix (27 cases):

| Test Case | Result | Loss Type |
|-----------|--------|-----------|
| basic-heading | PASS | — |
| bold-italic | PASS | — |
| links-inline | PASS | — |
| links-reference | DIFF | Reference definitions lost → inline links |
| fenced-code | PASS | — |
| fenced-code-custom-info | PASS | Custom info string `jsx-component` preserved |
| indented-code | DIFF | Indented code → fenced code block |
| nested-list | PASS | — |
| ordered-list | PASS | — |
| tight-list | PASS | — |
| loose-list | DIFF | Loose list (blank lines between items) → tight list |
| blockquote | PASS | — |
| horizontal-rule | PASS | — |
| image | PASS | — |
| gfm-table | DIFF | Table formatting changes (padding, dash counts, leading blank line) |
| hard-break-trailing-spaces | PASS | Trailing spaces preserved |
| hard-break-backslash | DIFF | Backslash hard break → trailing spaces |
| html-block | DIFF | HTML entities escaped (`<div>` → `&lt;div&gt;`) |
| html-inline | DIFF | HTML entities escaped (`<em>` → `&lt;em&gt;`) |
| frontmatter | DIFF | YAML frontmatter parsed as markdown content (not preserved as-is) |
| multiple-blank-lines | DIFF | Extra blank lines between paragraphs reduced |
| nested-blockquote | DIFF | Formatting changes (`>>` → `> >` with blank line between) |
| mixed-emphasis | PASS | — |
| strikethrough | PASS | — |
| task-list | DIFF | Task list checkboxes lost (`- [x] Done` → `- Done`) |
| escaped-chars | DIFF | Escaped characters unescaped (`\*` → `*`) |
| complex-document | DIFF | Table padding changes, trailing newline difference |

### Finding: prosemirror-markdown v1.13.4 passes 12 of 25 test cases byte-identical
**Confidence:** CONFIRMED
**Evidence:** Live test run, `/private/tmp/tiptap-roundtrip-test/roundtrip-test.mjs`

Key differences from @tiptap/markdown:
- Uses `*` for bullet lists (vs `-` in @tiptap/markdown) → configurable
- Blockquote line continuation is merged (multi-line within same paragraph → single line)
- Hard break serializes as `\` (vs trailing spaces in @tiptap/markdown)
- Strikethrough escaped (not in default schema)
- HTML blocks collapsed to single line (vs entity-escaped in @tiptap/markdown)

### Finding: Both systems converge after 1 round-trip cycle
**Confidence:** CONFIRMED
**Evidence:** Convergence test in both test files

@tiptap/markdown: Cycle 1 changed (40 chars diff), Cycles 2-5 stable.
prosemirror-markdown: Cycle 1 changed (1 char diff — trailing newline), Cycles 2-5 stable.

This is the critical property: after the FIRST normalization pass, subsequent round-trips produce identical output.

---

## Gaps / follow-ups

* Need to test with community `tiptap-markdown` package separately (uses markdown-it instead of marked)
* Need to test with TipTap editor extensions loaded (TaskList, Strike, etc.) which may improve some cases
