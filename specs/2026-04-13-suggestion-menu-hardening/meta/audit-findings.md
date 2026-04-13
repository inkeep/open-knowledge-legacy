# Audit Findings

**Artifact:** specs/2026-04-13-suggestion-menu-hardening/SPEC.md
**Audit date:** 2026-04-12
**Total findings:** 3 (1 high, 1 medium, 1 low)

---

## High Severity

### [H] Finding 1: Atomicity framing is incoherent — problem, success criteria, fix, and code comment tell four different stories

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L2 (confidence-prose misalignment)
**Location:** §1 Complication #1, §2 Success Criteria (Primary, bullet 1), §3.2 (title, target code, code comment, note)
**Issue:** The spec correctly identifies the problem as non-atomic (two separate chains), then claims the fix achieves atomicity, then proposes a fix that does NOT achieve atomicity (error containment via try/catch), then adds a code comment that misleads about what "atomic" means for TipTap chains. Four sections say four different things:

1. **§1 Complication #1** (correct): "Slash-command's two-chain approach is not [atomic]." Correctly describes the problem.
2. **§2 Success Criteria** (incorrect): "Slash-command `command()` uses a single atomic chain (deleteRange + item.command in one transaction)." The proposed fix does NOT achieve this — `deleteRange` runs in a `.chain().run()` call and `item.command(editor)` runs afterward as a separate function call. These are not in one transaction.
3. **§3.2 target code comment** (misleading): "TipTap chains are atomic (single transaction) — deleteRange only applies if `.run()` succeeds." This is misleading because `.run()` always dispatches the accumulated transaction — it's the terminal call that triggers `view.dispatch(tr)`. The comment implies deleteRange might not apply if .run() fails, but .run() is what makes it apply. More importantly, `item.command(editor)` is OUTSIDE the chain, so it is NOT part of the same ProseMirror transaction. The comment gives a false sense of atomicity.
4. **§3.2 note** (correct): "Unlike wiki-link... slash-command can't combine deleteRange with item.command in one chain because `item.command(editor)` is an arbitrary function." This correctly acknowledges the fix is NOT atomic.

**Current text:** §2: "Slash-command `command()` uses a single atomic chain (deleteRange + item.command in one transaction)"
§3.2 comment: "TipTap chains are atomic (single transaction) — deleteRange only applies if .run() succeeds. item.command() runs after deleteRange is dispatched, so if it throws, the trigger text is already gone. This is acceptable"
**Evidence:** TipTap's `CommandManager.ts` (verified from `node_modules/@tiptap/core/src/CommandManager.ts`) confirms chains accumulate commands into a single transaction dispatched by `.run()`. But `item.command(editor)` is called AFTER `.run()` returns — it's a separate operation, not part of the chain's transaction. The fix wraps both in try/catch for error containment, not atomicity.
**Status:** INCOHERENT
**Suggested resolution:** Reframe the fix as what it actually achieves — **error containment**, not atomicity. Specifically:
- §2 success criteria: Change to "Slash-command `command()` wraps deleteRange and item.command in a single try/catch so errors from pluggable commands don't crash the editor"
- §3.2 title: Change from "Fix slash-command `command()` atomicity" to "Fix slash-command `command()` error safety"
- §3.2 target code comment: Remove the misleading atomicity framing. Replace with a comment that accurately describes the behavior: deleteRange dispatches first, then item.command runs. If item.command throws, the trigger text is already consumed (intentional — user selected an item). The try/catch ensures the editor doesn't crash.
- The note at the bottom of §3.2 is correct and should be preserved.

---

## Medium Severity

### [M] Finding 2: Assumption A3 says `popup.isConnected` is unnecessary, but proposed code in §3.1 uses it throughout

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §9 Assumptions (A3), §3.1 (proposed code and design notes)
**Issue:** Assumption A3 states "`popup.isConnected` is unnecessary when callers null the reference in onExit" at HIGH confidence, explaining that the old null-check pattern (`if (popup)`) works because `destroySuggestionPopup` sets the reference to null before async callbacks resolve. But the proposed code in §3.1 explicitly replaces all null-checks with `popup.isConnected` guards (lines 88, 97, 107, 112 of the proposed code) and the Design Notes call this out as an improvement: "popup.isConnected guards replace the previous `if (popup)` null-checks — more semantically correct."

