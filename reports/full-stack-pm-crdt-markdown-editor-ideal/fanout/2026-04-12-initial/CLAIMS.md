# Claim Inventory

## Consolidation Metadata

| Metric | Value |
|---|---|
| Sources processed | 42 |
| Sources accessible | 42 of 42 |
| Total claims extracted | ~305 |
| Claims after dedup | ~185 |
| Conflicts detected | 2 |
| Conflicts resolved | 2 (conclusion disagreements, both surfaced) |
| In-scope claims | ~185 |
| Out-of-scope claims | 0 |
| Coverage ratio | ~95% (all P0 claims represented) |

## Sources

| ID | Path | Type | Dimension | Claims |
|---|---|---|---|---|
| S1 | d1-prosemirror-tiptap/REPORT.md | structured | D1 | 20 |
| S2 | d1-prosemirror-tiptap/evidence/d1-atom-node-contract.md | structured | D1 | 8 |
| S3 | d1-prosemirror-tiptap/evidence/d10-content-expressions.md | structured | D1 | 6 |
| S4 | d1-prosemirror-tiptap/evidence/d2-mark-vs-atom-inline-refs.md | structured | D1 | 5 |
| S5 | d1-prosemirror-tiptap/evidence/d3-unified-list-type.md | structured | D1 | 10 |
| S6 | d1-prosemirror-tiptap/evidence/d5-command-coupling.md | structured | D1 | 6 |
| S7 | d1-prosemirror-tiptap/evidence/d7-attribute-shape.md | structured | D1 | 8 |
| S8 | d1-prosemirror-tiptap/evidence/d8-d9-codeblock-html-roundtrip.md | structured | D1 | 13 |
| S9 | d2-crdt-collab/REPORT.md | structured | D2 | 22 |
| S10 | d2-crdt-collab/evidence/atom-node-collaborative-editing.md | structured | D2 | 5 |
| S11 | d2-crdt-collab/evidence/concurrent-mark-operations.md | structured | D2 | 6 |
| S12 | d2-crdt-collab/evidence/hocuspocus-extension-patterns.md | structured | D2 | 4 |
| S13 | d2-crdt-collab/evidence/tiptap-y-tiptap-vs-y-prosemirror.md | structured | D2 | 3 |
| S14 | d2-crdt-collab/evidence/y-codemirror-next-analysis.md | structured | D2 | 4 |
| S15 | d2-crdt-collab/evidence/y-prosemirror-schema-name-handling.md | structured | D2 | 6 |
| S16 | d2-crdt-collab/evidence/y-xmlfragment-internals.md | structured | D2 | 5 |
| S17 | d2-crdt-collab/evidence/yjs-schema-evolution.md | structured | D2 | 8 |
| S18 | d3-unified-remark-micromark/REPORT.md | structured | D3 | 25 |
| S19 | d3-unified-remark-micromark/evidence/e1-mdast-node-catalogue.md | structured | D3 | 8 |
| S20 | d3-unified-remark-micromark/evidence/e2-mdx-node-types.md | structured | D3 | 5 |
| S21 | d3-unified-remark-micromark/evidence/e3-plugin-ordering.md | structured | D3 | 4 |
| S22 | d3-unified-remark-micromark/evidence/e4-handler-api.md | structured | D3 | 8 |
| S23 | d3-unified-remark-micromark/evidence/e5-position-preservation.md | structured | D3 | 5 |
| S24 | d3-unified-remark-micromark/evidence/e6-known-bugs.md | structured | D3 | 7 |
| S25 | d3-unified-remark-micromark/evidence/e7-frontmatter-gfm-config.md | structured | D3 | 6 |
| S26 | d4-remark-prosemirror/REPORT.md | structured | D4 | 22 |
| S27 | d4-remark-prosemirror/evidence/e1-complete-api-surface.md | structured | D4 | 6 |
| S28 | d4-remark-prosemirror/evidence/e2-atom-node-and-custom-type-analysis.md | structured | D4 | 5 |
| S29 | d4-remark-prosemirror/evidence/e3-mark-hydration-algorithm.md | structured | D4 | 4 |
| S30 | d4-remark-prosemirror/evidence/e4-coverage-gaps-and-error-handling.md | structured | D4 | 7 |
| S31 | d4-remark-prosemirror/evidence/e5-version-history-and-ecosystem.md | structured | D4 | 6 |
| S32 | d5-codemirror/REPORT.md | structured | D5 | 15 |
| S33 | d5-codemirror/evidence/current-integration-audit.md | structured | D5 | 6 |
| S34 | d5-codemirror/evidence/lang-markdown-capabilities.md | structured | D5 | 8 |
| S35 | d5-codemirror/evidence/y-codemirror-next-binding.md | structured | D5 | 5 |
| S36 | d6-reference-editors/REPORT.md | structured | D6 | 20 |
| S37 | d6-reference-editors/evidence/blocknote-schema-analysis.md | structured | D6 | 6 |
| S38 | d6-reference-editors/evidence/commands-shortcuts-versioning.md | structured | D6 | 5 |
| S39 | d6-reference-editors/evidence/fidelity-and-wikilinks.md | structured | D6 | 8 |
| S40 | d6-reference-editors/evidence/milkdown-schema-analysis.md | structured | D6 | 10 |
| S41 | d6-reference-editors/evidence/plate-schema-analysis.md | structured | D6 | 6 |
| S42 | d6-reference-editors/evidence/prosemirror-canonical-patterns.md | structured | D6 | 8 |

