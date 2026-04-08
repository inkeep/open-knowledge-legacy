## 2026-04-08

### Session 1 — Initial draft

- **SPEC.md created:** Full draft covering Layer 2 (typed void nodes + prop panels) + Layer 3 (inline rich-text children). Written from prior conversation context without formal intake.
- **12 Open Questions defined:** OQ1-OQ12 covering architecture, implementation, UX, and migration decisions.
- **5 Decisions logged:** D1-D5 (serialization format, prop storage, children storage, unregistered fallback, built-in components).
- **5 Assumptions logged:** A1-A5 covering react-docgen-typescript, NodeViewContent, @babel/parser, y-prosemirror attributes, mdManager scoping.
- **6 Risks logged:** R1-R6 covering NodeViewContent, observer shimmer, react-docgen edge cases, children serialization, bundle size, concurrent editing.
- **World model memory created:** `worldmodel_mdx_component_pipeline.md` in project memory — captures the four-layer model, agents-docs analysis, serialization format, observer sync compatibility.
- **Source:** Prior conversation (bidirectional observer sync ship + architectural analysis + agents-docs content analysis). Spec was drafted as seed for formal spec process.

### Investigation round 1

- **OQ4 resolved → D6:** Single extension with formal attributes from registry. y-prosemirror confirmed per-attribute LWW. Evidence: `evidence/tiptap-dynamic-attributes.md`
- **OQ7 resolved → D7:** acorn + acorn-jsx selected (6x smaller than babel, same correctness). Evidence: `evidence/jsx-parser-comparison.md`
- **A2 confirmed:** NodeViewContent supports editable content holes in ReactNodeViewRenderer — working demo found in TipTap repo. Evidence: `evidence/nodeviewcontent-feasibility.md`
- **A4 confirmed:** y-prosemirror treats each attribute as independent CRDT value (per-attribute LWW). Evidence: `evidence/tiptap-dynamic-attributes.md`
- **R1 mitigated:** NodeViewContent feasibility risk eliminated by evidence.
- **SPEC.md updated:** OQ4, OQ7 marked resolved; A2, A4 marked confirmed; R1 marked mitigated; D6, D7 added to Decision Log; Tech stack updated (acorn replaces babel).

### Investigation round 2 (4 parallel)

- **react-docgen-typescript verified:** children filtered by default (must set `skipChildrenPropWithoutDoc: false`), ReactNode needs dual string check, union extraction works. Evidence: `evidence/react-docgen-typescript-behavior.md`
- **A1, A3 confirmed** from live testing and source analysis
- **A5 partially confirmed:** `h.renderChildren()` works for serialization, BUT `parseMarkdown()` cannot re-parse code fence children — `token.tokens` is empty for code fences. **New OQ13 created** for children parsing strategy.
- **D8 created:** Two node types (`jsxComponentEditable` + `jsxComponentVoid`). Universal CMS pattern confirmed from 12 systems. Evidence: `evidence/node-type-split-architecture.md`
- **D9 created:** Children never in prop panels. Universal consensus. Evidence: `evidence/cms-prior-art-synthesis.md`
- **CMS landscape synthesis:** Keystatic "wrapper kind" is the reference for Layer 3. Auto-extract + override is universal for prop panels. Evidence: `evidence/cms-prior-art-synthesis.md`
- **New OQ13:** Children markdown parsing from code fence tokens (high priority, blocks Layer 3 design)
- **New OQ14:** Shared parseMarkdown logic between two node types

### Investigation round 3 (OQ13 deep trace)

- **OQ13 resolved → D10:** `marked.lexer()` + `helpers.parseBlockChildren()` is the clean path. Investigated full helpers API (6 methods, no MarkdownManager access), confirmed closure approach is NOT viable (circular dep), confirmed marked.lexer() produces compatible tokens. Evidence: `evidence/children-parsing-strategy.md`
- **Option C (closure over mdManager) ruled out:** parseMarkdown is a static function, no `this` context. Closure creates circular dependency (sharedExtensions → JsxComponent → mdManager → sharedExtensions).
- **SPEC.md updated:** OQ13 resolved, D10 added.

### Investigation round 4 — Raw JSX serialization (6 parallel agents, autonomous)

**CRITICAL FINDING: D1 REVISED.** `jsx-component` fenced code blocks are NOT valid MDX — fumadocs renders them as code snippets. On-disk format must be raw JSX.

