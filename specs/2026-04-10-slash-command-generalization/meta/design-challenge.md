# Design Challenge Findings

**Artifact:** `specs/2026-04-10-slash-command-generalization/SPEC.md`
**Challenge date:** 2026-04-10
**Total findings:** 8 (3 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: Range deletion gap — spec's target code leaves trigger text in the document

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap)
**Location:** §3.1 (target code, `command` callback), §3.2 (item `command` signature change), D9, Success Criteria §2
**Issue:** The spec's target Suggestion `command` callback delegates range handling to each item's command function, but existing items don't delete the range. The slash trigger text (`/heading1`, `/table`, etc.) would remain in the document after item selection — a catastrophic regression.

**Current design:** The spec's target code (§3.1, line ~175) reads:
```ts
command: ({ editor, range, props: item }) => {
  item.command(editor, range);
},
```
And §3.2 changes the item command signature to `(editor: Editor, range?: Range) => void`, noting: "Main's current items ignore it."

**Evidence:** `@tiptap/suggestion` does NOT auto-delete trigger text. The `command` callback is responsible for removing the trigger range. This is confirmed by the [TipTap Suggestion docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) and the canonical pattern in all TipTap slash command implementations: `editor.chain().focus().deleteRange(range).toggleHeading({level: 1}).run()` — the `deleteRange(range)` call is always explicit in the command.

Main's current code (`extensions/slash-command.ts:116-119`) handles this correctly:
```ts
view.dispatch(view.state.tr.setMeta(slashCommandKey, { close: true }));
editor.chain().focus().deleteRange(range).run();
item.command(editor);
```
The extension deletes the range, THEN calls the item command. Items never need to know about the range.

The spec's target inverts this: it pushes range into item commands, but existing items ignore it. Result: all 10 items leave trigger text in the document.

**Alternative:** Keep range deletion in the extension's Suggestion `command` callback — exactly matching the current code's responsibility split:
```ts
command: ({ editor, range, props: item }) => {
  editor.chain().focus().deleteRange(range).run();
  item.command(editor);
},
```
This makes D9 (adding optional `range` to command signature) unnecessary for the base refactor. D9 becomes a future-work concern: only needed if a downstream item wants to handle range itself (e.g., PR #23's `deleteRange(range).insertContent(...)` pattern). When that need arises, the extension callback can be made configurable — but baking it in now creates a silent failure path for every existing item.

**Trade-off:** Keeping range deletion in the extension is simpler and preserves the current responsibility boundary. The cost is that future items requiring custom range handling need a different pattern (either the extension delegates conditionally, or the item opts into range handling via a flag). This is an acceptable deferral — the two downstream consumers (PR #23 and block-editor-ux) can both work with the extension handling deletion.
**Status:** CHALLENGED

---

### [H] Finding 2: D5 is internally contradicted — spec locks `forwardRef + useImperativeHandle` while evidence recommends closure-based approach

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap) + DC3 (Framing validity)
**Location:** D5 (Decision Log §9), §3.3 (menu keyboard handling), Agent Constraints §13 ASK_FIRST, `evidence/slash-command-architecture-analysis.md` Angle 4
**Issue:** D5 is LOCKED at HIGH confidence as "`forwardRef` + `useImperativeHandle`", but the spec's own evidence analysis recommends option B (closure-based, no ref needed) as the correct approach. The spec's Agent Constraints ASK_FIRST section then acknowledges the conflict with React Compiler. Three sections of the same spec point in three different directions on the same decision.

**Current design:** D5 says: "In the menu component via `forwardRef` + `useImperativeHandle`. Follows TipTap's canonical Suggestion pattern."

But the evidence file (Angle 4, lines 218-223) concludes: "Recommendation: **B.** Keep all keyboard state in the render callback's closure, no ref needed." This is because the codebase uses React Compiler (`babel-plugin-react-compiler` is configured in `vite.config.ts`), and `forwardRef`/`useImperativeHandle` are discouraged.

Then Agent Constraints ASK_FIRST says: "If migrating to `forwardRef` + `useImperativeHandle` conflicts with React Compiler expectations (this codebase uses React Compiler; the block-editor-ux spec notes that `useMemo`/`useCallback`/`forwardRef`/`memo` are discouraged — so `useImperativeHandle` might need an alternative pattern)."

**Nuance:** `useImperativeHandle` IS already used in this codebase (`TiptapEditor.tsx:379`), so the React Compiler constraint may not be absolute. However, the TiptapEditor case is an escape hatch for imperative API exposure to parent components — a fundamentally different use than keyboard event routing in a short-lived popup menu. The evidence file's option B (closure in Suggestion's `render()` callbacks) is genuinely simpler and avoids the ref lifecycle entirely.

