# Design Challenge Findings (Rebase Pass)

**Artifact:** `specs/2026-04-11-wiki-link-suggestion-migration/SPEC.md`
**Challenge date:** 2026-04-12
**Baseline:** `39fcd87` (post-PR #53 / post-PR #71)
**Prior challenger:** `meta/design-challenge.md` (2026-04-11, pre-rebase)
**Prior audit (rebase):** `meta/audit-findings-rebase.md` (2026-04-12, applied in spec)

**Total findings:** 7 (2 high, 3 medium, 2 low)
**Top-line stance:** The prior challenger's H1 ("just add Floating UI, keep the custom plugin") **gets stronger, not weaker, after the rebase.** The savings math now works against the migration: 492 → ~375-400 is a 19-24% reduction for a change that touches trigger detection, keyboard handling, render lifecycle, and atom deletion simultaneously. Two of the four originally-claimed migration benefits (collaborative-safe, consistent Escape) are still unsubstantiated in the rebased spec; one (error boundary) is 3 lines; one (Floating UI) is independently portable. The spec should either (a) split the migration into two PRs or (b) commit to Floating-UI-only and defer the full migration until a second suggestion-like feature (mentions, tags) lands and amortizes the abstraction.

---

## High Severity

### [H] Finding R1: The prior challenger's H1 ("Floating UI only, keep custom plugin") gets STRONGER after the rebase

**Category:** DC1 (Simpler alternative) — **re-opened with new evidence**
**Source:** Prior `meta/design-challenge.md` H1; audit-findings-rebase.md M2
**Location:** §1 Problem Statement; §2 Secondary (line 72); §8 D-table (no D0 for the "whether to migrate" question)

**Issue:**
The prior challenger's H1 argued for "incremental Floating UI only (~40 lines of change)" over the full migration. At the time, the numeric comparison was ~40 lines of change vs. ~518 lines of churn (338 removed + 180 added). The pre-rebase savings ratio was ~47%.

After the rebase (PR #53 anchor mode, PR #71 backlinks panel), the target file is 492 lines. The spec's revised LOC estimate (492 → ~375-400, per §2 line 72 and audit M2) is a **19-24% reduction**. The delta between "do nothing but add Floating UI" and "full migration" has compressed dramatically:

| Dimension | Pre-rebase (prior challenger) | Post-rebase (this pass) |
|---|---|---|
| Current file size | 338 | 492 |
| Target size | ~180 | ~375-400 |
| Raw reduction | 158 lines (47%) | 92-117 lines (19-24%) |
| Churn (add + remove) | ~518 | ~800+ (full rewrite of a 492-line file) |
| "Just Floating UI" alternative churn | ~40 lines | ~40 lines (unchanged — the positioning block is still the same size) |
| Migration premium over incremental | ~478 extra lines of churn for 47% savings | ~760+ extra lines of churn for 19-24% savings |

**Churn-to-savings ratio gets worse, not better:** Pre-rebase, the full migration cost 10x more churn per unit of future-LOC savings. Post-rebase, it costs ~8x more churn — but the absolute savings shrunk so much that the tradeoff is now "800 lines of churn today for ~100 lines of future maintenance surface." That's one big review-surface PR for one quarter's worth of maintenance avoided.

**What the rebase also added that the migration *still* doesn't simplify:**
1. **Per-mode branching in items()** — `parseQuery(query)` → mode-specific fetch + filter. Exists in both before and after (§3.3 lines 138-174). No reduction.
2. **Two caches** (`cachedPages`, `cachedHeadings: Map`) — Exists in both. Suggestion does not abstract page or heading caching.
3. **Fallback insertion** (§3.5 lines 275-286) — Now has to read `wikiLinkSuggestionKey.getState(editor.state).query` instead of `state.query` directly. Slightly worse ergonomics.
4. **Atom deletion plugin** (§3.6) — Migration *adds* a second plugin because Suggestion's onKeyDown is active-only. This is a *new* layer of complexity relative to the custom plugin.
5. **Dual `onBeforeStart` + `onBeforeUpdate`** (§3.3 lines 216-220, D8) — Migration-specific scaffolding to push loading props before `items()` awaits. The custom plugin doesn't need this — `view().update` runs on every tx and reads state directly.
6. **Promise-dedupe** (§3.3 lines 181-200, D9) — Also migration-specific. The custom plugin today guarantees one fetch per menu open via `if (!renderer)` gate. Migration loses that natural singleton and has to re-add it via `pagesInFlight`.

Items 4-6 are **net complexity added by the migration that the custom plugin does not have**. The prior challenger didn't have these to cite because they only emerged when the rebased spec confronted the PR #53 anchor-mode surface honestly.

**What the migration still buys (re-evaluating the four original claims):**

| Claim | Pre-rebase verdict | Post-rebase verdict |
|---|---|---|
| "No Floating UI — menu doesn't flip/track-scroll" | Real gap, solvable with ~40 LOC addition to custom plugin | **Same** — still a real gap, still portable to the custom plugin |
| "No collaborative-safe `shouldShow`" | Unverified (prior Finding 2) | **Still unverified** in rebased spec. Spec references Suggestion's internal lifecycle as "collaborative-safe" but neither the pre- nor post-migration code path uses `shouldShow`. Slash-command.ts doesn't either. |
| "No error boundary on `insertWikiLink`" | 3-line try/catch addition | **Same** — 3 lines in the custom plugin, 3 lines in the migrated version |
| "Inconsistent Escape handling" | Undefined / unclear | **Still undefined.** The custom plugin's Escape at line 251-255 closes the menu. Suggestion's Escape (`index.js` lines 328-332) also closes the menu and ignores onKeyDown's return. The user-visible behavior is the same. |

Two out of four claimed benefits are unchanged and portable (Floating UI, error boundary). Two remain unsubstantiated (collaborative-safe, consistent Escape) — the rebased spec never added evidence for either.

**New pressure points specific to the rebased spec:**
- **PR #71 just merged** (commit 39fcd87, "Wiki links: backlink graph, HTTP + MCP APIs, and editor backlinks panel"). PR #53 before that (commit 5f19fae). The wiki-link surface is *live* work — two substantive PRs in the last month from mike-inkeep, with the suggestion file going from 338 → 492 in that window. This is a bad time to land a 800-line-churn rewrite that will merge-conflict with any in-flight wiki-link PR.
- **Audit H2 caught a concurrent-fetch race** that only exists in the migrated version (the custom plugin fetches once per menu open by construction; the migration fetches on every keystroke and needs `pagesInFlight` to dedupe). This is a pattern: migration surfaces *new* correctness obligations that the custom plugin didn't have. The audit caught one. What others are latent?

**Alternative this finding proposes:**

Option A (strongest recommendation): **Ship only Floating UI + error boundary + the `]]` mid-word trigger test coverage.** ~40-60 lines of change to the existing 492-line plugin. No custom matcher, no lifecycle rewrite, no atom-deletion plugin extraction, no `pagesInFlight` dedupe. The user-visible wins (flip, scroll-track, dynamic max-height, insertion doesn't throw) land with ~1/15th the code churn. The architectural-alignment win is deferred until a third suggestion trigger (mentions, tags, etc.) justifies the shared abstraction.

Option B: **Split the migration into two PRs.** PR-1: Floating UI + error boundary on the custom plugin (small, low-risk, quick revert). PR-2: Suggestion migration when reviewer cycles allow. PR-2 reviewers can focus on the lifecycle rewrite without being distracted by positioning/try-catch mechanics. This is DC4 (scope contract) applied.

Option C (current spec): **Full migration in one PR.** Highest churn, requires careful review of trigger detection AND keyboard handling AND render lifecycle AND atom deletion AND async timing AND concurrent-fetch dedupe — in a file that just received 154 net lines of new surface area from the last contributor.

**Trade-off comparison:**

| Dimension | Option A (Floating UI only) | Option B (split PRs) | Option C (current spec) |
|---|---|---|---|
| LOC of diff in PR | ~40-60 | PR-1: ~40-60; PR-2: ~600-800 | ~800 |
| Review-surface complexity | Positioning function swap + try/catch | Two focused reviews | Full rewrite in one sitting |
| User-visible benefit delivered | Floating UI + no-throw insertion | Same (immediately) + architectural alignment (later) | All at once |
| Risk surface | Positioning + one 3-line try/catch | Split: PR-1 localized, PR-2 concentrated | All surfaces touched simultaneously |
| Merge-conflict risk against in-flight wiki-link PRs | Low (touches 2 small blocks) | Low for PR-1, real for PR-2 | **High** (full file rewrite collides with any concurrent edit) |
| Rollback cost if wrong | Revert 40 lines | Revert PR-1 or PR-2 independently | Full revert of a 492-line rewrite |
| Architectural alignment win | Deferred | Preserved (PR-2) | Immediate |
| LOC saved | 0 (but flat — same 492 maintained) | ~100 after PR-2 | ~100 |

**Severity rationale (HIGH):** This is exactly the question the prior challenger raised, and the post-rebase evidence makes the answer *less* favorable to the migration, not more. The spec has not added a D0 decision ("why migrate at all given these numbers") — it still reads as "the migration mechanics are sound" without revisiting whether the migration itself is the right move.

**Status:** CHALLENGED (re-opened with strengthened evidence)

**Suggested resolution:**
1. Add a D0 decision to §8 comparing full-migration vs Option A (Floating-UI-only) vs Option B (split PRs) with the quantitative churn/savings math from this finding.
2. If the chosen rationale is "establish architectural alignment now so the next suggestion-type trigger is cheap," document the pipeline: who is planning to ship mentions/tags/templates, on what horizon, and whether that plan exists in any tracker/roadmap/issue. Without a concrete next-suggestion on the calendar, "architectural alignment" is deferred value against immediate churn.
3. If the chosen rationale survives that scrutiny, still consider Option B (split PRs). The Floating UI + error-boundary portions can ship in 1-2 days and deliver the user-visible wins immediately, while PR-2 (Suggestion migration) can take its time.

---

### [H] Finding R2: Single-PR delivery is fragile against two active contributors on the same file

**Category:** DC2 (Stakeholder gap) + DC7 (Reversibility)
**Location:** Header (Target PR: Direct to main); §11 SCOPE
**Issue:**
The rebase itself is the evidence. The spec was drafted at baseline `0e5c31d` (target 338 lines, estimate ~180). Between draft and challenger pass, two PRs merged from the same author (mike-inkeep) — PR #53 (`5f19fae`: anchor mode + fallback insertion + atom deletion) and PR #71 (`39fcd87`: backlinks panel). The suggestion file grew 45% (338 → 492) during a roughly 2-week window. The spec had to rebase once already. That is a live signal: wiki-link is an area of active iteration, not a settled surface that's safe to rewrite.

**What the spec doesn't address:**

1. **Locking semantics.** Suppose mike-inkeep is preparing a PR that adds (say) inline-previews for wiki-links, touching `wiki-link-suggestion.ts` and `WikiLinkSuggestionMenu.tsx`. The migration PR rewrites both files. The conflict surface is near-total — there is no clean three-way merge possible for a file that was fully rewritten against one that received surgical edits in the same blocks.

2. **Review bandwidth.** The spec targets "moderate size — bigger than originally scoped due to anchor mode, but still a single-sitting review." A 800-line-churn PR that touches trigger detection + keyboard handling + async lifecycle + atom deletion + two fetchers + error boundaries is a poor fit for "single sitting" review, especially for a reviewer who also maintained PR #53 and remembers its subtleties. Errors in review are more likely as surface grows.

3. **Commit-isolation for rollback.** Spec §11 SCOPE is tight (four files), but the rollback unit is "revert the migration PR" — not "disable the migration via flag." If a subtle regression surfaces days after merge (e.g., a collaborative-editing edge case — see R3 below), the revert itself is a substantial code move.

4. **Staging gap.** The spec has no staging/canary phase. §2 "zero user-visible behavior change" is manual QA (§7 R01-R23). The entire "it doesn't regress" claim rests on one reviewer's pre-merge testing. There is no feature flag to let the migration coexist with the old plugin for any duration.

**What a stakeholder-aware spec would include:**

- **Coordination protocol:** "Confirmed with mike-inkeep that no wiki-link PR is in flight that would conflict with this rewrite" — or explicit acknowledgement that a rebase/merge cost is accepted.
- **Feature flag or dual-plugin mode:** `if (USE_NEW_SUGGESTION) return [Suggestion(...), atomDeletionPlugin]; else return [createWikiLinkSuggestionPlugin(this.editor)];` — lets the new path coexist with the old for a rollout window; revert is a flag flip, not a code revert.
- **Split PRs** (Option B from R1): A small PR-1 (Floating UI + error boundary) is low-risk and can merge immediately. PR-2 (migration) can wait for a quiet period in wiki-link work.

**Severity rationale (HIGH):** "Direct to main" + "no feature flag" + "active file churn from another contributor" + "full rewrite in one PR" combine to make this the highest-risk deployment path chosen for a pure refactor that (per §2) has zero user-visible benefit beyond Floating UI. The risk profile doesn't match the claimed benefit profile.

**Status:** CHALLENGED

**Suggested resolution:**
1. Add a coordination section in §11 Agent Constraints or a new §12: "Before merge, confirm no wiki-link-touching PR is open or imminent." Link to the author's GitHub (mike-inkeep) or a team channel for active-work verification.
2. Add a feature-flag option (or explicitly accept the revert-via-PR path with rationale: "The rollback cost is a PR revert; we accept this because [specific confidence-building evidence]").
3. Prefer Option B from R1 (split PRs) over Option C (single big PR). The Floating UI + try-catch portion can ship Monday; the Suggestion migration can wait a week.

---

## Medium Severity

### [M] Finding R3: Atom deletion plugin (D6) creates a new coordination surface that the custom plugin doesn't have

**Category:** DC6 (Premature complexity) + DC5 (Foreclosed paths)
**Location:** §3.6 (lines 302-325), §8 D6 (line 445), Risk R3 (line 471)

**Issue:**
The current custom plugin handles active-state (Enter/Tab/Arrow/Escape) and inactive-state (Backspace/Delete atom deletion) in the same `handleKeyDown` with a `!state?.active` early branch (lines 188-213). The migration must split these: Suggestion's `render().onKeyDown` only fires when active, so inactive-state Backspace/Delete needs a separate plugin.

D6 locks this in and says "~30-line ProseMirror plugin." The audit Risk R3 notes: "Backspace while suggestion ACTIVE: Suggestion's `onKeyDown` returning `false` for Backspace — does ProseMirror then run the atom-deletion plugin's Backspace handler?"

This is a real coordination problem:

1. **Plugin ordering sensitivity.** `addProseMirrorPlugins()` returns `[Suggestion(...), wikiLinkAtomDeletionPlugin]`. ProseMirror runs keymap/props plugins in registration order. If Suggestion returns `false` for Backspace when active, the second plugin's Backspace handler runs. To prevent atom deletion while active, the second plugin must re-query `wikiLinkSuggestionKey.getState(view.state)?.active` and guard. That's a new cross-plugin dependency that didn't exist in the custom plugin (where the two paths were literally one function).

2. **Three-way test surface.** The spec's R23 covers "Backspace while active → suggestion nav, no atom deletion." But R21-R22 cover "Backspace/Delete when inactive → atom deletion." The in-between case (transitioning state: the current tx deactivates Suggestion because the user just pressed Backspace through the `[[`, but the atom-deletion plugin reads state *before* that tx completes) is not explicitly tested. R23 assumes the state read is stable within a keydown — which it is, but the migration's split plugins make this reasoning non-local.

3. **Debuggability.** The custom plugin's Backspace behavior is 15 lines in one function. The migrated version has: Suggestion's internal `handleKeyDown` (calls `onKeyDown` via renderer) + `render().onKeyDown` (returns false for Backspace) + ProseMirror's plugin chain dispatch + `wikiLinkAtomDeletionPlugin.props.handleKeyDown` (reads Suggestion's state, guards). Tracing a "Backspace didn't do what I expected" bug now spans three layers.

4. **Alternative not seriously considered.** D6's rationale explicitly rules out `addKeyboardShortcuts` with a comment lifted from PR #53 ("interferes with TipTap's built-in handleBackspace chain"). That comment is from the PR #53 context — it was written when the handler was in the *suggestion* plugin, which has priority 200. An atom-deletion-only keymap on the wiki-link extension itself (which also has priority 200) might not have the same interference. The spec doesn't test this — it inherits the PR #53 decision verbatim. An in-extension keyboard shortcut would avoid the separate plugin entirely.

**Concrete alternative:**

```ts
// wiki-link.ts
export const WikiLink = BaseWikiLink.extend({
  priority: 200,
  addNodeView() { return ReactNodeViewRenderer(WikiLinkView); },
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        // Guard: only run when suggestion is inactive
        const s = wikiLinkSuggestionKey.getState(this.editor.state);
        if (s?.active) return false;
        // Delete adjacent wikiLink atom (same logic as current lines 189-199)
        ...
      },
      Delete: () => { ... },
    };
  },
  addProseMirrorPlugins() {
    return [Suggestion<WikiLinkSuggestionItem>({ ... })];  // single plugin
  },
});
```

This keeps the "two plugins → one extension + one keymap" surface, which is closer to the custom plugin's single-function model. Whether the PR #53 comment's interference concern materializes needs testing — but the spec hasn't tested it, only cited a stale comment.

**Trade-off:**
- Pro: Single plugin returned from `addProseMirrorPlugins`; keyboard handling co-located with the extension it protects; simpler mental model.
- Con: If the PR #53 comment is right and keymap interferes, we're back to D6's separate-plugin approach.
- Verification cost: 5 minutes to test Backspace on adjacent text vs. adjacent atom with `addKeyboardShortcuts`.

**Severity rationale (MEDIUM):** D6 is locked at HIGH confidence, but the rationale inherits a comment from a different context without testing whether it still applies in the migrated world. A 5-minute test could simplify the design.

**Status:** CHALLENGED

**Suggested resolution:**
1. Before locking D6, spike `addKeyboardShortcuts` on the wiki-link extension itself with a guard on suggestion state. If it works (no interference with the base Backspace chain), use that path — simpler than a second plugin.
2. If `addKeyboardShortcuts` genuinely interferes, keep D6 but update its rationale to cite a test from *this* migration, not a PR #53 era comment.
3. Add an R23-plus scenario: "Backspace through `[[query` (deactivation-adjacent) — verify the exact boundary tx where Suggestion deactivates and atom-deletion does NOT fire on the same keystroke."

---

### [M] Finding R4: `pagesInFlight` Promise-dedupe (D9) is over-engineered relative to the actual race condition

**Category:** DC6 (Premature complexity)
**Location:** §3.3 lines 176-199, D9 (line 448), Risk R8 (line 476)

**Issue:**
D9 locks in `let pagesInFlight: Promise<PageItem[]> | null = null` + `.then/.catch/.finally` to close off a race that the audit H2 identified. The fix is correct, but it's more machinery than needed.

**The actual race:**
`items()` is called on every query change (source line 195-200). A fast typist types `[[r` then `[[re` within 50ms. First invocation sets `pagesLoaded = false` → fires `fetchPages()` → awaits. Second invocation sees `!pagesLoaded` → fires a *second* `fetchPages()` → awaits the same endpoint twice. Result: same pages array arrives twice, `cachedPages` is overwritten with identical data (harmless), but two HTTP requests fired.

**Simpler alternative:** A `pagesFetching: boolean` flag:
```ts
let pagesFetching = false;
if (!pagesLoaded && !fetchError && !pagesFetching) {
  pagesFetching = true;
  try {
    cachedPages = await fetchPages();
    pagesLoaded = true;
  } catch (err) {
    pagesLoaded = true;
    fetchError = '...';
  } finally {
    pagesFetching = false;
  }
}
```

**Trade-off vs. Promise-dedupe:**

| Dimension | `pagesFetching: boolean` (proposed) | `pagesInFlight: Promise` (spec) |
|---|---|---|
| LOC | 6-8 | 15-20 |
| Behavior on concurrent calls | Second caller sees `pagesFetching === true`, short-circuits (returns empty items, relies on `onBeforeUpdate` to show loading). Third call waits for pagesLoaded flip. | Second caller awaits the same Promise. Both get the same populated items array. |
| User-visible difference | Second keystroke shows "Loading pages…" briefly until the first fetch's `onUpdate` fires and unblocks the next `items()` invocation | Second keystroke's items promise resolves to the same populated array as the first |
| Parallel with anchor-mode | **Yes — anchor mode uses exactly this pattern:** `anchorFetchingFor: string \| null` is a flag (§3.3 line 152, current impl line 123). Spec D9 explicitly notes "parallel pattern" for anchor mode. | Asymmetric — page mode uses Promise, anchor mode uses flag, even though the racing situations are identical |

**The asymmetry is the real concern.** Spec §3.3 line 151 uses `anchorFetchingFor: string | null` for anchor dedupe — the exact flag-based pattern rejected for page mode in D9. The rationale in D9 is "a simple `!pagesLoaded` guard doesn't prevent concurrent fetches because the flag only flips after `await` resolves." That's correct. But a **two-flag** guard (`!pagesLoaded && !pagesFetching`) does prevent concurrent fetches — and it's what anchor mode already uses.

Either:
- Page mode should use the flag pattern (matches anchor mode), or
- Anchor mode should be converted to Promise-dedupe too (consistency).

The spec picks "asymmetric" which is the worst of both worlds.

**What the Promise-dedupe actually buys:** Exactly one benefit — the second caller gets the populated items back in the same awaited frame, so it doesn't have to return empty + wait for `onBeforeUpdate` → next items call. This saves one render cycle (~16ms). Whether that matters for "fast typist hits second keystroke within the fetch window" is a UX question that the spec doesn't raise.

**Severity rationale (MEDIUM):** This is not wrong, but it's asymmetric with the anchor-mode pattern and more complex than needed. The `pagesFetching` flag matches anchor mode's approach and costs 6-8 lines vs 15-20.

**Status:** CHALLENGED

**Suggested resolution:**
1. Either adopt `pagesFetching: boolean` (match anchor mode) or convert anchor mode to Promise-dedupe (match page mode). Don't leave them asymmetric.
2. If Promise-dedupe is deliberately chosen for page mode (e.g., "page mode is higher-traffic so sharing the Promise saves a render"), document that reasoning in D9's rationale. Currently the rationale just says "flag doesn't prevent concurrency" — which is true of the 1-flag version but not the 2-flag version that anchor mode uses.

---

### [M] Finding R5: `onBeforeStart` + `onBeforeUpdate` dual-push is a lifecycle mismatch, not a clean API

**Category:** DC6 (Premature complexity)
**Location:** §3.3 lines 216-220, D8 (line 447), audit H1 (which forced this design)

**Issue:**
The rebased spec (per audit H1) correctly adds `onBeforeUpdate` to push the per-mode loading label before `items()` awaits. The implementation now has **six** render hooks: `onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`, `onKeyDown`, `onExit` — each with mode/pageTarget/anchorQuery parsing via `parseQuery(props.query ?? '')` at the top.

Compare to the custom plugin's `view().update()` which runs once per tx and reads state once. The migration's lifecycle splits "the same conceptual work" (figure out mode + parse query + decide loading state + rebuild filtered items) across six entry points.

**Concrete smell:** §3.3 line 218-220 says:
> `onBeforeStart` — mount popup + ReactRenderer with `loading: true`.
> `onBeforeUpdate` — mode switch path... Compute `loading` as: `mode === 'anchor' ? !cachedHeadings.has(pageTarget) : !pagesLoaded`.
> `onStart` / `onUpdate` — items have resolved; update renderer with `loading: false`.

So each of these four hooks does a `parseQuery(props.query ?? '')` + `cachedHeadings.has(...)` check + `renderer.updateProps(...)` with four args. The "mode / loading / pageTarget / anchorQuery" tuple is computed identically in four places. This is a classic symptom of a lifecycle that doesn't match the problem — the conceptual step is "whenever state changes, re-render with derived props," which is `view().update()` in the custom plugin and a distributed four-hook dance in the migration.

**Is there a cleaner collapse?** Not within `@tiptap/suggestion`'s API. The lib forces this shape:
- `onBeforeStart` / `onBeforeUpdate` fire before the async `items()`
- `onStart` / `onUpdate` fire after
- No single "re-render with new state" hook

The spec locks D8 as HIGH confidence, accepting this. But it's worth naming the cost: **the migration trades one `view().update()` callback (custom plugin) for six render hooks with duplicated logic (Suggestion API)**. This is accurate if you read the spec carefully, but §2 ("architectural alignment") and the overall tone don't highlight that the alignment itself adds surface area for this particular problem.

**What helps:** Extract a `renderProps(suggestionProps: SuggestionProps<...>, loading: boolean, error: string | null): MenuProps` pure function that all four hooks call. Saves a couple lines and centralizes the parseQuery logic.

**Severity rationale (MEDIUM):** Not a blocker — the six-hook dance is what the API requires. But the spec should (a) not pretend this is simpler than the custom plugin's `view().update()` when it's just differently-shaped, and (b) extract a helper to avoid quadrupled parseQuery+loading logic across hooks.

**Status:** CHALLENGED

**Suggested resolution:**
1. Extract a `computeMenuProps(suggestionProps, loading, error)` helper and call it from all four render hooks (`onBeforeStart`, `onBeforeUpdate`, `onStart`, `onUpdate`). This centralizes the parseQuery/mode/loading logic.
2. Update §2 Secondary line 72 to be more honest: "Savings ~20%, offset by six-hook render lifecycle that replaces a single `view().update()`. Net complexity is *redistributed*, not reduced — the user-facing wins are Floating UI + error boundary."

---

## Low Severity

### [L] Finding R6: No D0 decision for "migrate vs not" — foreclosed by spec structure

**Category:** DC1 (Simpler alternative)
**Location:** §8 Decision Log (lines 438-448)

**Issue:**
This is the prior challenger's Finding 6 reiterated. The rebased Decision Log adds D6-D9 (four new locked decisions), but still does not include D0 ("should we migrate at all"). The table goes directly from problem (§1) to "how to migrate" (D1 = findSuggestionMatch choice) without recording the "whether to migrate" decision.

The post-rebase LOC math (R1 above) makes this more pressing than the pre-rebase version. The spec needs an explicit record of "we evaluated Option A (Floating UI only) and Option B (split PRs) and chose Option C for reasons X, Y, Z." Without that, the D1-D9 record looks like post-hoc rationalization of a pre-chosen approach.

**Severity rationale (LOW):** Decision-log hygiene; not changing the design itself, but improving the defensibility of the spec for future readers.

**Status:** CHALLENGED (repeat from prior challenger, sharpened by rebase math)

**Suggested resolution:** Add D0 to §8 with the quantitative comparison from R1.

---

### [L] Finding R7: "No new dependencies" framing obscures that the migration delays a dependency discussion

**Category:** DC3 (Scope accordion — expand)
**Location:** §5 Tech Stack (lines 357-362), §1 Situation (line 17: "canonical pattern")

**Issue:**
§5 notes that `@tiptap/suggestion`, `@floating-ui/dom`, `fuzzysort`, and `@tiptap/react` are all already installed. This is true. The spec frames it as a benefit ("no new dependencies").

But the spec's whole thesis — "align with `@tiptap/suggestion` because it's the canonical pattern" — raises a scope-expansion question that isn't asked: **if we're going to standardize, what about future suggestion triggers?** The repo has no `Mention`, `Tag`, `Emoji`, or any other `@tiptap/suggestion`-compatible extension. A grep for `Suggestion|mention|@tiptap/suggestion` across `packages/app/src/editor` finds five files, all wiki-link or slash-command related.

If the pipeline is "we'll add mentions in 2 weeks, tags in a month, emojis in a quarter," the migration is paying forward real value — the custom findSuggestionMatch pattern + render-lifecycle mechanics can be reused across all of them. If the pipeline is "no other suggestion triggers on the calendar," the migration is paying forward value against a phantom roadmap.

The spec doesn't say which. §1 "canonical pattern" is asserted without evidence of additional consumers.

**Expand-scope question:** If we're going to migrate, should we simultaneously:
- Extract a shared `createSuggestionPopup(config)` helper that both wiki-link and slash-command use (since both have near-identical Floating UI setup — slash-command.ts:124-163 ≈ proposed wiki-link.ts:229-254)?
- Define a common `SuggestionItem` base type so per-extension items are typed uniformly?
- Register both in a shared `suggestionsExtension` that consumers can extend?

The spec explicitly declines this (§6 Out of Scope: "No changes to slash-command.ts"). That's a valid scope choice, but it means the "architectural alignment" win is purely symmetric-shape (both use Suggestion), not shared-abstraction (one helper for both). If there's no third consumer coming, the symmetric-shape win is small.

**Severity rationale (LOW):** This is a meta-observation about the framing, not a design flaw. It reinforces R1's point that "architectural alignment" needs to be valued against a concrete roadmap, not just aesthetics.

**Status:** CHALLENGED

**Suggested resolution:**
1. Add a sentence to §1 or the D0 rationale (per R6) that names the concrete next-suggestion: "Mentions extension planned for Q2" or "No additional suggestion triggers planned — architectural alignment for its own sake."
2. If there IS a concrete next-suggestion, consider expanding this spec's scope to extract a shared `suggestionPopup` helper now (amortize the abstraction), or leave a §6 Follow-up note anchoring the shared-helper work to the next consumer.
3. If there ISN'T a concrete next-suggestion, accept R1's Option A (Floating UI only) — no alignment cost paid today.

---

## Foreclosed-paths check (DC5) — explicit dismissal

Does the migration foreclose future work? I looked for specific reversals:

- **Adding tests at the ProseMirror-plugin level:** Both the custom plugin and the migrated Suggestion plugin are `Plugin` instances. Testing the custom plugin's state machine is easier (direct access to `state.apply`). Testing the migrated version requires wrangling Suggestion's internal state — which the spec's test file already does via `wiki-link-suggestion.test.ts` (testing the pure helpers, not the plugin). **Slightly harder for the migration**, but the spec's chosen test strategy (test pure helpers only) works either way.
- **Adding new suggestion types:** The migration makes this *easier* if done once — all suggestion types share the Suggestion API. But see R7 — no such types are on the roadmap, so the "easier later" claim is theoretical.
- **Changing keyboard shortcuts:** The migrated version has its keyboard surface split across Suggestion's onKeyDown (active) + atom-deletion plugin (inactive). The custom plugin has them in one function. Changes that affect both (e.g., "add Cmd+Enter to insert and close") are **slightly harder in the migration**.

No finding rises to HIGH severity here. R3 captures the atom-deletion split concern. Otherwise the migration does not meaningfully foreclose future paths.

---

## Confirmed Design Choices (summary)

These design choices held up under the rebase-aware challenge:

- **Custom `findSuggestionMatch` for `[[` paired delimiters (D1):** Still necessary. The audit verified the API, and the regex approach is correct. No simpler alternative exists for paired-delimiter matching within Suggestion's framework.
- **`allowedPrefixes: null` for mid-word trigger (D3):** Correct per source.
- **Floating UI positioning (D4):** Same win as slash-command; the middleware stack is the right shape.
- **Menu component preservation (D5):** The nine props are genuinely load-bearing per the audit's component read. Not contested.
- **Six-hook render lifecycle is what the API requires (D8):** R5 raises a cleanup (extract a helper), but the six-hook dance itself is unavoidable given Suggestion's API.
- **`addProseMirrorPlugins` can return two plugins (A6):** Verified.
- **fetching/caching semantics (A5):** Verified.

---

## Summary for resolver

**Top question, unchanged from prior challenger, sharpened by rebase:** Is the ~20% LOC reduction worth ~800 lines of one-PR churn on a file that two other PRs from an active contributor touched in the last two weeks?

| Severity | Finding | Change to design |
|---|---|---|
| HIGH | R1: Prior H1 re-opens with stronger evidence (savings halved, complexity added) | Add D0 evaluating full-migration vs. Floating-UI-only vs. split-PRs |
| HIGH | R2: Single-PR direct-to-main on an actively-churning file | Add coordination protocol; consider feature flag or Option B (split PRs) |
| MEDIUM | R3: Atom deletion plugin (D6) inherits a stale comment; `addKeyboardShortcuts` on the extension may work | Spike the alternative before locking D6 |
| MEDIUM | R4: `pagesInFlight` Promise-dedupe is asymmetric with anchor mode's flag | Either flatten to flag-based, or convert anchor mode to Promise — don't leave them mismatched |
| MEDIUM | R5: Six-hook render lifecycle duplicates parseQuery logic in four places | Extract a `computeMenuProps` helper |
| LOW | R6: Decision Log still missing D0 | Add the "whether to migrate" decision with quantitative comparison |
| LOW | R7: "Architectural alignment" is symmetric-shape only unless there's a third suggestion consumer | Name the concrete next-suggestion or accept R1's Option A |

**If only one finding can be addressed, it's R1 + R2 together.** Both point to the same underlying question (is full-migration-in-one-PR the right cadence given post-rebase reality?) and the same answer-direction (split the PRs or ship only the incremental Floating UI win). Everything else is sharpening within the chosen scope.

**If R1 is resolved in favor of the current spec** (full migration proceeds), R3/R4/R5 still warrant quick wins that reduce the migration's complexity surface.
