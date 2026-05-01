---
name: Why full byte preservation is structurally hard — rationale + peer survey
description: User asked why we don't always preserve bytes, why coercion exists, what other markdown editors do. This evidence captures the structural reasons (unified ecosystem inheritance), the existing OK NG1-NG11 carve-out, and the comparable posture of peer editors.
date: 2026-04-29
sources:
  - "CLAUDE.md 'Storage-layer fidelity contract' + 'Irreducible gaps NG1-NG11'"
  - "specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md (NG-pinned tests R7, ng-coverage-audit)"
  - "PRECEDENTS.md #15(d) sourceRaw passthrough"
  - "reports/tiptap-clipboard-round-trip-markdown/REPORT.md (15-editor paste survey + Archetypes A-Z)"
  - "reports/markdown-roundtrip-fidelity-tiptap/REPORT.md"
  - "reports/markdown-construct-fidelity-catalog/REPORT.md (118-case fidelity catalog)"
type: meta
---

# Why full byte preservation is structurally hard

## TL;DR

We don't preserve bytes always because the unified parse/serialize cycle is information-lossy by design — a small set of structural normalizations (NG1-NG11) is baked into how the unified ecosystem represents markdown as an AST. To preserve those bytes losslessly we'd need a different parser that retains all bytes including semantically-irrelevant whitespace. That parser doesn't exist in the unified ecosystem, and rebuilding the ecosystem byte-perfectly is unaffordable. Peer markdown editors that use unified or similar AST-canonical pipelines have the same set of normalizations. Editors that ARE byte-perfect either don't have rich WYSIWYG (source-mode-only: iA Writer, GitHub textarea) or use a custom block model that doesn't claim markdown canonicality (Notion, Roam, Logseq).

## What "byte-for-byte preservation" actually means in OK

### The chain

```
disk bytes → mdManager.parse → mdast → PM JSON (Y.XmlFragment) → mdManager.serialize → disk bytes'
```

For a round-trip to be byte-preserving, `disk bytes' === disk bytes`.

### Where coercion enters

1. **`mdManager.parse`**: `unified + remark-parse + remark-mdx + remark-gfm + remark-frontmatter + remarkMdxAgnostic + remarkWikiLink + remark-github-alerts` produces an mdast tree. The tree captures **semantic structure** (headings, paragraphs, lists, code blocks, tables, MDX JSX nodes) but discards:
   - **Blank-line counts** between blocks. CommonMark §4.2 says paragraphs are separated by ≥1 blank line; the parser collapses 1, 3, or 7 blank lines into the same AST node.
   - **GFM table column widths** (alignment cells). `| name | value |` and `|name|value|` parse identically.
   - **Backslash-escape choices** when ambiguous. `\foo` (literal) vs `\\foo` (escaped backslash + literal) collapse where the parser deems the backslash non-significant.
   - **Entity references**. `&amp;` decodes to `&` in the AST; serializing back may emit `&` directly (depends on context).
   - **Doc-start `---` ambiguity**. `---` at byte 0 parses as YAML frontmatter delimiter OR thematic break depending on what follows. The serializer canonicalizes to `***` for thematic break.
   - **U+E000-U+E004 PUA sentinels**. Reserved by `autolink-void-html-guard.ts` for the R23 PUA-sentinel guard. User content containing these literal bytes is corrupted on parse.

2. **`mdManager.serialize`**: `mdast-util-to-markdown` emits canonical markdown. For each AST node, there's exactly one byte representation it produces. Multiple input forms of the same AST collapse to the canonical output.

3. **Cumulative effect**: parse drops information; serialize emits canonicalized output. The set of ways to write a given AST is many-to-one.

### NG1-NG11 catalogue (the "irreducible gaps")

CLAUDE.md "Markdown Pipeline" section enumerates these. They're all in the unified-stack-inherent class above.

