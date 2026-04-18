# Spec Changelog

Append-only history of spec-level events, decisions, and process transitions.

---

## 2026-04-14 — Scaffold

- Spec created at `specs/2026-04-14-component-blocks-v2/`
- Worktree: `.claude/worktrees/component-blocks-v2` on branch `worktree-component-blocks-v2`
- Baseline commit: `db8a6d6` (main HEAD at scaffold)
- Problem statement drafted in SCR format; 5-probe stress-test passed (summary in chat)
- Initial scope hypothesis: Layer 2 (typed props) + Layer 3 (inline children) + block-UX Phase 1 in scope; block-UX Phase 2 (keyboard nav Esc/Enter) pending §Decision batch 1
- D0 LOCKED: supersede PR #23 + block-editor-ux SPEC (driven by audit findings H1-H4)
- D1 PROPOSED: single-node schema shape under R10 (routing between widen vs two-node add)
- A1-A4 recorded

## 2026-04-14 — Worldmodel harvest + PR #105 discovery (major cascade)

- Worldmodel agent returned: `evidence/worldmodel.md` (1500 words, per-finding confidence)
- **Critical discovery:** PR #105 (MDX Tolerant Parsing, open, 11/13 checks) is an active in-flight dependency that explicitly names Component Blocks v2 as downstream
- PR #105 delivers: R1 agnostic MDX mode (no acorn), R3 `jsxInline` PM node at Layer 3 target shape, R4 drops `remark-directive`, R5 `rawMdxFallback` PM node, R6 block-level split-then-rejoin fallback, R9 `isolating: true` on jsx nodes, R10 schema add-only invariant (CI-enforced), R13 y-prosemirror patch
- **A1 confirmed HIGH:** `MdxJsxAttribute.value` is directly readable for literals/booleans; expressions carry raw string
- **A2 confirmed HIGH:** children are standard mdast, reusable through existing walker
- **A3 confirmed HIGH but PARTIAL:** need two packages (`extension-drag-handle` + `extension-drag-handle-react`); runtime probe still needed for CollaborationCursor collision
- **A4 REFUTED:** 21-entry manifest has 5 stale entries — only 16 fumadocs resolve; `@inkeep/docskit` not installed; `ui/mermaid.tsx` and `ui/audio.tsx` don't exist
- Decision log revised: D1 reopened against R10; D2-D5 added as decisions needing user input
- Revised decision batch presented to user: #105 ordering, schema shape under R10, expression-attr handling, built-ins scope correction, Phase 2 keyboard nav

## 2026-04-14 — Architecture convergence (MDX editor research + serializer probe + y-prosemirror research)

- Three research threads completed:
  1. MDX editor component patterns (`mdx-editor-component-patterns.md`) — convergent signal: runtime-registration editors (MDXEditor, Plate, TinaCMS) use ONE document-model type; compile-time-schema editors (BlockNote, Sanity) use N types. Custom-component requirement puts us in the runtime camp.
  2. Serializer probe (`serialize-roundtrip-probe.md`) — 10 test cases: 5 IDENTICAL, 5 DIFFERS, **10/10 idempotent**. Library default indentation stacking is load-bearing concern (CommonMark 4-space ambiguity at depth 2+); custom flush-left handler required.
  3. ProseMirror schema evolution (`prosemirror-schema-evolution.md`) — y-prosemirror has ZERO `isAtom` references; atom→non-atom widening is safe; `content: 'block*'` accepts zero children; `block+` would auto-insert empty paragraphs (round-trip hazard).
- **D1 locked: Option A-prime — one widened `jsxComponent` node, MDXEditor descriptor pattern**
- **D2 locked: hard-depend on PR #105 as predecessor**
- **D3 locked: 18 components for P0** (16 fumadocs + Mermaid + Audio shadcn wrappers); docskit as Future Work
- **D4 locked: Block-UX Phase 2 keyboard nav IN P0**
- **D5 locked: Expression attrs via JSON.parse fallback for simple literals; raw-string for complex**
- NG6 flipped to NEVER (two-node split); custom-component requirement is the decisive argument
- Assumptions A5-A10 added/updated
- Custom component discovery explicitly moved from Future Work to P0 scope (user directive: "custom components are definitely a requirement to account for")

## 2026-04-14 — /assess-findings self-critique + γ dirty-tracking pattern

- User directive: assess my own proposed D6 flip (α → β) with evidence scrutiny before locking
- Phase-1 investigation revealed binary α-vs-β framing was WRONG:
  - Option α (eager reconstruction) violates #105's "raw content passes through unchanged" invariant for pristine nodes on unrelated saves (normalizes even when user didn't touch the component)
  - Option β (sourceRaw authority with refresh-on-edit) has a children-edit plumbing gap that collapses back to α
- **Option γ (dirty-tracking hybrid) emerged as architecturally correct:**
  - `sourceDirty: boolean` attr on jsxComponent/jsxInline
  - Origin-aware observer plugin marks dirty on user-intent transactions (guards: sync-from-text, sync-from-tree, agent-write, rollback-apply)
  - nodeHandler branches: pristine → sourceRaw (byte-identical), dirty → reconstruction (NG12 normalized)
  - ~75-95 LoC overhead; matches codebase fidelity-pattern precedent (sourceDelimiter, sourceFenceChar on marks/blocks)
- **D6 locked: γ pattern**
- **D8 locked: Inline Layer 3 IN P0** — once γ infrastructure is in scope, inline L3 adds only ~140 LoC and the exclusion creates UX fragmentation (block editable, inline read-only)
- **D7 locked: custom flush-left `mdxJsxFlowElement` to-markdown handler** (probe evidence: library default indents children 2-space-per-depth, 4-space code-block ambiguity at depth 2+)

## 2026-04-14 — One-way-door audit: #105 amendments not required

- User directive: identify load-bearing one-way doors between our spec and #105
- Audit result: **NONE of proposed amendments (A1 sourceDirty on jsxInline, A2 §16 prose update, A3 observer plugin scaffold) are load-bearing**
- All are evolvable within our own spec scope:
  - A1: R10 permits adding attrs with defaults; we add sourceDirty when we need it
  - A2: pure documentation; #105's text is descriptive, not prescriptive
  - A3: plugin registers at editor/app level; no #105 code change needed
- **D2 refined: no #105 amendments required.** Coordination collapses to mechanical post-merge rebase.
- One minor concern flagged: R10 snapshot-test implementation quality is TBD; worst case is a test-fix in our implementation phase, not a blocker

## 2026-04-14 — D9 lock: custom component registration via `.open-knowledge/components.ts`

- P0 supports custom components via explicit registration file (`.open-knowledge/components.ts`)
- File-system scanning (`mdx-components.tsx` auto-discover) deferred to Future Work as convenience layer
- D9 locked; NG1 refined accordingly
- D10 locked: custom components ARE in P0 scope (user directive)

## 2026-04-14 — Full SPEC cascade (γ + inline L3 + no #105 amendments + explicit registration)

- SPEC.md rewritten end-to-end to reflect D1-D10 locked decisions
- §9 Architecture rewritten around γ pattern + descriptor registry + inline-L3-symmetry
- §13 In Scope expanded: inline L3 extensions, source-dirty observer plugin, `.open-knowledge/components.ts` loader
- §3 Non-goals: NG6 (two-node split) and NG7 (eager α reconstruction) locked as NEVER
- §14 Risks: no #105 coordination risk; added source-dirty observer correctness risks (Q3 matrix test)
- §15 Future Work: file-system scanning, docskit components, multi-content-hole, inline slash insertion, schema versioning
- Ready for audit + challenger dispatch (Step 6 of /spec protocol)

## 2026-04-14 — Carry-forward audit assessment: 26 Apply items cascaded from T1 + T3 findings

Two Opus /eng:audit subagents surfaced 29 actionable findings (20 KEEP + 9 DISCUSS) from T1 (typed-component-nodes SPEC + rebased implementation) and T3 (block-editor-ux SPEC + its audit/challenger outputs). After adversarial assessment via /eng:assess-findings (each "missing from our spec" claim verified by reading SPEC.md; each "critical implementation trap" cross-checked against cited source), 27 findings classified as Apply, 1 as Escalate, 1 as Decline. This entry logs the cascade.

**Schema + descriptor completeness:**
- §9.2 expanded with full discriminated-union PropDef (salvaged verbatim from pr23-rebase types.ts — illegal states unrepresentable)
- `JsxComponentDescriptor` split: `JsxComponentMeta` (core, React-free) + `JsxComponentDescriptor` (app, adds `Component`); core/app split made explicit
- Added descriptor fields: `description` (MCP agent discoverability P4), `searchTerms` (slash-menu fuzzy match), `emptyChildName` (FR-16a containers)
- Built-ins manifest populated with T1 curation verbatim (Callout → ['note','warning','tip','info','alert'], etc.)

**γ serialization correctness (critical — caught real bug):**
- §9.4 `reconstructAttrs` clarified to MERGE semantics: start from preserved mdast `attributes`, overlay descriptor-mapped structured attrs; descriptor wins ONLY for PropDef-declared keys; all other keys pass through verbatim
- Prevents γ-dirty path from silently dropping user-supplied attrs not in descriptor (e.g., agents-docs `<Card color="#F05032" external>` vs fumadocs Card)
- M10 test codifies this: edit unknown-attr-bearing component → save → unknown attrs still present
- FR-21 added as explicit requirement

**NodeView implementation traps (6 items, all from pr23-rebase production-hardened code):**
- §9.7/§9.8 NodeView code rewritten with: `ComponentErrorBoundary` per-instance wrap (FR-19), `setNodeSelection(getPos())` click handler for non-atom nodes (FR-17a), PropPanel `onMouseDown` stopPropagation wrapper (FR-13a), breadcrumb on child selection (FR-13b), empty-panel suppression for ReactNode-only descriptors (FR-11 clause), hover outline CSS (FR-20)
- Each trap has a specific bug signature it prevents; each has source cited from pr23-rebase

