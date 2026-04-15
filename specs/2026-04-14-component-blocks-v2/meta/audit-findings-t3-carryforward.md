# Audit: T3 (block-editor-ux) Carry-Forward Findings

**Audit date:** 2026-04-14
**Source:** T3 SPEC (642L) + 3 evidence files + prior audit (10 findings) + rebase audit (7 findings) + design-challenge (9 findings)
**Target:** `specs/2026-04-14-component-blocks-v2/SPEC.md` (baseline 699a27e, D1–D10 locked)
**Total findings:** 22 (8 KEEP, 4 DISCUSS, 6 ALREADY CAPTURED clusters, 4 OBSOLETE clusters)

---

## KEEP — carry forward to Component Blocks v2 SPEC

### [KEEP-1] Test Scenarios section is entirely missing from our SPEC
**Source:** T3 §7 (~100 lines, 45 scenarios across HH/BS/PI/KN/FP/EB/ES/HO/MR/PD)
**Insight:** T3 had a full Test Scenarios table with ~45 scenarios organized by feature area. Our SPEC has M1-M8 success metrics (outcome-oriented) but no enumerated per-feature scenarios. T3's scenarios are the acceptance-criteria layer the implementer works from.
**Why still applies:** Our scope is SUPERSET of T3 (adds inline L3, custom components, descriptor dispatch) — we need MORE scenarios, not fewer. Scenarios BS01–BS06 (badge), KN01–KN10 (keyboard), HH01–HH08 (hover handle), PI01–PI07 (insertion) all still apply to our `jsxComponent`-widened model with minor renames.
**Recommended addition to our spec:** Add §7a "Test Scenarios" between §7 (metrics) and §8 (current state). Port T3's tables with renames (`jsxComponentEditable` → `jsxComponent`), add new tables for Inline L3 (IN01–IN08: click to open inline PropPanel, prop change re-render, wildcard inline badge, etc.) and Custom Components (CC01–CC06: register → existing instance upgrades, de-register → downgrade, no migration). Also add descriptor-dispatch scenarios (DD01–DD04: unknown block shows UnregisteredBadge + editable children; unknown inline shows InlineBadge + editable children).

### [KEEP-2] Accessibility section is entirely missing from our SPEC
**Source:** T3 §14 (~45 lines, WCAG-grounded per-surface guidance)
**Insight:** T3 spelled out aria-labels, Tab behavior, focus management, live-region announcements, focus traps for each interactive surface (hover handle, "+" button, floating PropPanel, keyboard nav, component badge). Addresses WCAG 2.1.2 keyboard trap explicitly.
**Why still applies:** Our scope ADDS interactive surfaces (inline PropPanel, custom-component registration UI, InlineBadge chip) that need the same A11y treatment. Block UX Phase 1 in §9.10 references drag handle + "+" without A11y considerations. "Best product experience" directive implies accessibility.
**Recommended addition to our spec:** Add §13a "Accessibility" subsection (or §14 "Accessibility" renumbered). Port T3 §14 verbatim with 3 additions:
- Inline PropPanel: focus moves to first control on open; Esc closes + returns focus to the inline span; popover has `role="dialog"` + `aria-labelledby={componentName}`.
- InlineBadge: `aria-label="Unregistered component: ${name}"` + focusable via Tab.
- Tab key decision matrix: T3 has a clean 4-row table ("Text edit mode" / "Navigation mode" / "Prop panel focused" / "Handle menu focused") — port as-is.

