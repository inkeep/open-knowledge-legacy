# Audit Findings (Rebase Pass)

**Artifact:** `specs/2026-04-11-wiki-link-suggestion-migration/SPEC.md`
**Audit date:** 2026-04-12
**Baseline:** `39fcd87` (origin/main head at rebase time; HEAD is `a000542` containing only the spec files)
**Total findings:** 8 (2 high, 3 medium, 3 low)

---

## High Severity

### [H1] Loading-state design omits `onBeforeUpdate`, breaking per-query / mode-switch loading indicators

**Category:** COHERENCE / FACTUAL
**Source:** L4 (evidence-synthesis fidelity) + T2 (OSS source read)
**Location:** §3.3 "Loading state" paragraph (lines 187-189); §3.7 render-callback list (line 298-303); §10 R5 (line 439); A3 (line 424)

**Issue:**
The spec correctly identifies `onBeforeStart` → `await items()` → `onStart`/`onUpdate` for the *initial* mount, but the "same pattern applies when `onUpdate` fires on query changes" sentence is incomplete: `onUpdate` fires **after** items resolve (source line 204-205), not before. The hook that fires before `items()` awaits on a query change is `onBeforeUpdate` (source line 192-193). The spec never names `onBeforeUpdate`, lists it in the render lifecycle, or accounts for it in the `command`/render callbacks, §3.7 props, or §4 implementation order.

**Current text:**
> "Same pattern applies when `onUpdate` fires on query changes: Suggestion re-awaits `items()` for each query change before firing `onUpdate`, so we render `loading: true` before the call and update props to `loading: false` when the callback returns."

**Evidence:** `node_modules/@tiptap/suggestion/dist/index.js` lines 189-209:

```js
if (handleStart) { renderer?.onBeforeStart?.call(renderer, props); }   // L189
if (handleChange) { renderer?.onBeforeUpdate?.call(renderer, props); } // L192  <-- NOT in spec
if (handleChange || handleStart) {
  props.items = await items({ editor, query: state.query });           // L195-200
}
if (handleExit) { renderer?.onExit?.call(renderer, props); }           // L201
if (handleChange) { renderer?.onUpdate?.call(renderer, props); }       // L204
if (handleStart) { renderer?.onStart?.call(renderer, props); }         // L207
```

`onBeforeUpdate` is the only hook that fires **before** the async `items()` on a query change. It is exposed by the public type (`index.d.ts` line 150: `onBeforeUpdate?: (props: SuggestionProps<I, TSelected>) => void;`).

**Concrete regression this causes:** In anchor mode, typing `[[release-notes#` triggers `items()` to `await fetchHeadings('release-notes')`. During that await, the only render update that fired is whatever `onUpdate` left on screen — i.e., the previous page-mode items with no "Loading headings for release-notes…" label. The current (pre-migration) implementation shows the "Loading headings for …" label during this fetch (`view.update()` runs on every transaction, reading `isLoading(state.query)`). Without `onBeforeUpdate`, that loading label disappears on mode switch. This regresses scenario R15.

**Status:** INCOHERENT (lifecycle model in §3.3 omits a required hook that the spec's own loading-state design depends on)

**Suggested resolution:**
1. Add `onBeforeUpdate` to the render lifecycle alongside `onBeforeStart`/`onStart`/`onUpdate`/`onKeyDown`/`onExit`.
2. In `onBeforeUpdate`, call `parseQuery(props.query)` and push `{loading: true, mode, pageTarget, anchorQuery}` into the renderer before the async `items()` runs. (Page-mode: only set loading=true when `!pagesLoaded`; anchor-mode: set loading=true when the target docName is not yet cached — mirrors the current `isLoading()` logic.)
3. Update §3.3 line 187-189 to explicitly reference `onBeforeUpdate` as the "before the call" hook for query changes (distinct from `onBeforeStart` which only fires on open).
4. Update A3 to include `onBeforeUpdate` in the verified lifecycle.
5. Add R5 mitigation: "Loading-state transition on query change uses `onBeforeUpdate`, not `onUpdate`."

---

### [H2] `items()` closure shares mutable `cachedPages`/`cachedHeadings` with `onBeforeUpdate`/`onUpdate` callbacks — scope location matters and is under-specified

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity) + T1 (own codebase)
**Location:** §3.3 lines 143-149 (closure declaration) and line 141 ("Closure state lives outside the `Suggestion()` config, shared between `items` and the `render` callbacks.")

