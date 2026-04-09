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

### Session 3 — Post-merge audit (PR #7 integration)

**Trigger:** User created worktree, pulled `origin/main`. PR #7 (commit `8e3845d`: "feat: presence & awareness UX") had merged since the spec was finalized, adding substantive changes to `observers.ts` (+320 lines, delta-based Observer A + typing-defer Observer B + early-exit), `TiptapEditor.tsx` (+292 lines, awareness/cursor wiring, `markUserTyping` listener), and a new `src/presence/` module.

**Audit findings (7 total: 3 high, 3 medium, 1 low — all decision-implicating):**

- **PM-H1 (Prop panel bypasses typing-defer):** Radix popovers portal to `document.body`. `markUserTyping()` is only bound to `editor.view.dom` keydown/paste/drop/cut. Prop panel mutations never trigger the typing-defer, and concurrent agent writes can silently overwrite user prop changes via `updateYFragment` tree replacement. **Applied:** §3.6 now requires every prop panel change handler to call `markUserTyping()`. Added R9 and test CE05. §13 EXCLUDE updated to acknowledge the carve-out.
- **PM-H2 (Observer B early-exit requires byte-identical serialization):** PR #7 added `currentBody === body` early-exit at `observers.ts:288-301`. Prototype tests use `.trim()` which is evidence that cycle 1 is NOT byte-identical. Without fixing, every Observer B fire misses the early-exit and runs destructive `updateYFragment`, disrupting cursors inside NodeViewContent. **Applied:** Added Phase 0 steps 5a and 5b for explicit cycle-1 byte-identity test and Observer B no-op early-exit test. Added R10 (High likelihood, High impact), test scenarios OS06 and OS07, and assumption A8 (pending verification).
- **PM-H3 (Observer A delta-based `applyUserDelta`):** Spec's §2 Tertiary criterion was factually wrong about how Observer A serializes — it's now delta-based, not full serialization. The `applyUserDelta` line-matching via `indexOf` can mis-target duplicate JSX lines. **Applied:** Rewrote §2 Tertiary criterion to describe the delta architecture. Added R11, test scenario OS08, and assumption A7.
- **PM-M1 (Baseline commit stale):** `5597eb7` → `8e3845d`. **Applied.** Added assumption A6 for presence/undo coexistence.
- **PM-M2 (Missing test scenarios):** Added OS06, OS07, OS08, CE05, CE06.
- **PM-M3 (Schema construction order):** `editorSchema` (TiptapEditor.tsx:53) and server `MarkdownManager` (persistence.ts:28) both run at module load, BEFORE the registry exists. **Applied:** Added Phase 1 step 0 to defer schema construction. Added R12.
- **PM-L1 (§13 EXCLUDE overly absolute):** **Applied** — carve-out for typing-defer protocol participation.

**Non-findings (investigated but clean):**
- Presence/undo interaction with prop panel: server-side UndoManager correctly scopes to `'agent-write'` origin on Y.Text; prop panel XmlFragment transactions don't carry that origin.
- yCursorPlugin + NodeViewContent: same pattern as table cells, no conflict.
- Agent flash UX on typed components: works correctly via `Y.Map('activity')`; fine-grained per-component highlighting is a Future Work UX gap but not a spec blocker.

**Live preview analysis (user asked separately):**
Analyzed whether the spec addresses "live preview" for source editing and WYSIWYG. Key findings:
- WYSIWYG IS live preview (sense C: the editor is the render). Already covered by the spec's Primary success criterion.
- Split-pane preview (sense A: source + WYSIWYG side-by-side) NOT addressed. **Critical finding:** architecture supports it nearly for free — bidirectional observer sync keeps both modes live in memory; current `App.tsx` mounts TipTap unconditionally, SourceEditor conditionally. Split-pane = unconditional mount + CSS layout.
- Obsidian-style inline rendering (sense B) deliberately rejected per `mdx-text-editor-preview-approach` report.
- Publish-fidelity preview (sense D) not addressed; low priority unless editor/publish fidelity diverges.

**Applied:** Added split-pane to Future Work (Explored, ~1 day). Added publish-fidelity and Obsidian-style to Future Work (Noted). Added explicit clarification to §2 Tertiary: "WYSIWYG mode IS live preview — components render with their real React implementation in real-time as props and children change."

