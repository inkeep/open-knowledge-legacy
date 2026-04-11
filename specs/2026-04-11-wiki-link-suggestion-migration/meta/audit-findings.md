# Audit Findings

**Artifact:** specs/2026-04-11-wiki-link-suggestion-migration/SPEC.md
**Audit date:** 2026-04-11
**Total findings:** 6 (3 high, 2 medium, 1 low)

---

## High Severity

### [H1] Finding 1: Loading state lifecycle contradicts @tiptap/suggestion source

**Category:** FACTUAL
**Source:** T2 (OSS repos - direct source read)
**Location:** §3.3 (lines 120-137), Problem Statement line 136
**Issue:** The spec incorrectly describes the Suggestion lifecycle order, leading to a flawed loading state design

**Current text:** 
> "**Loading state:** Suggestion calls `onStart` then `items()`. While `items()` is resolving (async), the menu shows loading state. When items resolve, `onUpdate` fires with the populated items. The render callback's `onStart` mounts the menu with `loading: true`; `onUpdate` transitions to `loading: false`."

**Evidence:** Read from `node_modules/@tiptap/suggestion/dist/index.js` lines 189-209. The actual lifecycle order is:

```javascript
// Line 189-191: onBeforeStart called BEFORE items fetch
if (handleStart) {
  (_c = renderer?.onBeforeStart)?.call(renderer, props);
}

// Lines 195-200: items() is awaited
if (handleChange || handleStart) {
  props.items = await items({ editor, query: state.query });
}

// Lines 204-209: onUpdate/onStart called AFTER items resolve
if (handleChange) {
  (_f = renderer?.onUpdate)?.call(renderer, props);
}
if (handleStart) {
  (_g = renderer?.onStart)?.call(renderer, props);
}
```

The correct sequence is: `onBeforeStart` → `await items()` → `onStart`/`onUpdate`

When `onStart` fires, `props.items` is already populated (items resolved before `onStart` was called). The spec's design to show `loading: true` in `onStart` would never display a loading state because items are already available.

**Status:** CONTRADICTED

**Suggested resolution:** 
1. Implement `onBeforeStart` to mount the menu with `loading: true`
2. Implement `onStart` to receive already-populated items and transition to `loading: false`
3. Update the lifecycle explanation in §3.3 to reflect the correct order
4. Update Problem Statement line 136 to say "`onBeforeStart` then `items()` then `onStart`"

---

### [H2] Finding 2: Query prop removal breaks empty state message

**Category:** COHERENCE (evidence-synthesis fidelity)
**Source:** L4 (evidence-synthesis fidelity) + T1 (own codebase)
**Location:** §3.6 (line 194)
**Issue:** The spec proposes removing the `query` prop from WikiLinkSuggestionMenu, but the component uses it for the empty state fallback message

**Current text:**
> "The menu component (`WikiLinkSuggestionMenu.tsx`) stays largely unchanged — it's already a pure render function receiving `items`, `selectedIndex`, `onSelect`, `loading`, `error` as props. The only change: remove the `query` prop (filtering happens in the `items()` callback now, matching the slash command pattern where the menu receives pre-filtered items)."

**Evidence:** Read from `packages/app/src/editor/wiki-link-suggestion/WikiLinkSuggestionMenu.tsx` line 56:

```tsx
if (items.length === 0) {
  return (
    <div ...>
      {error ?? (query.trim() ? `No pages found for "${query.trim()}"` : 'No pages found')}
    </div>
  );
}
```

The component uses `query` to display a contextual empty state message: `No pages found for "user's query"`. Removing the prop would break this feature or require defaulting to the generic "No pages found" message (regression in UX specificity).

**Status:** INCOHERENT (proposal contradicts component implementation)

