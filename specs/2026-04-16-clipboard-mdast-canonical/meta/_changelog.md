# Spec Changelog

Append-only history of spec process events. Session-scoped; preserves audit trail across iterative runs.

---

## 2026-04-16 — Spec kickoff

- Scaffolded spec directory, SPEC.md, evidence/, meta/.
- Baseline commit stamped: `0e2ed52`.
- Research substrate: `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` Parts 1 + 2 + 3 plus 8 evidence files.
- Intake complete: SCR problem statement + 5-probe stress test pass. Demand real, status quo non-viable for agent-native wiki, narrowest wedge = WYSIWYG rich-paste, future-fit MORE essential (agent workflows move content between tools).
- 1P investigation:
  - Custom node renderHTML confirmed (wikiLink → `span[data-wiki-link]`, jsxComponent → `div[data-jsx-component]`, jsxInline → `span[data-jsx-inline]`, rawMdxFallback → `div[data-raw-mdx-fallback]`). All use private `data-*` attrs keyed to their `parseHTML` rules for self-round-trip.
  - Current PM→mdast handlers emit custom nodes as `html` mdast passthrough with raw source. Works for markdown round-trip, but means `remark-rehype` would emit `[[Page]]` / `<Component>` as literal text in text/html output — a problem for rich-paste destinations.
  - Unified deps already installed: `unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-frontmatter`, `mdast-util-*`, `@handlewithcare/remark-prosemirror`. Need to add: `rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify`.
  - Paste fidelity test infrastructure already exists: `packages/app/tests/stress/paste-fidelity.e2e.ts` + `test:e2e` script.
  - `y-codemirror.next@0.3.5` does not override CM6 copy/paste — no conflict with our planned domEventHandlers.
- New decision surfaced by 1P investigation: custom-node HTML emission strategy (not covered in research report). Adding to backlog.

## 2026-04-16 — Decision batch 1 resolved

User resolved all 7 items in decision batch 1:

- **D3 + D4 confirmed** (cross-view text/html emission via mdast-to-html in both views — greenfield amendment LOCKED).
- **D7 per-node HTML rendering shapes approved** (wikiLink→`<a class="wiki-link" data-*>`; jsxComponent→`<pre class="mdx-component"><code>`; jsxInline→`<span class="mdx-inline">children</span>`; rawMdxFallback→`<pre class="mdx-fallback"><code>` + leading `<!-- Parse error: reason -->`). Q1 resolved.
- **D8 markdown-first on ambiguous paste LOCKED** (hard-coded `true`, no config option). D15 added capturing no-config choice. Q2 resolved.
- **Q4 resolved via FR-19:** copy-inside-code-block emits canonical fenced code block — natural output of pipeline, zero extra code.
- **D9 LOCKED: ship full panel of 6 cleanup plugins day-one** (GDocs, Word/mso-*, Cocoa, Gmail, Notion-whitespace-preserve, VS Code structural fallback). Investigation confirmed no standard OSS packages exist — all DIY. See evidence/d9-rehype-cleanup-landscape.md.
- **Q6 resolved via FR-18:** performance instrumentation added; structured JSON console.warn mirrors existing `mdx-block-fallback` / `unknown-mdast-type` patterns at `packages/core/src/markdown/parse-with-fallback.ts` and `index.ts`.
- **D14 added** — mechanism refinement: WYSIWYG copy/cut/dragstart uses DOM-level `handleDOMEvents`, NOT PM's `clipboardTextSerializer` + `clipboardSerializer` dual hooks. Cleaner single control point; symmetric with Source view's `domEventHandlers`; BlockNote production pattern. Refines D3's mechanism without changing intent.

Added FR-17 (promoted Should → Must — Cmd+Shift+V escape hatch is architectural requirement), FR-18 (perf instrumentation), FR-19 (copy-in-code-block canonical form).

Added evidence/d9-rehype-cleanup-landscape.md documenting the DIY-vs-standard-OSS investigation.

Updated §16 Agent Constraints: full plugin list, new mdast-to-hast-handlers.ts file, D14-based DOM-level handler choice.

