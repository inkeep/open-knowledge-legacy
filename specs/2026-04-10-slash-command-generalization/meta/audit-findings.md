# Audit Findings

**Artifact:** `specs/2026-04-10-slash-command-generalization/SPEC.md`
**Evidence:** `specs/2026-04-10-slash-command-generalization/evidence/slash-command-architecture-analysis.md`
**Audit date:** 2026-04-10
**Auditor:** Cold-read audit agent (no prior session context)
**Total findings:** 10 (3 high, 4 medium, 3 low)

---

## High Severity

### [H1] Finding 1: Regex misquotation — missing `i` flag changes equivalence analysis

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §1 (line 17), §9 D6 (line 476), Assumption A2 (line 488); Evidence file lines 66, 85-86
**Issue:** The spec quotes main's trigger regex as `(?:^|\s)\/([a-z0-9-]*)$` throughout. The actual code at `packages/app/src/editor/extensions/slash-command.ts:58` is:

```ts
const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
```

The `i` flag makes the character class `[a-z0-9-]` also match uppercase A-Z. The current code already accepts uppercase query characters (typing `/HELLO` matches against items case-insensitively).

**Current text (evidence file, lines 85-86):** "Main's current regex silently dismisses uppercase — that's a subtle behavior difference, but arguably a bug in main (users expect case-insensitive matching). After the refactor, uppercase triggers work correctly."
**Evidence:** Line 58 of `slash-command.ts` contains the `i` flag. The `filterItems` function (items.ts:112-113) also lowercases the query before matching, so the full pipeline is already case-insensitive end-to-end.
**Status:** CONTRADICTED
**Suggested resolution:** Correct the regex quotation everywhere to include the `i` flag. Remove the evidence file's claim about "minor improvement" for uppercase — there is no improvement because the current behavior already handles it. Update the equivalence analysis in D6 and A2 to note that `@tiptap/suggestion` passes the raw query string to the `items()` callback, and the case-insensitive behavior is preserved by `filterItems`'s `toLowerCase()` call, not by the trigger regex.

---

### [H2] Finding 2: @tiptap/suggestion is NOT transitively present in the project

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §5 (line 372-373)
**Issue:** The spec claims `@tiptap/suggestion` is "Already transitively present via `@tiptap/extension-mention` and other suggestion-using extensions." This is false on three counts:

1. `@tiptap/extension-mention` is NOT in `packages/app/package.json`
2. `@tiptap/suggestion` does NOT appear in `bun.lock` (zero grep matches)
3. `@tiptap/suggestion` is NOT in `node_modules/` (directory does not exist)

None of the project's installed `@tiptap/*` packages (`core`, `react`, `pm`, `starter-kit`, `extension-collaboration`, `extension-collaboration-cursor`, `extension-image`, `extension-link`, `extension-placeholder`, `extension-table`, `extension-task-list`, `markdown`, `y-tiptap`) depend on `@tiptap/suggestion`.

**Current text:** "Already transitively present via `@tiptap/extension-mention` and other suggestion-using extensions. Needs explicit `bun add @tiptap/suggestion` if not."
**Evidence:** `grep '@tiptap/suggestion' bun.lock` returns zero matches. `ls node_modules/@tiptap/suggestion` returns "NOT_INSTALLED". `packages/app/package.json` lists 13 `@tiptap/*` packages, none of which is `@tiptap/extension-mention` or `@tiptap/suggestion`.
**Status:** CONTRADICTED
**Suggested resolution:** Remove the "Already transitively present" claim. State definitively: "`@tiptap/suggestion` is a new dependency that must be explicitly added via `bun add @tiptap/suggestion@^3.22.3`." This changes §5 from "might need to add" to "must add," and makes Risk R6 (peer-dep conflict) slightly more relevant since it's a genuinely new package entering the dependency tree.

---

### [H3] Finding 3: D5 (forwardRef + useImperativeHandle) contradicts evidence recommendation and target code sketch

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md §3.3 (lines 329-335), §9 D5 (line 475), §13 Agent Constraints ASK_FIRST (lines 546-547), §3.1 target code (line 218); Evidence file lines 218-223, conclusion (lines 247-249)
**Issue:** The spec contains four contradictory statements about keyboard handling architecture:

1. **§3.3** says: "Use React's `useImperativeHandle` + forwardRef pattern so the extension can call `menuRef.current.onKeyDown(event)`."
2. **D5** says: "In the menu component via `forwardRef` + `useImperativeHandle`." (Status: LOCKED, HIGH confidence)
3. **Evidence file conclusion** says: "Keyboard handling should live in the `render()` callback's closure via Suggestion's built-in `onKeyDown` return value, not via a React ref." (Option B recommended)
4. **§3.1 target code** (line 218) uses `menuHandleKeyDown(props.event)` — a bare function call, not a ref-based call like `menuRef.current.onKeyDown(event)`.
5. **§13 Agent Constraints** says ASK_FIRST "If migrating to `forwardRef` + `useImperativeHandle` conflicts with React Compiler expectations."