### [KEEP-3] Empty-container "Click to add a step" UX pattern
**Source:** T3 §3.3 "Inside empty containers (direct-insert hardcoded child type)"
**Insight:** T3 specifies placeholder text inside empty Steps/Tabs/Cards/Files containers with a hardcoded parent→child mapping (`{ Steps: 'Step', Tabs: 'Tab', Cards: 'Card', Files: 'File' }`). Clicking inserts the expected child with defaults, no menu needed. Addresses the "empty container is useless until you know to type inside it" discoverability gap.
**Why still applies:** All four container components (Steps, Tabs, Cards, Files) are in our P0 built-ins manifest (D3). The UX issue is real — users who insert `<Steps>` via slash command land in an empty container with no guidance. Our NG4 covers context-aware filtering (Gutenberg-level) — this is SIMPLER than NG4 (just a hardcoded map for 4 known containers).
**Recommended addition to our spec:** Add an FR under Block UX Phase 1 (near FR-16). Proposed text: "FR-16a Empty-container placeholder: when a registered container component (Steps, Tabs, Cards, Files) has zero child components, render a clickable placeholder ('Click to add a step' / 'Click to add a tab' / 'Click to add a card' / 'Click to add a file'). On click, insert one instance of the mapped child type (hardcoded `{Steps:'Step',Tabs:'Tab',Cards:'Card',Files:'File'}`) with default props and place cursor in its children. The mapping lives on the descriptor as an optional `emptyChildName?: string` field." This is ~30 LoC; keeps context-filtering out of scope per NG4.

### [KEEP-4] Breadcrumb on child selection
**Source:** T3 §3.2 "Breadcrumb on child selection"
**Insight:** When a child component is selected (e.g., Step inside Steps), T3 shows a breadcrumb path in the PropPanel header ("Steps > Step") with clickable segments that call `setNodeSelection(ancestor_pos)`. Provides navigation context when child badges are suppressed.
**Why still applies:** Our §9.7 implements child-badge suppression (`isChildOfComponent` check) but drops the breadcrumb compensation. Without breadcrumbs, a user selecting a nested Step has no visible indication of the Steps ancestor — breaks the discoverability contract that child-suppression assumes. This is the UX pairing (child-suppression + breadcrumb) that T3 D4 explicitly designed together.
**Recommended addition to our spec:** Add to §9.7 JsxComponentView: "When `isChildOfComponent === true` AND PropPanel is open, render a breadcrumb header in the PropPanel showing the ancestor chain via `doc.resolve(getPos())` ascent — each segment is a `<button>` calling `editor.commands.setNodeSelection(ancestorPos)`. ~20 LoC." Alternatively add a short FR (FR-17a).

### [KEEP-5] Phase 2 keyboard nav L1–L4 MVP tiering
**Source:** T3 §4 (Phase 2 build order) + design-challenge H3 (the tiering was added in response to the challenger finding)
**Insight:** T3's post-challenge revision defines 4 explicit tiers:
- L1 (~10 LoC): Esc → `selectParentNode` — A1 verified, cheap win.
- L2 (~30 LoC): Arrow Up/Down between blocks in nav mode.
- L3 (~50 LoC): Custom Enter-at-isolating-boundary command — RISKY (A5 verified from ProseMirror source but untested in practice).
- L4 (~20 LoC): Escape priority chain coordination.
The tiers give a natural stopping point if L3 proves harder than A5 suggests. T3 said "L1+L2 is still valuable; L3+L4 can defer if too complex."
**Why still applies:** Our D4 locks "Block-UX Phase 2 IN P0" but treats it as one monolithic deliverable with no contingency. Our §9.11 is 3 bullet points. If L3's `tr.insert($pos.after(depth), paragraph)` doesn't work in practice (nested containers, multi-empty-paragraph edge case), we have no graceful descope path. Greenfield directive said "no deferred debt" — but that doesn't require shipping everything monolithically; it means having no half-broken features live. An L1+L2 without L3 is not broken, just narrower.
**Recommended addition to our spec:** Expand §9.11 with explicit L1/L2/L3/L4 subsections matching T3's. Add a risk row: "L3 custom-command edge cases (multi-empty-paragraph, deeply-nested containers) may require iteration beyond A5 source verification — descope path: ship L1+L2+L4 as Phase 2 MVP, move L3 to Explored Future Work with trigger 'L3 edge-cases surface during Phase 2 implementation'." Add a corresponding KN-series test scenarios covering L1 & L2 independently (so they can verify green without L3).