| # | Gap | Cause |
|---|---|---|
| NG1 | Blank-line counts between blocks | CommonMark AST doesn't track them |
| NG2 | GFM table column widths | mdast `tableCell` has no width metadata |
| NG3 | Math, footnotes, alerts (rendering-class) | Some have first-class mdast types post-2026-04-23 (alerts via remark-github-alerts); others (math/footnotes) don't |
| NG4 | Non-ambiguous `\foo` backslashes | Serializer emits canonical escape choice |
| NG5 | Storage never sanitizes raw HTML — IS the contract | Render-layer DOMPurify; storage passthrough |
| NG6 | Entity refs decode literal | rehype/mdast normalize entities to characters |
| NG7 | MDX `---` inside JSX is thematicBreak | MDX-JSX block boundary specifics |
| NG8 | Block GFM inside inline `<Note>` flattens | mdxJsxTextElement only allows phrasing children |
| NG9 | U+E000-U+E004 PUA reserved as R23 guard sentinels | autolink-void-html-guard internal use |
| NG10 | Doc-start `---` → `***` | Frontmatter delimiter ambiguity resolution |
| NG11 | Ignore-typed-only docs get a synthesized empty paragraph | `ensureNonEmptyDoc` keeps PM schema valid |

### Why we can't just "fix" each one

- **NG1 (blank-line counts)**: The unified parser's tokenizer is line-based with abstract block boundaries. Tracking exact blank-line counts requires extending every block-level token type with a `prefixBlankLines` field and propagating it through every plugin. That's a fork of micromark.
- **NG2 (table column widths)**: mdast `tableCell` would need an `originalWidth` field; remark-gfm would need to populate it; mdast-util-to-markdown would need to reproduce it. Three plugins to fork.
- **NG5 (HTML passthrough)**: This isn't a normalization — it's an explicit contract decision (storage never sanitizes; render layer does). Reversing it would break the security model.
- **NG7 (MDX `---` inside JSX)**: This is upstream mdast-util-mdx behavior. Forking it would mean maintaining a fork of every MDX serializer.
- **NG10 (doc-start `---` → `***`)**: CommonMark spec requires either form to be valid. Choosing one canonical output is the spec-conformant move.
- **NG11 (empty-paragraph synthesis)**: PM schema requires content; without the synthesis, ignore-typed-only docs (just frontmatter) fail schema validation.

### The pragmatic alternative: precedent #15(d) `sourceRaw` passthrough

For descriptors with non-trivial AST representation gaps (jsxComponent, rawMdxFallback), OK keeps the original source bytes in `node.attrs.sourceRaw`. The serializer's "pristine path" emits `sourceRaw` directly when the node hasn't been edited; the "dirty path" reconstructs from descriptor `serialize(node)` after edits invalidate `sourceRaw`.

This achieves byte-perfect round-trip for the highest-fidelity-need nodes (custom JSX components) without rebuilding the unified ecosystem. The cost: every `sourceRaw`-carrying node doubles in storage size (PM attrs + the raw bytes). The benefit: lossless round-trip for the cases that matter most (user-authored JSX with non-canonical attribute spelling).

Could we extend `sourceRaw` to ALL nodes? In principle yes, but:
- Storage cost on long docs becomes substantial.
- Any PM mutation invalidates `sourceRaw`, so the dirty-path serializer runs anyway after edits — `sourceRaw` only helps on the read-then-write path with no edits between.
- Most "lossy" normalizations (blank-line counts, table widths) don't actually matter for typical authoring — users don't notice or care.

## What other markdown editors do

Sourced from `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` (15-editor survey, Archetypes A-Z).

### Markdown-canonical WYSIWYG editors using unified or similar AST stacks

| Editor | Storage | Byte preservation posture | Notes |
|---|---|---|---|
| **OK** (us) | markdown on disk + Y.Doc | NG1-NG11 normalizations; `sourceRaw` for jsxComponent/rawMdxFallback | Only editor in this row with first-class JSX descriptors. |
| **Outline** | markdown on disk | Similar normalization set | Uses Lexical+CRDT; unified parse on import/export. |
| **BlockNote** | block-model on disk | Markdown is import/export — lossy by design | Block model means many markdown features have no representation. |
| **Milkdown** | markdown in-memory | Normalization set similar to OK | TipTap-based; same unified ecosystem. |
| **Plate (Slate)** | block model | Markdown is import/export — lossy | Same as BlockNote. |
| **Novel** | block model | Markdown is import/export — lossy | TipTap+block model. |
| **Keystatic** | markdown on disk | Normalization set similar to OK | mdast-canonical. Reuses unified ecosystem. |

