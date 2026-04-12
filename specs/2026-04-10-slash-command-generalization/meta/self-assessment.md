# Self-Assessment: Spec Decisions D1-D9

**Assessor:** Same agent that authored the spec (adversarial stance)
**Date:** 2026-04-10
**Protocol:** /assess-findings — attempt to disprove each decision before accepting it
**Method:** Evidence verification against live codebase + TipTap docs + React 19 patterns

---

## Summary

| Decision | Status after self-assessment | Severity |
|----------|------------------------------|----------|
| D1 — Foundation: Suggestion | VALID | — |
| D2 — Item sources via addOptions | VALID | — |
| D3 — Open category taxonomy | VALID | — |
| D4 — Category labels via extension option | VALID | — |
| **D5 — Keyboard handling in render closure** | **REVISED** — should use `useImperativeHandle` + ref-as-prop | **MEDIUM** |
| D6 — Trigger via allowedPrefixes | VALID (with implementation caveat) | — |
| D7 — Preserve existing items | VALID | — |
| D8 — Add description field | VALID | — |
| D9 — Add range param | VALID | — |

**Additional factual error (not a decision, but spec text):** Tech Stack table claims `@tiptap/suggestion` is "already transitively present via `@tiptap/extension-mention`". This is WRONG — `@tiptap/suggestion` is NOT in main's `bun.lock` at all. It must be explicitly added.

Two correctable issues. All 9 decisions structurally hold; D5's implementation note needs fixing.

---

## Finding 1: `@tiptap/suggestion` is NOT transitively installed on main

**Category:** FACTUAL
**Severity:** MEDIUM — affects implementation planning
**Location:** §5 Tech Stack table, A1 in Assumptions

**Current text:**
> `@tiptap/suggestion@3.22.3` | Foundation for the slash command menu | Already transitively present via `@tiptap/extension-mention` and other suggestion-using extensions. Needs explicit `bun add @tiptap/suggestion` if not.

**Evidence (verified against codebase):**
- `bun.lock` contains only: `@tiptap/core`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-list`, `@tiptap/extension-table`, `@tiptap/extension-task-list`, `@tiptap/markdown`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/y-tiptap`
- `grep -c '"@tiptap/suggestion"' bun.lock` returns 0
- `find node_modules -name "suggestion*" -type d` returns nothing
- No `@tiptap/extension-mention` installed either (would be the most common transitive carrier)

**Correction:**
> `@tiptap/suggestion@^3.22.3` | Foundation for the slash command menu | **Must be explicitly added — not currently installed** (neither direct nor transitive). Run `bun add @tiptap/suggestion@^3.22.3` during implementation. Same major version as other `@tiptap/*` packages.

**Impact on spec:** Minor. Implementation gains one extra install step. No architectural change. Update §5 Tech Stack + A1.

---

## Finding 2: D5 keyboard handling approach is over-restrictive

**Category:** DESIGN / FACTUAL
**Severity:** MEDIUM — affects implementation pattern choice
**Location:** D5 in Decision Log, §3.3 menu component section, R2 in Risks

**Current text (D5):**
> Keyboard handling location | **In the menu component via `forwardRef` + `useImperativeHandle`.** Follows TipTap's canonical Suggestion pattern.

**Current text (§3.3):**
> Use React's `useImperativeHandle` + forwardRef pattern so the extension can call `menuRef.current.onKeyDown(event)`.

**Also in evidence file (slash-command-architecture-analysis.md):**
> **Angle 4: "React Compiler compatibility — useImperativeHandle is discouraged in our codebase."**
> Response: This is a real constraint. The block-editor-ux spec notes React Compiler patterns avoid `useImperativeHandle`/`forwardRef`/`memo`/`useMemo`/`useCallback`. We need a workaround.

**The problem:** I conflated `useImperativeHandle` with `forwardRef`. Verification:

1. **AGENTS.md line 202:** "React Compiler is enabled for this repo. Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler unless a maintainer explicitly requests an exception"
   - Explicitly lists: `forwardRef`, `memo`, `useMemo`, `useCallback`
   - Does NOT list: `useImperativeHandle`

2. **React version:** `"react": "^19.2.5"` in `packages/app/package.json`
   - React 19 introduced ref-as-prop pattern — `forwardRef` is no longer needed
   - `useImperativeHandle` is fine without `forwardRef`