**Alternative:** Resolve D5 to match the evidence recommendation: keyboard state lives in closure variables inside the `render()` callback, updated by `onUpdate`, read by `onKeyDown`. No ref, no `forwardRef`, no `useImperativeHandle`. The menu component becomes a pure render function. This is simpler, React Compiler-safe, and still follows the Suggestion pattern (the `render()` lifecycle IS the keyboard coordination point).

**Trade-off:** The closure approach couples keyboard state to the extension's render lifecycle rather than encapsulating it in the menu component. This is a minor separation-of-concerns regression, but the menu is only ever rendered via this one render lifecycle, so the coupling is acceptable.
**Status:** CHALLENGED

---

### [H] Finding 3: A substantially simpler alternative achieves the stated unblocking goals without the Suggestion migration

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §1 Problem Statement, §3.1, D1, entire spec framing
**Issue:** The spec frames the Suggestion migration (D1) and the pluggability changes (D2-D4) as a single inseparable refactor. But the actual downstream unblocking need — PR #23 needs to add item sources, block-editor-ux needs to share items — requires only the pluggability changes. The Suggestion migration is a modernization bet being piggy-backed onto an unblocking refactor.

**Current design:** "Three structural changes, all backwards-compatible: (1) Migrate extension foundation to @tiptap/suggestion, (2) Open item source to multiple providers, (3) Open category taxonomy." (§1 Resolution)

**Alternative — pluggability-only refactor (~50 lines changed vs ~200):**
1. Change `category: 'basic' | 'insert'` to `category: string` (D3 — same)
2. Add `addOptions()` with `itemsSources` and `categoryLabels` (D2, D4 — same)
3. Keep the existing custom ProseMirror Plugin exactly as-is (contradicts D1)
4. Update the Plugin's `state.apply` and `view.update` to read items from `this.options.itemsSources.flatMap(s => s())` instead of hardcoded `slashCommandItems`
5. Pass `categoryLabels` from options to the menu as a prop (D4 — same)

What this achieves:
- PR #23 registers component items via `SlashCommand.configure({ itemsSources: [...] })` — identical consumer API
- block-editor-ux "+" button imports items from the same sources — identical
- Main's users see zero behavior change — identical
- All 10 existing items unchanged — identical
- Implementation time: ~2 hours vs ~4-6 hours
- Risk: near-zero (no foundation swap, no new dependency, no keyboard handling restructure)

What this gives up:
- Collaborative-editing awareness (labeled INFERRED in evidence, untested, addresses a scenario "that hasn't been tested or reported")
- Ecosystem alignment (real but not load-bearing for any stated goal)
- ~40 fewer lines of bespoke code (11% — marginal)

The evidence file (Angle 6, lines 226-239) already considers this alternative and rejects it: "The smaller refactor costs less to implement but costs more to maintain over time." This claim is unsubstantiated — no evidence quantifies the maintenance cost difference, and the "custom Plugin" is 213 lines of clear, working code that has been tested through PR #37.

**The cost-of-inaction test:** If you never migrated to Suggestion, what concretely goes wrong? The answer from the spec: (1) collaborative edge case remains latent, (2) ecosystem divergence. Neither is concrete enough to justify the risk of a foundation swap on a recently-merged feature.

**Trade-off:** Pluggability-only is lower risk, faster to land, and unblocks downstream identically. The cost is deferring the Suggestion migration to a point where it can be justified on its own merits (e.g., when collaborative slash command bugs actually surface, or when a new Suggestion feature is needed). Deferral does NOT foreclose the migration — the pluggable custom Plugin can be swapped to Suggestion later with the same consumer API.
**Status:** CHALLENGED

