# Design Challenge Findings — Second Pass

**Artifact:** `specs/2026-04-14-component-blocks-v2/SPEC.md`
**Challenge date:** 2026-04-14
**Pass:** 2 (first pass produced 10 findings; all applied or dismissed — not re-proposed here)
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Finding: D12 forecloses a credible hybrid (direct-import leaves + pattern-copy compounds) that eliminates FR-27 R1 risk entirely

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** D12 (§10), §9.15 (Context Bridge Registry), FR-27 R1 (§15)
**Issue:** D12 treats "fidelity with fumadocs" as a monolithic commitment: either import ALL fumadocs-ui components directly (requiring the Context Bridge for compounds) or rewrite ALL of them (rejected as "Tier 3 divergence"). This binary framing misses a hybrid architecture that achieves the stated fidelity goal with significantly less risk.

**Current design:** "Fidelity priority: use fumadocs-ui components directly (no editor-local rewrites). Solve NodeView-portal-context-mismatch via Context Bridge Registry infrastructure rather than rewriting containers." (D12)

**Alternative — Hybrid approach (direct-import leaves + pattern-copy compounds):**

The 18 P0 components split cleanly:
- **12 leaf components** (Callout, Card, Steps/Step, ImageZoom, Banner, TypeTable, InlineTOC, Mermaid, Audio, plus self-contained Files/Folder per §9.15.5 table showing "0 — each Folder is self-contained"): these have zero compound-context dependency. Import directly from fumadocs-ui. Fidelity = 100%. No Context Bridge needed.
- **4-6 compound components** (Tabs/Tab, Accordion/AccordionItem, possibly Files/Folder if reclassified): pattern-copy the fumadocs implementations (~200-300 LoC per ecosystem research §4, Tier 1+2+3 estimates) and design their state management to work natively with TipTap's portal architecture. A simplified store (~80 LoC) replaces the generic Context Bridge (~670 LoC).

**Comparison:**

| Dimension | Current (D12 + Context Bridge) | Hybrid (leaf import + compound copy) |
|---|---|---|
| Leaf fidelity | 100% (direct import) | 100% (direct import — identical) |
| Compound fidelity | 100% (direct import) | 95-99% (pattern-copy, periodic sync with upstream) |
| FR-27 R1 risk | HIGH — unvalidated scope-resolved Radix capture; implementation-gating | **Eliminated** — no Radix scope bridging needed; you own the compound code |
| FR-27 R2 risk | MEDIUM — Collection-hook bridging for keyboard nav | **Eliminated** — pattern-copy controls its own Collection implementation |
| FR-27 R3 risk | MEDIUM — mutable-array-push-during-render at fumadocs layer | **Eliminated** — pattern-copy can fix the purity violation directly |
| New LoC | ~670 (Context Bridge) | ~200-300 (compound copies) + ~80 (simple store) |
| Dependencies on Radix internals | High (scope-resolved Context capture reads `__scopeTabs`, `__scopeAccordion`) | Zero |
| Maintenance surface | Context Bridge is generic + reusable for NG13 custom components | Compound copies need periodic sync with upstream fumadocs |
| Phase 0 prototype | Required (Q9 — implementation-gating) | Not needed (no unvalidated mechanism) |

