---
type: synthesis
investigation: I1
date: 2026-04-11
question: "What libraries/approaches beyond our 3 already-compared could solve source-text fidelity?"
prior: reports/markdown-roundtrip-fidelity-tiptap/, reports/markdown-construct-fidelity-catalog/, reports/peritext-on-yjs-feasibility/
---

# I1: Library / Ecosystem Reuse Survey for Source-Text Fidelity

## Summary verdict

No single external library solves our fidelity problem out of the box. The root cause (entity encoding in `@tiptap/core`'s `encodeHtmlEntities`, missing `escape` token handler in `parseInlineTokens`) is in **our** stack's serialize layer, not in the upstream parsers. The most productive path is targeted patches to @tiptap/markdown's serialize pipeline, supplemented by marked's tokenizer fidelity and CommonMark/GFM test corpora.

---

## 1. remark / unified pipeline (remark-stringify)

**What it offers:** remark-stringify serializes from MDAST (Markdown AST), the richest intermediate representation. MDAST preserves `spread` (tight/loose), separate `html` node type, `position` data, and frontmatter via plugin. remark-stringify options control `bullet`, `emphasis`, `fence`, `setext` heading style, `resourceLink` vs reference links.

**What it doesn't solve:** remark-stringify cannot preserve the *original* source form — it regenerates markdown from the AST with configurable but static defaults. Per the mdast-util-to-markdown docs: "complete roundtripping is impossible." It picks *one* canonical form per construct (e.g., always `*` or always `-` bullets), not per-occurrence source preservation. Entity handling is clean (no spurious encoding), which solves our P0 entity bug — but only if we replace the entire serialize layer.

**Integration cost with TipTap:** Requires `remark-prosemirror` (announced Dec 2024, <1K weekly npm downloads) as adapter. This replaces @tiptap/markdown's entire parse+serialize infrastructure. Each TipTap extension's `parseMarkdown`/`renderMarkdown` config becomes dead code — you'd write mdast↔PM handlers instead. Blast radius: every custom extension (jsx-component, frontmatter, task-list) needs new handler code. Estimated 2-4 weeks for full migration, with ongoing maintenance of two handler systems if any TipTap markdown features are still used.

**Recommendation: IGNORE for migration. REFERENCE for test oracle.** remark-parse + remark-stringify is useful as a *reference serializer* in tests to verify our output against a known-good pipeline.

## 2. markdown-it + TipTap adapter

**What it offers:** markdown-it has the highest CommonMark spec compliance among JS parsers. prosemirror-markdown already uses it. Our 118-case probe confirmed: PM fixes entity corruption (all 10 cases) and backslash escape (all 4 cases).

**What it breaks:** 9 NOT_IN_SCHEMA failures for GFM extensions (strikethrough, task lists, wiki-links). Would require custom ProseMirror schema nodes + serializer rules for every non-CommonMark extension we use.

**Integration cost:** A hybrid (markdown-it parse, @tiptap/markdown serialize) isn't architecturally possible — @tiptap/markdown's parseMarkdown handlers expect marked token shapes, not markdown-it tokens. You'd need to replace the full parse side, losing TipTap extension integration. Net negative for our extension-heavy codebase.

**Recommendation: IGNORE.** The 118-case probe already quantified this tradeoff. The 14 bugs fixed vs 9 introduced is not worth the migration.

## 3. Custom serializer on marked tokens

**What it offers:** marked's tokenizer is 91/118 clean (77% whitespace-only diff) — highest of all three tested. The corruption happens in @tiptap/markdown's serialize layer, not in marked. A custom serializer that walks marked tokens directly, bypassing `encodeHtmlEntities` and `renderMarkdown` handlers, could achieve near-lossless fidelity.

**Integration cost:** This is effectively what our planned P0-P2 patches do — targeted fixes to the serialize layer while keeping marked's tokenizer. The architecture is: (a) fix `encodeHtmlEntities` bypass (~30 LOC post-process), (b) add `escape` token handler (~20 LOC), (c) preserve tight/loose via `token.loose` (~50 LOC). Building a *completely custom* serializer is ~500-800 LOC and duplicates work @tiptap/markdown already does.

**Recommendation: COMPOSE — patch the existing serializer.** This is the chosen path per SPEC.md. The marked tokenizer is our strongest asset; the serialize layer is where all bugs live.

## 4. Peritext / Loro / CRDT frameworks

**What they solve:** Peritext defines correct merge semantics for concurrent inline formatting (bold overlap). Loro implements Peritext + Fugue on a custom CRDT. Neither addresses source-text fidelity — they operate at the rich-text formatting layer, not the markdown text layer.

**Relevance to our problem:** Zero. Source-text fidelity is a serialize/parse concern. CRDT layer (Yjs Y.Text + Y.XmlFragment) passes constructs through transparently — confirmed by our D6 multi-client probe (all constructs survive 2-client concurrent edit). The peritext-on-yjs-feasibility report already covers dual-view architecture; that's orthogonal to this spec.

**Recommendation: IGNORE for source-text fidelity. Already covered by separate report.**

## 5. Obsidian's markdown handling

**How they achieve it:** Obsidian uses CodeMirror 6 as a *text editor*, not a WYSIWYG ProseMirror editor. The file on disk is the buffer — CM6 decorates markdown syntax in-place (Live Preview mode) but never converts to/from an intermediate document model. There is no parse→serialize round-trip; the source text IS the document. Obsidian is closed-source; their approach is not documented in detail beyond community plugin APIs.

**Applicability:** Their architecture avoids the round-trip problem entirely by never leaving the text domain. Our dual-mode architecture (WYSIWYG TipTap + Source CodeMirror on a shared CRDT) inherently requires parse/serialize. Obsidian's approach is architecturally incompatible with our design.

**Recommendation: IGNORE. Different architecture class.** Our Source mode (CodeMirror on Y.Text) already achieves Obsidian-like lossless editing for source-mode-only workflows. The fidelity problem is specifically in the WYSIWYG↔Source bridge.

## 6. Other editors (Logseq, HackMD, StackEdit)

- **Logseq:** Uses `mldoc` parser (OCaml-based), stores as markdown but adds custom syntax (`{{query}}`, property lines). Fidelity with standard markdown is poor — community complaints about non-standard output. Not useful.
- **HackMD/CodiMD:** CodeMirror-based collaborative editor. Same architecture as Obsidian — text buffer, no round-trip. Real-time sync via OT, not CRDT. No serialize layer.
- **StackEdit:** Uses PageDown (Stack Overflow's library). Multiple markdown flavors. No CRDT. No relevant fidelity innovations.

**Recommendation: IGNORE all. No transferable patterns for our ProseMirror-based WYSIWYG architecture.**

## 7. Markdown test suites

| Corpus | Cases | Format | Covers | URL |
|--------|-------|--------|--------|-----|
| CommonMark spec tests | 652 | JSON (`spec.json`) | CommonMark 0.31.2 parse correctness | github.com/commonmark/commonmark-spec |
| GFM spec tests | ~200 additional | Same format | Tables, strikethrough, autolinks, task lists | github.com/github/cmark-gfm |
| karlcow/markdown-testsuite | ~100+ | Individual .md files | Multi-implementation compat | github.com/karlcow/markdown-testsuite |
| Our construct catalog | 118 | TSV + .md | Round-trip fidelity (input→output diff) | reports/markdown-construct-fidelity-catalog/ |

**Integration recommendation: COMPOSE.** Import CommonMark spec.json (652 cases) as a *round-trip* test corpus — parse each example's markdown source through our pipeline, diff output vs input. This tests a different property than CommonMark intends (they test parse→HTML correctness; we test parse→serialize→identity). GFM spec adds ~200 cases for our extension surface. Our existing 118-case catalog covers constructs CommonMark doesn't (JSX blocks, wiki-links, frontmatter). Together: ~970 cases covering the full surface.

---

## Decision matrix

| Approach | Solves entity bug? | Solves backslash bug? | Preserves tight/loose? | Integration cost | Recommendation |
|----------|---|---|---|---|---|
| remark-stringify migration | Yes | Yes | Yes | HIGH (2-4 weeks, all extensions) | IGNORE |
| markdown-it migration | Yes | Yes | Yes | HIGH (9 new breaks) | IGNORE |
| Patch @tiptap/markdown serialize | Yes (post-process) | Yes (token handler) | Yes (marked token.loose) | LOW (~150 LOC) | **COMPOSE** |
| Peritext/Loro | N/A | N/A | N/A | N/A | IGNORE |
| Obsidian pattern | N/A | N/A | N/A | Incompatible | IGNORE |
| CommonMark + GFM test corpus | Validates fix | Validates fix | Validates fix | LOW (import JSON) | **COMPOSE** |