**Spec status:** Still **Final** — all fixes are additive (new test scenarios, new risks, new assumptions, clearer requirements). No core decisions reopened. Baseline advanced to `8e3845d`. In Scope items still pass the resolution completeness gate; some assumptions (A6, A7, A8) are now "pending verification" in Phase 0/2, which is correct — they require the code to be written to verify.

**Ready for implementation** with the Phase 0 byte-identity gate as the first hard test.

### Session 4 — Scope clarification (built-ins only, custom deferred)

**Trigger:** User asked whether `.openknowledge/*` folder was being set up for component config, and whether the spec defined an entry point contract for custom components. Follow-up questions surfaced scope ambiguity: slash commands vs. drag-and-drop palette, built-ins vs. custom components, drop-in fumadocs support.

**Key evidence gathered:**
- `reports/fumadocs-full-pipeline/evidence/d4-custom-component-registration.md` **CONFIRMED:** Fumadocs uses `mdx-components.tsx` with `getMDXComponents()` returning a flat object. No separate registration API, no plugin system — it's just MDX's `components` prop. The filename is a convention, not a framework requirement.
- `reports/fumadocs-full-pipeline/evidence/d4-custom-component-registration.md` **CONFIRMED:** Fumadocs does NOT use TypeScript prop types for validation or introspection. The visual editor has to add its own extraction layer.
- `@inkeep/docskit/package.json` **CONFIRMED:** Docskit ships only compiled `.js` + `.d.ts` (no source `.tsx`). react-docgen-typescript needs a fallback path for library components without source.

**Scope decisions (user-directed):**
- **Built-ins only in P0.** Custom component discovery, drop-in fumadocs support, and drag-and-drop component palette all move to Future Work.
- **Slash commands stay in scope** — they work on the built-in registry.
- **`.openknowledge/*` is cache-only for P0.** No new user-facing config file (no `.openknowledge/components.ts`). For Future Work, the recommended approach is to reuse fumadocs's `mdx-components.tsx` convention rather than invent a new namespace — this gives drop-in support for free.
- **Drop-in fumadocs support is coupled to custom component discovery.** Both move to Future Work together — one feature, not two.
- **MCP endpoint for agent component discovery:** Future Work (Explored, ~1-2 days). Near-term alternative in Phase 4: generate `init_spike/COMPONENTS.md` from the registry at build time, link from `CLAUDE.md` / `AGENTS.md` so agents learn components by reading the repo.