**Issue:**
The spec says closure state is "declared inside `addProseMirrorPlugins()` but outside `Suggestion()`" — correct as far as it goes, but the design critically assumes the `render()` callback (which closes over `renderer`, `popup`, `currentProps`) can read the same `cachedPages`/`cachedHeadings`/`anchorFetchingFor`/`fetchError` vars that `items()` mutates. `render` returns an object once when `Suggestion()` is constructed (source line 85: `const renderer = render?.();`), and `items` is a separate callback closure. For them to share mutable state, all declarations must live in the outer scope enclosing both.

The spec's snippet (§3.3) places the declarations and the `items` callback at the top level of the example but does not show the same for `render`. An implementer might mirror slash-command.ts and put `render` in a way that closes over a different scope (nested `render: () => { let renderer ... }`), which is fine — but the cross-reads in `onBeforeUpdate`/`onUpdate` (needed for H1's loading transition) must reach `pagesLoaded` / `anchorFetchingFor` / `fetchError` / `cachedHeadings`.

More importantly: the spec's own §3.3 `items()` code mutates these variables inside the async callback with no guard against concurrent re-entry. `items()` is awaited each time `handleChange || handleStart` fires (source line 195-200). A fast typist can issue two `items()` invocations that race — e.g. `[[re` then `[[rel` lands before the first fetch resolves. Both see `!pagesLoaded`, both fire `await fetchPages()`, and both overwrite `cachedPages`. The current implementation guards this with `anchorFetchingFor` for anchor fetches but does not for page fetches (pages are fetched once in `view()`). The spec's port silently removes that single-fetch guarantee.

For the page-mode fetch, the spec's guard is `if (!pagesLoaded && !fetchError)` — but `pagesLoaded` is only set to `true` *after* `await fetchPages()` resolves. A second `items()` invocation during the first await sees `pagesLoaded === false` and fires a second `fetchPages()`. Mitigation is trivial (set an in-flight flag before awaiting, similar to `anchorFetchingFor`), but the spec does not call this out.

**Current text (§3.3):**
```ts
if (!pagesLoaded && !fetchError) {
  try {
    cachedPages = await fetchPages();
    pagesLoaded = true;
  } catch (err) { ... }
}
```

**Evidence:** Current `wiki-link-suggestion.ts` lines 417-421 only fires `fetchPages()` inside `view().update`'s `if (!renderer)` first-mount branch — so it's guaranteed-once per menu open. The port moves it into `items()` which runs on every query change. The spec's guard does not bridge the gap.

**Status:** INCOHERENT

**Suggested resolution:**
1. Add a `pagesFetching: boolean` (or Promise-dedupe: `let pagesInFlight: Promise<PageItem[]> | null`) guard to §3.3, analogous to `anchorFetchingFor`.
2. Explicitly state in §3.3 that closure variable scope is the outermost block inside `addProseMirrorPlugins()` (where both `items` and the factory `render()` close over the same frame).
3. Add a risk entry (R8?) for the concurrent-fetch race: "`items()` re-runs on every keystroke; concurrent `fetchPages()` invocations possible if the first fetch hasn't resolved."

---

## Medium Severity

### [M1] Assumption A4 claims Suggestion's state exposes `query: string`; source says `query: string | null`

**Category:** FACTUAL
**Source:** T2 (OSS source read)
**Location:** §9 A4 (line 425); §3.5 D7 code block (lines 248-249); §3.3 line 189 ("using `parseQuery(state.query)` from `pluginKey.getState(view.state)`")

**Issue:**
Suggestion's state shape is:
```js
{ active: false, range: {from:0,to:0}, query: null, text: null, composing: false, dismissedRange: null }
```
(source line 221-233). On activation, `next.query = match.query` (string); on deactivation or init, `next.query = null` (lines 297, 311-315). The spec A4 says the state exposes `query: string`. It does not; the field is `string | null`.

**Current text (A4):**
> "`wikiLinkSuggestionKey.getState(editor.state)` returns Suggestion's state with `query: string`"