### [KEEP-6] L3 custom-command error-handling contract (return false fallback)
**Source:** T3 §3.4 "Error handling" paragraph + audit-findings M2
**Insight:** T3 explicitly documents: if the custom Enter-at-container-boundary command encounters unexpected state (cursor not in expected position, multiple empty paragraphs, `$pos.after(depth)` invalid), it returns `false` (standard ProseMirror convention), letting default editor behavior take over — no risky DOM mutation attempted. This is load-bearing safety for a command that manipulates positions across isolating boundaries.
**Why still applies:** Our §9.11 says "Custom ProseMirror command for isolating-boundary Enter (lifts empty child to sibling after component)" in one bullet, no error-handling contract. Implementation without this contract risks silent corruption if a user hits the command in an unexpected state.
**Recommended addition to our spec:** Add to §9.11 L3 sub-bullet: "Error-handling contract: command returns `false` (ProseMirror convention) if cursor not in expected position, multiple empty paragraphs present, or `$pos.after(depth)` returns an invalid position. Fallback is default ProseMirror behavior — NO partial DOM mutation on unexpected state."

### [KEEP-7] Drag-handle peer-dep + NodeViewWrapper attribute requirements
**Source:** T3 §3.1 implementation notes + §5 Tech Stack table
**Insight:** T3 enumerates concrete integration requirements for `@tiptap/extension-drag-handle-react`:
- Peer deps: `@tiptap/extension-node-range`, `@tiptap/extension-collaboration`, `@tiptap/y-tiptap`, `yjs` (all already installed, but node-range is NOT obvious from our current §5/§9.10 which only names drag-handle-react + drag-handle peer).
- NodeViewWrapper attrs required: `data-drag-handle=""` + `draggable="true"` on the wrapper, `contentEditable={false}` on the handle element.
- `onNodeChange({ node, editor, pos })` fires on hovered-block change (deduped by block identity, not on every mousemove).
- `lockDragHandle()` / `unlockDragHandle()` freeze visibility while context/slash menus are open.
**Why still applies:** Our §9.10 is 4 bullets; it mentions `lockDragHandle`/`unlockDragHandle` but misses `@tiptap/extension-node-range`, the `data-drag-handle` attribute contract, and `onNodeChange` dedup semantics. Our Q2 integration probe against CollaborationCursor will hit these integration points — implementer needs them written down.
**Recommended addition to our spec:** Expand §9.10 to a proper integration checklist. Add to §9.10:
- Peer deps: `@tiptap/extension-node-range@3.22.3` (in addition to the drag-handle peer).
- NodeViewWrapper contract: `data-drag-handle=""` + `draggable="true"` on wrapper, `contentEditable={false}` on handle/children elements.
- `onNodeChange` deduplicates by block identity — safe to trigger React setState on every invocation.
- Add to FR-15: "Peer deps also include `@tiptap/extension-node-range`."

### [KEEP-8] Cross-container drop validation behavior (schema-only, no `handleDrop`)
**Source:** T3 §3.1 "Cross-container drag behavior"
**Insight:** T3 clarifies: `isolating: true` does NOT prevent dragging (ProseMirror drag is schema `draggable`, not `isolating`), BUT drop validation uses schema content-expressions — invalid drops fail silently (no error, just no drop). T3 explicitly says "For P0, rely on schema validation — invalid drops fail silently. Explicit drop-target restriction (custom `handleDrop`) is out of scope."
**Why still applies:** Our SPEC has zero discussion of drag-drop validity. When a user drags a Callout into the middle of a Steps container, what happens? Schema says `content: 'block*'` on jsxComponent — all blocks accept all blocks. This creates a potentially-unintended "any block inside any container" permissiveness that we should acknowledge explicitly.
**Recommended addition to our spec:** Add a scope note under §9.10 or §6 Non-goals: "NGxx: Custom drop-target restriction via `handleDrop` — out of P0. Schema `content: 'block*'` permits any block inside any component; invalid cross-container drops fail via schema validation with no UI feedback. Drop-target highlighting + `handleDrop`-based restriction is Future Work (paired with NG4 context-aware insertion filtering)."