All P0 open questions resolved. Spec is draft-complete; ready for audit (Step 6).

## 2026-04-16 — Audit + /assess-findings (Steps 6+7) + decision batch 2 under strict greenfield

### Audit (Step 6)

Parallel subagents (auditor + challenger) completed. Auditor: 10 findings (2 HIGH, 4 MEDIUM, 4 LOW). Challenger: 12 findings (3 HIGH, 6 MEDIUM, 3 LOW).

### Assess findings (Step 7) — applied /assess-findings protocol adversarially

**Auto-applied (14 findings):** FR-12 + §13 stale mechanism refs updated; NG4 collision resolved (CLAUDE.md-NG4 references renamed); FR-8 wording reconciled with Q1 data-attrs; Source paste collapsed from 5 to 4 branches (text/x-gfm redundant); §8 rawMdxFallback renderHTML corrected; Q1 data-resolved rationale added; D14 BlockNote line range 176-235; FR-18 "mirrors" semantically qualified; A6 grep specifics recorded; FR-21 added (paste-size ergonomic guard — proactive, not reactive); NG9 added (complex tables); NG4 extended (mixed-paste image behavior); §13 #8 elevated (simulateCopyAndRead harness day-one + 5 scenarios); FR-20 added (custom-node HTML escape correctness).

**Declined (2):** Challenger #5 (config for prioritizeMarkdownOverHTML — user explicit preference was hard-code); Challenger #11 (decision log renumber — challenger's own tradeoff analysis unfavorable).

**Confirmed no action (2):** Auditor #7 (D9 fingerprint gap — folded into decision batch 2 Q9 reopen → now fully closed by expansion to 9 plugins); Challenger #10 (module naming consistent).

### Decision batch 2 reopens

Three challenger HIGH findings survived assessment as decision-implicating reopens. Initial recommendation drifted toward pragmatism (narrow Q8, narrow Q9). User reaffirmed greenfield posture verbatim — "don't worry about breaking changes or blast radius, NO DEFERRED TECH DEBT" — triggering recalibration.

### Decisions locked under strict greenfield recalibration

- **Q7 → Option B (PM hooks).** D14 LOCKED. `clipboardTextSerializer` + `clipboardSerializer` (DOMSerializer subclass) for WYSIWYG; Source view retains `EditorView.domEventHandlers` (no PM-equivalent API). Drag-and-drop preserved by PM's default handlers automatically; `data-pm-slice` wrapped around our canonical HTML resolves challenger #1's cross-PM-editor interop concern.
- **Q8 → Option A (full mdast promotion).** D7 LOCKED. wikiLink/jsxComponent/jsxInline/rawMdxFallback promote from `html` passthrough to first-class mdast types. Markdown handlers emit bit-exact source (no persistence regression); HTML handlers emit per Q1 shapes. Fixes the existing type lie rather than preserving it.
- **Q9 → Option A (expanded to 9 plugins).** D9 LOCKED. Day-one panel covers all 9 D13 fingerprints. Closes Auditor #7 gap (expansion from 6 to 9).

### Cascade applied