**Impact:**
- §3.5 code block uses `state?.query ?? ''` — safe (null-coalesces to empty string, which `parseQuery` handles correctly). Good.
- §3.3 line 189 ("`parseQuery(state.query)` from `pluginKey.getState(view.state)`") does **not** null-guard. If called from a render callback, `state.active` is true so `query` is a string and this works; if called from `command` after the menu has been dismissed by a prior tr, it could throw `TypeError: Cannot read properties of null (reading 'indexOf')`. In practice `command` is invoked before any such transition, but the spec should be explicit.

**Evidence:** `index.js` lines 229 (`query: null` in init), 297 (`next.query = match.query` when active), 311-315 (`next.query = null` when inactive); `index.d.ts` does not publicly export the state interface but the runtime shape is as described.

**Status:** CONTRADICTED (on the type claim), BENIGN (because existing snippets null-coalesce or are invoked on active state)

**Suggested resolution:**
1. Update A4 to: "`wikiLinkSuggestionKey.getState(editor.state)` returns Suggestion's state where `query` is `string` when `active === true` and `null` otherwise — always null-guard via `?? ''` or by checking `active` first."
2. Add a clarifying note to §3.3 line 189: `parseQuery(state.query ?? '')` to match §3.5's defensive style.

---

### [M2] Line-count estimate 492 → ~280 is optimistic given what the migration actually replaces

**Category:** COHERENCE (quantitative claim)
**Source:** L7 (inline attribution) + T1 (own codebase arithmetic)
**Location:** §2 Secondary (line 72) and changelog (`_changelog.md` line 44)

**Issue:**
The 492-line count is verified. The 280-line target requires ~212 lines of net reduction. Arithmetic against the current file:
| Block in current plugin | Lines | Fate under spec |
|---|---|---|
| Header + types + INITIAL_STATE + MAX_ITEMS | 1-44 | Kept / minor |
| Pure helpers (parseQuery, filterPages, filterHeadings, buildSuggestionItems, buildAnchorItems) | 46-102 | Kept verbatim |
| `fetchPages` / `fetchHeadings` | 104-116 | Kept |
| Mutable closure state (§3.3) | 119-125 | Kept (same 5-6 vars) |
| `rebuildFiltered` + `isLoading` helpers | 127-140 | Removed — logic moves inline into `items()` / `onBeforeUpdate` |
| `insertWikiLink` | 142-177 | Moves to `command` (≈30 lines — similar size) |
| `handleSuggestionKeyDown` (two branches) | 179-258 | Active branch moves to `render().onKeyDown` (≈30 lines), inactive branch moves to atom-deletion plugin (≈30 lines). Current 80 → new ~60. |
| `state.init` + `state.apply` (regex + selection + meta) | 263-298 | Removed — Suggestion internalizes. -40 lines. |
| `view()` return incl. ReactRenderer + `updatePosition` + `ensureHeadings` + mount/fetchPages callback | 307-490 | Replaced by render lifecycle (onBeforeStart + onStart + onBeforeUpdate + onUpdate + onKeyDown + onExit) + Floating UI. Current ~184 lines → new ~140 lines (slash-command.ts's lifecycle is ~80 lines; wiki-link's per-mode branching + two fetches + fallback state push this higher). |

Net: ~45 lines saved from view(), ~40 saved from state.apply, ~0 from command, ~20 saved from handleKeyDown extraction, ~10 saved from rebuildFiltered/isLoading. Total ≈ 115 lines. **Projected new size: ~375, not ~280.** Adding `onBeforeUpdate` (H1) adds another ~15-25 lines.

The spec already acknowledges "savings smaller than initial plan because anchor mode's two-phase fetch and per-mode state add real complexity that Suggestion doesn't abstract away" — but the quantitative target hasn't moved accordingly.

**Evidence:** slash-command.ts is 253 lines total (with the SlashCommand extension wrapper); the render() callback body alone is ~130 lines (onStart+onUpdate+onKeyDown+onExit+doPosition+rerender). Wiki-link has strictly more: per-mode items branching, two fetchers, fallback insertion handler, and an `onBeforeUpdate` (per H1).

**Status:** INCOHERENT (the estimate underweights what remains after migration)

**Suggested resolution:** Revise the estimate to 492 → ~350-400 lines (a ~20% reduction, honest about what the migration actually buys). The architectural consistency / Floating UI / error boundary wins stand regardless of LOC.

---

### [M3] Spec does not specify which hook renders the per-mode loading label before items resolve on mode switch

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + L4
**Location:** §3.3 line 189, §3.7 lines 298-303, D8 (line 414)