The assumption says the defense is unnecessary; the code adds it as an improvement. One of these is wrong. Either:
- A3 is wrong (popup.isConnected IS necessary, e.g., because React cleanup races can remove the element from DOM while the reference is still non-null), in which case the assumption should be corrected, OR
- A3 is right (it's unnecessary), in which case the code is adding defensive guards it doesn't need and the design notes' "more semantically correct" framing is misleading

**Current text:** A3: "`popup.isConnected` is unnecessary when callers null the reference in onExit [...] The null-check pattern (`if (popup)`) works because `destroySuggestionPopup` sets the reference to null before async callbacks resolve."
Design notes: "`popup.isConnected` guards replace the previous `if (popup)` null-checks — more semantically correct (element exists but may be removed from DOM by React cleanup race)"
**Evidence:** The design notes parenthetical describes a real scenario (React cleanup race removing element from DOM while JS reference persists) that the null-check pattern would NOT catch — the reference would be non-null but the element would be disconnected. This suggests A3's claim of "unnecessary" is wrong.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) correct A3 to acknowledge that `popup.isConnected` catches a scenario the null-check misses (React cleanup race), making it a genuine improvement, or (b) if the React cleanup race is theoretical and never actually occurs, remove `popup.isConnected` from the proposed code and keep the null-check pattern. The design notes' parenthetical suggests (a) is correct.

---

## Low Severity

### [L] Finding 3: Location header includes directory with no in-scope files

**Category:** COHERENCE
**Source:** L5 (summary coherence)
**Location:** Header (Location field), §6 (Scope Boundaries)
**Issue:** The Location header lists `packages/app/src/editor/wiki-link-suggestion/` as one of three directories. This directory exists and contains `WikiLinkSuggestionMenu.tsx`, but §6 (Scope) explicitly excludes that file: "Changes to WikiLinkSuggestionMenu.tsx (already has aria-live from PR #78)." The only wiki-link file in scope is `packages/app/src/editor/extensions/wiki-link-suggestion.ts` — which is in the `extensions/` directory (already listed in Location), not the `wiki-link-suggestion/` directory.
**Current text:** Location: "`packages/app/src/editor/extensions/`, `packages/app/src/editor/slash-command/`, `packages/app/src/editor/wiki-link-suggestion/`"
**Evidence:** §6 In Scope lists 4 files — all in `extensions/` or `slash-command/`. No file in `wiki-link-suggestion/` is in scope. Verified via codebase: `packages/app/src/editor/wiki-link-suggestion/` contains only `WikiLinkSuggestionMenu.tsx` (out of scope).
**Status:** INCOHERENT
**Suggested resolution:** Remove `packages/app/src/editor/wiki-link-suggestion/` from the Location header. The in-scope directories are `packages/app/src/editor/extensions/` and `packages/app/src/editor/slash-command/`.

---

## Confirmed Claims (summary)

**T1 (own codebase) — all load-bearing claims verified:**
- `slash-command.ts:108-110`: deleteRange as separate chain before try/catch — CONFIRMED (exact lines match)
- `slash-command.ts:196-197`: redundant `doPosition()` after `autoUpdate` — CONFIRMED (exact lines match)
- Wiki-link uses single chain for deleteRange + insertContent — CONFIRMED (line 226)
- SlashCommandMenu has role="listbox"/option/aria-selected, no aria-live — CONFIRMED
- WikiLinkSuggestionMenu has aria-live="polite" — CONFIRMED (lines 63, 88, 118)
- Positioning duplication ~30 lines in both files — CONFIRMED (34 lines slash-command, 38 lines wiki-link)
- `SlashCommandItem.command` typed as `(editor: Editor) => void` — CONFIRMED (items.ts:44)
- `@floating-ui/dom` is a direct dependency — CONFIRMED (package.json)
- `@tiptap/suggestion` is installed — CONFIRMED (package.json)

**T2 (OSS repos / node_modules source):**
- `autoUpdate` calls callback synchronously on setup — CONFIRMED from `node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs` line 666
- TipTap chains dispatch as single ProseMirror transaction via `.run()` — CONFIRMED from `node_modules/@tiptap/core/src/CommandManager.ts` lines 59-93

**L4 (evidence-synthesis fidelity):**
- Both evidence files (`positioning-duplication.md`, `slash-command-safety.md`) are consistent with their corresponding spec sections. Line number references in evidence are within 1 line of actual. No selective evidence use or unsupported qualifiers detected.

## Unverifiable Claims

None. All claims in the artifact are verifiable from the codebase or dependency source code, and all were checked.