3. **Existing usage on main:** `packages/app/src/editor/TiptapEditor.tsx` already uses `useImperativeHandle` with ref-as-prop:
   ```tsx
   // Line 15
   import { type FC, type Ref, useEffect, useImperativeHandle, useRef } from 'react';
   
   // Line 49
   export interface TiptapEditorHandle { ... }
   
   // Lines 130-131
   export const TiptapEditor: FC<{
     ref?: Ref<TiptapEditorHandle>;
     ...
   
   // Line 379
   useImperativeHandle(
     ref,
     () => ({ getMarkdown, getYText, getProvider }),
     [editor, provider.document, provider]
   );
   ```

**Correction:**

The slash command menu SHOULD use the React 19 ref-as-prop pattern with `useImperativeHandle`:

```tsx
// packages/app/src/editor/slash-command/SlashCommandMenu.tsx
import { useImperativeHandle, type Ref } from 'react';

export interface SlashCommandMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  query: string;
  categoryLabels: Record<string, string>;
  onSelect: (item: SlashCommandItem) => void;
  ref?: Ref<SlashCommandMenuHandle>;
}

export function SlashCommandMenu({ items, query, categoryLabels, onSelect, ref }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const filtered = filterItems(items, query);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % filtered.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
          return true;
        }
        return false;
      },
    }),
    [filtered, selectedIndex, onSelect],
  );

  // ... render
}
```

And the extension's render lifecycle:

```tsx
// extensions/slash-command.ts
render: () => {
  let renderer: ReactRenderer | null = null;
  let popup: HTMLDivElement | null = null;
  let menuHandle: SlashCommandMenuHandle | null = null;

  return {
    onStart(props) {
      popup = document.createElement('div');
      // ... positioning
      
      renderer = new ReactRenderer(SlashCommandMenu, {
        props: {
          items: props.items,
          query: props.query,
          categoryLabels: extension.options.categoryLabels,
          onSelect: (item) => props.command(item),
          ref: (handle: SlashCommandMenuHandle | null) => { menuHandle = handle; },
        },
        editor: props.editor,
      });
      popup.appendChild(renderer.element);
    },

    onKeyDown(props) {
      return menuHandle?.onKeyDown(props.event) ?? false;
    },
    // ...
  };
}
```

This is:
- ✓ Standard React 19 pattern
- ✓ Matches main's existing `TiptapEditor.tsx` implementation
- ✓ Compatible with React Compiler (no `forwardRef`)
- ✓ Cleaner than the closure-based alternative I originally considered
- ✓ Testable (can mock the ref in unit tests)

**Revised D5:**

> D5 | Keyboard handling location | **In the menu component via `useImperativeHandle` + ref-as-prop (React 19 pattern).** Follows main's existing `TiptapEditor.tsx` pattern. React Compiler compatible — `forwardRef` is NOT used (forbidden), but `useImperativeHandle` with ref-as-prop IS the idiomatic React 19 replacement. | LOCKED | HIGH |

**Impact on spec:** Update D5 text, update §3.3 menu component section, update the `Angle 4` response in the evidence file. No architectural change — this simplifies implementation.

---

## Decision-by-decision review

### D1: Foundation = @tiptap/suggestion

**Survived adversarial review.** Evidence verified:
- TipTap Suggestion API supports all claimed options (`char`, `startOfLine`, `allowedPrefixes`, `items`, `command`, `render`, `shouldShow`) — verified from tiptap.dev/docs/editor/api/utilities/suggestion
- BlockNote uses it at production scale (verified from deepwiki.com)
- Migrating main's 431 lines to ~385 lines via library adoption is a strict improvement in bespoke code surface

**No adversarial challenge survives.** D1 remains LOCKED.

### D2: Item sources via addOptions config array

**Survived adversarial review.** Pattern is the TipTap canonical approach.

Alternatives considered and rejected:
- Module-level registry: import-order sensitive, no tree-shaking, harder to test
- React context: slash command extension runs outside React tree
- Explicit `configure({ items: [...] })` (static array): misses dynamic use cases (component manifest can change during dev hot-reload)

**D2 remains LOCKED.**

### D3: Open category taxonomy (string vs closed union)

**Survived adversarial review.** Necessary for PR #23 and future consumers.