---

## Medium Severity

### [M] Finding 4: `@tiptap/suggestion` is not transitively installed — spec's dependency claim is wrong

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §5 Tech Stack, A1 (Assumptions)
**Issue:** The spec says: "Already transitively present via `@tiptap/extension-mention` and other suggestion-using extensions. Needs explicit `bun add @tiptap/suggestion` if not." This implies it might already be installed. It is not.

**Evidence:** `@tiptap/extension-mention` is not in `packages/app/package.json`. `@tiptap/suggestion` is not in `bun.lock`. The `node_modules/@tiptap/suggestion` directory does not exist. No TipTap extension currently installed in this project uses Suggestion transitively.

This means `@tiptap/suggestion` is an entirely new dependency — not "explicitly adding what's already transitively present." While this doesn't change the design recommendation, it changes the risk profile: a new dependency introduces a new surface for version conflicts, bundle size impact, and API surface that must be learned. The spec's framing minimizes this by implying it's already present.

**Alternative:** Correct the spec to state: "`@tiptap/suggestion` is a new dependency. It has zero transitive dependencies and is part of the TipTap monorepo (version-locked to 3.22.3, matching our other `@tiptap/*` packages)." This is still a strong position — just an honest one.
**Trade-off:** Documentation accuracy. No design change needed.
**Status:** CHALLENGED

---

### [M] Finding 5: Evidence file contains factual error on regex case sensitivity

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** `evidence/slash-command-architecture-analysis.md` lines 82-86 ("Finding: Trigger rules are reproducible")
**Issue:** The evidence file claims: "Main's current regex silently dismisses uppercase — that's a subtle behavior difference, but arguably a bug in main (users expect case-insensitive matching). After the refactor, uppercase triggers work correctly."

This is factually wrong. The actual regex at `extensions/slash-command.ts:58` is:
```ts
const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
```

The `/i` flag makes the entire regex case-insensitive. `[a-z0-9-]*` with `/i` matches uppercase letters. There is no behavior difference — uppercase already works. The evidence file missed the `i` flag.

**Impact:** While this doesn't change the design recommendation (Suggestion handles both cases correctly), it undermines confidence in the evidence analysis quality. The "improvement" cited as a free benefit of migration doesn't exist. More importantly, if the analysis missed a flag on a regex it quoted verbatim, what else was read carelessly?

**Alternative:** Correct the evidence file. The trigger behavior is fully equivalent, not "slightly improved."
**Trade-off:** None — pure factual correction.
**Status:** CHALLENGED

---

### [M] Finding 6: `allowedPrefixes: [' ', '\n']` equivalence with `(?:^|\s)` is asserted but not verified for edge cases

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** D6 (Decision Log), A2 (Assumptions), `evidence/slash-command-architecture-analysis.md` "Trigger rules" section
**Issue:** The spec claims `allowedPrefixes: [' ', '\n']` reproduces the current regex `(?:^|\s)\/([a-z0-9-]*)$`. While `allowedPrefixes` is confirmed to exist in the [TipTap Suggestion API](https://tiptap.dev/docs/editor/api/utilities/suggestion), the equivalence has edge cases:

1. **`\s` matches more than space and newline.** In JavaScript regex, `\s` matches `[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]`. In rich text editing, non-breaking spaces (`\u00a0`) can appear (TipTap/ProseMirror uses them for some inline spacing). `allowedPrefixes: [' ', '\n']` does not match after a non-breaking space. This is probably fine (typing `/` after a non-breaking space is pathological), but it's an untested semantic difference.

2. **`\n` in block text.** ProseMirror blocks don't typically contain literal `\n` characters — block boundaries are structural, not textual. So `\n` in `allowedPrefixes` may be a no-op for most practical cases. Start-of-block triggering is handled by Suggestion's `startOfLine: false` behavior (matching at position 0 of a textblock). The evidence file says "the start of the parent text, which is always allowed" when `startOfLine: false` — this needs verification from Suggestion source, not assumption.

3. **The evidence gaps section explicitly states:** "Have not read `@tiptap/suggestion@3.22.3` source directly; relied on docs + ecosystem usage patterns." D6 is LOCKED at HIGH confidence on unverified source-level behavior.

**Alternative:** Before locking D6, read `findSuggestionMatch` in `@tiptap/suggestion` source to verify start-of-block behavior with `startOfLine: false` + `allowedPrefixes`. If it works as assumed, D6 holds. If there's a gap, `allow` or custom `decorationNode` filtering is the escape hatch.
**Trade-off:** Verification effort (~30 minutes). Given D6 gates the "zero behavior change" criterion, this is warranted.
**Status:** CHALLENGED

---

## Low Severity

### [L] Finding 7: PR #23 rebase path claims are unverified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** §2 Success Criteria (Secondary), §8 Delivery, §15 Rebase Path Diagram, A4
**Issue:** The spec makes specific claims about PR #23's rebase cost: "~50 lines addition, ~350 lines deletion, net: much smaller PR." These are presented as part of the Success Criteria and the Rebase Path Diagram with HIGH confidence (A4). But the evidence file's Gaps section explicitly states: "Have not dry-run the PR #23 rebase against the refactored main."

The spec's §8 (Delivery) says: "Before merging: verify the rebase path for PR #23 is clean by dry-running it." This is good — but the verification is deferred to implementation time, while the claims are used as motivation throughout the spec (§1, §2, §15). If the rebase reveals unexpected entanglement (e.g., PR #23's slash command touches shared state, type exports, or test infrastructure beyond the two files mentioned), the spec's value proposition weakens.