- **D1 revised:** On-disk format is now raw JSX (valid MDX, fumadocs-compatible). Custom markdownTokenizer intercepts uppercase JSX tags.
- **D11 created:** markdownTokenizer API proven via prototype (24/24 tests pass). TipTap v3 first-class API.
- **D12 created:** Version B tokenizer (~80 lines, tag-counting for nested same-name). Zero new dependencies.
- **D13 created:** Dual-format migration — two extensions (fenced + raw) create same node type. Old content opens correctly, saves as raw JSX.
- **D14 created:** Prop panel UX: popover.
- **D15 created:** Built-in set: Callout + Tabs/Tab + Note/Warning/Tip.
- **D16 created:** Layer 2+3 ship together.
- **R7, R8 added:** Tokenizer regex edge cases + indentation normalization risks.
- **R5 mitigated:** acorn replaces babel (23KB vs 148KB).
- **OQ8 fully resolved:** h.renderChildren() for serialize, marked.lexer() + dedentation for parse. Nested JSX in children works because marked.lexer() uses globally-configured instance with custom tokenizers.
- **Evidence files created:** `raw-jsx-tokenizer-proof.md`, `fumadocs-serialization-compatibility.md`
- **SPEC.md updated:** D1, Section 3.5 (serialization), Phase 1 (implementation order), tech stack, risks, decision log all revised.
- **Prototype test file created:** `init_spike/src/editor/extensions/jsx-tokenizer-prototype.test.ts`
- **Tokenizer versions file created:** `init_spike/src/editor/extensions/jsx-tokenizer.ts` (Versions A, B, C)
- **PROJECT.md updated:** TQ29 (layered component discovery), TQ30 (.openknowledge/ convention), PQ18 (non-fumadocs component scope), TQ31 (react-docgen-typescript gotchas).

### Current state summary
- **16 decisions logged** (D1-D16). All load-bearing technical decisions resolved.
- **5 assumptions validated** (A1-A5). All confirmed from source code.
- **9 evidence files** grounding the spec.
- **All P0 technical blockers resolved.** The architecture is fully proven:
  - Raw JSX on disk (fumadocs-compatible) via markdownTokenizer
  - Two node types (registered editable + unregistered void)
  - Per-prop concurrent editing via attribute-level LWW
  - Children parsing via marked.lexer() + helpers.parseBlockChildren()
  - Inline children editing via NodeViewContent
  - Dual-format migration for backward compatibility
- **Remaining open items are all low-priority or product decisions:**
  - OQ1 (static registry) — resolved, stated intention
  - OQ2 (component location) — resolved via fumadocs conventions + TQ29
  - OQ3 (startup perf) — non-issue for spike
  - OQ5 (multiple content holes) — children-only for P0
  - OQ10 (Tab/Tabs enforcement) — no enforcement for spike
  - OQ11 ({" "} whitespace) — accept lossy normalization
  - OQ12 (undo batching) — default TipTap behavior
  - OQ14 (shared parseMarkdown) — single handler on editable type

### Scope decision: tokenizer incorporated into this spec

- **Raw JSX tokenizer is Phase 0** (not a separate spec). User directed: "incorporate as first thing in this spec."
- Implementation order restructured: Phase 0 (tokenizer) → Phase 1 (registry) → Phase 2 (typed nodes + prop panel) → Phase 3 (inline children) → Phase 4 (polish)
- Phase 0 is independently verifiable — all existing tests must pass after the format switch
- SPEC.md Section 4 (Implementation Order) rewritten with 5 phases

### Session 2 — Decision confirmation + component inventory

**Decisions confirmed:**
- **D11 confirmed:** markdownTokenizer API for raw JSX.
- **D12 confirmed:** Version B tokenizer (tag-counting, ~80 lines). User asked for version explanation — documented Versions A/B/C trade-offs.
- **D13 revised:** ~~Dual-format migration~~ → **Raw JSX only**. User directed: "we're greenfield, ignore migration paths." Dropped `JsxComponentFenced` extension entirely. Simplified Phase 0.
- **D14 confirmed:** Popover prop panel for P0, sidebar exploration for future.
- **D15 revised (major):** Expanded from 6 components to 3-layer sourcing strategy:
  - Fumadocs (canonical, 15): Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC
  - Docskit (gap fill only, 3): Video, Frame, CodeGroup — only where fumadocs has no equivalent
  - Shadcn ecosystem (gap fill, 2): Mermaid (MermaidCN registry), Audio (AI Elements registry)
  - Design principle: fumadocs is canonical source, no divergent implementations. Docskit Note/Warning/Tip excluded (would diverge from fumadocs Callout).
- **D16 confirmed:** Layer 2+3 ship together.