**Build script correctness (§9.9):**
- Explicit `react-docgen-typescript` propFilter rules (filter ONLY @types/react + node_modules/react — NOT blanket node_modules, which drops fumadocs-ui's own props → single most load-bearing line)
- `resolveDts()` helper pattern for `exports`-restricted packages (avoids ERR_PACKAGE_PATH_NOT_EXPORTED)
- `getDefaultProps` fallback ladder for slash-insert UX (FR-14a — "insert Callout → see a Callout")
- Explicit DELETE: acorn + acorn-jsx (obsolete under agnostic mode + D5)
- `.extend()` vs wholesale Node.create discipline (preserves R10 snapshot ordering)

**Block UX Phase 1 expansion (§9.10):**
- Full drag-handle integration contract: NodeViewWrapper `data-drag-handle=""` + `draggable="true"`, `contentEditable={false}` on handle elements, onNodeChange dedup semantics, lockDragHandle/unlockDragHandle lifecycle
- Empty-container placeholder for Steps/Tabs/Cards/Files (FR-16a) with hardcoded `emptyChildName` mapping
- Q8 added: `@tiptap/extension-node-range` peer-dep claim from T3 is UNVERIFIED — npm registry JSON says it's NOT a peer of drag-handle-react@3.22.3; probe during Phase 1

**Block UX Phase 2 expansion (§9.11):**
- L1/L2/L3/L4 tiered delivery with explicit MVP floor (L1+L2+L4) + L3 descope path (Explored Future Work if edge cases resurface)
- L3 return-false error-handling contract: command fails closed on unexpected state (no partial DOM mutation across isolating boundary)

**Test coverage expansion (new §7a, ~90 scenarios across 11 areas):**
- HH (hover handle), BS (badge suppression + breadcrumb), PI ("+" insertion), KN (keyboard nav L1-L4), FP (floating PropPanel), EB (error boundaries), ES (empty panel suppression), HO (hover outline), MR (multi-client), PD (PropDef controls), IN (inline L3), CC (custom components), DD (descriptor dispatch)
- Acceptance-criteria layer for implementers; M-series remains outcome layer
- M9-M12 added to outcome metrics (isolating-boundary safety, unknown-attr preservation, error-boundary isolation, empty-container UX)

**Accessibility (new §14, renumbers §15/§16/§17):**
- Full WCAG 2.1 per-surface section ported + extended from T3 §14
- ARIA labels for ComponentToolbar, PropPanel (block + inline), SideMenu, UnregisteredBadge/InlineBadge
- Tab key decision matrix (4 contexts × expected behavior)
- Focus trap inside Radix Popover; focus return on Esc
- Reduced-motion respect for transitions
- Live-region announcements for NodeSelection / block-transition / deletion

**Assumptions & Non-goals:**
- NG8 added: custom `handleDrop` drop-target restriction (paired with NG4)
- Q7/Q8 added to Open Questions

**Declined:** `@tiptap/extension-node-range` as required peer dep (evidence: npm registry JSON lists only `@tiptap/extension-drag-handle`, react, react-dom, `@tiptap/pm`, `@tiptap/react`). Held as Q8 integration probe — installable if Phase 1 surfaces a runtime need.

**Escalated to user:** T1 DISCUSS-2 — wildcard NodeView visual design. Our clean badge vs T1's inspectable raw-JSX view. HIGH-confidence lean: clean badge (consistent with Notion/Plate prior art + our "best product experience without over-engineering" directive). Counter-argument: "bring your own markdown" users editing files they didn't author may want to see unknown component's attrs at-a-glance rather than switch to source mode. Pending user input.

## 2026-04-14 — Cross-check: `.mdx` admission claim (stale-worktree false positive)

User surfaced a claim from the #136 implementation agent that `.mdx` files are NOT admitted at the file-system layer (7 gates listed with file:line references). Investigation determined the agent's claim is based on a stale worktree (`spec+mdx-tolerant-parsing` is 25 commits behind origin/main, does NOT have PR #126, has no `doc-extensions.ts`). On origin/main (our baseline 699a27e):

- `schema.ts` default glob: `['**/*.md', '**/*.mdx']` — both included
- `file-watcher.ts` uses `isSupportedDocFile()` — covers both extensions
- `content-filter.ts` uses `stripDocExtension()` — handles both
- `backlink-index.ts` has dedup logic for `foo.md` + `foo.mdx` coexistence
- `normalizeDocName` in MCP tools accepts both extensions
- Dedicated regression test: `packages/app/tests/integration/mdx-extension.test.ts` — end-to-end `.mdx` watcher→CRDT
- Dedicated API test: `api-create-page.test.ts:116` — `.mdx` creation via REST

Our A12 assumption (`.mdx` first-class post-#126) is correct and verified. No spec changes required — only strengthened A12's evidence citation to reference the specific integration tests that regression-guard this.

## 2026-04-14 — Address real-world #136 implementation finding (inline JSX zero-affordance)

**Finding from #136 implementation testing:** `<CodeBlock> Hello </CodeBlock>` on a single line tokenizes as `mdxJsxTextElement` → jsxInline (micromark's rule: single-line balanced JSX is always inline). The shipped jsxInline renders as `<span data-source-raw="..." contenteditable="false">{children}</span>` — the tag name is only in a data-attribute, invisible. Users see just "Hello" with no indication it's a component.

**Does our spec address this?** Yes, but with one explicit gap now closed:

**Gap found and closed:** our §9.4 serializer and §9.8 NodeView both read `node.attrs.name`, but the shipped jsxInline only has `{ attributes, sourceRaw }`. Our spec implicitly assumed `name` existed without calling it out as a schema addition.

**SPEC edits:**
- **FR-4 expanded:** jsxInline gets TWO R10-additive attrs via `.extend()`: `sourceDirty` (dirty-tracking) AND `name` (component name for descriptor dispatch + badge rendering). Explicitly called out, not implicit.
- **§9.1 architecture:** updated jsxInline attrs list to include `name`; updated NodeView behavior (removes `contenteditable: false` for both registered and wildcard descriptor paths)
- **§9.3 parse handler:** added `handlers.mdxJsxTextElement` full implementation that extracts `name` from `mdxJsxTextElement.name` and stashes on PM node attrs
- **§9.3 new note:** explains micromark's single-line-vs-multi-line tokenization rule; documents that both paths have valid NodeView rendering via our descriptor dispatch; users who want block rendering must use multi-line form (byte-identity preservation principle — we don't override)
- **§9.8 new section:** InlineBadge visual contract with P0 CSS; explains the #136 finding explicitly so future readers understand the context
- **§5 user journeys:** added single-line inline case (the exact scenario the user tested); clarified tokenization note

Our spec now explicitly addresses the observed behavior. The "zero visual affordance" gap the reviewer called out is eliminated by our `JsxInlineView.tsx` + descriptor dispatch + `name` attr.

## 2026-04-14 — Rebase onto post-#136 main

**PR #136 merged 2026-04-14 22:29 UTC** — shipped the full #105 implementation. Baseline commit moved from `db8a6d6` → `699a27e`. 16 new commits on main since our initial baseline.

**Shipped primitives we now inherit:**
- `packages/core/src/extensions/jsx-inline.ts` — at Layer 3 target shape, `contenteditable: false` (transitional)
- `packages/core/src/extensions/raw-mdx-fallback.ts` — parse-failure fallback
- `packages/core/src/extensions/jsx-component.ts` — now has `isolating: true` (R9); still atom (we widen)
- `packages/core/src/markdown/parse-with-fallback.ts` — R6 block-level split-then-rejoin
- `packages/core/src/markdown/remark-mdx-agnostic.ts` — R1 agnostic mode
- `packages/core/src/markdown/unknown-mdast-guard.ts` — R8 catch-all
- `packages/core/src/markdown/ref-def-hoist.ts` — R11
- `packages/core/src/markdown/fence-regions.ts`
- `packages/core/src/metrics/parse-health.ts` — R14 observability
- `packages/core/src/schema-invariant.test.ts` + `schema-snapshot.json` — R10 enforcement
- `patches/y-prosemirror@1.3.7.patch` — R13 patch (100 lines, real — not vaporware as the research caveat had flagged)
- `packages/server/src/{api-extension,external-change,persistence,agent-sessions}.ts` — migrated to parseWithFallback

**Other post-db8a6d6 PRs with implications for us:**
- **PR #128** (Observer A origin-aware diff) merged — `ORIGIN_TREE_TO_TEXT` / `ORIGIN_TEXT_TO_TREE` exported constants; `applyUserDelta` rewritten to DMP three-way merge with Item-preservation gate. Our source-dirty observer consumes this origin model cleanly (A11).
- **PR #126** (.mdx first-class) merged — `doc-extensions.ts` module; our component editing applies to both `.md` and `.mdx` uniformly (A12).
- **PR #127** (file-tree "+" for new file/folder) merged — different UX surface from our block-level SideMenu "+"; no conflict.
- **PR #39** (Timeline with rollbacks) merged earlier — `'rollback-apply'` LocalTransactionOrigin present; in our deny-list.

**Key verification via shipped code:**
- **A10 CONFIRMED:** reading shipped `schema-invariant.test.ts:118-130` — the content-expression strict-equality check has `if (expected.content !== '')` exception. Widening jsxComponent from `atom` (content: '') to `content: 'block*'` passes the test. Snapshot regeneration is the standard additive path.
- **A5 CONFIRMED:** R10 enforcement test active on main; adding our new attrs to jsxComponent is tested.
- **A4 CONFIRMED SHIPPED:** all #105 primitives landed as spec'd.

**SPEC edits:**
- Header: baseline → 699a27e; "Predecessor (merges first)" → "Foundation (shipped on main)"; added Related recent PRs section
- §1 Resolution: references #136 baseline not #105 in-flight
- §8 Current state: fully rewritten to enumerate shipped artifacts + what we add
- §11 Q3: enumerated the 4 known origins from shipped code
- §12 Assumptions: A4, A5, A10 upgraded to ✅ CONFIRMED / SHIPPED; A11 and A12 added
- §13 Next actions: removed "wait for #105 merge" step
- §14 Risks: removed #105 slippage risk; added A11 conflict risk and widened-node-vs-paragraph-lift risk
- §16 Agent constraints: STOP_IF updated to remove #105-wait and add A11 coordination

## 2026-04-14 — G9 cascade: per-node rendering independence (ancestor-chain locality)

User directive: "in view or editing, one broken node shouldn't affect nodes/elements not in its ancestor chain." Principle mapped to two architectural edits plus comprehensive test coverage. Eliminates the "freeze" concept entirely — WYSIWYG always renders current Y.Text state via `parseWithFallback`; broken nodes degrade only their minimal enclosing ancestor. Multi-session analysis preceded cascade: walked typing states 1-4 for `<Accordions><Accordion>` nested editing, identified State-3 shattering as today's recursive split-then-rejoin failure mode, verified via `/explore` that Observer B is the SOLE `mdManager.parse` caller that freezes on failure (every other caller — persistence, external-change, rollback, agent-sessions — already uses `parseWithFallback`).

**Architectural decisions:**
- **D11 LOCKED:** Bridge always-live. Observer B flip + `findFallbackRegion` minimize-first widen-iterative. 1-way door (Observer B behavior change touches bridge semantics).
- **Freeze concept dissolved:** Observer B's try/catch + "keep last valid XmlFragment" pattern is removed. No notion of "pause" or "sync paused" indicators needed. Both modes always reflect current Y.Text state.

**New goal:**
- **G9 Per-node rendering independence (ancestor-chain locality):** A broken node affects only its own ancestor chain — never siblings, sibling-descendants, or unrelated subtrees. Both modes always render. Broken blocks → `rawMdxFallback` chrome in place; structured siblings + ancestors unaffected.

**New functional requirements:**
- **FR-22:** Observer B at `observers.ts:461` flips from bare `mdManager.parse(body)` (with try/catch swallowing `SyntaxError | VFileMessage | RangeError`) to `mdManager.parseWithFallback(body)`. `parseWithFallback` is total — no freeze path remains.
- **FR-23:** `findFallbackRegion` in `parse-with-fallback.ts:214` refined to minimize-first widen-iterative. Algorithm: compute minimal candidate region → try excising surround → if surround parses clean use minimal region, preserving outer structure; else widen to next enclosing paired tag and retry, up to `MAX_WIDEN_ITERATIONS = 4`. Falls back to current blank-line block bounds on loop exhaustion. Applies to EVERY `parseWithFallback` caller (unified improvement, not Observer-B-specific).

**Test scenarios added (§7a):**
- **MR series extended (MR04-MR08):** multi-region independence at top level; edit-one-component-doesnt-touch-others (verified via render-count); fix-one-broken-region-preserves-others; document-level liveness denial regression guard.
- **NB series (NB01-NB08):** nested broken preserves siblings/ancestors. Covers the State-3 shattering regression, widen-iteration termination, `MAX_WIDEN_ITERATIONS` enforcement, fence-awareness preservation.
- **TP series (TP01-TP06):** typing preserves principle. Per-keystroke rawMdxFallback in block being typed, never in surrounds. Bridge always-live contract. Mode-toggle no-op at data layer. Observer A DMP merge + Observer B parseWithFallback interaction under concurrent cross-mode edits.
- **M13:** outcome metric binding MR04+NB+TP into one rollup assertion for G9.

**Scope changes:**
- §13 In Scope: added `packages/app/src/editor/observers.ts` (narrowed surgical edit only) and `packages/core/src/markdown/parse-with-fallback.ts` (narrowed surgical edit only). Both call out precisely which function/line changes.
- §17 Agent constraints: EXCLUDE narrows — removed `parse-with-fallback.ts` (SCOPE for FR-23) and `observers.ts` (SCOPE for FR-22). Added explicit narrowed-edit-only notes + new STOP_IF and ASK_FIRST clauses to protect bridge invariants and prevent scope creep beyond the two function edits.

**Architecture doc (§9.1 + new §9.13):**
- §9.1: added "Bridge always-live contract (G9, FR-22 + FR-23)" sub-diagram to the architecture pseudocode.
- §9.13: NEW subsection with precise BEFORE/AFTER code sketches for both edits — `observers.ts:461` replacement and `findFallbackRegion` rewrite with `parsesCleanly` helper. Complexity bound (`MAX_WIDEN_ITERATIONS = 4`), rationale for the cap, behavior-change matrix across 5 pre/post scenarios.

**Risks added (§15):**
- FR-22 per-keystroke flicker risk: mitigation via existing TYPING_DEFER_MS (300ms); G9 confines flicker to single broken block.
- FR-23 quadratic worst-case: bounded by `MAX_WIDEN_ITERATIONS`; fast-path abort on first parse success.
- FR-23 fixture-snapshot regressions: strictly wider-or-equal behavior; snapshot regeneration is the standard path.
- Observer B EXCLUDE-boundary perception: bridge invariants preserved, single-line call-site change.

**Files affected in this cascade:**
- `SPEC.md` §2 Goals (+G9), §6 Requirements (+FR-22, FR-23), §7 Metrics (+M13), §7a Test Scenarios (+MR04-MR08, +NB01-NB08, +TP01-TP06), §8 Current State (updated observers.ts + parse-with-fallback.ts + "missing" list), §9.1 Architecture (+Bridge always-live contract), §9.13 NEW (+edit sketches), §10 Decision Log (+D11), §13 In Scope (+observers.ts + parse-with-fallback.ts narrowed edits), §15 Risks (+4 rows), §17 Agent Constraints (narrowed EXCLUDE, new STOP_IF + ASK_FIRST).

**No carry-forward debt.** G9 was the last architectural principle missing from the spec. Test coverage closes the loop: MR+NB+TP series provide acceptance criteria for the implementer; M13 rolls up into the outcome metrics gate.

## 2026-04-14 — Q9 + Q10 resolution via codebase evidence

User challenged two parameter/mechanism choices I proposed as open questions. Investigation against the actual `observers.ts` implementation dissolved both:

**Q9 — `MAX_WIDEN_ITERATIONS` cap:** REMOVED. The widen loop is naturally bounded by MDX ancestor depth (`findEnclosingPairedTag` returns null at the outermost tag); identity guard catches non-monotonic regex bugs. An artificial cap would force returning a worse (coarser) fallback in deeply-nested cases where widening would converge at depth 5+, directly violating G9. Per-iteration cost is one `parse()` call on strictly-smaller-than-original source. FR-23 updated; §9.13 code sketch simplified to `while (true) { ... break }`. §15 risk row re-scoped from "quadratic worst-case" to "non-monotonic widening due to bug" (mitigation = identity guard). §17 STOP_IF reworded. NB05 + NB08 rewritten as natural-termination tests; new NB09 covers identity-guard regression.

**Q10 — source-mode-typing defer:** NOT NEEDED. Code trace of `observers.ts:403-419` + `:542-548`:
- `TYPING_DEFER_MS=300ms` exists to protect the user's cursor + in-flight WYSIWYG keystrokes from being obliterated by `updateYFragment`'s destructive tree replacement — the user's cursor is IN XmlFragment during WYSIWYG typing. Source-mode typing keeps the cursor in CodeMirror (bound to Y.Text directly); `updateYFragment` on XmlFragment doesn't touch that cursor. The mechanism doesn't translate because source mode doesn't have the cross-surface cursor-clobber problem.
- `DEBOUNCE_MS=50ms` (observers.ts:548) already coalesces rapid Y.Text updates into Observer B runs regardless of origin surface.
- Early-exit at observers.ts:442 already skips `updateYFragment` when XmlFragment already serializes to the current Y.Text body.
- So the asymmetry is correct, not incomplete. FR-22's authoring UX was originally risk-flagged as "per-keystroke WYSIWYG flicker in source mode"; re-scoped to "block being typed in visibly updates through rawMdxFallback → structured lifecycle" — expected always-render behavior, not a defect. Q10 removed from open questions.

**Lesson for this cascade:** both items I initially framed as "open questions" were resolvable by reading `observers.ts` in detail. The Q9 cap was invented to hedge against a pathological case that the natural bound already handles; the Q10 defer was invented by conflating "flicker" (cosmetic) with "cursor-clobber" (functional) — only the latter exists, and it's already addressed on the only side that has the problem.

## 2026-04-14 — FR-23 algorithm rework: single-pass enumeration replaces widen-iterative (critical correctness fix)

User challenge: "for any open product or technical questions that you auto-resolved or didn't ask me about, can you check if we actually had strong evidence?" Surfaced a concrete algorithmic bug in the prior FR-23 draft and led to a cleaner algorithm.

**Bug found in prior FR-23 draft:** `findEnclosingPairedTag(src, candidate.start - 1)` was proposed as the widen step. Code tracing against `parse-with-fallback.ts:164-194` revealed the function's `bestOpen` loop sets `bestOpen` to the last open tag with `match.index ≤ offset` **regardless of whether that tag was closed before `offset`**. Correct for the original use (error offset inside an unclosed partial tag) but WRONG for widening when the widen offset falls between a closed sibling and the broken inner candidate. Trace through NB01 (`<Accordions><Accordion>First</Accordion><Accordion><Image src="</Accordion></Accordions>`): widening from second Accordion would pick first Accordion as `bestOpen` (closed sibling with a matching `</Accordion>` after the widen-offset) → widened region = `{first_Accordion.start, second_Accordion.end}` → excision leaves valid `<Accordions></Accordions>` → loop converges → **FIRST Accordion collapses into rawMdxFallback**, violating G9.

**Root cause:** widen-iterative was solving a symptom (the source has ancestors we need to identify) with the wrong primitive (`findEnclosingPairedTag` isn't designed for ancestor-walking; it's designed for error-offset region-finding). A proper algorithm needs a stack-based scan that tracks still-open-at-offset state.

**New algorithm (FR-23, single-pass structural enumeration):**
- `enumerateFallbackRegions(src)` — fence-aware single scan. Open tag push; close tag pop-to-matching-name, emitting (a) an unmatched-open region for each tag above the match (evicted tags, end = close.start capped by blank line), (b) a paired region for the match itself. Self-closing `<Foo />` never enters the stack. Orphan closes dropped. Tags remaining on stack at EOF become unmatched (end = src.length capped by blank line).
- `findFallbackRegion(src, errorOffset)` — returns the smallest region (pair or unmatched-open) whose span contains `errorOffset`. Falls back to blank-line block bounds if no region contains the offset.

**Why one pass suffices:** for any broken node, the innermost containing region is either a properly-paired ancestor OR an unmatched-open region representing the broken node's own partial structure. Excising that region always leaves a structurally-balanced surround. No validation loop needed.

**Critical upgrade vs. widen-iterative:** the unmatched-open enumeration specifically handles **Scenario B'** (inner child that never closes, outer wrapper properly paired). The broken child's unmatched-open region = `child.start → parent_close.start`; excision removes ONLY the dangling child, preserving the outer wrapper and its closed siblings. Widen-iterative couldn't express this cleanly because the broken child isn't in the "pairs" list at all.

**SPEC edits:**
- **G9 goal text:** "minimize-first widen-iterative" → "single-pass structural enumeration (stack-based enumeration of pairs + unmatched-opens)."
- **FR-23 (§6):** complete rewrite around `enumerateFallbackRegions` + innermost-containing selection. No iteration, no cap, no try-excision-validate. Adds irreducible-gap note for tokenizer-disagreement on exotic malformed tags.
- **§9.1 architecture pseudocode:** bridge always-live sub-diagram rewritten — now shows stack-based emit + smallest-containing selection; drops `MAX_WIDEN_ITERATIONS` reference (which I had missed updating when initially dropping the cap — caught during this sweep).
- **§8 current state:** parse-with-fallback.ts description updated; "what's missing" entry updated.
- **§9.13:** title updated; Edit 2 code block replaced with full `enumerateFallbackRegions` + `findFallbackRegion` reference sketch (~70 LoC). Behavior-change-summary table expanded with unmatched-child row. `findFallbackRegion` no longer takes `parse` parameter (not needed without validation loop).
- **§13 In Scope:** parse-with-fallback.ts entry updated to mention `enumerateFallbackRegions` helper addition; notes that `findEnclosingPairedTag` may be removed or retained.
- **§15 Risks:** shape-change row updated (strictly finer-or-equal vs strictly wider-or-equal); non-monotonic-widening row replaced with tokenizer-disagreement + enumeration-sanity rows.
- **§17 STOP_IF + ASK_FIRST:** FR-23 STOP clauses rewritten around enumeration correctness invariants. ASK_FIRST for parse-with-fallback.ts notes `findEnclosingPairedTag` retention is implementer's call.
- **D11 decision-log rationale:** updated to reflect the new algorithm AND explicitly cite that the widen-iterative draft had a bug uncovered in evidence audit, which motivated the single-pass rewrite. Evidence entry expanded.
- **NB series (§7a):** NB01-NB07 rewritten around the new algorithm mechanism (pair/unmatched enumeration + innermost selection). NB08 repurposed as "single `parse()` invocation per `parseWithFallback` at depth 0" regression guard against any future widen-or-validate reintroduction. NB09 rewritten as the load-bearing Scenario-B' unmatched-open test. NB10 added for self-closing handling. NB11 added for top-level unmatched-open with blank-line cap.

**Lesson (meta):** the evidence audit the user requested caught a bug I'd missed when I was confident in my own sketch. The algorithm rework that resulted is cleaner AND strictly more capable than what I originally proposed. User-requested evidence audits are load-bearing; the cost of one turn of pressure-testing saved a round-trip in implementation (and a subtle G9 violation in production).

## 2026-04-14 — Post-rework audit + challenger cycle (opus, parallel), findings assessed via /assess-findings

Dispatched fresh opus auditor + challenger via `/nest-claude` after FR-23 rework. Delivered 5 audit findings (2 high, 3 medium) + 10 challenger findings (3 high, 4 medium, 3 low). One cross-finding duplicate merged (A-M3 ≡ C-L8, useMemo violation). Two of my own desk-assessments triggered opus `/explore` sub-investigations: (i) micromark-extension-mdx tokenizer behavior on malformed tags + expression-attribute brace handling, and (ii) y-prosemirror `updateYFragment` + `equalYTypePNode` behavior for non-atom content-bearing nodes with deep-equal attrs. First subagent returned clean empirical fixtures; second subagent crashed silently with empty output so I read y-prosemirror source directly at `node_modules/y-prosemirror/src/plugins/sync-plugin.js:929,993,1162-1294`.

**Two escalations routed to user (both accepted with my leans):**
- **A-H1/A-M2 (NB09 promise vs reality):** safe coarsening in v1; malformed-open TagEvent documented as Future Work precision enhancement. User approved.
- **C-H1 (bundle FR-22 with v1 vs separate PR):** keep bundled. User approved.

**11 findings applied to spec:**

| ID | Finding | Change applied |
|---|---|---|
| A-H2 | §17 stale "widen-iterative" reference | §17 line updated to "single-pass structural enumeration via `enumerateFallbackRegions`" |
| A-M1 | M13 metric references stale `MAX_WIDEN_ITERATIONS` | M13 rewritten to measure single-pass guarantees (O(n) scan, exactly-one-`parse()`, two-layer idempotence mitigation) |
| A-M3 / C-L8 | useMemo at §9.7:730 violates CLAUDE.md React Compiler convention | `useMemo` removed; replaced with IIFE-wrapped plain computation |
| C-M4 | "Irreducible gap" → "Accepted gap" relabel | FR-23 "Known irreducible gap" replaced with "Safe-coarsening guarantee (v1)" section documenting both coarsening cases (unclosed-quote + brace-depth) + "Precision enhancements (Future Work, reversible)" section listing malformed-open TagEvent (~30-40 LoC, recovers case 1) + brace-depth tracking (~10 LoC, recovers case 2) |
| C-L9 | D11 missing early-exit mitigation citation | D11 evidence list expanded to cite `observers.ts:442` early-exit as flicker-surface bound |
| C-L10 | FR-9 "hidden via CSS" under-specified | FR-9 now specifies `display: none` on NodeViewContent wrapper + notes that schema still permits children via `block*` (forward compat) |
| C-M7 | FR-22 missing Observer A rawMdxFallback handling note | FR-22 now explicitly cites `packages/core/src/markdown/index.ts:696-699` (Observer A serializes rawMdxFallback via `{ type: 'html', value: textContent }` — byte-preserving) |
| C-H2 | G9 framing lacks explicit trade-off acknowledgment | G9 gains "Explicit design trade-off (anti-freeze bias)" paragraph documenting the WYSIWYG-stability-during-source-typing vs document-wide-liveness trade |
| C-M6 | Per-block alternative (rejected) — 1-sentence D11 rationale | D11 rationale (6) now explicitly cites why per-block parsing fails for multi-line JSX containers (Accordions/Tabs/Steps span multiple blank-line blocks) |
| C-M5 | Brace-depth tracking necessity | Documented in FR-23 "Safe-coarsening guarantee" as precision enhancement, not correctness requirement (verified empirically: `<Comp filter={x > 5}>` parses correctly through micromark, so `scanTagEvents` only runs when doc also has an unrelated error — and even then, safe coarsening applies) |
| C-H3 | Observer B re-parse × sourceDirty × updateYFragment interaction | FR-22 gains "Two-layer idempotence mitigation" subsection citing (1) `observers.ts:442` early-exit and (2) y-prosemirror `equalYTypePNode` + `equalAttrs` deep-compare at sync-plugin.js:929,993 — verified non-atom `jsxComponent` uses surgical `setAttribute` (line 1171-1189), not delete+reinsert, even when recursion runs |
| A-H1 + A-M2 | NB09 promise vs algorithm reality | NB09 expected output rewritten to honestly describe safe-coarsening behavior (whole `<Accordions>` collapses when inner child has unclosed quote); FR-23 Future Work section flags malformed-open TagEvent as the precision upgrade that recovers the original Scenario-B' UX |

**Cross-spec consistency:** all stale "widen-iterative" / "MAX_WIDEN_ITERATIONS" references swept (§17, M13). Intentional contrastive references (§9.13 BEHAVIOR table, NB08 test, D11 rationale citing the bug-and-fix history) retained.

**Empirical evidence collected this cycle:**
- `evidence/` — auditor findings + challenger findings files preserved as audit trail (`meta/audit-findings.md`, `meta/design-challenge.md`). Kept as-is; not merged into permanent evidence since they represent one cycle's cold-reader feedback.
- Subagent investigation artifacts at `/tmp/explore-mdx-tokenizer.txt` (micromark fixture results) and direct y-prosemirror source reads documented inline in D11 + FR-22 evidence citations.

**Lesson (meta):** this cycle vindicated the /assess-findings protocol. Out of 14 de-duplicated findings, 11 applied + 2 escalated + 0 declined — suggesting the auditor and challenger were well-calibrated cold readers. The `/explore` subagent pattern worked well for the mdx-tokenizer investigation (clean empirical results), less well for the y-prosemirror investigation (empty output — infrastructure flake; recovered by doing the investigation directly). Takeaway: when a subagent crashes silently, don't re-dispatch blindly — check whether I have enough context to do it myself first.

## 2026-04-14 — Fidelity-first cascade: fumadocs CSS bridge + nested CodeMirror + Context Bridge commitment + custom-components flip (D12, D13 LOCKED)

Four research subagents (fumadocs-container-behavior, fumadocs-ecosystem, storybook-ecosystem, cm-in-pm-nested-editor-architecture) landed in succession. Post-read consolidation surfaced a **fidelity priority shift** from the user: "fidelity with their rendering components is top priority. we want wyswig to feel as real as possible. and to be clear: i think whatever components we include will just be part of our default editor/etc. -- supporting a customer's custom components is a later out of scope issue." Greenfield principle reinforced: "don't lean heavily on 'Defer to future', don't worry about breaking changes or blast radius, NO DEFERRED TECH DEBT." This directive reshaped the cascade.

**Two new LOCKED decisions:**

- **D12 LOCKED — Fidelity via direct fumadocs-ui imports + Context Bridge Registry.** Under "fidelity is top priority," reject the Tier 3 rewrite strategy proposed in `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` §4 (would diverge editor render from production render). Keep importing fumadocs-ui components directly. Solve the portal-context-mismatch problem via Context Bridge Registry infrastructure rather than rewriting containers. Architecturally correct per "two staff engineers" test.

- **D13 LOCKED — CM-in-PM nested editor for rawMdxFallback is P0.** `reports/cm-in-pm-nested-editor-architecture/REPORT.md` (1048 lines) recommends with HIGH confidence: direct PM transaction dispatch, NOT y-codemirror.next (avoids dual-observer conflict with y-prosemirror). Unified undo via PM history. Strong reuse from `SourceEditor.tsx` via `createNestedCMExtensions` factory. Canonical PM tutorial pattern + per-instance theme Compartment + lazy-init via click-to-edit. ~350 LoC + comprehensive test plan. Greenfield directive: no deferred tech debt — implement now.

**Two FLIPPED decisions (preserved for re-spec):**

- **D9 FLIPPED → NG13.** Was: "Custom component registration via `.open-knowledge/components.ts` explicit config file, LOCKED." Flipped by user directive: custom components are a later out-of-scope issue. Full prior analysis preserved in `evidence/custom-components-deferred.md` (9 sections: design, persona, MCP discovery, styling isolation, prior art references, open questions, original §9.12 snapshot, test scenarios, re-spec entry criteria).

- **D10 FLIPPED → NG13.** Was: "Custom components IN scope — not Future Work, LOCKED." Flipped alongside D9. Priority shifts to fidelity for the 18-component built-ins set. Styling isolation for user components deferred.

**Two new architectural precedents** (extend the 11 CLAUDE.md precedents):

- **Precedent #22 — Direct PM dispatch for nested editors.** Embedded editors inside PM NodeViews always dispatch PM transactions, never bind directly to Y types. Prevents dual-observer CRDT conflicts with y-prosemirror.

- **Precedent #23 — Context Bridge Registry for compound React components across NodeView portals.** Ancestor NodeViews publish React Context values to a registry keyed by PM node identity; descendant NodeViews walk the PM tree, look up ancestor bridges, and re-provide in their own React subtree. Solves the TipTap portal architecture's inability to propagate context from parent NodeView to child NodeView.

**Functional requirements added (FR-24..FR-28, FR-30..FR-35):**

| FR | Subject | Rationale |
|---|---|---|
| FR-24 | Render-failure editability (Option C4) — ComponentErrorBoundary gets `childrenFallback` + Retry button + read-only sourceRaw display + key-on-attrs auto-retry | C-H2 + user-approved; G9 consistency; parse/render failure asymmetry table |
| FR-25 | CSS variable bridge for fumadocs-ui (new §9.7a, ~80 LoC in globals.css) | FR — ends "components render unstyled" state; verified via both fumadocs researches |
| FR-26 | `fumadocs-core/link` + framework `Image` graceful degradation — no shim needed | Empirically verified at `node_modules/fumadocs-core/dist/chunk-K4WNLOVQ.js`; previously proposed shim dropped |
| FR-27 | Context Bridge Registry — pending research subagent #26; spec commits to architecture, exact contract TBD | Required for fumadocs Tabs/Accordion/Folder fidelity |
| FR-28 | build-registry diagnostic emission for known extraction failures (forwardRef, Omit/Pick, generics) | Storybook Issues #14798, #15334, #28269 document silent failures |
| FR-30..FR-35 | Nested CodeMirror in `rawMdxFallback` NodeView (full set: NodeView wiring, PM history delegation, typing-defer forwarding, per-instance theme Compartment, stopEvent/ignoreMutation, direct-PM-dispatch pattern) | CM-in-PM research HIGH-confidence recommendation |

**Non-goals added (formalized):**

| NG | Scope | Prior treatment |
|---|---|---|
| NG9 | Transformation UI (rename `<Callout>` → `<Note>` via menu) | Was informal NG; now explicit. Future Work Explored. |
| NG10 | Per-block source-mode toggle on any block | Was "Future Work Explored" lean; now explicit NG aligned with NG9. |
| NG11 | Conditional prop visibility (`hidden(props)`) | Swept 18 built-ins; no component needs it. Speculative complexity. |
| NG12 | Edited-node quoting normalization | Formalized in §3 (was referenced without definition in G5/§5/§6/§7/§15). |
| NG13 | User-registered custom components | D9 + D10 flip landing point. Evidence file preserves full prior design. |

**New sections (spec ~1500 → ~1900 lines):**

- §9.0 Architectural precedents (introduces Precedent #22 + #19)
- §9.7a Fumadocs CSS Integration (full globals.css addition, ~80 LoC, with explicit NOT-imported rationale)
- §9.14 Nested Editor Architecture (CM-in-PM synthesis + data flow + keybinding contract + extension reuse + lazy-init strategy; references research report §§1,3,6,7,8,10,11 for detail)
- §9.15 Context Bridge Registry — placeholder pending research subagent #26; captures architectural commitment, FR-27 contract shape, rejected alternatives, research-tracking

**Modifications:**

- §3 Non-goals: +NG9, NG10, NG11, NG12 (formalized), NG13 with `evidence/custom-components-deferred.md` reference
- §6 FR-8: drop user-config loading branch (D9 flipped)
- §6 FR-24..FR-28, FR-30..FR-35: added
- §9.2 PropDef: +`hidden?: boolean` with JSDoc; PropPanel filter updated to `descriptor.props.filter(p => !p.hidden && p.type !== 'reactnode')`
- §9.7 ComponentErrorBoundary: rewritten render() for Option C4 (Retry button, childrenFallback, sourceRaw display, key-on-attrs pattern in JsxComponentView usage)
- §9.8 JsxInlineView: mirrored Option C4 boundary config
- §9.9 build-registry: +`emitExtractionDiagnostic` function with heuristic Props-interface detection
- §9.12: gutted; replaced with pointer to `evidence/custom-components-deferred.md`
- §10 Decision log: D9 + D10 status annotated FLIPPED; D12 + D13 added LOCKED
- §17 EXCLUDE: `observers.ts` + `parse-with-fallback.ts` narrowed edits (unchanged from prior turn)

**Evidence files added/updated:**
- `evidence/custom-components-deferred.md` — 9-section capture of custom-components design work (310 lines)
- `reports/context-bridge-registry-architecture/` — pending (subagent #26 in flight)
- `reports/cm-in-pm-nested-editor-architecture/` — subagent #20 landed; 1048-line REPORT + 3 evidence files
- `reports/fumadocs-container-behavior/` — subagent #22 re-dispatch landed; 451-line REPORT + 11 evidence files
- `reports/fumadocs-ecosystem-component-blocks-reuse/` — subagent #17 landed; 304-line REPORT + 5 evidence files
- `reports/storybook-ecosystem-component-blocks-reuse/` — subagent #18 landed; 343-line REPORT + 7 evidence files (read in full during consolidation)

**Storybook findings applied (from prior /assess-findings pass + this cascade):**
- F1 Storybook `wrappers` field → superseded by Context Bridge Registry (richer mechanism)
- F2 Storybook `hidden?: boolean` on PropDef → APPLIED (§9.2)
- F3 Storybook build-registry diagnostics → APPLIED as FR-28 + implementation in §9.9
- F4 Storybook `hidden(props)` conditional → APPLIED as NG11 (NG-tier per greenfield: no concrete need in built-ins)

**Cross-research contradictions resolved:**
- Fumadocs container research claimed "context propagates through any DOM wrapper" → **WRONG for portal architecture**. React Context propagates through React tree, not DOM tree. TipTap's portals place child NodeViews as React-tree siblings of parent NodeViews, not React-tree descendants. Verified via `@tiptap/react/src/EditorContent.tsx:25-83` + React docs (react.dev/reference/react-dom/createPortal). Resolution: Context Bridge Registry (FR-27, §9.15) — architecturally correct.
- Fumadocs ecosystem research recommended Tier 3 rewrite of Tabs/CodeBlock → **REJECTED** under user's fidelity priority. Keep imports direct; fix context propagation via Registry.

**Research subagents in flight at session close:**
- Subagent #26 — Context Bridge Registry research — dispatched with comprehensive prompt covering React 18/19 portal semantics, Radix context internals, TipTap prior art, alternative architectures (A-G ranked), reference implementation (~200-300 LoC), testing strategy, performance. Writes to `reports/context-bridge-registry-architecture/`. When it lands, §9.15 placeholder fills in with exact contract.

**Tasks completed:** #17 (fumadocs ecosystem research), #18 (Storybook research), #19 (render/parse analysis), #20 (CM-in-PM research), #22 (fumadocs container re-dispatch), #23 (Option C4 application), #24 (CM-in-PM P0 decision), #25 (per-block toggle NG decision).

**Outstanding tasks:** #13 (Spec: Verify + finalize), #21 (Consolidate running research — partially done, #26 still running), #26 (Context Bridge research, in flight).

**Lesson (meta):** The user's fidelity-priority directive reshaped every research output's recommended path. Research subagents produced excellent technical findings but different research subagents' recommendations contradicted (fumadocs-container said "just works across portals" — wrong; fumadocs-ecosystem said "rewrite Tabs" — wrong under fidelity priority). Resolution required cross-research consolidation + user priority elicitation. Takeaway: research subagents are investigators, not decision-makers — the integration step where I reconcile their findings against user priorities is load-bearing and non-delegatable.

## 2026-04-14 — Context Bridge Registry research landed: §9.15 concrete contract + FR-27 promoted from "pending" to locked

Context Bridge Registry research subagent (task #26, `_nest:research-context-bridge-registry`) completed with a 754-line `REPORT.md` + 7 evidence files (~150KB total). Research was evidence-dense (HIGH confidence on most claims — code-verified TipTap source, React 18/19 docs, Radix internals, community patterns), independently verified findings that matched my earlier spec-level commitments, and surfaced load-bearing risks I hadn't fully articulated (particularly R1 — Radix scope-resolved Context capture).

**Key research findings:**

- **TipTap bug confirmed, known unsolved upstream:** Issues #6427 and #6547 (both open, both unresponded by maintainers as of v3.22.3). React RFC #13332 ("Support cross-renderer portals") — filed 2018 by Dan Abramov, still unresolved. No React API exists for cross-tree Context subscription. We are first-movers in the TipTap/ProseMirror space.

- **Prior art validates two-phase pattern:** PixiJS React `ContextBridge`, FluentUI `@fluentui/react-portal-compat-context`, `@react-three/drei` `useContextBridge`, `react-babylonjs`, `use-context-selector`'s `BridgeProvider` — four production libraries independently converged on "consume in providing tree → pass through external channel → re-provide in consuming tree." Our architecture aligns with cross-ecosystem consensus.

- **Radix uses `createContextScope`** — scoped contexts are standard `React.createContext` with a scope prop (`__scopeTabs` etc.) that resolves to specific Context references. **R1 HIGH risk:** the bridge must capture scope-resolved Context refs, not abstract Context objects. Mitigation: `ContextCapture` helper renders inside the real component subtree and uses `use()` / `useContext()` on the scope-resolved Context via scope-prop resolution. Requires hands-on prototyping as Phase 0 of implementation.

- **Radix Collection hook uses dual mechanism** — Context (`itemMap`) + DOM queries (`querySelectorAll`, v2: `OrderedDict` + `compareDocumentPosition` + `MutationObserver`). DOM queries work natively because `contentDOM` preserves nesting; Context must be bridged. Under greenfield + fidelity priority, we bridge Collection context rather than degrade to mouse-only interaction.

- **Per-component bridge complexity:** Tabs = 3 contexts (medium, ~40 LoC), Accordion = 5+ contexts across root + per-item (high, ~50 LoC + ~30 LoC Collection bridge), Files/Folder = 0 bridges needed (each Folder is self-contained with local `useState` + Radix Collapsible). Total implementation: ~730 LoC (core ~250 + integration ~90 + per-compound ~50 avg + tests ~280).

- **Alternative architectures ranked**: Option A (registry) wins over B (in-tree render, breaks contentDOM), C (fork @tiptap/react, ~500+ LoC fork maintenance), D (top-level Provider, converges on A with worse re-render scope), E (PM plugin state, reinvents A with extra indirection), F (imperative refs, infeasible), G (polling, wrong paradigm).

- **Architecture primitives confirmed:**
  - **Store keyed by stable `bridgeId` attr** (editor-scoped incrementing integer assigned via `appendTransaction` plugin — survives CRDT operations because Y.XmlElement preserves attrs).
  - **WeakMap<Editor, BridgeStore>** for editor-scoped stores — no global state, multi-editor safe.
  - **`useLayoutEffect` for publish** (not render) — avoids concurrent-render corruption.
  - **`useSyncExternalStore` for consumption** — React Compiler compatible.
  - **No consumer opt-in** — every NodeView unconditionally wraps in `<ContextBridgeProvider>`; zero-cost when no ancestors publish.

**Spec updates applied (this entry):**

| Change | Section | Detail |
|---|---|---|
| FR-27 promoted from "pending research" to concrete contract | §6 | Specifies `ContextCapture` helper pattern, `useLayoutEffect` publish, `useSyncExternalStore` subscription, auto-wrapping consumer |
| FR-29 added | §6 | `bridgeId` schema attr on jsxComponent/jsxInline with editor-scoped assignment plugin |
| §9.15 rewritten from placeholder → 9-subsection concrete architecture | §9.15 | ~300 lines: verified problem, prior art, contract, reference implementation with code sketches, per-compound specs, rejected alternatives, risks (R1-R5), effort estimate, open items |
| §9.1 architecture pseudocode | §9.1 | Added `bridgeId` attr to schema summary; added bridgeId-assignment-plugin and context-bridge-flow sub-diagrams |
| §15 Risks | §15 | Added 6 FR-27/FR-29 risk rows (R1 HIGH — Radix scope capture; R2 MEDIUM — Accordion Collection; R3 MEDIUM — fumadocs mutable-array; R4 LOW — parent unmount timing; R5 LOW — ancestor walk perf; FR-29 bridgeId assignment-miss edge cases) |
| §7a CB test series | §7a | New CB01-CB15 scenarios: store unit tests (2), compound rendering (2 Tabs + 1 Accordion), Accordion keyboard nav regression guard, structural-editing lifecycle, multi-instance isolation, nested compound, R1 regression guard, R4 unmount edge case, zero-cost leaf, depth perf, concurrent editing |
| §7 M-series | §7 | Added M14 (Context Bridge fidelity), M15 (Nested CM fidelity), M16 (fumadocs-ui rendering fidelity end-to-end) |
| §13 In Scope | §13 | Added `context-bridge/{store.ts, hooks.tsx}`, `extensions/bridge-id-plugin.ts`, `extensions/RawMdxFallbackCMView.ts`, `extensions/nested-cm-extensions.ts`, `extensions/arrow-handler.ts`, `globals.css` bridge additions |
| §13 Next actions | §13 | Reordered: **Phase 0 prototype R1 Radix scope capture** before Phase 2 implementation; added steps for CSS bridge, bridgeId plugin, Context Bridge core, Tabs/Accordion captures, nested CM factory |
| §17 SCOPE | §17 | Expanded to include context-bridge/ + new extensions + SourceEditor.tsx (factory extraction narrowed edit) + globals.css (additive) |
| §17 STOP_IF | §17 | Added: FR-27 R1 prototype failure (implementation-gating), FR-27 R2 Collection fork-required (escalate) |
| §17 ASK_FIRST | §17 | Added: fork/monkey-patch of @tiptap/react/@radix-ui/fumadocs-ui; SourceEditor.tsx edits beyond factory extraction; fumadocs CSS imports beyond §9.7a; reintroduction of `.open-knowledge/components.ts` (NG13) |

**Architectural precedents** now locked:
- **#22 — Direct PM dispatch for nested editors** (established by FR-30..FR-35 + §9.14)
- **#21 — Context Bridge Registry for compound React components across NodeView portals** (established by FR-27 + §9.15)

**Implementation sequencing reflects risk-gating:**

Phase 0 (implementation-gating): Prototype R1 Radix scope-resolved Context capture. Do not commit to descriptor-level contract until this pattern is validated hands-on.

Phase 1: CSS bridge (§9.7a), built-ins registry (~350-500 LoC adapter work per fumadocs-ecosystem research), schema widening + bridgeId plugin + source-dirty observer + γ serialization.

Phase 2: Full Context Bridge (core + Tabs `contextCapture`), NodeView (block + inline) + PropPanels with Option C4.

Phase 3: Accordion Context Bridge (root + per-item + Collection context), nested CodeMirror (FR-30..FR-35), Block UX Phase 1+2.

Phase 4: Test suite (M1-M16, CB01-CB15, NB01-NB11, TP01-TP06, IN01-IN08, MR01-MR08).

**Tasks completed:** #26 (Context Bridge research), #21 (consolidation — all 4 research threads converged). Only #13 (Spec: Verify + finalize) remains pending.

**Spec size at close of this cascade:** ~2100 lines (from ~1500 pre-fidelity-priority cascade). Changelog: ~450 lines with full audit trail.

**Lesson (meta, Context Bridge cycle):** The research report (754 lines) independently arrived at the architecture I had sketched at the spec level, validated it against production prior art (4 libraries), and surfaced a HIGH-risk load-bearing detail (R1 Radix scope capture) that I had hand-waved as "scope-resolved via ContextCapture helper." The research's precision on R1 — "The `contextPublisher` function signature in §8 is a **design sketch**, not a validated API — the actual capture mechanism must render inside the compound component's React tree to have access to scope-resolved context values" — is exactly the kind of implementation-gating risk that research adds value for. Lesson: commit to architecture at spec level, but defer low-level contract details to research + hands-on prototyping phases. Avoid false precision.

## 2026-04-14 — Verify + finalize (Step 8 of `/spec`)

Ran the `/spec` Step 8 adversarial checks + completeness gate + Future Work tier classification + baseline stamp. Results below. Spec passes the quality bar; ready for implementation.

### Mechanical adversarial checks (all PASSED)

- **ASSUMED / PROPOSED / INVESTIGATING status fields:** NONE found across D0-D13. All 14 decisions carry explicit resolution status (LOCKED / FLIPPED).
- **1-way door decisions at LOW/MEDIUM confidence:** NONE. All 6 1-way-door decisions (D0, D1, D6, D11, D12, D13) are LOCKED with HIGH-confidence evidence citations — worldmodel sections, prior-art research reports, code-level verification, or direct user directive.
- **Non-goal temporal tag accuracy:** swept NG1-NG13. NG1 absorbed by NG13 (noted). NG2/NG4/NG8 [NOT UNLESS / NOT NOW] — correct, triggers documented. NG3 refined (pointer to NG10). NG5/NG6/NG7 [NEVER] — correct, would never add. NG9/NG10/NG11/NG13 [NOT NOW] — correct with explicit triggers or evidence-file references. NG12 [ACCEPTED] — correct, known gap, not future work.

### Resolution status assignment (14 decisions)

| ID | Status | Resolution type |
|---|---|---|
| D0 | LOCKED | DIRECTED (user directive on scope) |
| D1 | LOCKED | DIRECTED (convergent prior art) |
| D2 | LOCKED | DIRECTED (evolvability analysis) |
| D3 | LOCKED | DIRECTED (worldmodel §1 evidence) |
| D4 | LOCKED | DIRECTED (T3 spec + greenfield directive) |
| D5 | LOCKED | DIRECTED (serialize probe) |
| D6 | LOCKED | DIRECTED (Options α/β/γ analysis) |
| D7 | LOCKED | DIRECTED (indentation probe) |
| D8 | LOCKED | DIRECTED (cost/benefit analysis) |
| D9 | FLIPPED → NG13 | User directive reversal; prior analysis preserved in evidence file |
| D10 | FLIPPED → NG13 | User directive reversal; same |
| D11 | LOCKED | DIRECTED (user principle + research + evidence audit) |
| D12 | LOCKED | DIRECTED (user fidelity-priority directive) |
| D13 | LOCKED | DIRECTED (CM-in-PM research HIGH confidence) |

### Open Questions resolution (9 items)

| ID | Final status |
|---|---|
| Q1 (flush-left corner cases) | DELEGATED — implementation-time fixture matrix + STOP_IF |
| Q2 (drag-handle × CollaborationCursor) | DELEGATED — Phase 1 probe + STOP_IF |
| Q3 (source-dirty origin-guard completeness) | **RESOLVED — CLOSED** (V0-14 spec doesn't exist; enumeration confirmed complete) |
| Q4 (inline PropPanel trigger UX) | DELEGATED — UX probe during implementation |
| Q5 (inline slash menu insertion) | **LOCKED** — source-mode-only for P0 |
| Q6 (wildcard `hasChildren` default) | **LOCKED** — default true |
| Q7 (Radix Popover anchoring) | DELEGATED — Phase 1 probe + fallback path |
| Q8 (`@tiptap/extension-node-range` peer dep) | DELEGATED — Phase 1 conditional |
| Q9 (NEW — FR-27 R1 scope capture) | DELEGATED → **Phase 0 implementation-gating prototype** |

### Resolution completeness gate — In Scope items

Spot-checked major clusters (all PASSED):

**Built-ins registry (FR-8 + §9.2 + D3):** 18 components named (16 fumadocs + Mermaid + Audio shadcn wrappers). Per-component prop schemas extracted via react-docgen-typescript at build time (§9.9). All decisions made (D1, D3, D6, D8). No dependency on Out of Scope.

**Context Bridge Registry (FR-27, FR-29, §9.15, Precedent #23):** architecture spec'd with reference implementation code sketches; risks enumerated with mitigations; 3P dependency (Radix contexts via fumadocs-ui 16.1.0) pinned; integration feasibility confirmed through hands-on research (prior art in PixiJS / FluentUI / drei); acceptance criteria verifiable via CB01-CB15 + M14. Phase 0 prototype (Q9) is implementation-gating — acknowledged explicitly in §13 Next actions step 1 + §17 STOP_IF.

**Nested CodeMirror (FR-30..FR-35, §9.14, Precedent #22):** architecture + reference implementation + test plan + risk matrix all present. No new npm dependencies. Strong reuse via `createNestedCMExtensions` factory. Acceptance: M15 + CM-in-PM research §10 test plan.

**Option C4 render-failure editability (FR-24 + §9.7):** ComponentErrorBoundary rewritten with `retry`, `childrenFallback`, `sourceRaw` read-only display; key-on-attrs auto-retry in JsxComponentView + JsxInlineView. Asymmetry table documents parse/render failure difference. Acceptance: EB-series tests (implementation-time) + documented in §9.7.

**G9 ancestor-chain locality (G9 + FR-22 + FR-23 + §9.13):** single-pass structural enumeration with safe-coarsening for 2 known cases. Full algorithm in §9.13 with MERGE table and ASCII traces. NB01-NB11 + TP01-TP06 + MR04-MR08 test series. Bridge invariants preserved.

**CSS variable bridge for fumadocs (FR-25 + §9.7a):** ~80 LoC declared verbatim in §9.7a, scoped to globals.css additive-only. Token mapping via existing shadcn tokens. Not-imported list (fumadocs-ui/style.css, preset.css) with explicit conflict rationale. Acceptance: M16 + CB03/CB05 visual verification.

### Quality bar check (per `references/quality-bar.md`)

- **Problem statement** in SCR format (§1) ✓
- **Goals (G1-G9)** with acceptance mapping ✓
- **Non-goals (NG1-NG13)** with temporal tags + tier classification ✓
- **Consumer/persona matrix** (§4) ✓
- **User journeys** per persona (§5) ✓
- **Requirements** with FR numbering (FR-1..FR-28, FR-30..FR-35) + Non-functional ✓
- **Success metrics** (M1-M16) ✓
- **Test scenarios** (HH/BS/PI/KN/FP/EB/ES/HO/MR/PD/IN/CC/DD/NB/TP/CB series — ~130+ scenarios) ✓
- **Architecture** (§9 + sub-sections 9.0 through 9.15) with reference code sketches ✓
- **Decision log** with status + rationale + evidence for 14 decisions ✓
- **Open questions** with status + plan for 9 questions (1 CLOSED, 2 LOCKED, 6 DELEGATED) ✓
- **Assumptions table** (A1-A12) with confidence + verification ✓
- **Risks & mitigations** (24+ rows covering all FRs + Context Bridge risks) ✓
- **Future Work** with Explored/Identified/Noted tiers ✓
- **Agent constraints** (SCOPE + EXCLUDE + STOP_IF + ASK_FIRST) ✓
- **Architectural precedents** #20 + #21 explicitly introduced ✓

### Baseline commit

Stamped at current worktree HEAD: `699a27e` (branch `worktree-component-blocks-v2`, which is main's HEAD — the spec + research files are uncommitted additions, no spec-relevant code changes).

### Artifact completeness

- `SPEC.md` — 2148 lines, complete
- `meta/_changelog.md` — 485+ lines, append-only history
- `meta/audit-findings-t1-carryforward.md` — carry-forward from T1 audit
- `meta/audit-findings-t3-carryforward.md` — carry-forward from T3 audit
- `meta/audit-findings.md` — this spec's audit subagent output
- `meta/design-challenge.md` — this spec's challenger subagent output
- `evidence/custom-components-deferred.md` — 310 lines preserving D9/D10-era analysis for the re-spec
- `evidence/worldmodel.md` — Phase 3 worldmodel dispatch output
- External: `reports/storybook-ecosystem-component-blocks-reuse/` (8 files) + `reports/cm-in-pm-nested-editor-architecture/` (9 files) + `reports/fumadocs-container-behavior/` (12 files) + `reports/fumadocs-ecosystem-component-blocks-reuse/` (6 files) + `reports/context-bridge-registry-architecture/` (9 files) — all persisted for implementation reference

### Status: READY FOR IMPLEMENTATION

Spec is unambiguous at the architecture level. Implementation-time discoveries captured as DELEGATED open questions with STOP_IF gates for load-bearing risks. Phase 0 (Context Bridge R1 prototype) is the only implementation-gating step before broader work can proceed; all other phases sequence cleanly.

**Tasks completed this turn:** #13 (Spec: Verify + finalize).

**Spec sign-off:** Owner/DRI — Nick Gomez. Cascade from intake through finalize complete.
---

## 2026-04-14 — Re-audit pass (second cycle, opus)

User request: one more audit pass after finalize given the volume of post-first-audit changes (FR-27/29 Context Bridge Registry, §9.15, §9.14 nested CM, Precedents #20 + #21, §9.7a CSS bridge, Option C4 ErrorBoundary rewrite, fidelity-priority cascade from fumadocs/Storybook/Context Bridge research).

Before re-spawning: prior `audit-findings.md` (H1/H2/M1/M2/M3) and `design-challenge.md` (Findings 1-10) already applied and captured in prior changelog entries. Files will be overwritten by this pass — latest state captured below. Carry-forwards `audit-findings-t1-carryforward.md` and `audit-findings-t3-carryforward.md` preserved (out of audit scope, not overwritten).

Second-pass audit focus areas (NEW since first audit):
- FR-27 / FR-29 / §9.15 Context Bridge Registry (R1 scope capture, publish/subscribe model, bridgeId scheme, 1.5 flags × fumadocs-ui 16.1.0 prior art)
- §9.14 Nested CodeMirror architecture (FR-30..FR-35, Precedent #22)
- §9.7a Fumadocs CSS variable bridge (~80 LoC in globals.css, token mapping)
- Option C4 ErrorBoundary (chrome + Retry + childrenFallback + sourceRaw read-only + key-on-attrs auto-retry)
- §9.0 Architectural Precedents section (Precedents #20 + #21)
- NG13 custom-components-deferred scope reversal (flipped D9/D10)
- Fidelity-first reframing (use fumadocs components directly, not rebuild)

Spawning opus auditor + challenger in parallel via `env -u CLAUDECODE ...` subprocess pattern.
---

## 2026-04-14 — Re-audit pass (second cycle): findings assessed via /assess-findings + applied

Opus auditor returned 3 findings (0 high, 2 medium, 1 low). Opus challenger returned 7 findings (2 high, 3 medium, 2 low).

### Auditor findings — all APPLIED (correctness + coherence)

**[Auditor M1] APPLY — Residual custom-component-in-P0 references after D9/D10 → NG13 flip.** 11+ locations scrubbed beyond the original 9 cited. Fixes applied:
- §1 Resolution (pillar 1): removed "custom component registration is first-class" framing; added extensibility-seam note pointing to NG13.
- §2 G3: narrowed "built-in or user-defined" → "any built-in component"; added NG13 cross-reference.
- §3 NG1: rewritten as [ABSORBED INTO NG13].
- §4 P3: narrowed "Component contributors (monorepo + end-user)" → "Open Knowledge maintainers"; end-user contributor role deferred.
- §5 P3 journey: rewritten from "P3 adding a custom component" to "P3 adding a new built-in (Open Knowledge maintainer)"; `.open-knowledge/components.ts` → `packages/core/src/registry/built-ins.ts`.
- §6 M3: rewritten from "Custom component registration: add descriptor in `.open-knowledge/components.ts`..." → "Built-ins hot-add: add descriptor to `packages/core/src/registry/built-ins.ts`..."; added NG13 validation note.
- §6 FR-8: added explicit extensibility-seam statement per Challenger M3.
- §6 FR-19: rewritten "user's custom component bug" to enumerate real sources (fumadocs mis-use, agent writes, future NG13).
- §7a EB03: "User's custom component throws" → "A built-in component throws on render (e.g., bad prop shape passed through agent edit)"; EB04 rewritten to align with Option C4 retry semantics.
- §7a MR03: rewritten from cross-client registration scenario → build-version skew scenario; preserves runtime-descriptor-dispatch invariant test; MR04 "3 registered Callouts" → "3 built-in Callouts".
- §7a CC section (CC01-CC06): replaced 6 rows with a DEFERRED placeholder pointing to `evidence/custom-components-deferred.md` §8 where the scenarios are preserved verbatim for re-spec.
- §9.2 searchTerms footer: "Custom components via `.open-knowledge/components.ts` can supply their own" → "the descriptor schema's optional `searchTerms?: string[]` is a stable extensibility seam — NG13 custom components would supply their own without schema change."
- §9.7 ErrorBoundary intro: "one bad custom component" → "one throwing component — e.g. fumadocs component mis-used, agent-authored bad props".
- §13 In Scope bullet: removed `.open-knowledge/components.ts` loader line.
- §13 build-registry.ts: "extended to scan `.open-knowledge/components.ts` for custom props" → "extraction for the committed built-ins manifest only".

**[Auditor M2] APPLY — `useAncestorContexts` wrapping order bug.** Confirmed via manual trace (outer ancestor context was shadowing nearest ancestor). Fix: `collected.unshift(...e)` → `collected.push(...e)` at §9.15.4 line ~1845. Comment updated: "nearest-ancestor entries pushed last → innermost React providers (shadowing)." Also updated the `useAncestorContexts` hook description (§9.15.3) and the ASCII trace diagram (§9.15.1) to match. Latent bug — would have surfaced on any same-type compound nesting (Tabs-in-Tabs, Accordion-in-Accordion) or on a future custom compound (NG13).

**[Auditor L1] APPLY — `@source` CSS directive path off by one level.** Bun workspace hoisting puts fumadocs-ui at worktree-root `node_modules/`, not `packages/node_modules/`. From `packages/app/src/globals.css`, the correct relative path is `../../../node_modules/` not `../../`. Fixed §9.7a line ~1098. Verified via realpath + repo inspection + Tailwind v4 @source semantics (paths resolve relative to the CSS file containing the directive).

### Challenger findings

**[Challenger H1 + H2] APPLY (merged) — Phase 0 fallback cascade expanded.** Both findings argue the same thing: the current Phase 0 gate has one unvalidated primary path and one unvalidated fallback; needs a pre-evaluated Fallback 2 so Phase 0 failure is a routing decision, not a design restart. Fix: Q9 table cell rewritten with explicit three-tier cascade:
1. **Primary:** scope-resolved capture via `use()` inside `ContextCapture` (current design).
2. **Fallback 1:** scope-prop forwarding through bridge store.
3. **Fallback 2 (retreat):** hybrid architecture — keep 12-14 leaf components as direct fumadocs-ui imports (100% fidelity, no bridge needed); pattern-copy the 4-6 compound components (~300 LoC); eliminate Context Bridge for compounds entirely. Retreat budget: ~2 days. Does NOT reopen D12 — D12's fidelity-first stance holds for leaves; the retreat is scoped to compounds only where fidelity is mostly chrome. Same cascade documented in §15 FR-27 R1 risk row, §13 Next Actions step 1, and §17 STOP_IF.

**[Challenger M1] APPLY — §9.14 framing leads with NG10 foundational-infrastructure.** §9.14 opening rewritten: "Establishes the foundational CM-in-PM infrastructure (Architectural Precedent #22) that serves both `rawMdxFallback` (P0, this spec) and the future per-block source-mode toggle (NG10, deferred). The investment is proportional to the platform primitive it creates..." Communicates proportionality; D13 rationale unchanged.

**[Challenger M2] APPLY — §9.7a fumadocs-ui/style.css rejection enumerates all three specific conflicts.** Previous text named 2 conflicts (body styling + border-color reset). Now explicitly names 3 with code snippets: (1) `body { background-color; color }`, (2) `@layer base { *, *::before, *::after { border-color } }`, (3) `@variant dark (&:where(.dark, .dark *))` variant-strategy mismatch with our `@custom-variant dark`. Prevents future implementer from reopening the style.css import question.

**[Challenger M3] APPLY — FR-8 extensibility-seam statement.** Added one-paragraph extensibility-seam note to FR-8: "The `Map<string, JsxComponentDescriptor>` interface is designed as a stable seam for NG13. A future re-spec merges user descriptors into the same Map at startup with zero schema or registry-structure change (`userDescriptors.forEach(d => registry.set(d.name, d))`)." Anchors future re-spec to the current interface rather than inviting clean-slate redesign.

**[Challenger L2] APPLY — §9.15.8 Phase 0 budget line + LoC delta for hybrid retreat.** Added: "Phase 0 budget: ~1-2 days beyond the ~670 LoC above. The LoC estimate is production code; prototyping is investigation. If Fallback 2 (hybrid retreat) is triggered, the ~670 LoC shrinks by ~420 and grows by ~300 for a net ~550 LoC."

### Challenger findings — DECLINED

**[Challenger L1] DECLINE — Move §7a test scenarios to separate `meta/test-scenarios.md`.** Classification: tradeoffs unfavorable. The challenger itself labels this LOW severity ("readability optimization, not content reduction"). Rationale for decline: (a) test scenarios are acceptance criteria that implementers read alongside the FR/architecture sections they test; splitting adds navigation cost. (b) The spec's length (2148 → 2170 after fixes) is justified by three-subsystem scope (the challenger's own Confirmed Design Choices section says so). (c) Splitting is a structural change that would break cross-references (EB01-CB15, MR03, etc., are cited inline throughout §9-§15). The cost of restructuring outweighs the readability benefit. No future relevance — if the spec later becomes unwieldy, the split is a fresh-eyes decision, not a predetermined action.

### Assessment protocol
- `/assess-findings` skill loaded before evaluation.
- Each finding investigated: codebase inspection + web search where applicable (Tailwind v4 @source semantics verified via web search + docs).
- Confidence HIGH across all findings. No LOW-confidence decisions made.
- No decision reopens surfaced. All findings were coherence fixes, latent-bug fixes, framing improvements, or planning-artifact additions. D11, D12, D13 rationales unchanged.

### Spec post-second-pass status: READY FOR IMPLEMENTATION

All mechanical adversarial checks pass. Correctness bugs eliminated (M2 wrapping, L1 path). Stale references scrubbed (M1). Phase 0 fallback pre-evaluated with retreat path. Framing aligned to proportionality. Baseline commit: `699a27e`.
---

## 2026-04-14 — Acceptance criteria expansion (deep-coverage cascade)

User directive: "think deeply about acceptance criteria. I want to ensure all the tricky parts / edge cases / etc. have great test coverage and QA coverage. add all into the spec." Three tiers applied in one cascade.

### Tier 1 — Design hole fix + new metric

**FR-5 effectiveDirty rule (CORRECTNESS FIX).** Pre-fix spec said serialize emits sourceRaw when `sourceDirty === false`. This silently dropped edits when a pristine parent contained a dirty descendant (parent's sourceRaw encoded the OLD children text; emitting it would lose the descendant's edit on save). FR-5 rewritten to compute `effectiveDirty(node) = node.sourceDirty || hasDirtyDescendant(node)` and emit sourceRaw ONLY when !effectiveDirty. During top-down serialization the walk is amortized — a pristine subtree boundary resumes sourceRaw emission once detected. Added scenarios DT-nested-01..05 covering the 4×4 parent×child state matrix + depth-independence, and M17 acceptance metric. Without this fix, nested edits are silently lost; with it, byte-identity is preserved per-subtree while edits propagate correctly.

**FR-5a (CH03 decision).** New FR: `hasChildren: false` descriptor with non-empty PM children → degrade-to-wildcard rendering for that instance (UnregisteredBadge + visible NodeViewContent + no PropPanel). Rationale: hiding content via `display: none` would silently lose the user's text; degrading visibly surfaces the mismatch. Updated FR-9 to reference the three render-path conditions (registered+empty, registered+content, wildcard).

### Tier 2 — Assertable acceptance coverage (72 new scenarios, 4 new invariants)

**New §7a test scenario series** (organized by subsystem; ~72 new scenarios):

| Series | Count | Focus | Tier |
|---|---|---|---|
| **SC** (scanTagEvents) | 10 | Tag scanner unit — including malformed-open (SC02 safe-coarsening), brace-depth tracking for JSX expression attrs (SC03-04), fence-awareness, edge cases | Layer A |
| **DT** (origin-guard + nested-dirty) | 12 + 5 nested | Concrete origin-guard truth table; nested-dirty 4×4 matrix + depth-independence; byte-identity corpus regression | Layer A + Integration |
| **CH** (content holes) | 7 | Four descriptor × PM-children combinations including FR-5a edge case | Layer C |
| **EX** (expression attrs) | 6 | D5 round-trip per attr shape (literal, identifier, array, complex, spread, shorthand) | Fidelity PBT |
| **NCM** (Nested CodeMirror) | 13 | PM↔CM sync, loop prevention, unified undo, boundary escape, typing-defer forwarding, theme compartment, HMR, wiki-link completion | Layer A (sync math) + Layer C (interactive) |
| **CB16-25** (Context Bridge extensions) | 10 | Nearest-ancestor shadowing (M2 audit-fix regression guard), publish/subscribe ordering, bridgeId invariant, undo cleanup, HMR, aborted render, GC, Observer B pristine preservation, multi-editor isolation, hybrid fallback | Layer A + Integration + Layer C |
| **SH** (schema widening runtime) | 5 | Pre-widening doc load, bridgeId additive, content expression widening, per-keystroke Y.Item preservation, cross-peer identity | Layer A + Integration |
| **PS** (paste / copy / cross-editor) | 5 | bridgeId assignment on paste/programmatic/copy-cross-editor; store isolation; undo cleanup | Integration |
| **AG** (agent interactions) | 7 | agent-write-md, agent-write, agent-patch, malformed writes, cross-boundary, undo, race with user edit | Layer B + Integration |
| **MR09-13** (multi-client extensions) | 5 | Delete vs edit race, layered concurrent edit, undo + bridge subscription, network partition + bridge divergence, server agent-write + client bridgeId | Integration + Layer C |

**New fidelity invariants I12-I16** (alongside I1-I11 from CLAUDE.md):
- I12 — Pristine jsxComponent/jsxInline byte-identity (18 built-ins × block + inline)
- I13 — Edited jsxComponent/jsxInline idempotence (NG12 convergence PBT)
- I14 — rawMdxFallback byte-identity (NG4/NG5/NG9 passthrough preserved)
- I15 — Cross-path consistency (Observer B path ≡ mdManager path) — extends I5
- I16 — Nested-dirty serialization (FR-5 effectiveDirty as PBT over tree × dirty-subset)

**New M-series metrics:**
- M17 — Nested-dirty correctness (4×4 matrix; FR-5 effectiveDirty)
- M18 — bridgeId plugin invariant (non-empty, unique within editor, post-`appendTransaction`)
- M19 — Nested CodeMirror unified undo (10-step interleaved sequence)
- M20 — Visual-regression parity (Playwright screenshot diff ≤1% threshold × 18 components × light/dark × selected/unselected; ~72 image assertions)
- M21 — Context Bridge HMR resilience

**New open question Q10 (surfaced during gap analysis):** bridgeId as PM schema attr interacts with Observer B re-parse to potentially churn Y.XmlElements every cycle (parse output has `bridgeId=''` default; `equalYTypePNode` deep-attr compares; drift → delete+reinsert → consumers resubscribe). Directly threatens CB23 acceptance. Added as Phase 0 prototype gate alongside Q9. Q10 mitigation cascade: Option A (bridgeId in PluginState not schema attr, keyed by Y.ItemID), Option B (y-prosemirror patch to exclude bridgeId from attr comparison), Option C (parse handler consults prior state). Option A preferred. Surfaced proactively as a load-bearing implementation risk.

### Tier 3 — QA infrastructure (new test tiers)

**VR (Visual Regression) — 18 scenarios.** Playwright screenshot diffing per built-in component between editor render and docs-site reference render. Covers: {5 Callout types, Card ±external/title, Cards grid, Steps 3-step, Tabs 2+4 with active variations, Accordions 3-item with open-state variations, AccordionItem edge case, Files/Folder/File tree, ImageZoom ±modal, Banner, TypeTable, InlineTOC 0/3/10 headings, Mermaid flowchart, Audio, Icon, Badge, mixed-doc whole-screenshot, Wildcard UnregisteredBadge}. Each × {light, dark} × selection states. This is the only metric that actually *enforces* D12 fidelity-first; without it, fidelity is aspirational.

**PF (Performance) — 6 benchmarks with regression thresholds.** 100-component render-count verification, 10-level ancestor-walk latency, Observer B parse cycle under 500 keystrokes, full check-suite regression, Y.Item growth under typing (Precedent #10 validation), bridge publish/unpublish throughput under 50-compound mount.

**A11Y (Accessibility) — 10 WCAG 2.1 AA assertions.** Tab order, aria-live announcements on selection, Esc focus-restoration, popover dialog semantics, rawMdxFallback aria-label, keyboard nav between compound children, empty-container placeholder keyboard activation, ComponentErrorBoundary aria-alert role, badge accessible-name, axe-core full-document scan.

**Test infrastructure wiring:**
- New test files enumerated in §13 In Scope (14 new files across fidelity/unit/integration/e2e/visual/a11y/perf tiers)
- New turbo tasks: `test:visual`, `test:perf`, `test:a11y` with independent cache keys
- `bun run check` (canonical gate) expanded: fidelity suite now includes I1-I16; integration includes new bridge-matrix entries; unit includes store + observer tests
- `bun run check:full:parallel` extended to include visual/perf/a11y; target <5min warm
- Visual regression baselines stored in `__snapshots__/`; golden-file updates gated behind explicit `bun run test:visual:update` command + PR review

**New STOP_IF triggers in §17:**
- I16/M17 nested-dirty invariant fails (correctness regression — highest priority)
- M18 bridgeId invariant fails (plugin coverage gap)
- Q10 bridgeId-attr-churn prototype fails AND options A/B/C cannot resolve
- M20 visual regression fails for ≥3 components OR any single >5% (systemic CSS regression signal)
- PF01-03 p99 thresholds exceeded by >30%

### Test-pyramid assignment table

Added to §7a header: 17-row mapping from each scenario series → primary test tier → target test file location. Prevents tests from landing at the wrong tier (e.g., unit tests landing in E2E, integration tests landing in fidelity).

### Next actions expanded

§13 Next actions — added steps 13-15 for VR/A11Y/PF infrastructure stand-up as distinct implementation phases. Baseline-capture PRs for visual regression require maintainer review (can't silently regenerate in CI).

### Final state

- Spec now 2453 lines (was 2167 pre-expansion; +286 for full coverage)
- One genuine correctness bug fixed (FR-5 effectiveDirty) before implementation — would have caused silent data loss
- Three architectural open questions now on Phase 0 gate: Q9 (scope-resolved capture), Q10 (bridgeId-attr churn), and the hybrid fallback for either
- 16 invariants (I1-I16), 21 metrics (M1-M21), ~250 test scenarios across 22 named series
- Every load-bearing behavior has at least one automated assertion path

### Status: READY FOR IMPLEMENTATION (re-affirmed)

All three verify+finalize gates held through this expansion. No decision reopens — all additions are coverage, clarification, or framing enhancements. Baseline commit still `699a27e`.
---

## 2026-04-14 — Combined cascade: inline deferral (NG14) + always-visible invariant (Precedent #24)

User directives (three, in sequence):
1. "we ALWAYS want to show all content so that the user is aware and can edit/fix/read all content. that's an invariant. ... when something is an invalid state, i think we need to use the same 'render embedded source editor' thing so people can fix it?"
2. "can inline jsx elements just be editable as normal inline text? i.e., don't pretty or special render them?"
3. "we can add to future work and put all of our learnings/thoughts in an evidence file, similar to the custom components stuff. ... remember we're greenfield."

Investigation confirmed: fumadocs-ui ships zero inline MDX components. The 18-component D3 manifest is entirely block-level. G2/§5/IN01-03 used `<Icon>` and `<Badge>` as examples, but neither was in the manifest.

### Inline-component-editing deferred to NG14

**Created:** `evidence/inline-component-editing-deferred.md` — preserves the complete prior inline design (descriptor-dispatched live React, PropPanel popover, InlineBadge chip, IN scenarios, inline bridgeId, prior-art references, re-spec entry criteria, open questions). 9 sections.

**Spec changes:**
- G2 rewritten: "Inline JSX round-trips byte-identically as source text" (no chrome, no popover, no descriptor dispatch)
- NG14 added to §3 (complete scope definition + evidence-file reference)
- §5 P1 inline editing journey rewritten to "inline JSX as source text"
- FR-2 rewritten: mdxJsxTextElement → jsxInline with raw source slice (discards mdast children)
- FR-4 rewritten: jsxInline thin shape (atom:false, content:'text*', isolating:false, zero attrs)
- FR-5 narrowed: γ dirty-tracking applies to jsxComponent only; jsxInline excluded (no sourceDirty attr)
- FR-5b added: jsxInline serializer routes through html-mdast (bypasses text-escape safe list)
- FR-7 narrowed: source-dirty observer walks jsxComponent only
- FR-10 marked NONE per NG14
- FR-12 marked NONE per NG14
- FR-14 simplified: registry is block-only, no isInline filter
- FR-17a narrowed to block-only
- §9.1 Architecture: jsxInline schema + serialization + observer + bridgeId sections all updated
- §9.2 descriptor: isInline field removed from JsxComponentMeta; wildcard is block-only
- §9.8 replaced: full "JsxInlineView.tsx" chrome section (~120 lines) → thin §9.8 "jsxInline thin shape" (~50 lines) with schema, parser, serializer code
- §9.9 salvage map: jsxInline entry updated to thin shape
- §9.13 Nested CM architecture note: jsxInline excluded (no CM for inline)
- §9.15 Context Bridge: JsxInlineView refs removed; consumer auto-wrap scoped to JsxComponentView
- §9.15.8 LoC estimate updated (integration in JsxComponentView only, -30 LoC)
- IN01-IN10 scenarios rewritten: all test thin-jsxInline source-text round-trip (not chrome/popover)
- DD03-DD04 scenarios updated
- M2 metric rewritten: inline round-trip end-to-end (not "Icon/Badge render live")
- M18 bridgeId invariant: jsxInline excluded
- §13 In Scope: salvage map entries, scope bullet, "Next actions" references all updated
- §17 Agent constraints: scope narrowed for inline-relevant files

### Always-visible content invariant (Precedent #24)

**Precedent #24 added to §9.0:** two coupled invariants:
1. No silent content hiding (no display:none on NodeViewContent, no read-only sourceRaw chrome, no data-* attribute hiding of tag names).
2. Invalid states surface the embedded source editor (nested CM, §9.14).

**Spec changes:**
- NG7a added (NEVER): silent content hiding
- FR-5a DELETED: "degrade to wildcard when hasChildren:false + children present" — replaced by FR-9's branch that always renders NodeViewContent
- FR-9 rewritten: three branches with NodeViewContent always rendered. hasChildren:false + zero children → CSS zero-footprint (not display:none). hasChildren:false + non-zero children → let runtime decide (if component crashes, ErrorBoundary → nested CM per FR-19).
- FR-19 rewritten: ComponentErrorBoundary catches → NodeView swaps to invalid-state nested CM. No retry button, no read-only chrome, no childrenFallback separate path.
- FR-24 rewritten: references FR-19 unified mechanism; removed Option-C4-specific language.
- §9.7 NodeView (block): COMPLETE REWRITE. Three render branches (wildcard, healthy, invalid-state). ComponentErrorBoundary simplified to just catch+signal. JsxComponentView renders `InvalidStateCMEditor` on error (reuses `createNestedCMExtensions` factory). Removed: Retry button, read-only sourceRaw display, childrenFallback, details-summary diagnostic chrome. Added: `InvalidStateCMEditor` component + commit-handler with block-scoped parseWithFallback + state transition logic (same-component update, different-component replaceNode, rawMdxFallback transition, re-throw stay-in-CM).
- §9.7 Asymmetry table → SYMMETRY table: render failure and parse failure now both use nested CM.
- I17 invariant added: all-user-content-visible PBT (DOM text ⊇ PM text).
- CH05 scenario updated: hasChildren:false + content → children visible; if component crashes, ErrorBoundary → nested CM.
- EB series: Retry button references removed; "edit in nested CM → auto-retry on commit" replaces throughout.

### Net spec state

Spec now at ~2500 lines (was ~2450 before this cascade — inline scaffold removal balanced by Precedent #24 additions + evidence file).
Evidence files: 3 (custom-components-deferred, inline-component-editing-deferred, worldmodel).
Changelog: this entry brings it to ~850 lines.
All decisions still LOCKED (D0-D13) — this cascade adds no new decisions, just narrows scope (NG14 deferral) and adds a new architectural invariant (Precedent #24).
---

## 2026-04-14 — Re-audit pass (third cycle, opus)

User request: one more audit pass after the combined NG14 inline deferral + Precedent #24 always-visible invariant cascade + D8 flip + Q10 Option A confirmation + STOP_IF hardening.

Before re-spawning: prior `audit-findings.md` (second-pass: M1/M2/L1) and `design-challenge.md` (second-pass: H1/H2/M1/M2/M3/L1/L2) already applied and captured in prior changelog entries. Files will be overwritten by this pass.

Third-pass audit focus areas (NEW since second audit):
- NG14 (inline-component-editing deferred): G2 rewrite, FR-2/FR-4/FR-5/FR-5b/FR-7/FR-10/FR-12/FR-14/FR-17a updates, §9.8 thin jsxInline shape, IN01-IN10 rewritten scenarios, D8 FLIPPED
- Precedent #24 (always-visible content + unified invalid-state CM): §9.0, NG7a, FR-5a deleted, FR-9 rewrite, FR-19/FR-24 rewrite, §9.7 JsxComponentView COMPLETE rewrite (ErrorBoundary → invalid-state CM, symmetry table)
- I17 invariant (content-visibility PBT)
- Q10 Option A confirmed (bridgeId in PluginState)
- STOP_IF hardened language for FR-27 R1 (exhaust primary path with evidence before retreat)
- D8 FLIPPED → NG14
- Custom-component scrub coherence (second-pass M1 applied throughout)
- isInline field removed from JsxComponentMeta; registry block-only

Spawning opus auditor + challenger in parallel.
---

## 2026-04-14 — Third audit pass: findings assessed via /assess-findings (full protocol) + applied

Auditor returned 12 findings (1 high, 7 medium, 4 low). Challenger returned 8 findings (2 high, 4 medium, 2 low). 17 unique after merging duplicates (Aud L4 + Chal H1; Aud M4/M5 + Chal H2). Root cause of all auditor + H/M challenger findings: NG14 + Precedent #24 cascade didn't fully propagate into code samples, test scenarios, and auxiliary sections; the FR-level definitions were updated but secondary references lagged.

Full /assess-findings protocol applied (Phases 1-7). Phase 1 investigation: codebase + spec cross-reference for each finding. Phase 2 confidence: HIGH on all 17 (no web search needed — all findings internal coherence against spec's own invariants). Phase 6 communication: 16 APPLY, 1 APPLY PARTIALLY (Chal M1 — document trade-off, don't reverse), 0 DECLINE. Phase 7 Declined Findings Summary: empty (no findings declined).

### Coherence fixes applied (16 mechanical text + code changes)

**Code correctness (would have crashed):**
- [Aud H1] §9.4 jsxInline serializer rewritten from old attr-accessing code to thin-shape handler: `(node) => ({ type: 'html', value: node.textContent ?? '' })`
- [Aud M1] §9.6 source-dirty observer guard: removed `&& node.type.name !== 'jsxInline'` — now checks jsxComponent only

**Precedent #24 contradictions:**
- [Aud M2, Chal L1] EB04 scenario + Next Actions step 7 rewritten: invalid-state CM (no Retry button)
- [Aud M3] A11Y08 rewritten to test CM accessibility + aria-alert on error badge
- [Aud M4, M5, Chal H2] CH04 + SH03 rewritten: CSS zero-footprint instead of `display: none`

**NG14 dead-scope cleanup:**
- [Aud M6] §14 InlinePropPanel accessibility subsection replaced with deferral pointer
- [Aud M7] §13 In Scope line: removed JsxInlineView + InlinePropPanel + InlineBadge from the file list
- [Aud L1] §8 "we extend this" → thin-shape rewrite language
- [Aud L2] §9.2 line 902 comment "same for block + inline" → "block-only per NG14"
- [Aud L3] FR-13 header "(block + inline)" → "(block-only; inline has no PropPanel per NG14)"
- [Aud L4, Chal H1] D6 decision updated (γ applies to jsxComponent only); A5 assumption marked OBSOLETE per NG14

**M3 reference-implementation framing (challenger):**
- §9.7 invalid-state CM: added behavioral contract table (normative) + framed code block as "Example potential implementation — adjust as architecturally best given implementation-time deep-level context"
- §9.15.4: same framing added to Context Bridge reference implementation sketches
- User direction: "example potential implementation -- adjust as needed and as architecturally best as given my implementation deep level context"

**M1 render-failure UX regression documented (challenger):**
- §9.7 Precedent #24 symmetry table: added "Acknowledged trade-off" paragraph. PropPanel was available during render failure under Option C4; unified CM drops to raw-source editing. Accepted because: (1) built-in components rarely throw; (2) hybrid chrome re-introduces complexity; (3) unified mental model; (4) user directive authorized the trade-off.

### Architectural updates (2 items — both user-authorized)

**Q10 LOCKED → Option A** (user directive "agree with your option a for q10"). bridgeId is NOT a PM schema attr; it lives in `bridgeIdPlugin` PluginState keyed by Y.XmlElement. Cascaded through 12 sections:
- Q10 entry itself (LOCKED with Option A design)
- FR-27 (reads bridgeId via plugin accessor)
- FR-29 (rewritten — PluginState-based, not schema attr)
- §9.1 Schema box (bridgeId removed from attrs list)
- §9.1 bridgeIdPlugin flow diagram (PluginState.apply, not appendTransaction of attr)
- §9.1 Context Bridge flow (bridgeId read via `bridgeIdPluginKey.getState(...).getFor(node)`)
- §9.15.3 Architecture contract (bridgeId-via-PluginState paragraph rewritten)
- §9.15.4 (reference code uses plugin accessor)
- §9.15.8 LoC table (plugin size adjusted — ~40 LoC)
- M18 (bridgeId invariant — plugin accessor check)
- MR13 (server agent-write + client PluginState assignment)
- CB18, CB23 (invariants updated — CB23 now structurally guaranteed)
- SH02 (no attr migration needed)
- §13 In Scope (bridge-id-plugin.ts description)
- §13 agent-sessions.ts (server schema unaffected — bridgeId client-local)
- §9.7 NodeView reference code (`ancestorNode.attrs.bridgeId` → plugin accessor)

**STOP_IF for FR-27 R1 — partial retreat with escalation trigger** (user direction "sounds good"):
- Per-component partial retreat permitted under same evidence bar
- Escalation trigger: if 2+ compounds fail primary path, escalate (pattern across compounds indicates architectural question, not isolated issues)
- Global failure path: apply Fallback 1 globally → Fallback 2 globally
- Preserves user's rigor directive while acknowledging 80/20 reality

### Declined findings

None.

### Confirmed (no action)

- [Chal L2] Escape-mark alternative investigated: fails on 3 independent axes (serializer architecture mismatch, Y.Item identity, schema extensibility). Current jsxInline design correct.

### Spec state after third pass

- SPEC.md: 2455 lines (from 2425 before third pass; +30 for Q10 cascade + acknowledgment paragraphs + behavioral table)
- Decision log: 11 LOCKED (including Q10), 3 FLIPPED (D8→NG14, D9→NG13, D10→NG13)
- Open questions: 9 of 10 resolved (Q1-Q8 delegated/locked, Q10 LOCKED, Q9 still Phase 0 gate)
- No design reopens. No additional findings left to address from this pass.
