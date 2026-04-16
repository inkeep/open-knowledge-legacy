# Evidence: NG1 and NG11 Canonical Byte Outputs

**Dimension:** Byte-identity targets for R7 pinning tests
**Date:** 2026-04-16
**Sources:** Direct `MarkdownManager` probe on current main @ 2de299b
**Method:** `bun -e` with `sharedExtensions` — observed actual behavior, no prediction.

---

## NG1 — blank-line normalization

**Confirmed canonical:**
```
Input:  "# H\n\n\n\nP\n"       (4 newlines between blocks)
Output: "# H\n\nP\n"            (normalized to exactly 2 newlines = 1 blank line)
```

CommonMark spec semantics: any ≥1 blank line between blocks = 1 paragraph break. ProseMirror's schema has no representation of multi-blank-line runs. Normalization is both correct per CommonMark and irreducible under the PM model.

**R7 test target:** byte-identical assertion that `serialize(parse("# H\n\n\n\nP\n")) === "# H\n\nP\n"`.

## NG11 — ensureNonEmptyDoc synthesis

### Correction from prior evidence

Prior `ng-coverage-audit.md` cited `---\n\n---` as the NG11 test input. **This is incorrect.** Probe result:

```
Input:  "---\n\n---"
Parsed mdast children: [thematicBreak, thematicBreak]
Serialized output: "***\n\n---\n"
```

Both children are `thematicBreak`, which is renderable (NOT in the `{yaml, toml, footnoteDefinition}` ignore set at `pipeline.ts:82`). `ensureNonEmptyDoc` does NOT fire. The output reflects NG10's doc-start `---` → `***` normalization, which is already pinned by three existing tests (`to-markdown-handlers.test.ts:56`, `doc-start-thematic-fix.test.ts:37`, `mark-rename-verification.test.ts`).

### Real NG11 trigger

An input whose mdast consists solely of ignore-typed nodes (yaml / toml / footnoteDefinition). Confirmed trigger:

```
Input:  "---\ntitle: X\n---\n"      (yaml frontmatter alone)
Parsed mdast children: [yaml]       (ignored by remark-prosemirror)
PM doc children after ensureNonEmptyDoc: [paragraph (empty)]
Serialized output: ""               (empty paragraph renders to empty string)
```

**What this proves:**
1. `ensureNonEmptyDoc` fires (without it, `doc.content: 'block+'` validation would throw `Invalid content for node doc: <>`)
2. The canonical byte output is the empty string `""`
3. Frontmatter round-trip is a separate concern — handled via `Y.Map('metadata')` in the observer sync bridge, not via the PM-canonical path; in pure parse/serialize (no Y.Doc) the yaml is lost. Documented in CLAUDE.md's NG catalog.

**R7 test target:** byte-identical assertion that `serialize(parse("---\ntitle: X\n---\n")) === ""` and that the intermediate PM JSON contains exactly one empty `paragraph` child.

### Alternative NG11 triggers (not selected for test, documented for awareness)

- `"[^1]: content\n"` (footnote definition alone) — parses as `paragraph` (remark-gfm footnote plugin produces the mapping; in our pipeline `footnoteDefinition` falls through to paragraph via handler table fallback). Serializes to `""`.
- `"---\ntitle: X\n---\n\n[^1]: content\n"` — mixed yaml + footnote. Same `""` output.
- `"[a]: https://example.com\n"` (link reference definition alone) — parses as `linkRefDef`, which IS renderable. NG11 does NOT fire; output round-trips.

The selected test input (yaml alone) is the cleanest demonstration of the synthesis mechanic.

## Implication for R7

Spec text "NG1 (`# H\n\n\n\nP\n` → `# H\n\nP\n`) and NG11 (`---\n\n---` → canonical output)" is wrong on NG11. The rewrite must use `---\ntitle: X\n---\n` → `""` as the NG11 example. `---\n\n---` should NOT appear in R7 — it's already covered as NG10 by three existing tests.
