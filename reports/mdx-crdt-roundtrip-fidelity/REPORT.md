---
title: "MDX Round-Trip Fidelity Through CRDT-Backed Visual Editors"
description: "Source-code-level investigation of whether MDX files can survive round-trip through a CRDT-backed visual editor. Traces the four conversion boundaries (MDX text <-> MDAST <-> editor blocks <-> Yjs) through Plate/TinaCMS and Milkdown/ProseMirror pipelines. Identifies blocking issues, architectural constraints, and viable paths."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - remark-mdx
  - TinaCMS
  - Plate
  - slate-yjs
  - y-prosemirror
  - Milkdown
  - Yjs
  - ProseMirror
  - Slate
topics:
  - MDX round-trip fidelity
  - CRDT collaboration
  - visual editor architecture
  - markdown-as-canonical
---

# MDX Round-Trip Fidelity Through CRDT-Backed Visual Editors

## 1. Executive Summary

**Can MDX survive a round-trip through a CRDT-backed visual editor?**

Not today. No existing system has demonstrated the full chain -- MDX to editor to Yjs to editor to MDX -- working end-to-end with conflict resolution. The individual legs are proven in isolation, but the combination introduces at least six failure vectors that range from silent data loss to architectural incompatibility.

The investigation traced the conversion pipeline at source-code depth across seven dimensions: the remark-mdx parse/serialize layer, TinaCMS and Plate's Slate-based MDX handling, Milkdown's ProseMirror-based remark integration, the slate-yjs and y-prosemirror CRDT bindings, and the untested seam where these layers meet. A concrete test case (3-level nested JSX with expression props and YAML frontmatter) was traced through both the Slate and ProseMirror pipelines.

The findings:

1. **The remark-mdx layer is mostly sound.** Of 23 edge cases tested, 22 converge to a stable form after one normalization pass. One critical defect -- multiline expression indentation drift -- does not converge and requires a workaround.

2. **The MDAST-to-editor conversion is the primary failure point.** Both Plate/Slate and Milkdown/ProseMirror destroy JSX component structure for unregistered components. Plate flattens JSX to literal paragraph text (losing attributes and expression props). Milkdown treats JSX as opaque HTML atoms (preserving tag strings but losing nesting).

3. **The CRDT bindings are structurally adequate.** Both slate-yjs and y-prosemirror store node attributes as individual CRDT keys, enabling concurrent merges of different props on the same component. Nested object props are the exception: they get last-writer-wins on the entire object.