---

## High-Impact Claims (representative sample)

### C1: Flat attributes required for CRDT
- **Text:** All node/mark attributes must be flat primitives (string, number, boolean, null) in a Y.js CRDT editor
- **Source:** S7, S9, S16
- **Confidence:** CONFIRMED
- **Content type:** prose + code
- **In output:** Yes — §2 HC1
- **Verification:** PASSED

### C2: checked belongs on listItem
- **Text:** mdast puts `checked` on listItem, not list; a single list can contain mixed task and non-task items
- **Source:** S1, S5, S18
- **Confidence:** CONFIRMED
- **Content type:** reasoning-chain
- **In output:** Yes — §2 HC2, §1.1
- **Verification:** PASSED

### C3: y-prosemirror is fully name-agnostic
- **Text:** y-prosemirror does not hardcode any ProseMirror node or mark names; uses strict === comparison at runtime
- **Source:** S9, S15
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §4, §7.1
- **Verification:** PASSED

### C4: Schema renames are destructive for in-flight Y.Docs
- **Text:** When schema.node() throws for unknown type, y-prosemirror permanently deletes the Y.XmlElement via `el._item.delete(transaction)`, propagated to all clients
- **Source:** S9, S15
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §2 HC6, §7.2
- **Verification:** PASSED

### C5: Markdown-on-disk is the migration lever
- **Text:** Y.Docs are ephemeral session state rebuilt from markdown on every onLoadDocument; schema changes are safe as long as the parser handles both formats
- **Source:** S9, S17, S36
- **Confidence:** CONFIRMED
- **Content type:** reasoning-chain
- **In output:** Yes — §7.3, Cross-cutting Theme 2
- **Verification:** PASSED

### C6: 32 mdast node types
- **Text:** The remark stack produces 32 distinct mdast node types: 19 CommonMark + 6 GFM + 2 frontmatter + 5 MDX
- **Source:** S18, S19, S20
- **Confidence:** CONFIRMED
- **Content type:** table
- **In output:** Yes — §5.1
- **Verification:** PASSED

### C7: Position info enables source-text fidelity
- **Text:** Every node from mdast-util-from-markdown has position.start.offset and position.end.offset (0-indexed), spanning complete syntactic extent including delimiters
- **Source:** S18, S23
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §5.3, Cross-cutting Theme 1
- **Verification:** PASSED

### C8: remark-prosemirror has zero default handlers
- **Text:** The library provides no default handlers for standard markdown types; consumers register handlers for every mdast type
- **Source:** S26, S30
- **Confidence:** CONFIRMED
- **Content type:** prose + table
- **In output:** Yes — §6.2
- **Verification:** PASSED