The evidence file analyzed this decision, recommended Option B (closure-based, no ref), but the spec's D5 was locked as Option A (forwardRef). Meanwhile, the target code sketch implements Option B. The decision log says one thing, the code shows another, and the evidence recommends a third path.

**Status:** INCOHERENT
**Suggested resolution:** Resolve the D5 decision to match the target code and evidence recommendation. If closure-based is the intended approach (as the evidence file and target code suggest), update D5 to say "Closure-based keyboard handling in Suggestion's `render().onKeyDown` callback." Remove the forwardRef language from §3.3. Remove the ASK_FIRST about forwardRef from §13 (the concern doesn't apply if forwardRef isn't used). If forwardRef IS intended, fix the target code sketch and the evidence file's conclusion.

---

## Medium Severity

### [M1] Finding 4: Tab key handling omitted from spec — silent behavior regression

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §3.3 (line 331), §7 test scenarios (R01-R13)
**Issue:** The current code at `slash-command.ts:111` handles Tab as an alias for Enter:

```ts
if (event.key === 'Enter' || event.key === 'Tab') {
```

The spec's §3.3 describes keyboard handling as covering "arrow up/down, enter, escape" — Tab is not mentioned. None of the 13 regression test scenarios (R01-R13) test Tab-to-select behavior. If the migration omits Tab handling, it's a behavior regression that would violate the spec's own P0 success criterion: "Zero user-visible behavior change."

**Current text (§3.3):** "Return `true` if it consumed the event (arrow up/down, enter, escape)"
**Evidence:** `slash-command.ts:111`: `if (event.key === 'Enter' || event.key === 'Tab') {`
**Status:** STALE (spec does not reflect current code behavior)
**Suggested resolution:** Add Tab to §3.3's keyboard handling description. Add a regression test scenario (e.g., R14: "Type `/h2` then Tab → Current block becomes H2"). Ensure the target implementation includes Tab in the keydown handler.

---

### [M2] Finding 5: Trigger regex equivalence is narrower than claimed

**Category:** FACTUAL
**Source:** T1 (own codebase), T3 (3P dependency docs)
**Location:** SPEC.md §9 D6 (line 476), Assumption A2 (line 488); Evidence file lines 66-86
**Issue:** The spec claims `startOfLine: false` + `allowedPrefixes: [' ', '\n']` is equivalent to main's `(?:^|\s)` alternation. This is close but not identical:

1. **`\s` vs discrete list:** The regex's `\s` matches any Unicode whitespace (space, tab, non-breaking space U+00A0, form feed, etc.). `allowedPrefixes: [' ', '\n']` only matches literal space and newline.
2. **Dead code in `'\n'`:** ProseMirror represents line breaks as block boundaries, not `\n` characters within text nodes. The `'\n'` in allowedPrefixes likely never matches anything in practice.
3. **Non-breaking space edge case:** ProseMirror uses non-breaking space (U+00A0) in certain decorations and for preserving whitespace. With the current regex, typing a non-breaking space followed by `/` would open the menu. With `allowedPrefixes: [' ', '\n']`, it would not.

In practice, these differences affect <0.1% of user scenarios. But the spec claims full equivalence without noting edge cases. The Assumption A2 confidence is "HIGH" with verification claim "Verified from TipTap Suggestion source" — but the evidence file (line 253) admits it hasn't read the `@tiptap/suggestion` source directly.

**Current text (A2):** "Equivalent to main's `(?:^|\s)` alternation."
**Evidence:** [TipTap Suggestion docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) show `allowedPrefixes` accepts an array of strings or null. ProseMirror text nodes don't contain `\n` characters.
**Status:** INCOHERENT (confidence HIGH but unverified from source; claim of full equivalence has known gaps)
**Suggested resolution:** Downgrade A2 confidence to MEDIUM. Add a note that `allowedPrefixes: [' ']` (just space) is probably sufficient since ProseMirror text nodes don't contain newlines. Acknowledge that `\s` is broader than `[' ', '\n']` but that the difference is practically negligible for editor text nodes.

---

### [M3] Finding 6: Collaborative awareness is NOT "free" — requires explicit shouldShow configuration

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), T3 (3P dependency docs)
**Location:** SPEC.md §2 Tertiary success criteria (lines 68-74), §7 C01-C02 test scenarios (lines 454-456), §3.1 target code (lines 108-233)
**Issue:** The spec claims (§2, line 69): "The migration to `@tiptap/suggestion` brings collaborative-awareness that main's custom Plugin lacks" and frames it as a benefit that comes "for free during the migration." Test scenarios C01-C02 verify this behavior.