**Pattern**: every editor that uses an AST-canonical pipeline has roughly the same set of unified-inherent normalizations. We're not unique in losing blank-line counts or table column widths.

### Source-mode-only editors

| Editor | Byte preservation posture |
|---|---|
| **iA Writer** | 100% byte-perfect — pure source mode |
| **VS Code (markdown mode)** | 100% byte-perfect — text editor |
| **Typora** (source mode) | 100% byte-perfect — text editor |
| **GitHub web textarea** | 100% byte-perfect — textarea |
| **Vim/Emacs** | 100% byte-perfect |
| **Sublime Text** | 100% byte-perfect |

These don't have a parse/serialize cycle on save. Trivially byte-perfect.

### Custom-block-model editors (not markdown-canonical)

| Editor | Storage | Markdown round-trip |
|---|---|---|
| **Notion** | block JSON in DB | Lossy by design — markdown is export-only |
| **Roam** | block JSON in DB | Lossy by design |
| **Logseq** | block JSON files | Lossy by design |
| **Anytype** | block JSON | Lossy by design |
| **Coda** | proprietary | Lossy by design |

These don't claim byte preservation. Markdown is interop, not canonical.

### The Obsidian outlier

**Obsidian** stores `.md` files raw and edits in source mode by default; WYSIWYG ("Live Preview") edits the AST and emits normalizations only when user explicitly edits in WYSIWYG. Source-mode edits round-trip byte-perfect. This is similar to OK's posture in spirit — pristine path preserved, dirty path normalized.

## The peer-comparison takeaway

**OK's byte-preservation posture is competitive with the markdown-canonical-WYSIWYG-with-AST class.** Our NG1-NG11 catalogue is roughly the median of what unified-ecosystem peers do. We're not "worse" at byte preservation than Outline, Milkdown, Keystatic.

We're "worse" than source-mode-only editors (no contest — they have no parse/serialize cycle). We're "better" than custom-block-model editors at preserving markdown bytes (their model claims no preservation).

The structural ceiling for byte preservation in OK is set by the unified ecosystem we depend on. Moving beyond it requires either:

1. **Forking unified components** — micromark, remark-mdx, mdast-util-to-markdown — each becomes a maintenance burden.
2. **Adopting a CST-aware parser** — markdown-it has this; tree-sitter has this; pandoc has this. Each loses unified's plugin ecosystem (autolinks, GFM tables, MDX, alerts).
3. **Storing raw bytes per-block alongside the AST** — extends `sourceRaw` to all node types. Storage cost on long docs.

None of these is in scope for this spec. They'd be Future Work in the "Identified" tier if the user wanted to pursue them.

## What this means for the clipboard spec

D1's "byte-for-byte source identity" is achievable on the clipboard path **modulo NG1-NG11**. The disk-side parse/serialize cycle already runs on the clipboard path (it's how `mdManager.parse` works); inheriting NG1-NG11 from the disk-side IS the byte-preservation contract. We commit to **no NEW lossy normalizations introduced by the clipboard path itself**.

The current OK→OK regression (the user's `<img>` bug) is a clipboard-introduced normalization (PM-native parseFromClipboard maps `<img>` to standard PM Image → markdown `![alt](src)` → loses the JSX descriptor identity). That's not in NG1-NG11 — it's a NEW lossy step on the clipboard path. The spec resolves it.

**Refined D1**: "The bytes a paste produces equal the bytes the source emitted on the same disk-write path, modulo NG1-NG11 storage normalizations baked into the unified parse/serialize pipeline."

The peer-comparison context belongs in §1 Situation framing — it shows we're not setting an unrealistic standard.