**Alternative:** Perform the dry-run rebase as part of spec validation, not implementation. This is a 15-minute task that either confirms the claim or reveals that scope needs adjustment.
**Trade-off:** Small upfront effort vs discovering rebase conflicts during implementation.
**Status:** CHALLENGED

---

### [L] Finding 8: Spec should explicitly address whether main will accept a pure refactor PR

**Category:** DESIGN
**Source:** DC3 (Framing validity)
**Location:** §1 Problem Statement (Nature), §8 Delivery
**Issue:** The spec says "Target PR: Direct to main. Small, focused, reviewable in one sitting." and describes the change as "Pure view-layer change with zero user-visible behavior regression." The evidence file acknowledges this is "a project governance concern, not a technical one" (Angle 5) and defers to "the PR #37 author should comment."

For a spec that gates two downstream branches, the governance path deserves more than a passing mention. PR #37 (the feature being refactored) merged the same day this spec was created. Rewriting a contributor's code the day it lands — even for good architectural reasons — is a social signal that the spec should address explicitly. At minimum: has the PR #37 author been consulted? Is there a PR review norm (CODEOWNERS, required reviewers) that applies?

**Alternative:** Add a brief section in §8 or §6 acknowledging the governance concern and stating the plan (e.g., "PR #37 author will be tagged as reviewer on the refactor PR").
**Trade-off:** Minor documentation addition. No design change.
**Status:** CHALLENGED

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative) — partially confirmed:**
- D2 (addOptions config for item sources) holds under challenge. The `configure()` pattern is the correct TipTap idiom regardless of whether the foundation is Suggestion or custom Plugin. No simpler alternative exists for this specific choice.
- D3 (open string categories) holds. Closed union is the bottleneck for PR #23. Opening to string is the minimum viable change.
- D4 (categoryLabels as extension option passed as prop) holds. The alternative (module-level const or context) is worse.
- D7 (preserve all 10 items exactly) holds trivially.
- D8 (optional description field) holds. Zero-cost additive change.

**DC2 (Stakeholder gap) — partially confirmed:**
- The test scenario coverage (§7) is thorough for the regression path. The extensibility scenarios (E01-E04) directly validate the downstream consumer API.
- Scope boundaries (§6) are correctly drawn — the change is contained to 3 files.

**DC3 (Framing validity) — confirmed with caveat:**
- The problem is real: two downstream branches are blocked by a closed slash command architecture. The complication's dimensions (PR #23 conflict + block-editor-ux extension point) are genuinely interconnected — solving one without the other creates a split-world problem.
- **Caveat:** The Resolution bundles pluggability (which solves the blocking) with Suggestion migration (which is a modernization choice). The framing presents both as the resolution, but only pluggability is required by the complication. See Finding 3.