Alternative: keep union, add members as needed. Rejected because every new consumer (PR #23, future mentions, future emoji) would require editing `items.ts` to add their category key. Breaking encapsulation.

**D3 remains LOCKED.**

### D4: Category labels via extension option

**Survived adversarial review.** Consistent with D2 pattern.

Alternatives considered:
- Module-level `registerCategoryLabel()`: same drawbacks as module-level item registry
- Labels on items themselves (each item carries its category label): violates DRY — 21 items with `category: 'content'` would each carry `label: 'Content'`

**D4 remains LOCKED.**

### D5: Keyboard handling — **REVISED**

See Finding 2 above. Changed from "closure-based" to "useImperativeHandle + ref-as-prop."

### D6: Trigger rules via allowedPrefixes

**Survived adversarial review with caveat.**

**Verified:** TipTap Suggestion API has `allowedPrefixes` option (default `[' ']`, accepts array or null). Confirmed via docs.

**Caveat for implementation:** The spec specifies `allowedPrefixes: [' ', '\n']` to reproduce main's `(?:^|\s)` regex behavior. However, the exact logic of how Suggestion checks "is this the start of a block vs after a newline" is not fully documented. If `[' ', '\n']` doesn't trigger at position 1 of an empty paragraph (because there's no preceding character to check), the implementation should:
1. Try `allowedPrefixes: null` (allow any prefix) + filter in `items({ query })` callback
2. Or try `allowedPrefixes: [' ', '\n']` combined with `startOfLine: false` default

**Recommendation:** Add implementation test case "trigger `/` at position 1 of an empty paragraph" to R01. If it fails with the proposed config, the fix is to use `allowedPrefixes: null` + document the implicit "any prefix" behavior in the extension comments.

**D6 remains LOCKED but flagged for implementation-time verification.**

### D7: Preserve all existing items exactly

**Survived adversarial review.** Non-negotiable for zero-regression goal.

### D8: Add optional description field

**Survived adversarial review.** Zero cost, future-proof.

Alternative: add only when PR #23 needs it. Rejected because that's a spec delay — PR #23 would have to make TWO changes (add the field + use it) instead of one.

**D8 remains LOCKED.**

### D9: Add optional range parameter to command signature

**Survived adversarial review.** Necessary for PR #23's component insertion pattern:

```ts
command: (editor, range) => {
  editor.chain().focus().deleteRange(range).insertContent({
    type: 'jsxComponentEditable',
    attrs: { componentName: 'Callout', type: 'info' },
  }).run();
}
```

Main's current items ignore the parameter (e.g., `toggleHeading({ level: 1 })`). No migration cost.

Verified: Suggestion's `command` callback signature already receives `{ editor, range, props }`. Our `SlashCommandItem.command` just needs to accept the range as an optional second arg. Extension wiring: `command: ({ editor, range, props: item }) => item.command(editor, range)`.

**D9 remains LOCKED.**

---

## What this self-assessment does NOT catch

Adversarial review against my own work has blind spots:
- Assumptions I made without realizing they're assumptions
- Design patterns I'm familiar with but are wrong for this specific context
- Knock-on effects I haven't thought through

The parallel auditor + challenger subprocesses are the second line of defense. They read the spec cold and may catch things I missed.

---

## Action items (to apply after audit + challenger complete)

1. **Update §5 Tech Stack** — `@tiptap/suggestion` is NOT transitively present. Must be explicitly added.
2. **Update D5** — Use `useImperativeHandle` + ref-as-prop (React 19), not a closure-based approach. `forwardRef` is forbidden, but `useImperativeHandle` alone is fine.
3. **Update §3.3 menu component** — Replace the `forwardRef` + `useImperativeHandle` description with the ref-as-prop pattern. Reference `TiptapEditor.tsx` as the precedent.
4. **Update evidence file Angle 4 response** — Correct the claim that `useImperativeHandle` is discouraged. It's fine; only `forwardRef` is forbidden.
5. **Update A1** — Note that `@tiptap/suggestion` is not currently installed and must be added.
6. **Add implementation verification task for D6** — Test that `allowedPrefixes: [' ', '\n']` triggers correctly at position 1 of an empty paragraph. Fallback is `null` with items-level filtering.
7. **Consolidate with audit + challenger findings** when they complete.