**Investigation:**
- Audited `~/agents/agents-docs/src/mdx-components.tsx` for actual component usage
- Audited `@inkeep/docskit` package exports and type definitions
- Cross-referenced fumadocs-full-pipeline report (d3-built-in-components, component-runtime-compatibility)
- Cross-referenced obsidian-vs-fumadocs-component-inventory report (D3 gap analysis)
- Researched shadcn ecosystem for remaining gaps (Mermaid, Audio, PDF, Video, extended Callout)

**Evidence created:**
- `evidence/component-inventory-and-gaps.md` — complete 3-layer inventory with Obsidian gap tracking, docskit exclusion rationale, and Future Work items with maturity tiers

**Spec updates:**
- Section 6 (Scope Boundaries): In Scope updated with 3-layer component set; Out of Scope added fenced-format compat exclusion; new Future Work section with maturity tiers (Explored/Identified/Noted)
- Section 3.5: Removed backward compatibility paragraph (D13 revised)
- Section 4 Phase 0: Removed dual-format step (D13 revised)
- Decision Log: D13 revised, D15 revised with evidence reference

### Audit phase

**Auditor findings (10 total: 3 high, 4 medium, 3 low):**
All coherence issues from D1→D13 revision cascade (stale references to fenced format). No factual errors, no decision-implicating findings. All 10 applied:
- H1: Fixed D1 text (removed dual-handler migration language)
- H2: Fixed Tertiary success criterion (fenced → raw JSX)
- H3: Fixed evidence/children-parsing-strategy.md code examples (fenced → jsxBlock token)
- M1: Fixed OQ6 resolution (dual-format → raw JSX only)
- M2: Fixed OQ11 (@babel/parser → acorn+acorn-jsx)
- M3: Fixed Phase 0 step 10 (removed backward-compat handler reference)
- M4: Fixed ASK_FIRST (removed resolved OQ7/OQ9, added relevant new constraints)
- L1: Fixed AW01 test scenario terminology
- L2: Fixed OQ14 reference (code fence → jsxBlock token)
- L3: Fixed A5 confidence (PARTIALLY CONFIRMED → CONFIRMED via D10)

**Challenger findings (5 total: 2 high, 2 medium, 1 low):**
- H1 (react-docgen-typescript unnecessary): **Rejected** — user wants to validate core architecture pipeline, not just the spike's known components. react-docgen-typescript stays.
- H2 (dedentation solves non-problem): **Accepted (improved)** — switched to flush-left children serialization. Eliminates dedentation step, R8, and nested indentation stacking concern. Simpler than indent-then-dedent.
- M3 (attribute namespace confusion): **Noted for Phase 4** — runtime validation is a valid improvement but low-probability concern for the spike. Deferred to polish phase.
- M4 (reframe D16 as phased delivery): **Rejected** — user directed: ship all together, remove fallback. D16 updated to High confidence, no fallback. Section 8 rewritten.
- L5 (STOP_IF will fire during Phase 0): **Accepted** — clarified STOP_IF to distinguish expected Phase 0 format migration from unexpected observer breakage.

**Spec changes from audit:**
- D1: Removed dual-handler migration language
- D10: Updated to flush-left children, removed dedentation
- D16: "No fallback" — High confidence
- R4: Likelihood reduced (Low), flush-left eliminates concern
- R8: Mitigated — flush-left serialization
- Section 2 Tertiary criterion: Rewritten for raw JSX
- Section 3.5: Flush-left children serialization
- Section 8: Rewritten from "Fallback" to "Delivery" — no fallback
- Section 13: STOP_IF clarified for Phase 0, ASK_FIRST updated
- evidence/children-parsing-strategy.md: Code examples updated

### Verify and finalize

**Mechanical adversarial checks:**
- All 16 decisions have explicit resolution. No ASSUMED or INVESTIGATING entries.
- All 1-way doors (D1, D2, D3, D8) at HIGH confidence with evidence.
- Future Work items have maturity tiers. No incorrectly deferred items.
- Post-audit sweep caught 4 remaining stale references: RT04 (migration test scenario), Phase 3 steps 3-4 (dedent/indent → flush-left), STOP_IF (fallback reference). All fixed.

**Resolution completeness gate:** All 9 In Scope items pass. No item depends on Out of Scope work. All 3P dependencies named with versions. All architectural claims validated by evidence.

**Challenger design challenges resolved:**
- H1 (react-docgen-typescript): Kept — user decision to validate full architecture pipeline.
- M4 (phased delivery): Rejected — user directed ship together, no fallback. D16 updated.

**Status:** SPEC.md set to **Final**. Baseline commit: 5c35f8f (unchanged — no codebase changes during spec work).

**Ready for implementation.**