**The key trade-off:** The hybrid sacrifices compound-component fidelity tracking (you'd need to manually sync ~200-300 LoC when fumadocs upgrades Tabs/Accordion) in exchange for eliminating the spec's highest-severity risk (FR-27 R1) and its single implementation-gating prototype (Phase 0).

**Decision Log check:** D12 rejects rewrites because "Tier 3 rewrite strategy (from fumadocs-ecosystem research §4) would diverge editor render from production render." But the hybrid only rewrites 4-6 compound components while keeping 12 leaf components as direct imports. The divergence risk is confined to the compound components' container chrome (tab triggers, accordion toggles) — not their content rendering. The leaf components (where visual fidelity matters most — Callout, Card, Steps styling) remain 100% fidelity.

**Verdict on D12's rejection:** The rejection rationale ("diverge editor render from production render") treats all 18 components as equally fidelity-critical. In practice, compound components' visual fidelity is in their chrome (tab bar appearance, accordion toggle icon), which is implementation detail, not semantic rendering. The content inside Tab/AccordionItem renders identically either way because it's PM-managed children. The rejection is **weak for the compound subset specifically**.

**Trade-off:** Eliminates FR-27 R1/R2/R3 risks + Phase 0 gating; confines maintenance surface to ~200-300 LoC of compound components that change infrequently (fumadocs Tabs/Accordion APIs have been stable since v14). Loses: automatic upstream fidelity for compound chrome.

**Status:** CHALLENGED
**Suggested resolution:** Evaluate the hybrid as a first-class option alongside D12. If Phase 0 prototype (Q9) succeeds, the current design is validated and the hybrid is unnecessary. But if Phase 0 fails or surfaces significant complexity, the hybrid is the pre-defined retreat path — not a separate spec cycle. Explicitly budget the hybrid as Fallback 2 in the Phase 0 gating section.

---

### [H2] Finding: Phase 0 prototype gating (Q9) has no explicit fallback cascade beyond one unvalidated alternative

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Q9 (§11), §13 Next Actions step 1, §15 FR-27 R1
**Issue:** Phase 0 gates the entire Context Bridge architecture on a single unvalidated mechanism (scope-resolved Context capture via `use()`). The spec provides one fallback (scope-prop forwarding through the bridge store), but that fallback is also unvalidated. If both fail, the spec provides no pre-evaluated retreat path, creating a cliff where implementation stalls and requires a new design cycle.

**Current design:** "Phase 0 of implementation (see §13 Next actions step 1). Build minimal `<Tabs>` + 2 `<Tab>` prototype; verify `ContextCapture` publishes the right Context identity... Fallback path: scope-prop forwarding through the bridge store (§15 R1 mitigation). STOP_IF: scope capture fundamentally doesn't work — escalate before committing further." (Q9)

**Gap analysis:**

The spec's decision cascade:
1. **Primary:** Scope-resolved capture via `use()` in `<ContextCapture>` — UNVALIDATED
2. **Fallback 1:** "Forward the `__scopeTabs` prop through the bridge store and let the child re-provide using the same scope object" — ALSO UNVALIDATED
3. **Fallback 2:** [MISSING]

The "escalate before committing further" instruction in STOP_IF is an open-ended directive, not a pre-evaluated option. In practice, "escalate" during implementation means: stop, re-spec, lose momentum. A pre-evaluated Fallback 2 would prevent this.

**Missing Fallback 2 — Pattern-copy compound components:**
If both scope-resolved capture AND scope-prop forwarding fail (indicating that Radix's scope architecture is fundamentally incompatible with cross-portal bridging), the viable retreat is pattern-copying compound components (see H1). This eliminates the Context Bridge entirely for compounds. The spec has all the evidence needed to pre-evaluate this path:
- Ecosystem research §4 estimates ~350 LoC for Callout + Steps + Card + Tabs
- Container-behavior research confirms structural correctness of all containers
- fumadocs author's own fuma-editor used Base UI (not fumadocs-ui), confirming pattern-copy is a recognized approach

**What a skeptical engineering manager would flag:** "You're gating the feature's most complex subsystem on an unvalidated mechanism with an untested fallback and no pre-planned retreat. Budget the retreat path explicitly — otherwise Phase 0 failure becomes a schedule surprise."

**Trade-off:** Adding Fallback 2 costs zero implementation effort (it's a documented escape hatch, not code). It reduces schedule risk by ensuring Phase 0 failure is a routing decision, not a design restart.

**Status:** CHALLENGED
**Suggested resolution:** Add explicit Fallback 2 to Q9 and §15 FR-27 R1: "If both scope-resolved capture AND scope-prop forwarding fail, retreat to hybrid approach (H1): direct-import leaf components, pattern-copy compound components (~300 LoC), eliminate Context Bridge for compounds entirely. This retreat path is budgeted at ~2 days and does not require a new spec cycle."

---

## Medium Severity

### [M1] Finding: Nested CM-in-PM is correctly chosen but the spec under-communicates its role as foundational infrastructure for NG10

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §9.14, D13, NG10 (§16)
**Issue:** §9.14 frames the CM-in-PM nested editor as solving the rawMdxFallback editing problem. But rawMdxFallback is a degraded state — documents typically have 0-5 instances. The spec buries the stronger justification (foundational infrastructure for NG10 per-block source-mode toggle) in a single sentence under "Forward-compatibility."

**Current design:** "rawMdxFallback NodeView embeds a CodeMirror 6 editor instance for inline editing of raw MDX source. Replaces plain PM-text-node editing with syntax-highlighted, keybinding-consistent source editing — aligned with the architectural principle that source editing uses the source editor regardless of outer container." (§9.14)

The forward-compatibility mention: "the `createNestedCMExtensions` factory accepts an optional `language: LanguageSupport` parameter. When Component Blocks v2 expands to per-block code editing (NG10, deferred), the same infrastructure serves JSX/TSX/Python highlighting per block." (§9.14, last paragraph)

**Issue with the framing:** D13's rationale gives four reasons. All four are valid but none addresses the proportionality question: is ~350 LoC + ~500 LoC tests justified for a degraded-state feature that affects 0-5 blocks per document? The answer is YES — but because of NG10, not rawMdxFallback alone. The spec should lead with the foundational-infrastructure argument, not bury it.

**Independent reasoning on the CM-vs-PM-text question:** I independently considered whether rawMdxFallback could use a simpler PM text container (no CM embed). The research report confirmed: CM provides interactive decorations (wiki-link click-navigation, md-link navigation), completion sources (wiki-link autocomplete on `[[`), bracket matching, and clean PM sync — far beyond static syntax highlighting. A contenteditable div can't provide these without reimplementing CM's architecture. The PM-dispatch constraint (NOT y-codemirror.next) is well-founded: dual-observer conflict with y-prosemirror is uncharted territory with zero production precedent. These conclusions align with D13's rationale.

**Decision Log check:** D13 was LOCKED with user concurrence. Not re-litigating the decision — challenging the framing's proportionality communication.

**Trade-off:** Reframing costs zero implementation effort. It strengthens the rationale by making the investment proportional to its actual scope (foundational infrastructure for all future per-block editing, not just a degraded-state UX improvement).

**Status:** CHALLENGED
**Suggested resolution:** Restructure §9.14's opening to lead with: "Establishes the foundational CM-in-PM infrastructure (Architectural Precedent #24) that serves both rawMdxFallback (P0) and future per-block source-mode toggle (NG10). The investment is proportional to the platform primitive it creates, not just the rawMdxFallback use case."

---

### [M2] Finding: CSS variable bridge rejection of `fumadocs-ui/style.css` is correctly reasoned but under-documented in the spec itself

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §9.7a, lines 1105-1108
**Issue:** The spec states `fumadocs-ui/style.css` is "NOT imported" because it "sets `body { background-color; color }` and resets `border-color` on ALL elements; conflicts with our design system." The fumadocs-container-behavior research provides three specific conflicts but the spec only names two. A future implementer reading only the spec (not the research report) might question whether importing a subset of style.css is viable, or whether the rejection was overly cautious.

**Current design:** "fumadocs-ui/style.css (3296 lines) — sets `body { background-color; color }` and resets `border-color` on ALL elements; conflicts with our design system. fumadocs-ui/css/preset.css (312 lines) — declares `@variant dark (&:where(.dark, .dark *))` which may conflict with our existing `@custom-variant dark (&:is(.dark *))` in globals.css; also triggers base layer resets." (§9.7a)

**Three specific conflicts from research (should all appear in spec):**
1. `body { background-color: var(--color-fd-background); color: var(--color-fd-foreground) }` — overrides editor body styling
2. `@layer base { *, *::before, *::after { border-color: var(--color-fd-border) } }` — globally resets ALL element borders including editor buttons, inputs, panels
3. `@variant dark` vs our `@custom-variant dark` — variant strategy conflict causing incorrect dark-mode scoping

**The bridge (~80 LoC) is well-proportioned.** Independent analysis confirms: 14 variable aliases + 5 callout colors + Steps utilities + animation keyframes + prose-no-margin + `@source` directive. This is a clean, targeted solution.

**Trade-off:** Adding the third conflict to the spec costs one sentence. It prevents future implementers from reopening the style.css question.

**Status:** CHALLENGED
**Suggested resolution:** Expand the `fumadocs-ui/style.css` rejection in §9.7a to name all three conflicts explicitly. The spec is the durable artifact; research reports are supplementary.

---

### [M3] Finding: NG13 deferral is architecturally clean but the spec lacks an explicit extensibility-seam statement at the registry

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** NG13 (§3), FR-8 (§6), §16 (Future Work), `evidence/custom-components-deferred.md`
**Issue:** The spec defers custom components (NG13) and preserves thorough prior analysis in the evidence file. The descriptor registry (`Map<string, JsxComponentDescriptor>`) is architecturally extensible — custom components would merge additional entries into the same Map at startup, with zero schema changes. But the spec doesn't make this extensibility seam explicit at the registry definition (FR-8), creating a gap where a future re-spec might redesign the registry from scratch rather than extending it.

**Current design:** "Registry source: committed built-ins manifest at `packages/core/src/registry/built-ins.ts` (18 components). User-registered custom components (formerly D9/D10, now NG13) are out of scope; full prior analysis preserved in `evidence/custom-components-deferred.md`." (FR-8)

**Independent analysis of architectural debt:**

The registry's `Map<string, JsxComponentDescriptor>` structure accommodates custom components naturally:
- Adding entries: `userDescriptors.forEach(d => registry.set(d.name, d))` — one line
- Wildcard fallback already handles unknown components gracefully
- `contextCapture` field is optional — custom components don't need it unless compound
- Schema is one-node (`jsxComponent`) — no migration when adding components (confirmed by `prosemirror-schema-evolution.md` Q1/Q2)
- Serialization via γ pattern works identically for custom and built-in components
- The evidence file's §1 already describes the `.open-knowledge/components.ts` merge pattern

The deferred concerns (styling isolation, security, name collision) are product decisions, not architectural constraints. They don't block the registry interface.

**What the evidence file gets right:** `custom-components-deferred.md` §1 describes the config-file pattern. The re-spec entry criteria (§9) are well-defined. The open questions (§6, 10 items) are thorough.

**What's missing:** A forward-reference at FR-8 stating the extensibility-seam intention. This anchors the re-spec to the current interface rather than inviting a clean-slate redesign.

**Trade-off:** One sentence at FR-8 costs nothing. It prevents architectural drift between the built-ins spec and the future custom-components spec.

**Status:** CHALLENGED
**Suggested resolution:** Add a forward-reference at FR-8: "The registry's `Map<string, JsxComponentDescriptor>` interface is designed as a stable extensibility seam for NG13 (custom components). Future user-registered components merge into the same Map at startup with zero schema or registry-structure changes. See `evidence/custom-components-deferred.md` for the preserved design work."

---

## Low Severity

### [L1] Finding: Spec length (2148 lines) is proportionate but test scenarios (~420 lines, 20%) could be a separate document

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §7a (test scenarios, lines 245-770)
**Issue:** The spec is 2148 lines for what the challenge prompt correctly identifies as "one feature." However, the spec actually covers THREE subsystems (component blocks + nested CM + context bridge) that interact through shared architectural primitives (the γ dirty-tracking pattern, the descriptor registry, the source-dirty observer). The length is driven by thoroughness (test scenarios, accessibility, risks), reference implementations (~200 LoC of code blocks in §9.14 and §9.15), and the three-subsystem scope.

**Independent assessment of proportionality:**

| Section | Lines | % | Necessity |
|---|---|---|---|
| Problem + goals + personas + journeys (§1-5) | ~120 | 5.6% | Required — frames the problem |
| Requirements (§6) | ~170 | 7.9% | Required — defines the contract |
| Metrics + test scenarios (§7+7a) | ~420 | 19.5% | Test scenarios could be separate |
| Proposed solution (§9) | ~720 | 33.5% | Includes ~200 LoC of reference code |
| Decision log + questions + assumptions (§10-12) | ~70 | 3.3% | Required — decision audit trail |
| Scope + a11y + risks + future work + agent constraints (§13-17) | ~260 | 12.1% | Required — operational completeness |

**Could a spec half this size achieve the same outcomes?**

To reach ~1074 lines, you'd need to cut ~420 (test scenarios) + ~200 (reference code) + ~60 (accessibility) + ~30 (alternative architectures table) = ~710 lines → ~1438. Still 34% over "half." Further cuts would remove decision rationale or risk analysis — genuinely load-bearing content.

**What's NOT over-specified:**
- The Context Bridge reference implementation (§9.15.4) is justified: the architecture is novel (no TipTap+Radix production precedent), the code blocks communicate the exact contract, and the alternative-architectures analysis (§9.15.6) prevents an implementer from re-investigating rejected options.
- The nested CM data-flow trace (§9.14) is justified: the PM-dispatch sync lifecycle is intricate and getting the offset math wrong causes content corruption.
- The Decision Log (§10) carries forward from a multi-session process with scope reversals (D9/D10 → NG13) — the rationale trail is essential for future readers.

**Trade-off:** Moving test scenarios to a separate document reduces SPEC.md by ~420 lines without losing any information. The test scenarios are acceptance criteria for implementers, not design decisions for reviewers.

**Status:** CHALLENGED
**Suggested resolution:** Consider splitting §7a test scenarios into `meta/test-scenarios.md` with a one-line reference from SPEC.md. This is a readability optimization, not a content reduction. The spec's design-level content is proportionate to its three-subsystem scope.

---

### [L2] Finding: §9.15.8 effort estimate (670 LoC) excludes prototyping cost that determines whether D12 fidelity is achievable

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §9.15.8 (Estimated effort)
**Issue:** The effort estimate for the Context Bridge lists core bridge (~250 LoC) + compound configs (~120 LoC) + tests (~280 LoC) = ~670 LoC. This excludes the cost of the Phase 0 prototype (Q9), per-compound integration testing, and fallback evaluation — the empirical work that determines whether the LoC estimate is even reachable.

The research report's open items (§13) list 6 items that "need hands-on prototyping during implementation." The effort estimate treats them as zero-cost.

**Trade-off:** Acknowledging the prototyping cost in the estimate doesn't change the architecture but sets implementer expectations correctly.

**Status:** CHALLENGED
**Suggested resolution:** Add a "Phase 0 budget" line to §9.15.8: "Phase 0 prototype (Q9) + per-compound integration: ~1-2 days beyond the LoC estimate. This is prototyping cost, not production code."

---

## Confirmed Design Choices (summary)

The following design choices held up under challenge, grouped by lens:

**DC1 (Simpler alternative):**
- Context Bridge Registry as a primitive is NOT over-engineering — the portal-topology problem is real, confirmed by 2+ years of unresolved TipTap issues (#6427, #6547), and the ~250 LoC core is proportionate. Shadow-DOM-per-NodeView is infeasible (breaks CRDT sync via y-prosemirror's `contentDOM` traversal). Application-level wrapping is infeasible (Radix `createContextScope` creates unique Context instances per scope — naive wrapping uses `BaseContext`, not the scope-injected one). The pub/sub store (`useSyncExternalStore`) is simpler and safer than portal rendering into parent DOM (Option B bypasses PM's contentDOM model, breaking CRDT sync). **However:** the hybrid alternative in H1 is a credible simpler path for the compound-component subset specifically.
- CM-in-PM nested editor is correctly chosen over plain PM text editing. CodeMirror provides interactive decorations (wiki-link/md-link click-navigation), completion sources (wiki-link autocomplete on `[[`), bracket matching, and clean PM sync — far beyond syntax highlighting. A contenteditable div cannot provide these without reimplementing CM's architecture.
- The PM-dispatch constraint (NOT y-codemirror.next) is well-founded. Dual-observer conflict between y-codemirror.next and y-prosemirror on the same Y.XmlText is uncharted territory with zero production precedent. Both libraries observe the same Y type with independent origin guards and no cross-origin filtering. Direct PM dispatch is the canonical PM tutorial pattern, proven across multiple implementations (ProseMirror examples, Remirror, Emergence Engineering).
- CSS variable bridge (~80 LoC) is proportionate and correctly chosen over importing `fumadocs-ui/style.css` (3296 lines with body-level styling conflicts, global border-color reset, dark mode variant collision).

**DC2 (Stakeholder gap):**
- NG13 deferral does not create architectural debt. The descriptor registry's `Map<string, JsxComponentDescriptor>` is naturally extensible for future custom components. The deferred concerns (styling isolation, security, name collision) are product decisions, not architectural constraints.
- Accessibility (§14) coverage is thorough and load-bearing — WCAG 2.1 compliance for keyboard navigation, focus management, and screen reader announcements is correctly treated as P0.
- Agent constraints (§17) correctly scope `observers.ts` and `parse-with-fallback.ts` edits to surgical, bounded changes with explicit STOP_IF conditions. The EXCLUDE boundary for bridge invariants is appropriate.
- The ~80 LoC CSS bridge is the correct CSS integration strategy. Importing style.css or preset.css would introduce body-level conflicts, global border-color resets, and dark-mode variant collisions that compromise the editor's existing design system.

**DC3 (Framing validity):**
- The Problem Statement's Complication holds: brownfield MDX content exists today, the editor renders it as opaque atoms, and the gap between source-only and WYSIWYG erodes adoption. These dimensions genuinely interact — the complication is structural, not post-hoc.
- The spec's three-subsystem scope (component blocks + nested CM + context bridge) is justified because all three subsystems share architectural primitives (descriptor registry, γ dirty-tracking, source-dirty observer) and must be designed together. Shipping component blocks without nested CM would leave rawMdxFallback as a non-editable `<pre>` block; shipping without the context bridge would leave compound components throwing errors in WYSIWYG.
- Spec length (2148 lines) is proportionate to the three-subsystem scope, though test scenarios could be separated for readability (L1).
