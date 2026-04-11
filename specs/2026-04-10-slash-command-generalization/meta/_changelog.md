# Changelog

## 2026-04-10 — Session 1: Initial spec creation

**Context:** This spec was spun off from the block-editor-ux spec session after discovering that main had merged PR #37 (table support with a custom ProseMirror Plugin slash command) while PR #23 (typed-component-nodes) was still open with a `@tiptap/suggestion`-based slash command. Two conflicting architectures blocking the downstream work.

**Process:**
1. Audited the divergence between main and PR #23's slash command implementations
2. Ran `/research` and `/analyze` on the two architectures (documented in prior session)
3. User confirmed "greenfield, both flexible — pick what's best"
4. Recommended: migrate main to `@tiptap/suggestion` with pluggable items sources
5. Committed block-editor-ux spec to its worktree
6. Created this spec in a new worktree based on origin/main

**Decisions locked:**
- D1: Foundation = `@tiptap/suggestion` (ecosystem standard)
- D2: Item sources = `addOptions` config array (standard TipTap pattern)
- D3: Category taxonomy = open string (flexibility for downstream)
- D4: Category labels = extension option passed as menu prop
- D5: Keyboard handling = in `render()` closure (NOT `forwardRef` + `useImperativeHandle` due to React Compiler constraints)
- D6: Trigger rules = `startOfLine: false` + `allowedPrefixes: [' ', '\n']` (reproduces main's current regex)
- D7: Preserve all 10 existing formatting items exactly
- D8: Add optional `description` field to `SlashCommandItem` (for PR #23 subtext)
- D9: Add optional `range` parameter to `command` signature (for PR #23 insertion)

**Scope:** Single-phase refactor. Three files in `packages/app/src/editor/`. Zero user-visible behavior change. Unblocks PR #23 rebase and block-editor-ux spec's "+" button.

**Evidence files:**
- `evidence/slash-command-architecture-analysis.md` — multi-angle analysis of Suggestion vs custom Plugin, code comparison, counter-argument evaluation

**Next step:** Implementation via `/ship` or direct edits. Expected PR size: ~200 lines changed. Target: main.

## 2026-04-10 — Session 1 continuation: Audit + Challenger resolution

**Context:** Ran `/assess-findings` on the spec decisions, spawned parallel audit + challenger subprocesses (Claude Code nested instances). Both returned substantial findings. User chose option B — keep the Suggestion migration, fix the factual errors.

### Audit findings (10 total) — all applied

- **H1 Regex misquotation (/i flag):** Evidence file claimed "main silently dismisses uppercase" — WRONG. Main's regex `/(?:^|\s)\/([a-z0-9-]*)$/i` has the `/i` flag. Corrected quotation throughout spec + evidence file. Removed the "free improvement" claim.
- **H2 @tiptap/suggestion not installed:** Verified via `grep '@tiptap/suggestion' bun.lock` (zero matches) and `ls node_modules/@tiptap/suggestion` (not installed). Corrected §5 Tech Stack to explicitly state "NEW dependency — must be added." Updated A1.
- **H3 D5 incoherent across sections:** Spec locked forwardRef+useImperativeHandle, target code sketch used a closure-based approach, evidence file recommended closure, agent constraints said ASK_FIRST. Picked closure-based (option B) and applied consistently to D5, §3.1 target code, §3.3 menu description, evidence Angle 4. Removed all forwardRef references.
- **M1 Tab key handling omitted:** Main's `slash-command.ts:111` treats Tab as Enter alias. Spec didn't mention Tab. Added D10, added R14 test, added to target code `onKeyDown`. Silent regression avoided.
- **M2 allowedPrefixes equivalence unverified:** Downgraded A2 from HIGH to MEDIUM. Simplified target config to accept Suggestion's default `allowedPrefixes: [' ']` instead of `[' ', '\n']` (ProseMirror text nodes don't contain `\n`). Added OQ6 flagging start-of-block verification as an implementation task.
- **M3 shouldShow not automatic:** Corrected §2 Tertiary success criteria from "free benefit" to "available as optional config." Moved C01-C02 collaborative tests to Future Work. Noted that `shouldShow` requires explicit `isChangeOrigin` implementation which this spec does NOT ship.
- **M4 React Compiler conflation:** Corrected the analysis. React Compiler forbids `forwardRef/memo/useMemo/useCallback`. React 19 deprecates `forwardRef`. `useImperativeHandle` is allowed and already used in `TiptapEditor.tsx:379`. Updated A6 to refute the earlier incorrect claim.
- **L1 R5 about tests:** Verified via grep — no test files reference `slashCommandKey` or `SlashCommand`. Removed R5.
- **L2 40% vs 11% code reduction:** Evidence file heading said "~40% reduction" but body showed -11%. Corrected to -5% (after actual target line count with closure-based keyboard handling).
- **L3 shouldShow imprecise:** Fixed evidence file characterization — `shouldShow` fires on transactions where a match is found, not every transaction.

### Challenger findings (8 total) — all applied, including one critical

- **[CRITICAL] Finding 1 — Range deletion gap:** My target code pushed range deletion to items (`item.command(editor, range)` + items ignoring range). This would have left `/heading1`, `/table`, etc. slash trigger text in the document after selection. **Catastrophic regression caught by the challenger.** Fix: keep range deletion in the extension's Suggestion `command` callback (matches main's `slash-command.ts:116-119` pattern). D9 (range parameter on items) REMOVED entirely — item signature stays `(editor: Editor) => void` unchanged from main. PR #23 component items simplify: drop their own `deleteRange(range)` call, just do `insertContent`.
- **Finding 2 — D5 contradictions:** Same as audit H3. Applied closure-based approach.
- **Finding 3 — Pluggability-only alternative:** User decided to keep the Suggestion migration (option B). Finding documented but not applied.
- **Finding 4 — suggestion not installed:** Same as audit H2.
- **Finding 5 — regex /i flag:** Same as audit H1.
- **Finding 6 — allowedPrefixes edge cases:** Same as audit M2.
- **Finding 7 — PR #23 rebase path unverified:** Added pre-merge dry-run requirement to §8 Delivery (mandatory, 15 min).
- **Finding 8 — governance (PR #37 author):** Added governance step to §8 Delivery — tag PR #37 author as reviewer, explain refactor rationale in PR description.

### Self-assessment findings (2 total) — both applied

- **Finding 1 — suggestion not installed:** Same as audit H2.
- **Finding 2 — D5 over-restrictive:** Same as audit H3. Clarified that `useImperativeHandle` is allowed; only `forwardRef` is forbidden. Still went with closure-based approach for simplicity.

### Net changes to spec

- 9 decisions → 10 decisions (added D10 Tab handling; removed D9 range param).
- D5 rewrote from "forwardRef + useImperativeHandle" to "closure in render() callback."
- D6 confidence downgraded HIGH → MEDIUM with implementation verification flag.
- D9 REMOVED (would have caused regression).
- §1 regex quotation corrected (added /i flag).
- §3.1 target code: extension now handles range deletion; closure-based keyboard state.
- §3.2 item signature: unchanged from main (no range parameter).
- §3.3 menu component: stays pure render function; category labels from props.
- §5 Tech Stack: @tiptap/suggestion as explicit new dependency.
- §7 Test scenarios: added R14 (Tab), R15 (case-insensitive), R16 (rapid insert), R17 (delete verification).
- §8 Delivery: added pre-merge dry-run rebase requirement + governance step.
- §10 Open Questions: added OQ6 (start-of-block verification).
- §11 Assumptions: A2 downgraded, A6 added (useImperativeHandle clarification).
- §12 Risks: R1/R6/R7 adjusted, R5 removed.
- Evidence file: regex analysis corrected, collaborative finding corrected, line count corrected from 40% to 5%, Angle 4 clarified.

### Key lessons

1. **Verify codebase claims directly.** I claimed `@tiptap/suggestion` was "transitively present" without running `grep bun.lock` or checking `node_modules/`. A 10-second verification would have caught it.
2. **Quote regexes with flags.** Missing `/i` led to an incorrect "improvement" claim.
3. **Keep responsibility boundaries clean.** Pushing range deletion to items would have been a catastrophic regression. The cleaner pattern is "extension owns lifecycle concerns (deletion, positioning); items own domain logic (what to insert)." Challenger's Finding 1 saved the spec from a critical bug.
4. **Subprocess cold reads catch things.** The audit + challenger pass caught multiple issues that self-assessment missed. Always run them on spec decisions with architectural implications.