**Issue:**
D8 says "Pass `mode` + `pageTarget` as render-lifecycle props even in `onBeforeStart`" — but `onBeforeStart` only fires on open. For mode switches (page → anchor, triggered by typing `#`), the menu is already open and `onBeforeStart` does not fire; only `onBeforeUpdate`/`onUpdate` fire. So the "per-mode loading label" claim in D8 requires `onBeforeUpdate` too — same root issue as H1, but worth calling out as a separate coherence problem with D8 specifically.

**Status:** INCOHERENT

**Suggested resolution:** Amend D8 to include `onBeforeUpdate` (the mode-switch equivalent of `onBeforeStart`).

---

## Low Severity

### [L1] Claim about parent-class state shape in spec §3.5 is phrased as a confirmation ("verified — Suggestion's state interface at source line 60 includes `query: string`") but that line number points to something else

**Category:** FACTUAL
**Source:** T2
**Location:** §3.5 line 269

**Current text:**
> "`wikiLinkSuggestionKey.getState(editor.state)` returns Suggestion's internal state shape — verify the shape exposes `query` at the same key (it does — Suggestion's state interface at source line 60 includes `query: string`)."

**Evidence:** Line 60 of `node_modules/@tiptap/suggestion/dist/index.js` is `if (!(slice == null ? void 0 : slice.content)) { return false; }` — inside `hasInsertedWhitespace`. The actual state shape is at lines 221-234 (`init()`). Line 60 reference is wrong.

