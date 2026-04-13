# Design Challenge Findings

**Artifact:** specs/2026-04-13-suggestion-menu-hardening/SPEC.md
**Challenge date:** 2026-04-12
**Total findings:** 5 (1 high, 3 medium, 1 low)

---

## High Severity

### [H] Finding 1: Command safety "fix" does not address the identified failure mode

**Category:** DESIGN
**Source:** DC1 + DC3
**Location:** §1 (SCR Complication item 1), §3.2, Decision Log D3
**Issue:** The SCR Complication identifies a specific failure mode: "If a pluggable item command throws, the `/heading` trigger text is already deleted with nothing replacing it." The proposed fix (§3.2) wraps both `deleteRange` and `item.command` in a single try/catch. However, the behavior for the identified failure mode is **identical before and after the fix**: `deleteRange` dispatches as a separate chain before `item.command` runs, so if `item.command` throws, the trigger text is still consumed with nothing replacing it. The spec explicitly acknowledges this in §3.2's note: "if it throws, the trigger text is already gone. This is acceptable."

**Current design:** "Wrap both deleteRange and item.command in single try/catch. Cannot combine into single chain because item.command is an arbitrary function. Trigger text consumption on select is intentional." (D3)
**Alternative:** Two options exist that would address the stated problem:

  - **Option A (transactional rollback):** After `deleteRange.run()`, if `item.command` throws, call `editor.commands.undo()` to restore the trigger text. This has its own risk — undo might revert more than intended if item.command partially dispatched — but it would actually address the identified failure mode. The risk is bounded: undo scope is one step, and a partial dispatch from a throwing command is unusual.

  - **Option B (reframe, don't fix):** Accept the behavior as-is and demote the command safety issue from SCR Complication and §3.2 to a documented known limitation. The spec's own analysis concludes the behavior is "acceptable." If it's acceptable, it shouldn't be positioned as a problem being fixed — that's a framing inconsistency. The remaining value of the try/catch change (catching a hypothetical throw from `deleteRange`) is too marginal to warrant a SCR complication dimension.

**Trade-off:** Option A provides real atomicity but introduces undo-scope risk. Option B is honest framing at the cost of reducing the spec's scope from 4 items to 3. The current design is a middle ground that reframes the problem rather than solving it — which is fine if the framing is updated to match.
**Status:** CHALLENGED
**Suggested resolution:** Either implement Option A (if the failure mode matters enough to list in the SCR) or implement Option B (demote to known limitation with improved error logging, remove from SCR complication). The current design claims to fix a problem it explicitly leaves unfixed.

---

## Medium Severity

### [M] Finding 2: Shared module changes autoUpdate/content ordering — first computePosition runs against empty popup

**Category:** DESIGN
**Source:** DC1
**Location:** §3.1 (createSuggestionPopup implementation), §2 (Success Criteria — "identical before and after")
**Issue:** Current code in both menus follows the sequence: create popup → append renderer content → start `autoUpdate`. The proposed `createSuggestionPopup` follows: create popup → start `autoUpdate` → return popup to caller → caller appends renderer content. Since `autoUpdate` fires `doPosition` synchronously on setup (per verified A1), the first `computePosition` runs against a popup with no content. The `size` middleware's `availableHeight` calculation and the resulting `--suggestion-menu-max-height` CSS variable may produce different values for an empty vs. populated popup. While `autoUpdate` will re-fire when content is appended (ResizeObserver detects the change), this initial empty-popup computation is a behavioral change.

**Current design:** "createSuggestionPopup calls autoUpdate internally and does not expose a separate setup step." (§3.1 design notes)
**Alternative:** The factory could accept a `setup` callback invoked between popup creation and autoUpdate:
```ts
export function createSuggestionPopup(
  getCurrentProps: () => SuggestionProps<unknown> | null,
  label: string,
  setup?: (popup: HTMLDivElement) => void,  // called before autoUpdate
): { popup: HTMLDivElement; doPosition: () => void; stopAutoUpdate: () => void }
```
Callers pass `(popup) => { renderer = new ReactRenderer(...); popup.appendChild(renderer.element); }` as setup. This preserves current ordering while still encapsulating positioning logic.
**Trade-off:** Adds one parameter to the API but preserves the content-before-autoUpdate ordering that both menus currently have. Alternatively, this may be a non-issue in practice since autoUpdate re-fires — but the spec should explicitly acknowledge the ordering change rather than claiming identical behavior.
**Status:** CHALLENGED
**Suggested resolution:** Either add the setup callback, or document in the spec that the first computePosition fires against an empty popup (with explanation of why this is benign).

---

### [M] Finding 3: Missing focus-steal prevention on SlashCommandMenu container

**Category:** DESIGN
**Source:** DC2
**Location:** §3.4 (aria-live addition to SlashCommandMenu), §6 (Scope Boundaries — "Modify: SlashCommandMenu.tsx")
**Issue:** `WikiLinkSuggestionMenu` has a `preventFocusSteal` handler (`onMouseDown={preventFocusSteal}`) on the container `<div>` that prevents clicks on empty space (padding, gaps between items) from stealing editor focus and dismissing the menu. `SlashCommandMenu` does not have this handler. Individual buttons call `e.preventDefault()` on their own `onMouseDown`, but clicking between buttons or on container padding triggers default browser behavior (focus steal → editor blur → suggestion dismiss). This is a real behavioral gap between the two menus that the spec doesn't address.

**Current design:** §3.4 only adds an aria-live `<span>` to SlashCommandMenu. Focus handling is not mentioned.
**Alternative:** Add `onMouseDown={(e) => e.preventDefault()}` to the SlashCommandMenu container div. This is a one-line change that eliminates a real (if uncommon) interaction bug, and it aligns with the spec's stated goal of making the two menus consistent.
**Trade-off:** None meaningful — this is a straightforward consistency fix with no downside.
**Status:** CHALLENGED
**Suggested resolution:** Add `preventFocusSteal` to the SlashCommandMenu container. This is in scope since §3.4 already modifies the file and the spec's nature is "cross-cutting hardening."

---

### [M] Finding 4: Incomplete a11y parity — missing aria-activedescendant and item IDs

**Category:** DESIGN
**Source:** DC2
**Location:** §3.4, §2 (Success Criteria — "matching wiki-link pattern")
**Issue:** `WikiLinkSuggestionMenu` has four a11y attributes beyond basic `role="listbox"` / `role="option"`:
1. `aria-activedescendant={activeDescendant}` on the listbox
2. Per-item `id={listboxId-option-${idx}}` attributes
3. `useId()` hook for stable ID generation
4. `tabIndex={-1}` on the listbox

The spec only adds `aria-live` (attribute 5, which wiki-link also has). §3.4 claims to "match the pattern added to WikiLinkSuggestionMenu in PR #78" but only matches one of five a11y attributes.

The spec correctly notes that `aria-activedescendant` is inert when focus stays in contenteditable (the spec's own rationale for why aria-live is needed). However:
- `aria-activedescendant` becomes functional if focus management ever changes (e.g., a future PR moves focus to the menu on open)
- The inconsistency means one menu is prepared for that change and the other is not
- Per-item IDs are also useful for automated testing (`#option-0`, `#option-1`)

**Current design:** "Match the pattern added to WikiLinkSuggestionMenu in PR #78" — adds only aria-live.
**Alternative:** Add the full set: `useId()`, per-item `id`, `aria-activedescendant`, `tabIndex={-1}`. The implementation cost is ~10 additional lines. Or explicitly document that the partial match is intentional (only aria-live is functionally necessary) and note the remaining attributes as future parity items.
**Trade-off:** Full parity adds a small amount of code that is currently inert. Documenting the intentional gap is zero-cost but makes the inconsistency explicit.
**Status:** CHALLENGED
**Suggested resolution:** Either bring full parity or document in the spec why partial parity is intentional. The current framing implies full pattern match but delivers partial.

---

## Low Severity

### [L] Finding 5: Assumption A3 contradicts §3.1 design notes on popup.isConnected

**Category:** DESIGN
**Source:** DC2
**Location:** §3.1 (design notes), §9 (Assumptions — A3)
**Issue:** §3.1 design notes state: "`popup.isConnected` guards replace the previous `if (popup)` null-checks — more semantically correct (element exists but may be removed from DOM by React cleanup race)." A3 states: "`popup.isConnected` is unnecessary when callers null the reference in onExit" with HIGH confidence.

These are contradictory claims. If the React cleanup race described in §3.1 is real — the popup element is removed from the DOM before `destroySuggestionPopup` nulls the reference — then `popup.isConnected` is **necessary** (§3.1 is right, A3 is wrong). If `destroySuggestionPopup` always runs before any async callback could fire — because `stopAutoUpdate()` cancels pending callbacks — then `popup.isConnected` is **unnecessary** (A3 is right, §3.1's race doesn't exist).

**Current design:** Uses `popup.isConnected` in the shared module while simultaneously assuming it's unnecessary (A3).
**Alternative:** Resolve the contradiction: investigate whether `autoUpdate`'s cleanup (`stopAutoUpdate()`) guarantees no further `doPosition` callbacks fire. If it does, `popup.isConnected` is defensive but unnecessary — update A3 to say "defensive, not load-bearing." If it doesn't (callbacks can fire after stop), the race is real — update A3 to acknowledge it and promote `popup.isConnected` from "more semantically correct" to "required for correctness."
**Trade-off:** None — this is about spec internal consistency, not implementation effort.
**Status:** CHALLENGED
**Suggested resolution:** Verify `autoUpdate`'s cleanup semantics and align A3 with §3.1's design rationale.

---

## Confirmed Design Choices (summary)

**DC1 — Extraction decision (D1):** The shared positioning utility is well-justified. Evidence of divergence is concrete (doPosition fix applied to wiki-link, missed in slash-command). The API shape (factory + cleanup) is appropriately minimal. User direction is recorded. The decision holds.

**DC1 — Extraction API shape (D2):** `createSuggestionPopup` returning `{ popup, doPosition, stopAutoUpdate }` with a separate `destroySuggestionPopup` is clean. Callers own renderer lifecycle; shared module owns positioning lifecycle. The split is at the right boundary. Holds up under challenge, with the caveat about content ordering (Finding 2).

**DC2 — Scope boundaries:** The spec's scope is tightly drawn — 4 files modified + 1 new file. No scope creep into filtering, items, keyboard navigation, or other extensions. The "no new dependencies" constraint is verified.

**DC3 — Problem framing (overall):** The four issues genuinely surfaced during PR #78's review, and bundling them in one PR is reasonable. The intersection is proximity (discovered together, touching the same files) rather than deep causal interaction — which the spec honestly represents. The SCR complication holds for dimensions 2-4. Dimension 1 (command safety) is challenged in Finding 1.