---

## DISCUSS — needs user judgment

### [DISCUSS-1] Hover outline as distinct visual state (beyond NodeView selection)
**Source:** T3 §3.9 + test scenarios HO01-HO03
**Question:** T3 specifies a DISTINCT hover outline on component blocks, visually different from the selection outline. Promoted to P0 as "immediate polish with zero risk" (~10 lines of CSS). Our SPEC mentions `ComponentToolbar` appears on selection but says nothing about a hover-state visual.
**Options:**
- A) Add it (P0, trivial). Ship a subtle hover tint + stronger selection outline per T3 HO03.
- B) Defer. Let the drag-handle SideMenu appearance on hover be the only hover feedback; add explicit hover outline only if user testing surfaces it as a gap.
- C) Add minimal version: outline only on registered components (signals "you can edit me"), not on wildcard/unregistered.
**Recommendation:** Lean A (LOW confidence). It's ~10 lines of CSS, zero behavioral risk, and the "is this block interactive?" discoverability question is real when the SideMenu hasn't rendered yet (initial hover has a delay). Could trivially add to §9.10 Phase 1.

### [DISCUSS-2] Graceful error boundaries for context-dependent components
**Source:** T3 §3.6 + test scenarios EB01-EB04
**Question:** T3 calls out the "Tab outside Tabs" render-error case and proposes a designed error state ("This Tab needs to be inside a Tabs container") instead of raw React stack trace. Our SPEC is silent on component render errors. Our descriptor-dispatch model means any registered component renders live — if `<Tab>` (a fumadocs child component) is rendered without the `<Tabs>` context, it will throw.
**Options:**
- A) Add ComponentErrorBoundary wrapping descriptor-rendered components. Catch render errors, show graceful UI. In scope for P0 (touches every NodeView render).
- B) Defer to Future Work. Let React errors surface as crashes during P0; add error boundaries when they become frequent.
- C) Add ComponentErrorBoundary ONLY for the context-dependent cases we know about (Tab, AccordionItem). Scope-limited fix.
**Recommendation:** Lean A (MEDIUM confidence). Our "live React render" promise means render errors WILL happen for fumadocs components with implicit parent requirements (fumadocs Tab uses context; AccordionItem uses Radix context). Without an error boundary, a user who inserts `<Tab>` via slash menu at top level will see a red crash overlay in WYSIWYG — worse than before (which rendered raw JSX text). This is a correctness/polish gap large enough to warrant P0 inclusion. ~60 LoC including the boundary component and per-component error messages. T3's EB01-EB04 scenarios port cleanly.

### [DISCUSS-3] Suppress empty prop panel when all props are ReactNode / none editable
**Source:** T3 §3.7 + test scenarios ES01-ES03
**Question:** T3: components whose only props are `reactNode` types (e.g., `<Step>` has only `children` of type ReactNode) should NOT show a PropPanel at all — empty panel wastes space. Our SPEC's FR-11 says PropPanel renders on block selection with auto-generated controls; doesn't specify empty-panel suppression.
**Options:**
- A) Explicit FR: PropPanel renders only if `descriptor.props.filter(p => p.type !== 'reactNode' && p.type !== 'unknown').length > 0`. If zero editable props, skip PropPanel rendering entirely (still allow NodeSelection + drag handle).
- B) Render empty panel with a "No editable properties" placeholder. Explicit state for users.
- C) Always render PropPanel; show breadcrumb header even when empty (keeps UI consistent — panel is the "I'm selected" affordance).
**Recommendation:** Lean A (HIGH confidence). T3 locked this via D-equivalent and it's universally applied in surveyed editors. Step, wildcard-descriptor, and any reactNode-only component would show empty panels otherwise — real UI noise. One-line filter in FR-11. Trivial.