### C9: CodeMirror has zero PM-schema coupling
- **Text:** CodeMirror 6 source editor binds to Y.Text only; zero awareness of ProseMirror schema, remark, or Y.XmlFragment
- **Source:** S32, S35
- **Confidence:** CONFIRMED
- **Content type:** diagram
- **In output:** Yes — §8, Cross-cutting Theme 3
- **Verification:** PASSED

### C10: No JS WYSIWYG editor preserves source form
- **Text:** No reference editor (Milkdown, BlockNote, Plate, prosemirror-markdown) preserves per-node source-text form; Open Knowledge's 12 fidelity extensions are unique
- **Source:** S36, S39
- **Confidence:** CONFIRMED
- **Content type:** table
- **In output:** Yes — §9.4, Cross-cutting Theme 1
- **Verification:** PASSED

### C11: Unified list type proven by prosemirror-flat-list
- **Text:** prosemirror-flat-list uses one node type with kind attribute; PM commands accept NodeType params not strings
- **Source:** S1, S5
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §1.1, SR1, Cross-cutting Theme 5
- **Verification:** PASSED

### C12: All reference editors use separate list types
- **Text:** Milkdown, BlockNote, and Plate all use separate types for bullet/ordered/task lists, not unified
- **Source:** S36, S37, S40, S41
- **Confidence:** CONFIRMED
- **Content type:** prose
- **In output:** Yes — §9.2, Cross-cutting Theme 5
- **Verification:** PASSED

### C13: Plate has strongest MDX model
- **Text:** Plate has remark-mdx integration with explicit bidirectional serialize/deserialize rules per component type
- **Source:** S36, S41
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §9.3
- **Verification:** PASSED

### C14: toProseMirror throws on unknown types
- **Text:** Any mdast node type without a registered handler causes a runtime crash via `throw new Error('unknown markdown node: ' + node.type)`
- **Source:** S26, S30
- **Confidence:** CONFIRMED
- **Content type:** code
- **In output:** Yes — §6.3
- **Verification:** PASSED

### C15: fromProseMirror silently drops unknown nodes
- **Text:** PM nodes without handlers return null and are silently removed from the mdast tree
- **Source:** S26, S30
- **Confidence:** CONFIRMED
- **Content type:** prose
- **In output:** Yes — §6.3
- **Verification:** PASSED

---

## Conflict Register

### F1: Unified vs Separate List Types
- **Claims involved:** C11, C12
- **Type:** Conclusion disagreement (shared evidence, different recommendations)
- **Structure:** Pair (D1 vs D6)
- **Resolution:** Both surfaced in Conflicts §C1. Unified is slightly favored for remark-based pipeline; separate is lower friction for incremental migration.
- **Surfaced in document:** Yes — Conflicts §C1, Cross-cutting Theme 5

### F2: TipTap vs mdast Naming Convention
- **Claims involved:** D1 "renames are low-friction" vs D6 "TipTap defaults are familiar"
- **Type:** Complementary (different aspects of same topic)
- **Structure:** Pair (D1 vs D6)
- **Resolution:** No constraint prevents either choice; mdast-canonical recommended for remark alignment. Surfaced in Conflicts §C2.
- **Surfaced in document:** Yes — Conflicts §C2

---

## Gaps & Missing Coverage

- OQ1: prosemirror-flat-list accessibility for screen readers — flagged but not resolved
- OQ2: remark-prosemirror fork timing — risk identified but decision criteria not established
- OQ3: Unknown MDX component handling strategy — design decision needed

---

## Structural Completeness

| Content Type | Source Count | In Output | Notes |
|---|---|---|---|
| Code blocks | ~45 | ~15 representative | Key code preserved (NodeSpec, handler signatures, destructive catch); repetitive variants deduplicated |
| Tables | ~30 | ~20 | All major comparison tables preserved (schema mapping, constraints, concurrent semantics, naming) |
| Diagrams | ~6 | 3 | Architecture diagrams for Y.Doc, remark-prosemirror integration, CodeMirror |
| Reasoning chains | ~15 | 12 | Fidelity reasoning, migration lever, zero-coupling, hydrateMarks |
| Examples | ~8 | 5 | Wiki-link handler, MDX rules, position slicing, emphasis hydration |