**Status:** CONTRADICTED (wrong line reference; combined with M1, the "includes `query: string`" claim is also wrong — it's `string | null`).

**Suggested resolution:** Rewrite to: "Suggestion's state shape (`index.js` lines 221-234) is `{active, range, query: string|null, text: string|null, composing, dismissedRange, decorationId}`. Null-coalesce `state.query` since the field is `null` when inactive."

---

### [L2] "From PR #42" attribution is slightly off — PR #42 introduced the suggestion, not the atom-deletion handlers

**Category:** COHERENCE (precision)
**Source:** L4 + T1 (git history)
**Location:** §1 Complication (line 20), §6 In Scope (line 342), §10 R7 (line 441), §8 D6 (line 412)

**Issue:** The spec attributes atom-deletion handlers to PR #53 in §3.6 and D6 (correct per git log: the `!state?.active` Backspace/Delete branch at wiki-link-suggestion.ts:188-213 came in with PR #53's 338→492 expansion), but §6 In Scope line 342 says "Preserve all existing behavior from PR #42 + PR #53: page trigger, fuzzy filter, insert, loading, error, anchor mode, per-mode loading, per-mode empty state, **atom deletion**, fallback insertion from raw query." Atom deletion belongs to the PR #53 column, not PR #42. Non-functional, but cleanup.

**Status:** INCOHERENT (minor attribution drift)

**Suggested resolution:** Rephrase §6 line 342 to group atom deletion and fallback insertion explicitly under PR #53.

---

### [L3] Evidence file claim "source line 80" for `findSuggestionMatch` default parameter matches but is fragile

**Category:** FACTUAL
**Source:** T2
**Location:** `evidence/suggestion-api-compatibility.md` line 33 and referenced from SPEC.md §1 (line 32), D1 (line 407)

**Issue:** Line 80 of the installed `@tiptap/suggestion@3.22.3` index.js is `findSuggestionMatch: findSuggestionMatch2 = findSuggestionMatch,` — correct. The evidence line numbers are accurate for this exact version. No action, just noting that the spec's version-pinning (`@tiptap/suggestion@^3.22.3` in §5) uses a caret, which allows minor version bumps. If @tiptap/suggestion 3.23.x reorders the destructure, line numbers in the evidence file go stale. Not an error in the spec, but the caret + line-pinned evidence combination is mildly brittle.

**Status:** CONFIRMED (for current version)

**Suggested resolution:** None required. Optionally pin the evidence to the exact commit SHA / version it was read against (`@tiptap/suggestion@3.22.3`) to make future drift easier to catch.

---

## Confirmed Claims (summary)

### From @tiptap/suggestion source (T2) — correctly captured in the spec:
- ✓ Custom `findSuggestionMatch` is a configurable option (destructured with default at source line 80) — D1, A1.
- ✓ `items()` is awaited (source line 195-200) — A5, D2.
- ✓ `items()` re-runs on every query change (`handleChange || handleStart` gate at source line 195) — §3.3, A5.
- ✓ `findSuggestionMatch` custom signature: `{ char, allowSpaces, allowToIncludeChar, allowedPrefixes, startOfLine, $position }` → `{ range, query, text } | null` — §3.2, A1. Matches `Trigger` + `SuggestionMatch` in `index.d.ts` lines 6-18.
- ✓ `onBeforeStart` fires before `items()` (source line 189-191) — A3, D8.
- ✓ `onExit` fires on exit (source line 201-203) — §3.4 reference.
- ✓ `onKeyDown` fires only when `active === true` (source line 322-325 in PM `handleKeyDown`) — D6. Critical finding holds.
- ✓ Escape is force-handled by Suggestion itself (source line 328-332): calls `renderer.onKeyDown` for side effects but ignores return value, then calls `dispatchExit` — spec Risk R2 is correct.
- ✓ `allowedPrefixes: null` skips the prefix check (source line 27) — D3.
- ✓ `pluginKey` option lets the caller name the plugin key (source line 65, `index.d.ts` line 27) — D7 approach of passing `pluginKey: wikiLinkSuggestionKey` works.
- ✓ `addProseMirrorPlugins` returns `Plugin[]` and multiple plugins from one extension are supported — A6. Confirmed in `@tiptap/core/dist/index.js` lines 3706-3708 (`const proseMirrorPlugins = addProseMirrorPlugins(); plugins.push(...proseMirrorPlugins);`).

### From own codebase (T1):
- ✓ `wiki-link-suggestion.ts` is 492 lines @ `39fcd87` (checked at audit time against a worktree HEAD containing only spec changes; the file is unchanged from origin/main).
- ✓ `WikiLinkSuggestionMenu.tsx` is 169 lines; loading/empty states branch on `mode` (lines 51-87); per-mode header at line 104-108; uses `items`, `query`, `selectedIndex`, `onSelect`, `loading`, `error`, `mode`, `pageTarget`, `anchorQuery` — all 9 props are load-bearing as D5 claims.
- ✓ Exports `parseQuery`, `filterPages`, `filterHeadings`, `buildSuggestionItems`, `buildAnchorItems`, `PageItem`, `WikiLinkSuggestionItem` — all referenced in spec. Non-exported helpers (`fetchPages`, `fetchHeadings`) are fine for the migration to lift to `items()`.
- ✓ `wiki-link-suggestion.test.ts` imports only `buildSuggestionItems` and `PageItem` — extraction preserves test compatibility.
- ✓ `wiki-link.ts` currently returns one plugin from `addProseMirrorPlugins`; priority 200 on the extension applies to both plugins when the migration returns two.
- ✓ slash-command.ts uses the same Floating UI middleware stack (`offset(4)` + `flip()` + `size`) and the `--suggestion-menu-max-height` CSS variable — D4 alignment is real.
- ✓ Current plugin fires `fetchPages` only once in `view().update`'s `if (!renderer)` branch (line 417) — page-mode is deduped today. The migration moves this inside `items()` which runs repeatedly. See H2.

### Closure/scope soundness (T1 + T3):
- ✓ `addProseMirrorPlugins` is invoked once per `ExtensionManager` construction (core source line 3706-3708). A fresh manager is built on editor init and on reconfigure (core source line 4938-4964). Each rebuild creates a fresh closure — the existing custom plugin already has this property and the migration preserves it (no regression in cache-lifetime semantics).

---

## Unverifiable Claims

None. All load-bearing claims either verified against source or noted as CONTRADICTED / INCOHERENT above.

---

## Summary for resolver

**Two HIGH-severity items** (H1, H2) would change the implementation:
- H1 adds an `onBeforeUpdate` hook to the render lifecycle.
- H2 adds a concurrent-fetch guard (page-mode dedupe matching the anchor-mode pattern) and clarifies closure scope.

Both can be fixed with targeted spec edits — the migration approach itself is sound. Neither invalidates the core design decision (Suggestion + custom matcher + two plugins).

**Three MEDIUM items** (M1-M3) sharpen correctness or set realistic expectations but don't change the design.

**Three LOW items** (L1-L3) are editorial.
