# Design Challenge Findings

**Artifact:** `specs/2026-04-11-wiki-link-suggestion-migration/SPEC.md`
**Challenge date:** 2026-04-11
**Total findings:** 7 (3 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: Simpler alternative not considered — incremental upgrade vs full rewrite

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §1 (Problem Statement), §8 (Decision Log)
**Issue:** The spec proposes a full architectural migration (338-line custom plugin → @tiptap/suggestion with custom matcher, ~180 lines estimated) to address positioning gaps and achieve "architectural alignment," but doesn't evaluate a substantially simpler incremental upgrade path.

**Current design:** "Migrate to `@tiptap/suggestion` with a custom `findSuggestionMatch` function... Pure view-layer change with zero user-visible behavior regression."

**Alternative:** Keep the current custom plugin and add only Floating UI positioning (~30-40 lines of change). The current implementation at `wiki-link-suggestion.ts:228-236` uses:
```typescript
const coords = view.coordsAtPos(from);
popup.style.left = `${coords.left}px`;
popup.style.top = `${coords.bottom + 4}px`;
```

This could be replaced with the same Floating UI pattern used in `slash-command.ts:124-150` (virtual element + `computePosition` + `autoUpdate` + `flip` + `offset` + `size` middleware). The rest of the plugin (trigger detection via `Plugin.state.apply()`, keyboard handling via `handleKeyDown`, async fetch + loading states) already works.

**Trade-off comparison:**

| Dimension | Full Migration (current spec) | Incremental Upgrade (alternative) |
|-----------|-------------------------------|-----------------------------------|
| **Lines changed** | ~338 deleted, ~180 new = 518 total churn | ~40 lines (positioning function only) |
| **Risk surface** | Entire suggestion lifecycle (trigger, keyboard, render, positioning, async loading) | Positioning only |
| **User-visible benefit** | Floating UI positioning (flip, dynamic max-height, scroll tracking) | Floating UI positioning (flip, dynamic max-height, scroll tracking) |
| **Architectural alignment** | Two systems use @tiptap/suggestion | Two systems remain (custom for wiki-links, @tiptap/suggestion for slash) |
| **Implementation complexity** | Custom `findSuggestionMatch` + lifecycle adaptation + loading state timing assumptions | Direct Floating UI integration with existing `coordsAtPos` output |
| **Rollback complexity** | Full revert (new trigger logic + new lifecycle) | Single function revert |

**What's gained by full migration over incremental:**
1. "Architectural alignment" — slash and wiki-link both use @tiptap/suggestion
2. Error boundary on insertion (but this is a 3-line `try/catch` addition to current code)
3. Claimed "collaborative-safe `shouldShow`" (see Finding 2 — unverified)
4. Claimed "consistent Escape handling" (current Escape handling works; spec doesn't show what inconsistency exists)

**What's lost:**
1. Working, battle-tested trigger detection logic (182-line state machine in `Plugin.state.apply()`)
2. Known loading state behavior (menu opens with `loading: true`, fetch resolves, updates to `loading: false` — timing is deterministic)
3. Simplicity of reasoning (custom plugin is self-contained; @tiptap/suggestion adds abstraction layer)

**The cost of "architectural alignment":** The spec's Situation (§1) states "slash command migration established `@tiptap/suggestion` as the canonical pattern" but doesn't demonstrate why uniformity is valuable here. The spec doesn't cite:
- Maintenance burden from having two systems
- Developer confusion when adding new suggestion triggers
- Bugs caused by inconsistency
- Plans to add 3+ more suggestion types where a shared abstraction pays off

Without evidence that two-system coexistence is causing harm, "architectural alignment" is an aesthetic preference, not a technical requirement. The incremental path delivers the same user-facing benefit (Floating UI) at 1/13th the code churn and 1/10th the risk surface.

**Status:** CHALLENGED

**Suggested resolution:** Before committing to full migration, verify whether the claimed benefits beyond Floating UI positioning are real:
1. Is there evidence that the current wiki-link plugin is not "collaborative-safe"? (Reproduce steps, logs showing a collaboration bug)
2. What is the "inconsistent Escape handling" and how does it manifest to users?
3. Are there plans to add 3+ more suggestion triggers (mentions, tags, templates) where consolidating to @tiptap/suggestion would avoid duplicating effort?

If the answers are no/unclear/no, the incremental path (just add Floating UI) is substantially simpler and lower-risk. If the answers are yes, document the evidence in the spec's Complication so the migration rationale is grounded in real problems rather than theoretical gaps.

---

### [H] Finding 2: "Collaborative-safe `shouldShow`" claim is unverified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §1 (Complication), §2 (Success Criteria)
**Issue:** The spec claims the current custom plugin "lacks collaborative-safe `shouldShow` option" (Complication, line 27) and lists this as a benefit of migration, but provides no evidence that:
1. The current implementation has collaboration bugs
2. What "collaborative-safe" means in this context
3. How `shouldShow` would prevent the claimed issue
4. Whether this issue has been observed in the wild or is theoretical

**Current design:** "The custom plugin also **lacks** what the slash command gained from migration: No collaborative-safe `shouldShow` option"

**Investigation findings:**
- Grep for `shouldShow|collaborative` in `packages/app/src/editor/extensions` → **no matches**
- Current wiki-link plugin at `wiki-link-suggestion.ts:156-337` has no `shouldShow` logic
- Slash command implementation at `slash-command.ts:70` uses `Suggestion<SlashCommandItem>({...})` but doesn't pass a `shouldShow` option either
- The @tiptap/suggestion source (per `evidence/suggestion-api-compatibility.md`) exposes `shouldShow` as an optional callback to conditionally suppress the menu, but neither the current wiki-link plugin nor the migrated slash command uses it

**Contradiction:** The spec claims the slash command "gained" collaborative-safe `shouldShow` from migration (Situation, line 18), but the slash command implementation doesn't use `shouldShow` at all. This suggests either:
1. The claim is mistaken (slash command didn't gain this)
2. The benefit is theoretical (Suggestion exposes `shouldShow` but we're not using it)
3. "Collaborative-safe" means something else (inherent in Suggestion's lifecycle, not the `shouldShow` callback)

**What would make this claim hold:**
- Evidence of a collaboration bug: "When two users type `[[` simultaneously at the same position, the menu state from User A overwrites User B's query, causing insertion to fail. Logs show..."
- Demonstration that `shouldShow` prevents it: "Suggestion's `shouldShow` callback receives collaborative context (e.g., selection from remote user) and can suppress the menu when the trigger position is stale."
- Confirmation that this is a known limitation: "The custom plugin's state machine in `Plugin.state.apply()` doesn't account for remote transactions; @tiptap/suggestion's internal lifecycle does."

Without this evidence, the claim is unsubstantiated. A skeptical SRE would ask: "Has this bug been observed? What's the repro? What's the mitigation in production today?"

**Status:** CHALLENGED

**Suggested resolution:**
1. If there's a known collaboration bug with wiki-link suggestions, document it: repro steps, logs, user reports. Then verify that @tiptap/suggestion's lifecycle prevents it (not just theoretically, but confirmed via testing or source trace).
2. If this is theoretical ("Suggestion is designed for collaborative editors, custom plugins might not be"), downgrade the claim from "lacks" to "unknown collaborative behavior" and clarify that migration is precautionary, not fixing a known issue.
3. If the slash command doesn't actually use `shouldShow`, remove the claim that it "gained" this benefit — the benefit is potential, not realized.

---

### [H] Finding 3: Framing post-hoc — Complication doesn't establish real problems

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 (Problem Statement — Complication)
**Issue:** The Complication lists four "lacks" (no Floating UI, no collaborative-safe, no error boundary, inconsistent Escape) and claims the custom plugin "duplicates every facility" of @tiptap/suggestion, but the framing appears designed to justify a pre-chosen solution (migrate to @tiptap/suggestion) rather than deriving from observed problems.

**Current design:** "The custom plugin also **lacks** what the slash command gained from migration: [list of 4 gaps]... Resolution: Migrate to `@tiptap/suggestion` with a custom `findSuggestionMatch` function..."

**Framing validity test:** If you removed one dimension of the Complication, would the Resolution still be justified?

1. **Remove "duplicates facilities"** → The Resolution becomes: "migrate to get Floating UI + collaborative-safe + error boundary + consistent Escape."
   - Floating UI: can be added to the current plugin without migration (Finding 1)
   - Collaborative-safe: unverified claim (Finding 2)
   - Error boundary: 3-line `try/catch` addition (`editor.chain().insertContent()` wrapped in try/catch at line 108)
   - Consistent Escape: undefined — current Escape handling works (line 147-150 closes menu on Escape)
   - **Result:** The Resolution doesn't hold without the "duplicates facilities" dimension.

2. **Remove "lacks features"** → The Resolution becomes: "migrate to remove duplication."
   - But duplication itself isn't a problem without claimed harm. The spec doesn't cite:
     - Maintenance burden (e.g., "bug fixes for trigger detection must be applied to 2 places")
     - Developer confusion (e.g., "engineers adding new suggestions don't know which pattern to follow")
     - Performance issues (e.g., "two separate plugin state machines impact editor responsiveness")
   - **Result:** The Resolution doesn't hold without the "lacks features" dimension.

**The intersection reasoning appears weak.** The two dimensions (duplication + gaps) don't reinforce each other. Instead, they independently fail to justify the Resolution:
- Duplication: no evidence of harm
- Gaps: 3 of 4 are unverified or trivially fixable without migration

**Alternative framings that would make the Resolution hold:**

| Framing | Would justify migration |
|---------|-------------------------|
| "We're adding 3 more suggestion triggers (tags, mentions, templates) and maintaining 4 separate custom plugins is untenable — team estimated 2 weeks of duplicate work per new trigger" | ✅ Yes — migration is solving a real scalability problem |
| "Wiki-link suggestions break in collaborative sessions when multiple users type `[[` at the same position (repro: steps A, B, C; logs show state race condition)" | ✅ Yes — migration is fixing a known bug |
| "The custom plugin's positioning breaks when the editor is in a modal or scrollable container (user reports #123, #145; screenshots showing menu cutoff)" | ✅ Yes — migration is addressing a real UX gap |
| "PR #51 established @tiptap/suggestion as the pattern; wiki-links should follow for consistency" | ⚠️ Weak — aesthetic preference, not a technical requirement (current framing) |

**The spec reads like the last row.** The Situation says "slash command migration established `@tiptap/suggestion` as the canonical pattern" (line 17) — this is a descriptive claim (PR #51 happened), not a normative claim (therefore wiki-links must follow). The Complication then constructs reasons to justify following the pattern, but those reasons don't have evidence of actual harm.

**Evidence that would validate the current framing:**
- User-reported positioning bugs with the current wiki-link menu
- Collaboration bugs (Finding 2)
- Concrete maintenance burden from having two systems (e.g., time spent on duplicate bug fixes, developer onboarding confusion)
- Roadmap showing 3+ more suggestion triggers coming soon

**Status:** CHALLENGED

**Suggested resolution:** Re-examine the problem framing with the user. Ask:
1. What problem is this solving? (User pain, developer pain, or architectural consistency for its own sake?)
2. If architectural consistency: what's the cost of *not* migrating? (Maintenance burden, confusion, foreclosing future work?)
3. If there are real gaps (Floating UI positioning, collaboration safety): can they be addressed incrementally without a full rewrite?

Then reframe the Complication based on the answers. If the answer is "architectural consistency for its own sake," that's a valid choice — but document it as such ("We're establishing @tiptap/suggestion as the house standard for all suggestion UIs to simplify future development") rather than framing it as solving technical gaps that aren't evidenced.

---

## Medium Severity

### [M] Finding 4: Missing rollback strategy for "direct to main" deployment

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — SRE perspective)
**Location:** Header (Target PR: Direct to main), §2 (Success Criteria: zero user-visible behavior change)
**Issue:** The spec proposes merging directly to main with "zero user-visible behavior change" as the success criterion, but doesn't address rollback strategy if the migration introduces regressions in production. A skeptical SRE would ask: "What's the blast radius if this breaks wiki-link suggestions? How do we roll back?"

**Current design:** "Target PR: Direct to main. Small, focused, reviewable in one sitting."

**What's missing:**
1. **Feature flag or phased rollout** — the migration replaces the entire wiki-link suggestion system in one commit. If there's a regression (e.g., menu doesn't open, insertion fails, keyboard nav breaks), every user is immediately affected. No mention of:
   - A/B testing (10% of users get new implementation, 90% stay on current)
   - Feature flag (`USE_SUGGESTION_API_FOR_WIKI_LINKS`) allowing instant rollback without a revert commit
   - Gradual rollout by account tier (internal users first, then external)

2. **Monitoring/alerting to detect regressions** — what metrics or logs would surface that wiki-link suggestions broke?
   - Current implementation has `console.error` on fetch failure (line 300) and tries to catch `coordsAtPos` errors (line 234), but no centralized error tracking
   - Spec adds error boundary on insertion (§3.5) but with silent `console.error` — how would the team know if insertions are failing at scale?

3. **Acceptance of risk** — if the user is confident in "zero behavior change" and accepts the rollback-via-revert path, that's a valid choice for a small refactor. But it should be explicit: "We're confident in the test coverage (§7) and will revert the PR if any regression is detected in production."

**What would an SRE flag:**
- "The test scenarios (§7) are manual QA, not automated. Who runs these before merge? If a regression slips through, how quickly can we detect and roll back?"
- "This touches suggestion trigger logic (custom `findSuggestionMatch`), keyboard handling (new `onKeyDown` lifecycle), and async loading (new timing via `onStart`/`onUpdate`). These are high-interaction surfaces. What's the monitoring story?"

**Alternative approaches (increasing safety, increasing complexity):**

| Approach | Safety | Complexity | When to use |
|----------|--------|------------|-------------|
| Direct to main (current spec) | Low — full exposure, revert-only rollback | Low | High confidence in test coverage + low blast radius |
| Direct to main + feature flag | Medium — instant rollback without revert | Medium — flag plumbing + cleanup | Medium confidence, or high-traffic feature |
| Phased rollout (10% → 50% → 100%) | High — incremental exposure, early detection | High — rollout infra + monitoring | Critical path, or low confidence in coverage |

**Status:** CHALLENGED

**Suggested resolution:**
1. If the user has high confidence in zero regressions (based on test coverage in §7 + code review), document the acceptance: "Rollback via PR revert. Confidence is high due to [specific test coverage / prior similar migrations]."
2. If confidence is medium, add a feature flag: `const USE_NEW_WIKI_LINK_SUGGESTION = true;` in a config file, allowing instant rollback by flipping to `false` and redeploying (no code revert needed).
3. If this is a high-traffic path or there's uncertainty about behavioral equivalence, consider a phased rollout or at minimum add automated tests for the regression scenarios (§7, R01-R14) before merge.

---

### [M] Finding 5: Loading state timing assumption not verified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — customer-facing engineer perspective)
**Location:** §3.3 (Async items with loading/error states)
**Issue:** The spec assumes that @tiptap/suggestion's lifecycle (`onStart` → `items()` async → `onUpdate`) will preserve the current loading state UX (menu opens immediately with spinner, then populates when fetch resolves), but this timing depends on when `onStart` fires relative to `items()` resolution.

**Current design (§3.3):**
> "Loading state: Suggestion calls `onStart` then `items()`. While `items()` is resolving (async), the menu shows loading state. When items resolve, `onUpdate` fires with the populated items. The render callback's `onStart` mounts the menu with `loading: true`; `onUpdate` transitions to `loading: false`."

**Current implementation behavior (`wiki-link-suggestion.ts:260-315`):**
1. Plugin state becomes `active: true` (trigger detected)
2. `view()` update fires → `if (!renderer)` branch (first render)
3. Menu mounts with `loading: true` (line 273)
4. `fetchPages()` promise starts (line 281)
5. User sees loading spinner
6. Promise resolves → `renderer.updateProps({ loading: false })` (line 296)

**New implementation timing (from spec §3.3):**
1. Trigger detected → Suggestion calls `onStart`
2. `onStart` mounts menu with `loading: true`
3. Suggestion calls `items({ query })` (async)
4. While `items()` is pending, menu shows loading state
5. `items()` resolves → Suggestion calls `onUpdate` with results
6. `onUpdate` updates menu to `loading: false`

**Assumption risk:** What if `items()` resolves *before* `onStart` finishes executing (e.g., `cachedPages` is already populated from a prior trigger, so `items()` returns synchronously)? The spec's approach caches pages in closure scope:
```typescript
if (cachedPages.length === 0 && !fetchError) {
  try {
    cachedPages = await fetchPages();
  } catch (err) { ... }
}
return buildSuggestionItems(cachedPages, query);
```

On **second trigger**, `cachedPages.length > 0` → `items()` returns immediately (synchronous) → does `onUpdate` fire before `onStart` completes? If so, the menu might:
- Render with results instantly (no loading spinner) — minor UX inconsistency
- Fail to mount because `onStart` hasn't finished setting up the popup element — renderer update on null element

**What would validate the assumption:**
1. Trace @tiptap/suggestion's source to confirm lifecycle order: does `onStart` always complete before `onUpdate` fires, even if `items()` resolves synchronously?
2. Test the second-trigger scenario: type `[[`, wait for results, close menu, type `[[` again — does the menu still show loading state briefly, or does it populate instantly?

**This is likely fine** (Suggestion's lifecycle probably guarantees `onStart` → `items()` → `onUpdate` ordering regardless of async/sync), but it's an assumption that hasn't been verified. The current implementation doesn't have this risk because the fetch is explicitly inside the `!renderer` branch — it only fires on first render.

**Status:** CHALLENGED

**Suggested resolution:**
1. Verify the lifecycle ordering by reading @tiptap/suggestion source or testing the cached-pages scenario.
2. If synchronous `items()` return can cause `onUpdate` before `onStart`, adjust the implementation: keep `loading` state in a closure variable that `onStart` sets to `true`, `items()` checks, and `onUpdate` sets to `false`.
3. Document the finding in §9 (Assumptions) if verified: "A3: Suggestion's lifecycle guarantees `onStart` → `items()` → `onUpdate` ordering even when `items()` returns synchronously. VERIFIED: [source line / test result]."

---

### [M] Finding 6: Decision Log doesn't address "should we migrate at all"

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §8 (Decision Log)
**Issue:** The Decision Log (5 decisions, D1-D5) addresses *how* to migrate (custom matcher, async items, prefix restriction, Floating UI pattern, menu component updates) but doesn't record a decision on *whether* to migrate vs. incremental upgrade. This suggests the migration approach was decided before the spec was written, and the spec is rationalizing the decision rather than evaluating alternatives.

**Current Decision Log:**
- D1: Custom `findSuggestionMatch` vs built-in `char` → Custom (LOCKED, HIGH)
- D2: Async items → Suggestion native (LOCKED, HIGH)
- D3: Prefix restriction → `null` (LOCKED, HIGH)
- D4: Floating UI → match slash-command.ts pattern (DIRECTED, HIGH)
- D5: Menu component → update (DIRECTED, HIGH)

**Missing decision:**
- D0: Approach → Full migration to @tiptap/suggestion vs incremental upgrade (add Floating UI to current plugin) vs status quo

**Why this matters:** The Decision Log is the audit trail for "what alternatives were considered and why they were rejected." A challenger who independently arrives at "just add Floating UI" (Finding 1) should see that decision in the log with a rejection rationale. Without it, the spec appears to foreclose the simpler alternative without evaluation.

**What a complete Decision Log would show:**

| Decision | Options Considered | Resolution | Rationale |
|----------|-------------------|-----------|-----------|
| D0: Migration approach | A) Full migration to @tiptap/suggestion<br>B) Incremental (add Floating UI only)<br>C) Status quo | A (LOCKED, MEDIUM) | Full migration achieves [specific goals beyond Floating UI]. Incremental approach considered but rejected because [evidence]. Status quo unacceptable because [user pain / technical debt]. |

If D0 doesn't exist because the alternatives weren't evaluated, that's the finding. If D0 was evaluated but not recorded, adding it to the log would strengthen the spec's defensibility.

**Status:** CHALLENGED

**Suggested resolution:**
1. Add D0 to the Decision Log: evaluate full migration vs incremental upgrade vs status quo.
2. If the user's intent is "establish @tiptap/suggestion as the house standard" (architectural consistency), document that as the rationale: "We choose full migration over incremental because we're standardizing all suggestion UIs on @tiptap/suggestion to simplify future development. The incremental path (Floating UI only) would leave the architecture split."
3. If there are specific technical benefits of migration beyond Floating UI (collaborative-safe, Escape consistency, etc.), verify them (Findings 2, 3) and document the evidence in D0's rationale.

---

## Low Severity

### [L] Finding 7: ARIA preservation assumption not tested

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — accessibility)
**Location:** §7 (Test Scenarios, R12)
**Issue:** The spec claims "Menu ARIA: `role="listbox"`, `role="option"`, `aria-selected` — Preserved from current implementation" but doesn't verify that the new ReactRenderer lifecycle allows the same ARIA setup as the current implementation.

**Current design (R12):** "Preserved from current implementation"

**What would validate this:**
1. Read `WikiLinkSuggestionMenu.tsx` to confirm ARIA attributes are on the menu component itself (not injected by the custom plugin's `view()` function)
2. Verify that the menu component receives the same props in the new implementation (`items`, `selectedIndex`, `onSelect`, `loading`, `error`) so ARIA bindings remain intact
3. Test with a screen reader after migration

**This is likely fine** (the menu component is preserved per §3.6, just with `query` prop removed), but it's an assumption. If the ARIA setup depends on the plugin's `view()` lifecycle (e.g., the plugin wraps the renderer in an ARIA container), that would break.

**Status:** CHALLENGED (low confidence that this is an actual issue, but flagging the assumption)

**Suggested resolution:**
1. Read `WikiLinkSuggestionMenu.tsx` to confirm ARIA attributes are component-internal.
2. If verified, upgrade the test scenario from "Preserved" to "VERIFIED: ARIA attributes are on the menu component (WikiLinkSuggestionMenu.tsx:10-15), not injected by plugin lifecycle."
3. If ARIA setup is plugin-dependent, add a task to migrate ARIA to the new render lifecycle.

---

## Confirmed Design Choices (summary)

These design choices held up under challenge:

**DC1 (Simpler alternative):**
- Custom `findSuggestionMatch` for paired delimiters: No simpler alternative exists — the built-in `char: '[[` + regex doesn't support stopping at `]`. The evidence file confirms this is necessary.
- Async items via Suggestion native: Simpler than manual fetch-in-`view()` — confirmed by source reading (Finding in evidence file).

**DC2 (Stakeholder gap):**
- Error boundary on insertion: Good defensive practice (though could be added to current plugin with 3 lines).
- Floating UI pattern matching slash-command.ts: Correct choice for positioning — the implementation details (middleware, virtual element, `autoUpdate`) are sound.

**DC3 (Framing validity):**
- Custom `findSuggestionMatch` requirement: The constraint is real — wiki-links' paired-delimiter pattern can't use the built-in matching. This isn't post-hoc; it's a technical necessity confirmed by evidence.

**Overall:** The *mechanics* of how to migrate (if migration is chosen) are sound. The challenge is on *whether* to migrate (Findings 1, 3, 6) and whether the claimed benefits are real (Findings 2, 5, 7).