### [DISCUSS-4] Radix Popover vs @floating-ui/react preference for floating PropPanel
**Source:** T3 §3.5 + audit-findings M3
**Question:** T3's audit found §3.5 ambiguous ("Radix Popover or `@floating-ui/react`"). Audit recommended a preference sequence: "Preferred Radix Popover (no new dep, established interaction hooks); fallback @floating-ui/react if Radix portals conflict with ProseMirror DOM management (verify during implementation)." Our FR-11 says "Radix popover floating near the block" — picked Radix, but there's no documented verification that Radix Popover anchors cleanly inside a NodeView (T3 A4 was MEDIUM confidence, unverified).
**Options:**
- A) Accept Radix as DIRECTED; add a risk row ("Radix Popover portal inside NodeView may conflict with ProseMirror DOM management — fallback @floating-ui/react if needed").
- B) Do a quick probe during Phase 1 alongside Q2 (drag-handle + CollaborationCursor) — add to Q-table as Q7.
- C) Use `@floating-ui/react` directly (already in dep tree transitively via @tiptap/extension-drag-handle-react's positioning needs). Skip Radix entirely.
**Recommendation:** Lean B (MEDIUM confidence). A quick probe eliminates the A4 unverified risk before implementation commits. ~30 min probe cost; delivers explicit evidence rather than a risk deferred to runtime. Add Q7 to §11 Open Questions: "Q7: Radix Popover anchoring inside NodeView — does portal placement conflict with ProseMirror contentDOM? Probe during Phase 1 Q2 window; fallback is `@floating-ui/react`."

---

## ALREADY CAPTURED — summary

One-liners grouped by T3 section:

**T3 §3.1 (SideMenu / drag handle):**
- Unified SideMenu pattern (grip + "+" in one container) → our §9.10.
- `lockDragHandle()` / `unlockDragHandle()` around menu lifecycles → our §9.10.
- BlockNote SideMenu as prior art → cited as "TipTap SlashCommandTriggerButton pattern" in FR-16.

**T3 §3.2 (child badge suppression):**
- Parent-detection via `doc.resolve(getPos()).parent.type.name` → our FR-17 + §9.7.
- Parent badge persistence + child suppression → our §9.7 `isChildOfComponent` check.

**T3 §3.3 ("+" insertion between blocks):**
- "+" inserts paragraph + "/" → Suggestion detects → our FR-16.
- Context-aware filtering out of scope → our NG4.

**T3 §3.4 (keyboard nav dual-mode):**
- Esc → `selectParentNode`; Arrow Up/Down between blocks; Enter enters edit mode → our FR-18.
- Escape priority chain → our §9.11 "Suggestion (slash + wiki-link unified per #53) → Radix popover → keyboard-nav → default".
- A5 verified (tr.insert bypasses isolating) → our §9.11 custom command description.

**T3 §3.8 (component transformation REJECTED):**
- No transformation feature → implicit in our D1 (one-node descriptor dispatch makes transformation trivially unnecessary; any component can render via any descriptor at any time).

**T3 §3.10 (real Mermaid rendering):**
- Mermaid as a real component (not shadcn placeholder) → our §8 "Mermaid/Audio wrapper files absent" + D3 (P0 built-in via shadcn wrapper). Note: our D3 scope says "Mermaid + Audio shadcn wrappers" — we commit to writing them but the implementation specifics (dynamic import, error state, memoization per T3 §3.10) are NOT in our SPEC. This is arguably KEEP-adjacent — see DISCUSS-5 below if desired. Treated as ALREADY CAPTURED at the scope level (we commit to writing the component); IMPLEMENTATION details from T3 §3.10 are good reference material.

---

## OBSOLETE — summary

**Superseded by PR #136 (tolerant parsing, jsxInline, rawMdxFallback):**
- T3 assumed typed-component-nodes PR #23 schema (`jsxComponentEditable` parent-type-name check). Our single widened `jsxComponent` + descriptor dispatch makes parent-type checks trivially portable (the type name is just `'jsxComponent'` for both parent and child).
- T3 required raw-JSX UI for unregistered components. Our wildcard descriptor + InlineBadge/UnregisteredBadge handles this in ONE render path, not a separate fallback node type.

**Superseded by PR #51 (pluggable slash-command) — pre-merged relative to T3:**
- T3's §3.3 evidence-staleness (`startOfLine: true`) and the "no programmatic trigger" investigation. Our FR-14 uses the already-landed pluggable `itemsSources` API.
- T3's audit-rebase-findings H (slash-commands.tsx path) — file no longer exists in the target; our SPEC references correct `slash-command.ts` paths.

**Superseded by PR #53 (wiki-link on @tiptap/suggestion):**
- T3's Escape priority chain had a SEPARATE "wiki-link-suggestion plugin" branch (item 2). Our §9.11 correctly collapses this: wiki-link and slash now share the `@tiptap/suggestion` plumbing, so "Suggestion" wins uniformly as ONE priority tier. T3's 5-item chain becomes our 4-item chain. Our simplification is CORRECT — no lost capability.

**Superseded by our D1 (one widened jsxComponent + descriptor dispatch):**
- T3's §3.8 transformation REJECTED — moot in our world; descriptor dispatch IS the transformation story (re-render via different descriptor, no schema mutation).
- T3's OQ7 transformation compatibility graph — moot.
- T3's stale evidence file transformation matrix (design-challenge H4) — moot.
- T3's §3.2 two-node-name check (`jsxComponentEditable`) — our one-node model, single check.

**Superseded by our D4 (Block UX Phase 2 IN P0) + D8 (Inline L3 IN P0) + D10 (custom components IN P0):**
- T3's "Future Work: multi-block selection / keyboard reorder / inline prop editing / preview toggle" — relevant but now within a BROADER P0; some of these (inline prop editing) are NOW our D8 core scope, not Future Work.
- T3's §3.8 "What would change this decision: if typed components grow to near-duplicates" — moot because transformation isn't a feature at all in our model.

**Superseded by shipped baseline context (post-#128 observer origin model, post-#126 .mdx parity, post-#136):**
- T3's R9 `markUserTyping()` → `markTyping()` prop rename (audit-rebase-findings M3) — our SPEC already uses `markTyping` (FR-13).
- T3's baseline-commit staleness (audit M1 + rebase M4) — we're on a fresh 699a27e baseline with SHIPPED date tracking.
- T3 Evidence file `evidence/technical-investigations.md` startOfLine staleness (audit H1) — moot.

---

## Summary recommendation (ordered by impact)

**HIGH-value additions (high confidence, scope-proportionate):**
1. **KEEP-1** Test Scenarios section (~50 scenarios, 150 LoC of markdown)
2. **KEEP-2** Accessibility section (~50 LoC, ports cleanly)
3. **KEEP-3** Empty-container placeholder FR-16a (~30 LoC of impl)
4. **KEEP-4** Breadcrumb on child selection (~20 LoC of impl, paired with child-suppression per T3 D4)
5. **KEEP-5** L1–L4 keyboard-nav tiering in §9.11 (documentation + 1 risk row)
6. **DISCUSS-3** Suppress empty prop panel — recommendation A (1-line filter in FR-11)

**MEDIUM-value additions:**
7. **KEEP-6** L3 custom-command error-handling contract (1 paragraph in §9.11)
8. **KEEP-7** Drag-handle peer-dep + NodeViewWrapper attr contract (expand §9.10)
9. **KEEP-8** Cross-container drop validation scope note (1 sentence in §6 or §9.10)
10. **DISCUSS-2** Context-dependent error boundaries — recommend A (~60 LoC)
11. **DISCUSS-1** Hover outline — recommend A (~10 LoC CSS)
12. **DISCUSS-4** Radix Popover probe as Q7 (add OQ row)

**No-action (confirmed complete or irrelevant):** 6 ALREADY CAPTURED clusters, 6 OBSOLETE clusters.

Implementer-facing impact: KEEP-1 and KEEP-2 alone add ~200 LoC of spec content but ZERO implementation cost beyond what's already planned — they document acceptance criteria and A11y requirements that implementation would otherwise reinvent (often incorrectly). Everything else is additive small deltas.