However, the target code sketch in §3.1 does NOT configure a `shouldShow` callback. The [TipTap Suggestion docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) state that `shouldShow` defaults to `null` and explicitly recommend configuring it with `isChangeOrigin` from `@tiptap/extension-collaboration` to prevent menus opening for remote users. This is not automatic behavior — it requires explicit configuration.

The evidence file (line 97) also mischaracterizes `shouldShow`: "Suggestion's `shouldShow` callback runs on every transaction." The actual docs state it is "only evaluated on transactions where the suggestion plugin finds a valid match."

**Current text (§2, lines 68-70):** "shouldShow callback can check transaction origin to avoid opening the menu on remote sync transactions"
**Evidence:** [TipTap docs](https://tiptap.dev/docs/editor/api/utilities/suggestion): `shouldShow` default is `null`. Must be explicitly configured with `isChangeOrigin` helper for collaborative filtering.
**Status:** INCOHERENT (success criterion claims behavior the implementation doesn't configure; test scenarios C01-C02 would likely fail against the target code)
**Suggested resolution:** Either add `shouldShow` with `isChangeOrigin` to the target code in §3.1, or reclassify collaborative awareness from "comes for free" to "new capability available via optional configuration" and move C01-C02 to a Future Work enhancement.

---

### [M4] Finding 7: React Compiler vs React 19 forwardRef deprecation conflated

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** SPEC.md §13 ASK_FIRST (lines 546-547); Evidence file Angle 4 (lines 218-223)
**Issue:** The spec says: "this codebase uses React Compiler; the block-editor-ux spec notes that `useMemo`/`useCallback`/`forwardRef`/`memo` are discouraged." This conflates two separate React changes:

1. **React Compiler** (build-time optimizer): makes `useMemo`, `useCallback`, and `React.memo` unnecessary by auto-memoizing. Does NOT specifically discourage `forwardRef` or `useImperativeHandle`.
2. **React 19** (runtime): deprecates `forwardRef` for function components — ref is now a regular prop. `useImperativeHandle` continues to work and is not discouraged.

The spec groups all five APIs (`useMemo`/`useCallback`/`forwardRef`/`memo`/`useImperativeHandle`) as equally discouraged by "React Compiler," but:
- `useMemo`/`useCallback`/`memo` → React Compiler concern (auto-memoized, no longer needed)
- `forwardRef` → React 19 concern (ref-as-prop, separate from Compiler)
- `useImperativeHandle` → NOT discouraged by either; still the canonical way to expose imperative APIs

**Current text:** "useMemo/useCallback/forwardRef/memo are discouraged"
**Evidence:** [React 19 blog post](https://react.dev/blog/2024/12/05/react-19), [React Compiler articles](https://dev.to/alexcloudstar/the-react-compiler-is-here-say-goodbye-to-usememo-and-usecallback-436g): Compiler auto-memoizes (memo/useMemo/useCallback unnecessary); React 19 deprecates forwardRef; useImperativeHandle remains supported.
**Status:** INCOHERENT (lumps unrelated concerns together; the analysis of "discouragement" is imprecise)
**Suggested resolution:** If D5 resolves to closure-based (per H3), this becomes moot. If forwardRef is needed, note that React 19 ref-as-prop is the concern (not React Compiler), and `useImperativeHandle` remains fully supported. Separate the memoization concern from the ref-forwarding concern.

---

## Low Severity

### [L1] Finding 8: No existing tests to preserve — Risk R5 is zero-probability

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §11 R5 (line 503), §3.4 (line 337), §13 ASK_FIRST (line 545)
**Issue:** The spec includes Risk R5 ("The refactor accidentally breaks a test that depends on the custom PluginKey state shape") and §3.4 says "All existing unit tests (if any) pass unchanged." Grep for `slashCommandKey`, `SlashCommand`, and `slash.*command` across all `*.test.*` files returns zero matches. There are no existing tests for the slash command system.

Risk R5 is about a scenario that cannot occur. §3.4's hedging "(if any)" is honest but the risk assessment implies a plausible threat.

**Evidence:** `grep -r 'slash.*command|SlashCommand' **/*.test.*` returns zero files.
**Status:** STALE (describes a risk that doesn't apply to current codebase)
**Suggested resolution:** Remove R5 or note it as "N/A — no existing slash command tests found." Keep §3.4's "(if any)" language, which is already appropriately hedged.

---

### [L2] Finding 9: Evidence file claims ~40% code reduction but calculates ~11%

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** Evidence file heading (line 116) vs detail (line 127)
**Issue:** The evidence file section heading says "Bespoke code surface reduces by ~40%" but the detailed calculation shows 431 → ~385 lines = -46 lines = -11%. The heading overstates the reduction by nearly 4x. The body text (line 129) acknowledges "The 11% line reduction understates the maintenance benefit" but the heading is misleading.

**Current text (evidence heading, line 116):** "Bespoke code surface reduces by ~40%"
**Evidence:** The table at lines 122-127 shows a -46 line / -11% reduction.
**Status:** INCOHERENT
**Suggested resolution:** Change the heading to match the data: "~11% line reduction with maintenance-weighted benefit" or similar. The argument about qualitative maintenance benefit is valid and well-stated in the body text — the heading just needs to match the numbers.

---

### [L3] Finding 10: shouldShow characterization in evidence file is imprecise

**Category:** FACTUAL
**Source:** T3 (3P dependency docs)
**Location:** Evidence file line 97
**Issue:** The evidence file says "Suggestion's `shouldShow` callback runs on every transaction." The [TipTap docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) state the callback "is not called for every transaction. It is only evaluated on transactions where the suggestion plugin finds a valid match."

This is a meaningful difference: `shouldShow` is a filter on valid matches, not a global transaction interceptor. The current characterization could lead to incorrect implementation assumptions (e.g., trying to use `shouldShow` as a general transaction observer).

**Current text:** "Suggestion's `shouldShow` callback runs on every transaction."
**Evidence:** TipTap docs say shouldShow evaluates only on match-containing transactions.
**Status:** CONTRADICTED
**Suggested resolution:** Correct to: "`shouldShow` is called when the plugin finds a valid trigger match, allowing filtering before the menu opens (e.g., to suppress on remote collaboration transactions)."

---

## Confirmed Claims (summary)

### T1 (Own codebase) — Confirmed
- **Line counts:** 213 + 119 + 99 = 431 total lines across the three files. Matches spec and evidence exactly.
- **10 items, 2 categories:** `items.ts` contains exactly 10 items (8 basic, 2 insert). Names, labels, icons, and categories match the spec's description.
- **Category labels:** Module-level const `categoryLabels` in `SlashCommandMenu.tsx` matches spec description.
- **Plugin architecture:** The custom ProseMirror Plugin structure with `slashCommandKey`, `state.apply`, `handleKeyDown`, and `view()` matches the spec's "Current" code description.
- **slashCommandKey usage:** Only used within `slash-command.ts` itself (10 references in that file, 0 in test files).
- **No import cycles:** `items.ts` has no dependency on the extension file. Confirmed.

### T3 (3P dependencies) — Confirmed
- **@tiptap/suggestion API:** `allowedPrefixes`, `shouldShow`, `startOfLine`, `shouldResetDismissed` all exist as documented options.
- **Docmost uses @tiptap/suggestion:** Confirmed via [DeepWiki](https://deepwiki.com/docmost/docmost/3.2-slash-commands-and-content-insertion).
- **TipTap Suggestion is the ecosystem standard:** TipTap's official examples, Docmost, and community packages (Novel, harshtalks/slash-tiptap) all use `@tiptap/suggestion` for slash commands.

### T4 (Web verification) — Confirmed
- **React 19 deprecates forwardRef:** Confirmed. Ref is now a regular prop in React 19.
- **React Compiler auto-memoizes:** Confirmed. Makes `useMemo`/`useCallback`/`React.memo` unnecessary.

---

## Unverifiable Claims

1. **"BlockNote uses `@tiptap/suggestion`"** (evidence file line 22): BlockNote is built on TipTap and has a `SuggestionMenuController` abstraction for slash menus, but whether it uses `@tiptap/suggestion` package directly vs. a custom ProseMirror-level implementation could not be confirmed from public documentation. The claim is directionally plausible but not verified from source. Severity: Low — the broader ecosystem argument holds regardless.

2. **`@tiptap/suggestion@3.22.3` version existence:** npm returned 403 during verification. The TipTap monorepo publishes all packages at the same version, and `@tiptap/core@3.22.3` is in use, so 3.22.3 very likely exists for suggestion as well. Could not directly confirm.

3. **Suggestion's `findSuggestionMatch` behavior at text-start position:** The evidence file claims that when the trigger char is at position 0 of the text content, it matches regardless of `allowedPrefixes` (covering the `^` case in the regex). This is plausible and consistent with docs, but the actual source code of `findSuggestionMatch` was not read. The evidence file (line 253) explicitly notes this gap: "Have not read `@tiptap/suggestion@3.22.3` source directly."

4. **PR #23 rebase cost estimate (~50 lines addition, ~350 lines deletion):** The evidence file (line 255) acknowledges "Have not dry-run the PR #23 rebase." This is an unverified projection. Not auditable without actually performing the rebase.