**Suggested resolution:** 
Keep the `query` prop and pass it from the render lifecycle (it's available in `props.query` at the render callbacks). Update §3.6 to note: "Keep the `query` prop — the component needs it for the empty state message. Pass `props.query` from the render callbacks."

---

### [H3] Finding 3: Missing onBeforeStart implementation in proposed design

**Category:** COHERENCE (cross-finding contradictions)
**Source:** L1 (cross-finding contradictions) + T2 (OSS repos)
**Location:** §3.3 render lifecycle, §3.4 Floating UI positioning
**Issue:** The spec's render implementation (§3.4) shows `onStart`, `onUpdate`, `onKeyDown`, `onExit` but omits `onBeforeStart`, which is required for correct loading state management (per H1 finding)

**Current text:** The spec provides code for `onStart` (§3.4 implicit), `onUpdate`, `onKeyDown`, `onExit` in the Floating UI pattern section, but no `onBeforeStart`.

**Evidence:** From the slash-command implementation (`packages/app/src/editor/extensions/slash-command.ts`), the render lifecycle returns an object with lifecycle methods. The wiki-link implementation needs `onBeforeStart` to mount the menu with loading state before the async `items()` fetch completes.

The @tiptap/suggestion source (line 190) calls `onBeforeStart` before awaiting items. Without implementing this callback, the menu would not render until items resolve, creating a visual delay with no loading indicator.

**Status:** INCOHERENT (loading state design requires onBeforeStart but spec doesn't implement it)

**Suggested resolution:** 
1. Add `onBeforeStart` to the render lifecycle (mount popup + ReactRenderer with `loading: true`)
2. Move the popup creation and ReactRenderer mounting from `onStart` to `onBeforeStart`
3. In `onStart`, receive already-populated items and update the renderer to `loading: false`
4. Update the §3.3 and §3.4 sections to include the `onBeforeStart` implementation

---

## Medium Severity

### [M1] Finding 4: Closure variables not declared in items() callback

**Category:** COHERENCE (completeness)
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §3.3 (lines 122-133)
**Issue:** The spec shows `cachedPages`, `currentFiltered`, and `fetchError` being used in the `items()` callback but doesn't show where these variables are declared or scoped

**Current text:**
```ts
items: async ({ query }) => {
  // cachedPages populated on first fetch, reused on subsequent queries
  if (cachedPages.length === 0 && !fetchError) {
    try {
      cachedPages = await fetchPages();
    } catch (err) {
      fetchError = 'Failed to load pages.';
      console.error('[wiki-link-suggestion] fetch error:', err);
    }
  }
  return buildSuggestionItems(cachedPages, query);
},
```

**Evidence:** The current implementation (wiki-link-suggestion.ts lines 84-86) declares these as closure variables in the `createWikiLinkSuggestionPlugin` function scope:

```ts
let cachedPages: PageItem[] = [];
let currentFiltered: WikiLinkSuggestionItem[] = [];
let fetchError: string | null = null;
```

The spec doesn't show where these should be declared in the new Suggestion-based implementation. The `items` callback is defined inside the `Suggestion()` call, so the closure would be different.

**Status:** INCOHERENT (incomplete code snippet)

**Suggested resolution:** 
Add a code block before the `Suggestion()` call showing:
```ts
let cachedPages: PageItem[] = [];
let fetchError: string | null = null;
```

Then clarify that these are closure variables accessible to both `items()` and the render callbacks. Note: `currentFiltered` is no longer needed because Suggestion manages the filtered items internally.

---

### [M2] Finding 5: Misleading comment about char parameter usage

**Category:** COHERENCE (precision)
**Source:** L2 (confidence-prose misalignment)
**Location:** §3.1 (line 77)
**Issue:** The inline comment states `char` is "Used by Suggestion internally for decoration, not for matching" but this is misleading

**Current text:**
```ts
char: '[[',  // Used by Suggestion internally for decoration, not for matching
```

**Evidence:** From @tiptap/suggestion source line 265-271, the `char` parameter is passed to the custom `findSuggestionMatch2` function:

```javascript
const match = findSuggestionMatch2({
  char,
  allowSpaces,
  allowToIncludeChar,
  allowedPrefixes,
  startOfLine,
  $position: selection.$from
});
```

While the custom matcher in this spec chooses to ignore `char` and use its own regex, the parameter is still available for matching. The comment should clarify that the custom matcher doesn't USE `char`, not that it CAN'T be used.

Additionally, `char` IS used for decoration — the decorationContent feature uses it (source line 74), though that's not relevant to this spec's use case.

**Status:** INCOHERENT (comment overstates the limitation)

**Suggested resolution:**
Update the comment to: `char: '[[',  // Custom matcher ignores this; Suggestion uses it for decoration class`

Or remove the comment entirely since it's a standard Suggestion parameter.

---

## Low Severity

### [L1] Finding 6: Test scenario R08 wording could be clearer

**Category:** COHERENCE (precision)
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §7 Test Scenarios (R08)
**Issue:** Minor wording imprecision in test scenario description

**Current text:**
> "R08 | Type `[[Done]]` (close with `]]`) | Menu closes when first `]` is typed (match stops at `]`)"

**Evidence:** The regex `/\[\[([^\]]*)$/` matches `[[` followed by any characters that are NOT `]`. When `]` is typed after `[[Done`, the regex no longer matches (because the character class `[^\]]` excludes `]`), causing the match to fail entirely and the plugin state to reset to `INITIAL_STATE` (current implementation line 184).

The phrase "match stops at `]`" could be misread as "the match captures up to `]`" when it actually means "the match fails when `]` is encountered."

**Status:** INCOHERENT (minor - description is technically correct but could be clearer)

**Suggested resolution:**
Rephrase to: "Menu closes when first `]` is typed (regex excludes `]`, match fails)"

Or: "Menu closes when first `]` is typed (match breaks - regex doesn't match `]`)"

---

## Confirmed Claims (summary)

### From @tiptap/suggestion source verification (T2):
- ✓ Custom `findSuggestionMatch` is supported via destructured parameter with default (line 80)
- ✓ The `items()` callback is `await`ed (line 196)
- ✓ Custom matcher receives `$position` in config object (line 270)
- ✓ Custom matcher return type is `{ range: { from, to }, query, text } | null` (lines 36-46)
- ✓ The range check `if (from < $position.pos && to >= $position.pos)` matches the built-in implementation (line 36)
- ✓ `allowedPrefixes: null` skips the prefix check (line 27 - returns null when allowedPrefixes is null, passes the check)
- ✓ Escape key is handled by Suggestion's `props.handleKeyDown` (lines 328-333), not delegated to render callback for decision-making

### From current implementation verification (T1):
- ✓ Current wiki-link uses regex `/\[\[([^\]]*)$/` (line 182)
- ✓ Current implementation has 338 lines (wiki-link-suggestion.ts)
- ✓ Current implementation uses `coordsAtPos` for positioning (line 231)
- ✓ Current implementation caches pages and manages loading/error states (lines 84-86, 223, 281-315)
- ✓ Floating UI pattern from slash-command uses `computePosition` + `autoUpdate` + `flip` + `offset` + `size` (slash-command.ts lines 131-164)

### From evidence file verification:
- ✓ Built-in regex doesn't support paired delimiters (evidence/suggestion-api-compatibility.md lines 10-24)
- ✓ The built-in regex with `allowSpaces: true` would yield `query = "Done]]"` for input `[[Done]]` (evidence line 22)

---

## Unverifiable Claims

None. All technical claims about @tiptap/suggestion source, current implementation, and slash-command pattern were verified from source code.

---

## Test Scenario Completeness Assessment

The spec provides 14 regression test scenarios (R01-R14). Coverage analysis:

**Well covered:**
- ✓ Basic trigger and filtering (R01, R02)
- ✓ Insertion flows: Enter, Tab, click (R03, R06, R10)
- ✓ Edge cases: mid-word trigger, unresolved links (R07, R04)
- ✓ Keyboard navigation and Escape (R09, R05)
- ✓ Paired delimiter behavior (R08)
- ✓ Error state (R11)
- ✓ ARIA semantics (R12)
- ✓ Floating UI positioning (R13, R14)

**Gaps identified:**
1. **Collaborative safety**: No test for multi-user concurrent editing (the spec mentions `shouldShow` option for collaborative-safety in Problem Statement line 27, but no test verifies this)
2. **Loading state timing**: No explicit test for "loading spinner shows while fetching" (mentioned in R01 but not isolated)
3. **Cache behavior**: No test for cached pages reuse (mentioned in §3.3 line 124 but not tested)
4. **Error boundary on insertion**: No test for the try/catch on wiki-link insertion (§3.5 - what happens if `insertContent` throws?)

**Recommendation:** Test scenarios are comprehensive for happy-path and common edge cases. The gaps are acceptable for a refactor (existing behavior should continue working). Consider adding a test for the insertion error boundary (T15) if this is a new safeguard not in the current implementation.

---

## Async Items/Loading State Design Soundness

**Assessment:** The design is conceptually sound but has a critical implementation flaw (H1 finding).

**What's sound:**
- Using Suggestion's native async `items()` support (verified at source line 196)
- Caching pages on first fetch and reusing for subsequent queries (matches current implementation pattern)
- Error state management with fallback to "insert unresolved link" (preserves current behavior)
- Closure variables for cache state (matches current pattern, though declaration location needs clarification per M1)

**What's flawed:**
- The lifecycle timing is wrong (H1) - must use `onBeforeStart` not `onStart` for loading state
- The loading state would never render with the proposed implementation (onStart fires after items resolve)

**Corrected design:**
```ts
render: () => {
  let renderer: ReactRenderer | null = null;
  let popup: HTMLDivElement | null = null;
  
  return {
    onBeforeStart(props) {
      // Mount with loading state BEFORE items fetch
      popup = document.createElement('div');
      // ... setup popup ...
      renderer = new ReactRenderer(WikiLinkSuggestionMenu, {
        props: {
          items: [],  // Empty - items haven't resolved yet
          selectedIndex: 0,
          onSelect: props.command,
          loading: true,  // Show loading spinner
          error: null,
        },
        editor: props.editor,
      });
      popup.appendChild(renderer.element);
    },
    
    onStart(props) {
      // Items have resolved - update to show them
      renderer?.updateProps({
        items: props.items,  // Populated items from await
        selectedIndex: 0,
        onSelect: props.command,
        loading: false,  // Hide loading spinner
        error: fetchError,
      });
      // Start Floating UI positioning
      stopAutoUpdate = autoUpdate(virtualEl, popup, doPosition);
      doPosition();
    },
    
    onUpdate(props) {
      // Query changed, items re-filtered
      renderer?.updateProps({
        items: props.items,
        selectedIndex: Math.min(selectedIndex, props.items.length - 1),
        onSelect: props.command,
        loading: false,
        error: fetchError,
      });
      doPosition();
    },
    
    // ... onKeyDown, onExit ...
  };
}
```

This matches how Suggestion's lifecycle works and provides a loading indicator during the async fetch.