**Spec updates applied:**
- **§6 In Scope:** Removed custom component discovery language. Clarified that built-ins are 15 components hardcoded in editor source. `.openknowledge/` described as cache-only.
- **§6 Out of Scope:** Added "Custom component discovery," "Drop-in support for existing fumadocs projects," "Component library palette / drag-and-drop insertion" with rationale for each.
- **§6 Future Work (Explored):** Added "Custom component discovery" with the fumadocs `mdx-components.tsx` reuse strategy, noting the `node_modules` compiled-only package challenge. Added "Drop-in fumadocs project support" with agents-docs as reference corpus. Added "MCP endpoint: component registry query" with the Phase 4 COMPONENTS.md fallback noted. Added "Component library palette with drag-and-drop."
- **Phase 1:** Clarified built-ins-only scope. Added detail on source paths for react-docgen-typescript (fumadocs ships source, docskit doesn't — hand-write PropDef for docskit). Created `built-ins.ts` as the canonical list in editor source code.
- **Phase 4:** Added step 4 to generate `init_spike/COMPONENTS.md` from the registry and link it from CLAUDE.md/AGENTS.md for agent discovery.

**Rationale for reusing fumadocs `mdx-components.tsx` (Future Work):**
- Single source of truth (users only maintain one file)
- Drop-in fumadocs compatibility is natural (existing projects already have the file)
- Zero friction onboarding (users already know the pattern)
- No bikeshedding over file names or export formats
- The only wrinkle is library components shipping only `.d.ts` (docskit case) — handled by a manual PropDef override path.

**Spec status:** Still **Final**. Scope narrowed (simpler, clearer Phase 1). In Scope items still pass the resolution completeness gate. Future Work expanded with explicit maturity tiers.

### Session 5 — v2 audit + factual correction on .d.ts extraction

**Trigger:** User requested re-audit after scope narrowing. Two subprocesses spawned in parallel: auditor (coherence sweep) and challenger (design stress-test).

**Auditor findings (11 total: 2 high, 6 medium, 3 low):**
- **H1 (decision-implicating):** Phase 1 step 4 claimed fumadocs-ui ships .tsx source — FALSE. Direct package inspection confirmed the installed `fumadocs-ui` package ships only `dist/*.js` + `*.d.ts`. The cited evidence file was reading the GitHub source tree, not the npm package. This invalidated the extraction plan for 13 of 15 components.
- **H2, M1-M6, L1-L3:** All coherence issues from scope narrowing — stale D5/D15 sentences, duplicate Phase 4 step number, OQ1/OQ2/OQ3 pre-narrowing resolutions, canonical count inconsistency, stale propFilter example, stale "Leaning: Option C" prose, missing Folder in evidence file, stale auto-discovery section.

**Challenger findings (6 total: 3 high, 2 medium, 1 low):**
- **H1 (decision-implicating):** Corpus validation gap — 55% of agents-docs components would fall through to raw-string fallback. Three options: narrow+validate, custom discovery in P0, honest restatement.
- **H2 (decision-implicating):** react-docgen-typescript cannot run against fumadocs-ui (confirms audit H1). Prior session-3 rejection of "drop react-docgen-typescript" based on false premise.
- **H3 (decision-implicating):** Silent namespace collision — agents-docs `<Card>` has different props than fumadocs `<Card>`. Spec had no collision policy.
- **M4:** COMPONENTS.md strictly worse than committed JSON.
- **M5:** Fumadocs mdx-components.tsx reuse has architectural mismatches — it's a function with runtime logic, not a data file. Walking it requires AST walker, not a static scan.
- **L6:** Hand-written PropDef drift detection unspecified.

**Critical factual correction (user D1 question):**
Investigation of react-docgen-typescript source + test suite revealed that **the library DOES support .d.ts extraction**:
- `src/parser.ts:377-409` explicitly handles the `!rootExp.valueDeclaration` case for `ForwardRefExoticComponent`, `FunctionComponent`, `MemoExoticComponent` (the exact patterns compiled libraries use)
- `src/__tests__/parser.ts:48-58` has the test "should parse simple typescript definition file with default export" — directly parses `Stateless.d.ts` and extracts props
- Verified fumadocs-ui's installed `callout.d.ts` has enum unions, prop interfaces, TSDoc comments (`@defaultValue info`), and component signatures — everything needed for extraction

**This invalidated both audit H1 and challenger H2.** The original "fumadocs ships no source" observation was true; the implication "must hand-write PropDef" was false. One pipeline works for all 15 built-ins: point react-docgen-typescript at the installed `.d.ts` files. The only fix needed: change propFilter from blanket `node_modules` exclusion to specific `@types/react` exclusion.

**User decisions:**
- **D1:** Keep react-docgen-typescript for all 15 via `.d.ts` extraction. Strictly better than hand-writing (auto drift detection, TSDoc preserved, no maintenance burden).
- **D2:** Interpretation A — keep all 15 built-ins, built-ins only in P0, custom discovery and drop-in in Future Work. Add real-corpus test (RT07) as secondary validation.
- **D3:** Collision policy — preserve unknown attributes + reserve built-in names (A + C from the options).
- **D4:** Future Work custom discovery = dual-track (Track 1 primary: static `.openknowledge/components.ts`, Track 2 secondary: static-import scan of `mdx-components.tsx`). Optionally Track 3 (full AST walker) as stretch.
- **D5:** Commit `.openknowledge/components.json` instead of generating separate `COMPONENTS.md`. Forward-compatible with MCP endpoint.

**Spec updates applied:**
- **Frontmatter:** Baseline unchanged (still `8e3845d`).
- **§2 Tertiary:** Previously updated for delta-based Observer A (session 3 audit).
- **§3.2:** Updated propFilter example to exclude only `@types/react` (not all node_modules). Removed stale OQ2 "Leaning: Option C" prose. Clarified startup performance for 15 components (<1s cold).
- **§3.8:** Added collision policy (preserve-and-render + reserved built-in names). Renamed section to "Unregistered Component Fallback + Collision Policy."
- **§4 Phase 1:** Rewrote step 4 with the unified `.d.ts` + `.tsx` extraction pipeline across all 15 components. Documented per-file-type extraction paths. Added step 7 per-built-in extraction tests (serves as drift detection). Changed cache file path to `.openknowledge/components.json` (same file as Phase 4 artifact).
- **§4 Phase 4:** Renumbered (was 1,2,3,4,4,5,6 → now 1-8). Replaced COMPONENTS.md generation with committed `.openknowledge/components.json`. Added step 6 real-corpus secondary validation (open agents-docs page, verify built-ins render + customs fall back cleanly). Step 5 updated to reference D15 built-ins instead of stale Note/Warning/Tip.
- **§6 In Scope / Out of Scope:** Minor cleanup from scope narrowing session 4.
- **§6 Future Work:** Rewrote "Custom component discovery" as dual-track (Track 1 + Track 2 + Track 3 stretch). Rewrote "Drop-in fumadocs support" as natural consequence of Track 2 with honest "partial drop-in" framing. Updated MCP endpoint entry to reference committed `components.json` file instead of COMPONENTS.md.
- **§7 Test Scenarios:** Added RT07 (real corpus validation) and RT08 (collision policy).
- **§9 Decision Log:** D5 marked superseded by D15. D15 reworded to "10 families / 15 total" with "custom component discovery is Future Work" clarification (removing stale "user components auto-discovered" trailing sentence).
- **§11 Risks:** R3 likelihood dropped to Low (`.d.ts` extraction verified). R13 added (collision policy — Medium likelihood, High impact, mitigated by preserve-and-render).
- **§12 Open Questions:** OQ1/OQ2/OQ3 resolutions rewritten to match current Phase 1 plan (static from built-ins.ts, no src/components/ scan, cache irrelevant at 15 components).
- **evidence/component-inventory-and-gaps.md:** Added Folder sub-component row. Rewrote "agents-docs Custom Components" section as "Reference Corpus for Future Work" — clarifies that these are NOT auto-discovered in P0 and maps each to the Future Work dual-track path.
- **evidence/react-docgen-typescript-dts-extraction.md (NEW):** Documents the verification that react-docgen-typescript supports `.d.ts` extraction. Evidence: test suite, parser source, live inspection of fumadocs-ui callout.d.ts. Resolves v2 Audit H1 + Challenger H2.

**Challenger L6 (drift detection) — invalidated:** No longer applies because we're not hand-writing PropDef. Phase 1 per-built-in extraction tests (step 7) automatically catch drift on every CI run.

**Spec status:** Still **Final**. All changes are additive or corrective (no core decisions reopened — the `.d.ts` finding is a strengthening of the original session-3 decision, not a reversal). Baseline `8e3845d` unchanged. In Scope items pass the resolution completeness gate.

### Session 5 — Self-assessment of v2 fixes (3 introduced issues caught and fixed)

After applying the v2 audit + challenger fixes, ran a self-assessment per `/eng:assess-findings` to catch any incoherence I introduced during the fix pass. Three issues found:

- **SA1: §6 In Scope line 569 still said `.openknowledge/` was "cache only (`component-cache.json`, gitignored)"** — stale from before the D5 swap to committed `components.json`. Fixed to reference the committed manifest file.
- **SA2: Phase 4 step 4 said "instead of gitignoring it, commit it"** — historical-artifact language from the transition. Phase 1 step 5 already establishes the file as committed; Phase 4 step 4 should only cover discoverability wiring (header comment, AGENTS.md link). Rewrote step 4 to remove the gitignore language.
- **SA3: Phase 1 step 2 example used `require.resolve('fumadocs-ui/dist/components/callout.d.ts')`** — **broken at runtime** because fumadocs-ui's `package.json` `exports` field restricts access to raw `dist/` paths. Verified by reading `docs/node_modules/fumadocs-ui/package.json`: `"./components/*": { "import": "./dist/components/*.js", "types": "./dist/components/*.d.ts" }` — the `.d.ts` is only accessible via TypeScript's type resolution, not Node's module resolution. Rewrote the example to use `path.dirname(require.resolve('fumadocs-ui/package.json'))` + manual dist/ path construction. Also added a "Docskit-specific pattern" section (docskit only exports `./mdx` aggregate, so extraction points at `dist/mdx.d.ts`). Updated `evidence/react-docgen-typescript-dts-extraction.md` with the same gotcha documented.

Additional minor correction: also fixed the `§3.8` collision policy text which said "The 15 component names in D15" but then listed 21 names (sub-components like `Tab`, `Cards`, `Step`, etc. each need individual name reservation). Rewrote to "21 names across the 15 built-in families."

**Spec status:** Still **Final**. Self-assessment caught 3 issues I introduced during session 5 fixes — all fixed before finalization. No outstanding findings. Implementation can proceed with Phase 0 byte-identity gate as the first hard test.

### Session 6 — Observer model refactor integration (post PR #8 + cross-tab fixes)

**Trigger:** User pulled origin/main into the worktree. 13 new commits since baseline `8e3845d` (post-merge audit baseline). Of the 13, 4 are spec-relevant:

- **`9f215ef`** — Observer A now skips remote transactions (`if (!transaction.local) return`). Prevents cross-tab infinite loop.
- **`99ea308`** — Observer B also skips remote transactions. Agent write endpoints now call a new server-side `syncTextToFragment()` helper that writes to both Y.Text AND XmlFragment in a single transaction. Clients receive paired changes via Yjs sync and both observers skip them.
- **`b289cc6`** — Disk bridge feedback loop fixes (writeTracker per-path hash queue, stable file watcher subscription across Vite HMR).
- **`456b6fc`** — jsx-tokenizer test fix (DOMParser dependency removal for Bun/Node test env).

**New observer model:** "Both observers follow the same principle: only process LOCAL changes. Remote changes arrive pre-synced via the Yjs CRDT protocol."

**Impact analysis on session 4/5 spec claims:**

The post-merge audit findings (PM-H1, PM-H2, PM-H3) were based on an observer model where Observer A and Observer B both processed remote transactions. That model is now obsolete. Updated the spec to describe the new local-only observer model without reopening architectural decisions.

**Spec updates applied:**
- **Baseline commit:** `8e3845d` → `02c2211`.
- **§2 Tertiary criterion:** Added local-only observer rule, syncTextToFragment description, disk bridge per-path hash queue note. Clarified that agent writes never trigger client-side Observer A or B at all now.
- **§3.6 Prop panel typing-defer:** Added a "Scope of the race" subsection. Clarified that the original PM-H1 "agent write race" scenario is now fixed at the server layer (via syncTextToFragment paired writes), and the remaining race is the narrower single-user two-pane scenario (WYSIWYG + source simultaneously).
- **§11 R9:** Likelihood dropped from Medium → Low. Impact from High → Medium. Updated description: race is now single-user two-pane, not agent-write collision.
- **§11 R10:** Still High/High (byte-identity is still load-bearing). Scope note added: only LOCAL Y.Text changes trigger Observer B now.
- **§11 R11:** Likelihood dropped from Medium → Low. Updated description: "Y.Text has unsynced content" scenario is rare because agent writes sync both trees server-side.
- **§11 R14 (NEW):** Agent writes + concurrent local prop edits — Yjs merge edge case at the `@tiptap/y-tiptap` layer. Low/Medium. Accepted as P0 edge case with mitigation path documented (flush Observer A before server writes if observed).
- **§10 A7:** Scope note added. OS08 test still valid but exercises only the local Observer A path now.
- **§7 OS07:** Rewrote test scenario to exercise the LOCAL Observer B path explicitly (remote writes no longer trigger Observer B).
- **§7 CE05:** Updated to reflect the new server-side merge path. Still validates end-to-end behavior but the mechanism is now Yjs CRDT merge, not client-side Observer B.
- **§7 CE07 (NEW):** Added the narrower R9 race test — prop panel edit + concurrent local source-mode edit. This is what `markUserTyping()` actually protects against now.

**No decisions reopened.** All changes are factual corrections describing the new observer reality. The spec's architectural plan (Phase 0 byte-identity gate, Phase 1 `.d.ts` extraction, Phase 2 prop panel + typing-defer, Phase 3 inline children) is unchanged.

**Good sign:** The jsx-tokenizer prototype test was updated (`456b6fc`) to remove a DOMParser dependency — meaning the team is already exercising the jsx-tokenizer infrastructure the spec builds on, validating that Phase 0's tokenizer is healthy.

**Spec status:** Still **Final**. Baseline advanced to `02c2211`. Implementation can proceed with Phase 0 byte-identity gate as the first hard test.

### Session 6 — Monorepo restructure adaptation (baseline `12f49c9`)

**Trigger:** PR #10 (`8971f7c spec: CLI packaging as @inkeep/open-knowledge`) landed on `main` on 2026-04-08, restructuring `init_spike/` into a four-package monorepo: `packages/core`, `packages/server`, `packages/cli`, `packages/app`. Worktree merged with `origin/main` at commit `12f49c9`. Spec was written against the pre-restructure layout — every `init_spike/` path is stale and several architectural assumptions broke.

**Audit:** Ran `/eng:audit` producing `meta/audit-monorepo-restructure.md` (14 findings: 5H, 6M, 3L). Verdict: NOT patchable with mechanical rewrites alone — 4 architectural blockers required decisions first.

**Decision 1 — H1: Does `.extend({ addNodeView })` preserve markdown hooks? RESOLVED via source read.**

Read `@tiptap/markdown@3.22.3/src/MarkdownManager.ts:113-120` → `registerExtension()` reads `markdownTokenName` / `parseMarkdown` / `renderMarkdown` via `getExtensionField(ext, ...)`. Read `@tiptap/core@3.22.3/src/helpers/getExtensionField.ts:17-20` → walks `extension.parent` recursively when the field is undefined on the child config. Verdict: app's `.extend({ addNodeView })` inherits core's markdown hooks transparently. The split is safe by construction.

**Spec action:** Added §3.3 "parent-chain invariant" subsection documenting the finding + the hard invariant "schema changes in core only; app `.extend()` for view layer only."

**Decision 2 — H3: Component registry home — 3-way split across packages.**

| Layer | Location | Owns |
|-------|----------|------|
| A: Types + built-ins manifest + factory | `packages/core/src/registry/` | `PropDef`, `ComponentMeta` (no React field), `BUILT_INS[]`, `createJsxComponentExtensions(manifest)` |
| B: Generated cache | `packages/core/src/generated/components.ts` | Extracted `componentManifest` (committed, single `.ts` file — no JSON twin) |
| C: React component map | `packages/app/src/editor/components/componentMap.ts` | Browser-only `Record<string, React.ComponentType>` — imports fumadocs-ui / docskit / shadcn |
| D: Dev script | `packages/core/scripts/build-registry.ts` | Runs `react-docgen-typescript` at dev time, writes Layer B |

Core stays React-free. Server reads the generated manifest directly for `MarkdownManager` schema. App reads the manifest (for PropDef lookup) and the React map (for rendering). Only the dev script depends on `react-docgen-typescript`, held in `packages/core/devDependencies` — never shipped to end users.

**Decision 3 — H3 sub-decision: where does the introspection script live? (ultrathink)**

Considered Option A (CLI subcommand — `open-knowledge build-registry`) vs Option B (core dev script — `packages/core/scripts/build-registry.ts`). Chose B decisively:

- Option A would ship `react-docgen-typescript` + TypeScript compiler (~5-15MB bundled) to every end user of the published CLI for a command they never run. Workarounds (devDep + runtime error, conditional bundling, thin wrapper) all introduced worse UX or broken subcommands.
- Option B keeps the published CLI lean, co-locates input (`built-ins.ts`), tool (`scripts/build-registry.ts`), and output (`generated/components.ts`) in one package, has no build-order bootstrapping loop (runs as raw TS via bun), enables trivial CI drift detection.
- The future MCP endpoint (§6 Future Work) was the strongest argument for A but dissolved — the endpoint reads the committed file and serves JSON over the wire; does not need `react-docgen-typescript`.

**Mitigations for B's discoverability con:** (1) root-level `build-registry` script alias in root `package.json`, (2) one line in root `CLAUDE.md` Commands table, (3) CI drift check that fails loudly + self-documents by existing.

**Decision 4 — M2: One `sharedExtensions` or two?**

Two files stay (`packages/core/src/extensions/shared.ts` + `packages/app/src/editor/extensions/shared.ts`). Given Decision 1, they produce byte-identical schemas today (schema is orthogonal to NodeView). Future risk is someone adding attributes via `.extend({ addAttributes })` in app — Decision 1's invariant prohibits this, and Phase 0 Step 5c adds a **mandatory drift-detection test** (OS09) that asserts `getSchema()` structural equality across both imports, failing CI if the invariant is violated.

**Decision 5 — H5: `.openknowledge/` vs `.open-knowledge/` vs elsewhere?**

Killed `.openknowledge/` entirely. The generated file is a build artifact, not user configuration. Moved to `packages/core/src/generated/components.ts` (regular TypeScript file, committed, ESM-importable). `.open-knowledge/` stays reserved for user YAML config per the CLI packaging spec (`specs/2026-04-08-cli-packaging/SPEC.md`).

**Mechanical rewrites applied (from audit M1-M6, L1-L3):**
- **Baseline commit:** `02c2211` → `12f49c9`.
- **Header Location field:** `init_spike/` → four-package breakdown.
- **§2 Tertiary:** Observer paths corrected to `packages/app/src/editor/observers.ts`. `syncTextToFragment` path corrected from `hocuspocus-plugin.ts:148` → `packages/server/src/agent-sessions.ts:39` + `api-extension.ts:79,160`. Noted that it's now public API of `@inkeep/open-knowledge-server`.
- **§3.1:** Rewritten — 3-way split across packages. Factory-based extension creation. React map in app as Layer D.
- **§3.2:** Rewritten — Node-only dev script at `packages/core/scripts/build-registry.ts`. Documents dev-time execution model, devDep isolation, CI drift check.
- **§3.3:** Added parent-chain invariant subsection; documented factory pattern; updated OQ4 resolution.
- **§3.6:** Clarified `@/editor/observers` alias is package-local to `packages/app/`.
- **§4 Phase 0:** Step 1 rewritten to "wire existing tokenizer" (`packages/core/src/extensions/jsx-tokenizer.ts` already exists). Step 4 → `packages/app/content/test-fixture.md`. Step 5c added — mandatory drift-detection test (OS09). Step 10 → per-package quality gates (root `bun run check` no longer a unified gate).
- **§4 Phase 1:** Step 0 updated with full 9-site schema refactor table. Step 1 updated with per-package dependency placement. Shadcn install target → `cd packages/app && npx shadcn@latest add`. Steps 2-4 rewritten for `packages/core/src/registry/` layout. Step 5 rewritten as dev script + root alias + commit. Step 5a added — CI drift check. Step 8 → per-package gates.
- **§4 Phase 2, 3, 4:** All path references updated. Phase 2 Step 11 added — app must swap BOTH editable + void node types. Phase 4 Step 4 rewritten — update root `CLAUDE.md`, create `packages/core/AGENTS.md`. Verify steps → per-package gates.
- **§5 Tech Stack:** New table with per-package dependency placement rationale.
- **§6 In Scope:** `.openknowledge/` → `packages/core/src/generated/components.ts` with explicit note about `.open-knowledge/` reservation.
- **§7 Test Scenarios:** OS06/OS07/OS08 observer paths corrected. OS09 added (schema-parity drift test).
- **§10 A7, §11 R9/R10/R11:** Observer path references corrected.
- **§11 R12:** Rewritten — 9 sites across 4 packages, not 2. Factory-centralization pattern. Synchronous ESM import eliminates async-boot concern.
- **§11 R14:** `syncTextToFragment` path corrected.
- **§12 OQ1/OQ2/OQ3:** Resolutions updated for new package layout + synchronous manifest import + dev-time extraction.
- **§13 STOP_IF:** `bun run check` replaced with per-package gates; OS09 drift test + CI drift check added as explicit stop conditions.
- **§9 Decision Log:** D17 added consolidating all 5 session-6 decisions with evidence refs.

**Decisions reopened:** None. The architectural plan (Phase 0 byte-identity gate, Phase 1 extraction, Phase 2 prop panel, Phase 3 inline children, Phase 4 polish) is unchanged. The factory pattern makes the registry-driven attributes story explicit rather than implicit.

**Invariants re-verification status:**
- **Preserved (moved only):** Observer A/B, `markUserTyping()`, early-exit logic, disk bridge, `syncTextToFragment` behavior, test-fixture content.
- **Broken by construction in the restructure, now fixed by the spec amendment:** `sharedExtensions` single source of truth (fixed via D17 invariant + OS09), schema construction ordering (fixed via factory centralization + 9-site refactor), single-extension `JsxComponent` (fixed via parent-chain invariant + factory pattern), `MarkdownManager` schema consistency across packages (fixed — core owns all schema fields).
- **Needs empirical re-check during Phase 0:** OS06 byte-identity, OS09 schema parity, OS08 `applyUserDelta` with duplicate JSX lines.

**Spec status:** Still **Final**. Baseline advanced to `12f49c9`. Implementation can proceed with Phase 0 byte-identity gate + schema-parity drift test + tokenizer wire-in as the first hard tests. /ship resumes at Phase 1 exit.