- FR-1 + FR-12 rewritten around PM hooks (no more `handleDOMEvents` on WYSIWYG).
- FR-9 expanded from 6 to 9 plugins with real-sample-fixture protocol.
- FR-16 upgraded Should→Must; added 3 drag scenarios day-one.
- FR-21 added (chunked Y.Text insertion for pastes >500KB); A7 superseded.
- FR-22 added (drag-and-drop MIME parity).
- §14 Risks "Observer-B re-parse latency" mitigation flipped from reactive to proactive (references FR-21).
- §13 Next-Action #6 rewritten for PM hooks; Next-Action #8 elevated `simulateCopyAndRead` helper to day-one + 5 minimum scenarios.
- §15 Future Work cleaned: removed day-one items; replaced with "Incremental Observer B re-parse" + "rehypeStripInlineImages opt-in".
- §16 SCOPE updated: 9 plugins + fixtures; PM-hooks wiring in TiptapEditor.tsx; `mdast-to-hast-handlers.ts` new file.
- §16 STOP_IF expanded with FR-20/FR-21 failure conditions + explicit prohibition on DOM-level WYSIWYG override (would re-introduce D14's rejected coupling).
- evidence/d9-rehype-cleanup-landscape.md updated to list all 9 plugins with reference implementations.

All P0 decisions now LOCKED. 15 decisions in log (D1-D15), all with resolution status. Q1-Q9 all Resolved. Ready for Step 8 (Verify + finalize).

## 2026-04-16 — Finalization (Step 8)

### Mechanical adversarial self-checks passed

- **ASSUMED decisions:** none. All 15 decisions at LOCKED (13) or DELEGATED (1: D13 package layout) or DIRECTED (1: D8 ambiguous-paste policy). D8 is DIRECTED because the behavior is LOCKED by D15 (hard-code `true`); D8 keeps DIRECTED because the "policy vs mechanism" split is legitimate (D8 = we pick markdown-first; D15 = we don't expose a config knob).
- **1-way-door confidence gaps:** all 1-way-doors (D3, D4, D10) cite research evidence at HIGH confidence.
- **Non-goal accuracy:** NG1-NG9 each has a revisit trigger or explicit NEVER justification. NG3 (CKEditor-grade Word lists) and NG9 (complex tables) are the most load-bearing NOT NOW items — both have clear revisit conditions keyed to user-reported pain.
- **No TBD/TODO/FIXME/PENDING markers** in SPEC.md (grep confirmed).

### Resolution completeness gate — In Scope items

- ✅ All decisions made (15 LOCKED/DIRECTED/DELEGATED, 0 INVESTIGATING, 0 ASSUMED blocking)
- ✅ 3P dependencies named: rehype-parse, rehype-remark, remark-rehype, rehype-stringify (all unified-ecosystem, institutional)
- ✅ Architectural viability: PM hook composition verified in `prosemirror-view/src/input.ts`; CM6 domEventHandlers verified at `@codemirror/view/dist/index.d.ts:1198`; unified pipeline compatibility confirmed via existing `packages/core/package.json` infrastructure
- ✅ Integration feasibility: Observer bridge invariants preserved (Source paste user-origin per §D23 research); schema-add-only respected (zero schema edits)
- ✅ Acceptance criteria verifiable: FR-1 through FR-22 all have concrete pass/fail conditions; `simulateCopyAndRead` harness day-one (FR-1/FR-2/FR-4 verifiable in CI)
- ✅ No dependency on Out of Scope items

### Future Work maturity tiers

- Explored (3): BlockNote-style private MIME, Cmd+Shift+C plain-text copy, CKEditor-grade Word list reconstruction — each has recommended approach + revisit triggers.
- Identified (3): Incremental Observer B re-parse, rehypeStripInlineImages opt-in plugin, Playwright cross-browser clipboard virtualization edge cases — each has "what we know" + "what investigation is needed."
- Noted (3): Mobile clipboard edge cases, accessibility (screen-reader-friendly text/plain), analytics on paste-source distribution.

### Baseline commit updated

From `0e2ed52` (session start) to `bb655f7` (finalization). Reflects codebase state this spec was last verified against.

### Quality bar

- Problem framing: SCR format + 5-probe stress test pass ✅
- Persona + journey coverage: 3 personas, 5 WYSIWYG + 4 Source + cross-view scenarios ✅
- FR acceptance criteria: 22 functional requirements, all with concrete pass/fail ✅
- Decision log: 15 decisions, all with Resolution + Evidence + Implications ✅
- Risks with proactive mitigations (flipped from reactive during batch 2) ✅
- Agent Constraints: SCOPE (9 plugins + 3 shared modules + 2 wiring sites) / EXCLUDE / STOP_IF / ASK_FIRST ✅
- Evidence files persist factual findings (D9 landscape) ✅

### Status

SPEC.md status: **Approved**. Ready for `/decompose` into spec.json or direct `/implement`.