4. **slate-yjs is abandoned with critical bugs.** The Slate CRDT binding has not been maintained since July 2023, with 20 open issues including a confirmed crash on inline void elements mixed with text (issue #390) and content duplication on offline reconnection (#382).

5. **The session boundary is an architectural tension.** When MDX files in git are the canonical format, every session start requires a fresh MDX parse. The resulting Yjs state will never match a previously edited Yjs state (different tombstone histories, whitespace normalization, type coercion). This forces a choice: either Yjs state is ephemeral (session-scoped only, no offline collaboration) or MDX is a derived artifact (loses the "markdown is source" property).

6. **Nobody has done this before.** An exhaustive search across TinaCMS, Plate, Milkdown, slate-yjs, y-prosemirror, mdx-editor, Dhub, Holocron, academic papers, and community discussions found zero implementations of the full MDX + CRDT chain with verified round-trip fidelity.

The path forward exists but requires deliberate engineering. The ProseMirror path (Milkdown or TipTap + y-prosemirror) has fewer blocking bugs and a more actively maintained CRDT binding. The Slate path (Plate + forked slate-yjs) has the more mature MDX pipeline but requires maintaining a fork of an abandoned library. Both paths require custom editor schemas for MDX component types, a normalization pass on load to establish a stable baseline, and a decision on whether Yjs state is ephemeral or persistent.

---

## 2. Research Rubric

This investigation evaluated MDX round-trip fidelity across seven dimensions, each addressed by a dedicated sub-report with source-code-level evidence:

| Dimension | Focus | Key Question |
|-----------|-------|-------------|
| D1: remark-mdx | Parse/serialize layer | What survives byte-identical? What normalizes? What drifts? |
| D2: TinaCMS + Plate | Production MDX visual editing | How does the only production MDX-to-Slate pipeline handle components? |
| D3: slate-yjs | Slate-to-Yjs binding | How do Slate nodes map to Yjs types? What are the concurrent edit semantics? |
| D4: y-prosemirror | ProseMirror-to-Yjs binding | How do PM nodes map to Yjs types? How does it compare to slate-yjs? |
| D5: Milkdown | ProseMirror + remark pipeline | Can remark-mdx be added? What is the round-trip fidelity of the remark integration? |
| D6: Untested seam | Adversarial analysis | What failure vectors exist in the full MDX + CRDT chain? What breaks first? |
| D7: Nested MDX trace | Concrete end-to-end test | Trace a real MDX document through both pipelines. Where does fidelity break? |

Each dimension produced a report with source-level citations (file paths, line numbers, function names) and evidence files with code extracts and test results.

---

## 3. The Four Conversion Boundaries

An MDX file must cross four boundaries to reach a CRDT-backed visual editor and return:

```
B1: MDX text  <-->  MDAST             (remark-mdx parse/serialize)
B2: MDAST     <-->  Editor blocks     (Slate or ProseMirror conversion)
B3: Editor    <-->  Yjs types         (slate-yjs or y-prosemirror)
B4: Yjs       <-->  MDX text          (B3 + B2 + B1 in reverse on save)
```

### B1: MDX Text to MDAST

remark-mdx (v3.1.1) is a thin unified plugin that registers three extension pairs: micromark-extension-mdxjs for tokenizing, and mdast-util-mdx for AST construction and serialization. It adds seven node types to the standard MDAST: `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`, `mdxJsxAttribute`, and `mdxJsxExpressionAttribute`.

**Round-trip fidelity at this boundary is mostly good.** Of 23 edge cases tested empirically, 14 round-trip byte-identical. Eight normalize in one pass (self-closing spacing, quote style, empty-to-self-close, blank line collapse, trailing whitespace, missing blank lines, list bullets, and inline-to-block expression expansion). All of these can be pre-normalized on load so subsequent round-trips are stable.

**One defect does not converge.** Multiline expression values (template literals with newlines) accumulate 2 spaces of indentation on continuation lines with every parse/serialize cycle. The root cause is two compounding indent operations in `mdast-util-mdx-expression` and `mdast-util-mdx-jsx`. This was filed as [mdx-js/mdx#2533](https://github.com/mdx-js/mdx/issues/2533) and closed as "expected behavior." Any system round-tripping MDX must strip accumulated indent from expression values after parsing.

**Serialization preserves**: attribute order, member expressions (Foo.Bar), fragments, spreads, import/export text verbatim, nested JSX structure, and markdown inside JSX children. **Serialization normalizes but converges**: quote style, self-closing form, blank lines, trailing whitespace, and list bullets. Configuration options exist for most normalizations (`bullet`, `quote`, `tightSelfClosing`).

### B2: MDAST to Editor Blocks

This boundary is the primary failure point. Both editor frameworks destroy JSX structure for unregistered components.

**Plate/Slate (via TinaCMS or @udecode/plate-markdown):** TinaCMS's pipeline is schema-dependent -- it looks up each JSX element by name in a `field.templates` array. Registered components get typed Slate nodes with extracted props. Unregistered components degrade to opaque HTML string nodes. Expression props (`data={chartData}`), import statements, and MDX expressions are all explicitly rejected with parse errors. In Plate's own markdown plugin, unregistered flow JSX elements are wrapped in paragraphs with literal tag strings as text content (`{ text: "<Tabs>\n" }`), losing all attributes.

**Milkdown/ProseMirror:** Without remark-mdx (not included by default), JSX tags become `html` MDAST nodes that map to inline atom ProseMirror nodes. Tag strings including attributes survive as opaque values, but structural nesting is completely flattened. With remark-mdx added, the MDAST is correct but there are no ProseMirror node schemas to match MDX types -- the parser throws `parserMatchError` (documented in [Milkdown Discussion #772](https://github.com/orgs/Milkdown/discussions/772)).

### B3: Editor Blocks to Yjs Types

Both CRDT bindings are structurally adequate and type-agnostic.

**slate-yjs** maps every Slate Element to a `Y.XmlText` instance. Properties are stored as individual `setAttribute(key, value)` calls. Text content and marks live as string segments with formatting attributes in the delta. The binding never inspects node types -- any Slate element, including custom MDX components, round-trips without modification.

**y-prosemirror** (v1) maps ProseMirror Element nodes to `Y.XmlElement(nodeName)` with individual `setAttribute(key, val)` per attribute. Text nodes become `Y.XmlText` with formatting deltas. v2 (pre-release) replaces this with a `lib0/delta`-based approach where both directions use the same diff/apply mechanism.

Both bindings store attributes as individual CRDT keys, enabling concurrent merges of different attributes on the same node. The critical constraint for both: **children content must be modeled as child nodes, not string attributes**, to get character-level CRDT merging rather than last-writer-wins on an entire string.

### B4: The Reverse Path (Yjs to MDX)

Beyond the losses in B1-B3, the reverse path introduces session-boundary drift: Yjs tombstone growth (edited documents have history; fresh parses do not), empty text node injection (Slate requires void elements to have `{text: ''}` children), type coercion (numbers stored via `setAttribute` may return as strings), and doc-level attribute stripping (y-prosemirror issue [#48](https://github.com/yjs/y-prosemirror/issues/48) strips doc.attrs on conversion).

---

## 4. Pipeline Comparison

A concrete test case -- an MDX document with 3-level nested JSX (Tabs > Tab > Callout), YAML frontmatter, expression props (`data={chartData}`), and standard markdown -- was traced through both pipelines at the code level.

### Plate/Slate Path

The remark-mdx parse produces a structurally perfect MDAST. But the MDAST-to-Slate conversion is catastrophically lossy for unregistered components. The `customMdxDeserialize` fallback in Plate's markdown plugin (at `plate/packages/markdown/src/lib/deserializer/utils/customMdxDeserialize.ts`) wraps flow elements in paragraphs with literal tag text. All JSX attributes, expression props, and structural nesting are destroyed. After concurrent CRDT edits on this flattened text, character-level merging can interleave characters within tag strings, producing malformed JSX.

YAML frontmatter is silently dropped (no yaml rule in `defaultRules.ts`). Self-closing components lose their form. The output is not valid MDX.

### Milkdown/ProseMirror Path

Without remark-mdx, JSX tags become raw HTML atoms. The tag strings themselves survive as opaque values (including attributes and expression props), but structural nesting is flattened to a sequence of atoms and content blocks. YAML frontmatter is destroyed (no `remark-frontmatter`; `---` becomes `thematicBreak`).

The CRDT behavior is safer: atoms are opaque blocks, so concurrent edits target different structural locations rather than interleaving characters within tag strings. But there is no structural validation that open/close tags match.

### Key Distinction

Plate has the better parser (remark-mdx in the pipeline). Milkdown has the better extension architecture (bidirectional specs, remark plugin integration, emphasis marker preservation pattern). Neither has MDX round-trip fidelity out of the box. Both require custom editor schemas for MDX component types.

The CRDT binding comparison tilts toward y-prosemirror: it is actively maintained, has fewer known critical bugs, and ProseMirror's strict schema validates documents on apply (versus Slate's post-hoc normalization). slate-yjs's abandonment (no commits since July 2023) and confirmed data corruption bugs make it a higher-risk foundation.

---

## 5. Blocking Issues

Six issues block a production MDX + CRDT system. They are ordered by likelihood of encounter.

**1. Schema mapping explosion.** Every MDX component needs a corresponding editor schema definition. A generic "mdx-component" node loses structural validation (enables invalid nesting). Per-component schemas require ahead-of-time configuration for every component and fail on unknown ones. This must be resolved before collaboration can be tested.

**2. Expression props not supported.** TinaCMS's Acorn extraction explicitly requires `Literal`, `ArrayExpression`, or `ObjectExpression` ESTree nodes. Variable references like `chartData` throw parse errors. This is architectural, not a bug -- TinaCMS supports only literal values that can be edited as form fields. Any alternative pipeline must decide how to handle expression props: as raw strings (opaque to the editor), as structured ASTs (opaque to the CRDT), or rejected.

**3. Multiline expression indentation drift.** Does not converge across round-trips. Each parse/serialize cycle adds 2 spaces to continuation lines. The MDX project considers this expected behavior ([mdx-js/mdx#2533](https://github.com/mdx-js/mdx/issues/2533)). Workaround: strip accumulated indent from expression values after every parse.

**4. slate-yjs abandoned with critical bugs.** Inline void elements crash on concurrent edits ([#390](https://github.com/BitPhinix/slate-yjs/issues/390)). Null parent references cause intermittent crashes ([#386](https://github.com/BitPhinix/slate-yjs/issues/386)). Offline reconnection duplicates content ([#382](https://github.com/BitPhinix/slate-yjs/issues/382)). Move operations miscalculate offsets ([#391](https://github.com/BitPhinix/slate-yjs/issues/391)). Undo destroys collaborator edits ([#332](https://github.com/BitPhinix/slate-yjs/issues/332)).

**5. Nested object props get LWW semantics.** Both CRDT bindings store node attributes as individual keys. But if component props are stored as a single nested object, the entire object is one CRDT key. Concurrent edits to different sub-props result in silent data loss.

**6. Session boundary drift.** Seven independent drift vectors (whitespace normalization, ESTree re-generation, type coercion, formatting preferences, empty text injection, doc-level attribute stripping, tombstone growth) ensure that Yjs state from a fresh MDX parse will never match Yjs state from a previous editing session.

---

## 6. Architectural Constraints

For any viable path, the following constraints are non-negotiable based on the source-level analysis:

**Flat props.** MDX component props must be flattened to individual top-level node attributes (not a nested `props` object) to get per-prop CRDT merging. A component with `variant`, `size`, and `title` props should store each as a separate Slate/ProseMirror attribute. Risk: name collisions with editor-internal properties (`type`, `children`). Mitigation: namespace prefixing (e.g., `mdx_variant`).

**Children as nodes, not strings.** MDX component children with rich-text content must be represented as child nodes in the editor's document model, not as string attributes. String attributes get last-writer-wins semantics from the CRDT; child nodes get character-level collaborative editing. This means MDX components with editable children cannot be void/atom nodes in the editor schema.

**Normalization on load.** One parse/serialize cycle must be run immediately on document load to normalize all converging transforms (self-closing spacing, quote style, blank lines, list bullets). The normalized form becomes the baseline. Without this, the first save after loading will produce a large diff of purely cosmetic changes.

**Expression value indent stripping.** After parsing, multiline expression values must have accumulated indentation stripped from continuation lines. This prevents the indentation drift defect from compounding across save cycles.

**Flow/text element stability.** The editor must track whether a JSX component is flow (block) or text (inline) and not convert between them during editing. The micromark tokenizer determines flow vs text based on whether the opening `<` appears at line start or within phrasing content. Changing this changes the MDAST node type and content model entirely.

**Import/ESM preservation.** ESM imports and exports (`import { Chart } from './Chart'`) must be stored in document-level metadata, not discarded. The `mdxjsEsm` MDAST node stores raw text in `value` and round-trips perfectly through remark-mdx. The editor must have a document-level slot for these nodes.

---

## 7. The Untested Seam

The combination of MDX visual editing with CRDT collaboration is genuinely unvalidated. An exhaustive search across TinaCMS, Plate, Milkdown, slate-yjs, y-prosemirror, mdx-editor, Dhub, Holocron, academic papers, conference talks, and blog posts found zero implementations with demonstrated round-trip fidelity.

**Plate is the closest.** It has MDX serialization/deserialization (via `@udecode/plate-markdown` with remark-mdx) and Yjs collaboration (via slate-yjs) in the same framework. But no integration test, demo, or documentation shows them combined. They are documented independently. The Plate docs page for [Yjs](https://platejs.org/docs/yjs) and the page for [Markdown](https://platejs.org/docs/markdown) do not reference each other.

**What breaks first** (ranked by likelihood):

1. Schema mapping -- before collaboration is even testable, you need editor schemas for MDX components
2. Nested prop LWW conflicts -- the first time two users edit different sub-properties of the same component's props
3. Session boundary drift -- after the first save-and-reload cycle
4. Inline void crash -- the first time an inline MDX component appears near text content (slate-yjs #390)
5. Expression props become opaque -- any component using JSX expression syntax for props
6. Undo crosses user boundaries -- the first undo after a collaborator has edited

The most insidious failure is session boundary drift. It is invisible during a single collaborative session but accumulates across sessions. The Yjs state after 10 save/reload cycles will have different structural characteristics than a fresh parse of the same MDX content, even if the text is identical. This is because Yjs documents carry edit history (tombstones) that fresh parses do not.

---

## 8. Viable Paths Forward

Five architectural paths were identified, ranked by feasibility for a system where MDX files in git are canonical.

### Path 1: ProseMirror + remark-mdx + Custom MDX Node Schemas

Build on Milkdown or TipTap. Add remark-mdx to the remark pipeline. Write ProseMirror NodeSpecs for MDX MDAST types. Use y-prosemirror (v1, stable) for CRDT.

**Why it works**: Milkdown's architecture already uses remark as the canonical pipeline with bidirectional specs on every schema node. Adding remark-mdx is one line. y-prosemirror is actively maintained with fewer critical bugs than slate-yjs. ProseMirror's strict schema validates on apply.

**What must be built**: ProseMirror node schemas for each MDX type (5 schemas), prop editing UX (side panel or inline), and the normalization pipeline. Milkdown's GFM preset provides a working template for the extension pattern.

### Path 2: Slate + remark-mdx + Forked slate-yjs

Build on Plate. Use TinaCMS's MDAST-to-Slate pipeline as reference. Fork slate-yjs and patch critical bugs.

**Why it works**: Plate/TinaCMS has the most mature MDX parse/serialize pipeline. The slate-yjs mapping is type-agnostic and handles MDX nodes without modification.

**What must be built**: Fork and maintain slate-yjs (patch #390, #386, #391 at minimum), a custom MDX deserializer that preserves unknown JSX as structured Slate elements, and expression prop handling.

### Path 3: Ephemeral Yjs with MDX-as-Canonical (Hybrid)

Use either editor framework. Make Yjs state session-scoped only. Parse MDX fresh on every session start. Serialize to MDX on save. No persistent CRDT state.

**Why it works**: Eliminates tombstone drift, session boundary divergence, and offline sync complexity. The simplest architecture.

**What it sacrifices**: Offline collaboration, persistent edit history, and cross-session awareness (the CRDT has no memory between sessions).

### Path 4: Opaque Component Blocks + Rich Text Zones

Treat MDX components as atom/void nodes with prop editing via forms. Only children rich-text zones are collaboratively editable in the visual editor.

**Why it works**: Sidesteps schema explosion (one generic node type), expression prop editing (raw string in form), and most CRDT edge cases. Closest to TinaCMS's existing architecture.

**What it sacrifices**: Inline prop editing and WYSIWYG component rendering. Components are opaque blocks with form-based configuration.

### Path 5: CRDT-First with MDX as Derived

Store Yjs binary state as canonical. Generate MDX on demand for git export and builds.

**Why it works**: Full offline collaboration, persistent history, clean CRDT semantics.

**What it sacrifices**: The "MDX is source" property. Git stores binary Yjs files. Direct MDX edits require three-way merge (an active research problem). Fundamentally conflicts with the git-first, markdown-canonical design.

---

## 9. Implications for Editor Framework Decision

This investigation changes the framework decision calculus in several ways.

**The CRDT binding is a bigger risk factor than the editor framework.** slate-yjs's abandonment (3 years without commits) and confirmed data corruption bugs make it a higher-risk foundation than y-prosemirror, which is actively maintained and has a v2 rewrite in progress. This tilts the decision toward ProseMirror-based frameworks regardless of other considerations.

**Neither framework has MDX round-trip fidelity out of the box.** Both require significant custom work: editor schemas for MDX types, a normalization pipeline, expression prop handling, and YAML frontmatter support. The delta in custom work between Slate and ProseMirror is smaller than it appears -- Plate's existing MDX pipeline (via TinaCMS) handles only registered components with literal props. Unknown components and expression props require new code in either path.

**The schema mapping problem is framework-agnostic.** Whether using Slate elements or ProseMirror NodeSpecs, every MDX component type needs a schema definition. The decision between a generic node (flexible but structurally unvalidated) and per-component schemas (validated but requires registration) is independent of the editor framework.

**ProseMirror's schema enforcement is an advantage for CRDT.** ProseMirror validates documents on apply, rejecting invalid states before they propagate. Slate applies changes first and normalizes after the fact. In a CRDT context where remote changes can produce surprising combinations, apply-time validation is safer.

**The ephemeral Yjs approach (Path 3) decouples the framework decision from CRDT risk.** If Yjs state is session-scoped only (no persistent CRDT, fresh parse on every session), then the CRDT binding's edge cases (session drift, tombstone growth, offline sync) become irrelevant. This reduces the decision to: which framework makes it easiest to build the MDX-to-editor-to-MDX pipeline?

---

## 10. Limitations and Open Questions

### Limitations of This Investigation

- **No empirical testing of the full chain.** The analysis is architecture-level, traced through source code. The concrete test case (nested MDX trace) was walked through the code, not executed as running software. Empirical testing of the full MDX -> Editor -> Yjs -> Editor -> MDX chain is the necessary next step.

- **Version sensitivity.** remark-mdx 3.1.1, slate-yjs 1.0.2, y-prosemirror 1.3.7/2.0.0-2, Plate HEAD, Milkdown v7.20.0. Future versions may address some findings.

- **Single-document focus.** Cross-document concerns (MDX imports referencing other files, component libraries) were not investigated.

- **Performance not evaluated.** Normalization-on-load latency, Yjs document size growth, and CRDT sync overhead for large MDX documents are open questions.

### Open Questions

1. **Does Plate's markdown MDX serialization survive a Yjs round-trip when components are registered?** The generic fallback is destructive, but with proper Plate plugins for each component, does the full chain work? This needs an empirical test.

2. **How does y-prosemirror handle `setAttribute` with complex JavaScript objects?** The documentation says attributes are strings, but both bindings pass non-string values. The behavior for arrays and nested objects needs empirical validation.

3. **Can the indentation drift workaround be upstreamed to remark-mdx?** The mdx-js team closed issue #2533, but a community PR with a targeted fix for the compounding indent could change the calculus.

4. **What is the byte-size ratio of Yjs binary state vs MDX text for a realistic document after 100 collaborative edits?** If Yjs state is 10x larger than MDX text, storing it in git (Path 5) becomes impractical.

5. **Can a three-way merge between MDX text (edited in git), previous Yjs state, and pending offline edits be made reliable?** This is the key feasibility question for the hybrid approach (Paths 1-2 with persistent CRDT state).

6. **How does y-prosemirror v2's delta-based approach handle custom node types compared to v1's XmlElement approach?** The v2 rewrite uses a different mapping architecture that may have different trade-offs for MDX component nodes.

---

## 11. Addendum: MDX Implications for Cross-Mode Sync Architectures (2026-04-07)

*This section extends the original report with findings on how MDX constructs interact with two candidate sync architectures identified during the init-spike validation work. The original analysis (Sections 1-10) remains unchanged. Evidence files for this addendum are in the same `evidence/` directory with `mdx-constructs-inventory`, `observer-sync-with-mdx`, `ytext-canonical-with-mdx`, `disk-bridge-with-mdx`, `comparison-matrix`, and `void-node-tradeoff-revisited` prefixes.*

### Context

The init-spike validated the core editor stack (TipTap + Hocuspocus + Yjs v13). Two sync architectures are now being evaluated to close cross-mode sync gaps (source↔WYSIWYG↔disk):

1. **Observer sync (Explorations 1+2):** Bidirectional observers between Y.XmlFragment and Y.Text, both types in the same Y.Doc.
2. **Y.Text canonical (Exploration 6):** Replace Y.XmlFragment with Y.Text storing raw markdown/MDX. Custom ProseMirror binding.

### MDX Construct Coverage

MDX adds 8 distinct construct types beyond standard markdown. The current void node approach (fenced code block with `jsx-component` info string) handles them as follows:

| Construct | Example | Current Handling |
|-----------|---------|-----------------|
| JSX self-closing | `<Chart />` | Void node (fenced code block) |
| JSX with children | `<Callout>text</Callout>` | Void node (fenced code block) |
| JSX expression props | `data={items.filter(i => i > 0)}` | Preserved in void node string |
| Import statements | `import { Chart } from './charts'` | NOT handled |
| Export statements | `export const meta = {...}` | NOT handled |
| Inline expressions | `{variable}` in paragraph | NOT handled |
| Nested JSX | `<Layout><Card /></Layout>` | Void node (flat string) |
| MDX comments | `{/* comment */}` | NOT handled |

**Evidence:** [evidence/mdx-constructs-inventory.md](evidence/mdx-constructs-inventory.md)

### Observer Sync with MDX

Observer sync handles the 5 constructs encodable as fenced code blocks with confirmed idempotency. The `jsx-component` extension's serialize/parse cycle through marked is stable — special characters in expression props (`{`, `}`, `<`, `>`) are preserved because fenced code block content is opaque to marked.

**Three MDX constructs have no observer sync path:** import/export statements (stripped/cached, invisible to the observer), inline expressions (literal text in marked), MDX comments (literal text in marked). This means source mode via Y.Text shows serialized WYSIWYG content, not the true .mdx file.

**Known bug — triple backtick edge case:** If JSX content contains triple backticks, the fenced code block encoding breaks. Fix: count backtick sequences in content, use N+1 backticks for the fence. Current `renderMarkdown` hardcodes 3 backticks.

**Evidence:** [evidence/observer-sync-with-mdx.md](evidence/observer-sync-with-mdx.md)

### Y.Text Canonical with MDX

Y.Text canonical stores all 8 MDX constructs natively as text. CodeMirror shows the raw .mdx content. Agent writes are trivially simple (natural MDX text insertion).

**The parser problem is blocking.** marked.js cannot parse MDX (confirmed: markedjs/marked#3465, closed as NFE). The ProseMirror binding under Y.Text canonical needs remark-mdx for .mdx files, creating a dual-parser architecture (.md via marked, .mdx via remark-mdx) with distinct conversion paths and doubled idempotency proof requirements.

**Concurrent syntax corruption is the new failure vector.** Y.Text operates at the character level. Two users editing near JSX boundaries can create syntactically invalid MDX. Under Y.XmlFragment with atom nodes, this is impossible — the entire component is one opaque string with last-writer-wins semantics.

**Evidence:** [evidence/ytext-canonical-with-mdx.md](evidence/ytext-canonical-with-mdx.md)

### Comparison Matrix

```
                    Observer Sync          Y.Text Canonical
                    ---------------        ----------------
Fidelity:           7/10                   9/10
                    (3 constructs broken)  (all work, some need parsing)

Concurrent Safety:  9/10                   5/10
                    (atom nodes protect)   (character-level corruption)

Agent Ergonomics:   4/10                   9/10
                    (fenced blocks + APIs) (natural text insertion)

Complexity:         7/10                   5/10
                    (existing code works)  (dual parser, new binding)
```

**Implication:** If the product emphasizes full .mdx compatibility, Y.Text canonical is stronger. If focused on block-level JSX components only (the 80% case), observer sync is simpler and safer.

**Evidence:** [evidence/comparison-matrix.md](evidence/comparison-matrix.md)

### Void Node Trade-off Revisited Under Y.Text Canonical

Under Y.Text canonical, the void node concept transforms from a DATA architecture decision (string attribute on atom Y.XmlElement) to a VIEW/rendering strategy decision (how the ProseMirror binding displays JSX regions). The rendering strategy can evolve without data migration:

- **Stage 1:** Full atom — entire JSX region is non-editable block (simplest, current behavior)
- **Stage 2:** Atom wrapper + editable children (fulfills MDX interleaving promise)
- **Stage 3:** Inline decorations (Obsidian-style, best for developers)

This reframing eliminates 5 of the 6 original failure vectors from this report:

| Original FV | Under Y.XmlFragment | Under Y.Text Canonical |
|-------------|--------------------|-----------------------|
| FV1: remark-mdx indentation drift | Relevant | Reduced |
| FV2: MDAST-to-editor destroys JSX | Blocking | **Eliminated** |
| FV3: Nested prop LWW | Relevant | **Eliminated** |
| FV4: slate-yjs abandoned | Blocking | **Eliminated** |
| FV5: Session boundary tension | Significant | **Reduced** |
| FV6: Nobody has done this | True | Still true |
| NEW: Concurrent syntax corruption | N/A | **New failure vector** |

Net: 4 eliminated, 1 reduced, 1 unchanged, 1 new. The new failure vector produces observable errors (malformed JSX) rather than the silent data loss of the original failure vectors.

**Evidence:** [evidence/void-node-tradeoff-revisited.md](evidence/void-node-tradeoff-revisited.md)

### Disk Bridge with MDX

The disk bridge (@parcel/watcher) needs dual-format persistence for .mdx files. remark-mdx works in Node.js. Three options: internal encoding on load, dual-parser persistence, or unified remark pipeline.

**Evidence:** [evidence/disk-bridge-with-mdx.md](evidence/disk-bridge-with-mdx.md)

---

## 12. References

### Repositories Analyzed

- [mdx-js/mdx](https://github.com/mdx-js/mdx) -- packages/remark-mdx (v3.1.1)
- [syntax-tree/mdast-util-mdx](https://github.com/syntax-tree/mdast-util-mdx) -- v3.0.0
- [syntax-tree/mdast-util-mdx-jsx](https://github.com/syntax-tree/mdast-util-mdx-jsx) -- v3.x
- [syntax-tree/mdast-util-mdx-expression](https://github.com/syntax-tree/mdast-util-mdx-expression) -- v2.x
- [syntax-tree/mdast-util-mdxjs-esm](https://github.com/syntax-tree/mdast-util-mdxjs-esm) -- v2.x
- [micromark/micromark-extension-mdxjs](https://github.com/micromark/micromark-extension-mdxjs) -- v3.x
- [micromark/micromark-extension-mdx-jsx](https://github.com/micromark/micromark-extension-mdx-jsx) -- v3.x
- [micromark/micromark-extension-mdx-md](https://github.com/micromark/micromark-extension-mdx-md) -- v2.x
- [tinacms/tinacms](https://github.com/tinacms/tinacms) -- HEAD of main (2026-04-03)
- [udecode/plate](https://github.com/udecode/plate) -- HEAD of main (2026-04-03)
- [BitPhinix/slate-yjs](https://github.com/BitPhinix/slate-yjs) -- @slate-yjs/core@1.0.2
- [yjs/y-prosemirror](https://github.com/yjs/y-prosemirror) -- v1.3.7, v2.0.0-2
- [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) -- extension-collaboration, @tiptap/y-tiptap@3.0.2
- [Milkdown/milkdown](https://github.com/Milkdown/milkdown) -- v7.20.0

### Issues and Discussions

- [mdx-js/mdx#2533](https://github.com/mdx-js/mdx/issues/2533) -- Indentation drift on multiline expressions (closed, "expected behavior")
- [mdx-js/mdx#1193](https://github.com/mdx-js/mdx/issues/1193) -- MDX whitespace normalization
- [BitPhinix/slate-yjs#390](https://github.com/BitPhinix/slate-yjs/issues/390) -- applyRemoteEvents crashes on text + inline void
- [BitPhinix/slate-yjs#386](https://github.com/BitPhinix/slate-yjs/issues/386) -- Null parent reference during flushLocalChanges
- [BitPhinix/slate-yjs#382](https://github.com/BitPhinix/slate-yjs/issues/382) -- Content duplication on offline reconnection
- [BitPhinix/slate-yjs#391](https://github.com/BitPhinix/slate-yjs/issues/391) -- move_node forward offset miscalculation
- [BitPhinix/slate-yjs#332](https://github.com/BitPhinix/slate-yjs/issues/332) -- Undo removes blocks with remote changes
- [BitPhinix/slate-yjs#343](https://github.com/BitPhinix/slate-yjs/issues/343) -- Empty text nodes not synced
- [yjs/y-prosemirror#116](https://github.com/yjs/y-prosemirror/issues/116) -- Attribute type coercion
- [yjs/y-prosemirror#48](https://github.com/yjs/y-prosemirror/issues/48) -- Doc-level attrs stripped
- [yjs/y-prosemirror#121](https://github.com/yjs/y-prosemirror/issues/121), [#160](https://github.com/yjs/y-prosemirror/issues/160), [#161](https://github.com/yjs/y-prosemirror/issues/161) -- v1 position-tracking bugs
- [tinacms/tinacms#2581](https://github.com/tinacms/tinacms/issues/2581) -- MDX content wiped on nested rich-text save
- [tinacms/tinacms#2580](https://github.com/tinacms/tinacms/issues/2580) -- Single container prevents editing outside
- [tinacms/tinacms#4646](https://github.com/tinacms/tinacms/issues/4646) -- Rich text formatting lost on copy/paste
- [tinacms/tinacms#2564](https://github.com/tinacms/tinacms/issues/2564) -- No error UI for unregistered JSX
- [Milkdown Discussion #772](https://github.com/orgs/Milkdown/discussions/772) -- Community attempt to add remark-mdx
- [Yjs Discussion: best way to store deep JSON objects](https://discuss.yjs.dev/t/best-way-to-store-deep-json-objects-js-object-or-y-map/2223)

### Documentation

- [Plate Yjs documentation](https://platejs.org/docs/yjs)
- [Plate Markdown documentation](https://platejs.org/docs/markdown)
- [Yjs shared types API](https://docs.yjs.dev/api/shared-types/y.xmlelement)

### Evidence Files

- [evidence/conversion-boundaries.md](evidence/conversion-boundaries.md) -- Source-level evidence for all four boundaries
- [evidence/pipeline-comparison.md](evidence/pipeline-comparison.md) -- Feature-by-feature comparison of Plate/Slate vs Milkdown/ProseMirror with test case results
- [evidence/blocking-issues.md](evidence/blocking-issues.md) -- Detailed evidence for each blocking issue with code references
- [evidence/viable-paths.md](evidence/viable-paths.md) -- Architecture details and trade-offs for each viable path
- [evidence/mdx-constructs-inventory.md](evidence/mdx-constructs-inventory.md) -- Full inventory of 8 MDX construct types and current void node handling (addendum)
- [evidence/observer-sync-with-mdx.md](evidence/observer-sync-with-mdx.md) -- Observer sync round-trip idempotency for MDX patterns (addendum)
- [evidence/ytext-canonical-with-mdx.md](evidence/ytext-canonical-with-mdx.md) -- Y.Text canonical parser compatibility and concurrent safety for MDX (addendum)
- [evidence/disk-bridge-with-mdx.md](evidence/disk-bridge-with-mdx.md) -- File watcher and remark-mdx in Node.js context (addendum)
- [evidence/comparison-matrix.md](evidence/comparison-matrix.md) -- Per-construct ratings: fidelity, safety, ergonomics, complexity (addendum)
- [evidence/void-node-tradeoff-revisited.md](evidence/void-node-tradeoff-revisited.md) -- Failure vector reframing under Y.Text canonical (addendum)
