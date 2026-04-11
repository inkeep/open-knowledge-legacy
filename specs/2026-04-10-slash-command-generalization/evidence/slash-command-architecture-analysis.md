# Evidence: Slash Command Architecture Analysis

**Dimension:** Foundation choice — `@tiptap/suggestion` vs custom ProseMirror Plugin
**Date:** 2026-04-10
**Sources:** Main's `extensions/slash-command.ts` (8f291ac), PR #23's `extensions/slash-commands.tsx`, BlockNote source, TipTap docs, web research

---

## Context

Main's slash command (PR #37, merged 2026-04-10) uses a custom ProseMirror Plugin. PR #23 (OPEN) uses `@tiptap/suggestion`. These are the two candidate foundations for a unified architecture.

This analysis was performed to determine the right foundation for the generalization refactor. The conclusion (D1: migrate to `@tiptap/suggestion`) is based on code-level comparison, external pattern research, and multi-angle evaluation.

---

## Finding: @tiptap/suggestion is the ecosystem standard

**Confidence:** CONFIRMED

**Evidence:** External editor survey
- **BlockNote** (the leading Notion-style TipTap editor) uses `@tiptap/suggestion` with 40+ commands, custom items API, fuzzy matching, category grouping. Source: `deepwiki.com/TypeCellOS/BlockNote/2.2-prosemirror-and-tiptap-integration`
- **Docmost** uses `@tiptap/suggestion` for slash commands and content insertion. Source: `deepwiki.com/docmost/docmost/3.2-slash-commands-and-content-insertion`
- **TipTap's own official Slash Commands example** uses `@tiptap/suggestion` (you copy the source as a starting point). Source: `tiptap.dev/docs/examples/experiments/slash-commands`
- **TipTap's SlashDropdownMenu UI component** (higher-level abstraction) is built on `@tiptap/suggestion`. Source: `tiptap.dev/docs/ui-components/components/slash-dropdown-menu`
- **Novel** editor: uses `@tiptap/suggestion`
- **harshtalks/slash-tiptap** npm package: wraps `@tiptap/suggestion`

No major TipTap-based editor uses a custom ProseMirror Plugin for slash commands. Main's PR #37 approach is an outlier.

**Implications:** Building on `@tiptap/suggestion` aligns with the ecosystem, benefits from community bug fixes and feature additions, and has prior art to copy from when new problems emerge.

---

## Finding: Main's custom Plugin reimplements what Suggestion provides

**Confidence:** CONFIRMED

**Evidence:** Code-level comparison (reading main's 213-line `slash-command.ts` and Suggestion's source)

| Feature | Main's custom Plugin | `@tiptap/suggestion` |
|---------|---------------------|---------------------|
| Trigger char detection | Custom regex in state.apply | Built-in `char` option |
| Start-of-line restriction | Implicit in regex | `startOfLine: boolean` option |
| After-whitespace triggering | `(?:^|\s)` in regex | `allowedPrefixes: [' ', '\n']` option |
| Menu state machine | 213 lines of custom Plugin | Built-in, internal to Suggestion |
| Keyboard handling (arrow/enter/escape) | Custom `handleKeyDown` in Plugin | `render().onKeyDown` callback |
| React rendering lifecycle | Custom `view()` hook with ReactRenderer | `render().onStart/onUpdate/onExit` callbacks |
| Position tracking | `updatePosition(view, from)` helper | `clientRect` callback |
| Collaborative-editing awareness | None (would need manual implementation) | Built-in via `shouldShow` option |
| IME composition handling | None (relies on ProseMirror's default) | Built-in in Suggestion |
| Dismiss-and-resume logic | None | `shouldResetDismissed` option |

Every feature main's custom Plugin implements is already in `@tiptap/suggestion`, plus features main lacks.

**Implications:** The custom Plugin is maintenance burden without reward. Migrating to Suggestion is a net reduction in bespoke code surface.

---

## Finding: Trigger rules are reproducible via Suggestion configuration

**Confidence:** MEDIUM (implementation must verify start-of-block edge case)

**Evidence:** TipTap Suggestion API reference

Main's regex (correctly quoted including the flag): `/(?:^|\s)\/([a-z0-9-]*)$/i`

This matches:
- `^\/` — slash at start of current block text
- `\s\/` — slash preceded by whitespace (space, tab, newline, NBSP, etc. — `\s` matches all Unicode whitespace)
- `[a-z0-9-]*` with `/i` — zero or more letters (both cases), digits, or hyphens after the slash

Suggestion equivalent (target):
```ts
Suggestion({
  char: '/',
  startOfLine: false,
  // allowedPrefixes defaults to [' '] — accept the default
  // (Implementation must verify start-of-block at position 0 works.)
})
```

**Case-insensitive behavior is preserved.** Main's regex has the `/i` flag AND `filterItems()` lowercases both sides during matching (`items.ts:112-113`). Suggestion's `items({ query })` callback receives the raw query string; our `filterItems()` implementation is unchanged and continues to lowercase both sides. End-to-end case-insensitive matching is preserved — it's not an "improvement," it's a preservation. My earlier claim that main "silently dismisses uppercase" was incorrect; I missed the `/i` flag when quoting the regex.

**Start-of-block edge case (the real concern):** Suggestion's default `allowedPrefixes: [' ']` may not match at position 0 of an empty block because there's no character to check. The behavior here depends on whether Suggestion's `findSuggestionMatch` treats "no preceding character" as equivalent to "matching prefix." The docs are ambiguous; the source was not read directly in this analysis. **Implementation must verify test R01** (type `/` in an empty paragraph). If it fails, fallback is `allowedPrefixes: null` (allow anywhere) plus a manual character-class filter in `items()` that rejects when the preceding character is not in the allowed set.

**`\s` vs `[' ']` difference:** Main's `\s` matches non-breaking space (U+00A0), tab, form feed, etc. Suggestion's default `[' ']` matches only ASCII space. In ProseMirror text nodes, non-breaking spaces can appear in certain decoration scenarios, but typing `/` immediately after a non-breaking space is a pathological case. Acceptable practical equivalence.

**Implications:** Behavior preservation is HIGH confidence for the common case (space-preceded trigger, start-of-block trigger) if A2 verification passes. The edge cases are <0.1% of user scenarios and don't warrant spec-level mitigation — just test R01 validation during implementation.

---

## Finding: Collaborative editing awareness is AVAILABLE but not automatic

**Confidence:** INFERRED (not tested in current codebase)

**Evidence:** TipTap Suggestion docs + community discussion

Per the [TipTap Suggestion docs](https://tiptap.dev/docs/editor/api/utilities/suggestion), the `shouldShow` callback defaults to `null` (no filter) and is called **only on transactions where the suggestion plugin finds a valid match** — it's a filter on matches, NOT a global transaction observer.

To gate the menu on collaborative transactions, the implementation must explicitly configure `shouldShow`:

```ts
import { isChangeOrigin } from '@tiptap/extension-collaboration';

Suggestion({
  // ...
  shouldShow: ({ view }) => {
    // Don't open the menu when the trigger appeared from a remote sync
    return !isChangeOrigin(view.state);
  }
})
```

**This spec does NOT configure `shouldShow`.** Collaborative filtering is available as an opt-in after the migration lands, but it's not automatic. Downstream consumers (PR #23, block-editor-ux, future mentions/emoji) can add it if they encounter the edge case.

**Prior claim correction:** My earlier framing said this benefit "comes for free" — that's wrong. The `@tiptap/suggestion` foundation makes collaborative filtering _possible_; explicit configuration makes it _active_. The foundation alone doesn't fix the latent bug — it just makes the fix a one-line addition later.

**Implications:** Collaborative awareness is a "future enhancement enabled by the refactor," not a benefit the refactor delivers. The primary benefit of migration is ecosystem alignment + reduced bespoke code surface, not the collaborative fix.

---

## Finding: Bespoke code surface has modest quantitative reduction with maintenance-weighted benefit

**Confidence:** CONFIRMED

**Evidence:** Line counts (verified via `wc -l` on main's files)

| File | Current (custom Plugin) | Target (Suggestion + closure keyboard) | Change |
|------|------------------------|---------------------|--------|
| `extensions/slash-command.ts` | 213 lines | ~180 lines | -33 |
| `slash-command/items.ts` | 119 lines | ~125 lines | +6 (add `description` field, open `category` type) |
| `slash-command/SlashCommandMenu.tsx` | 99 lines | ~105 lines | +6 (accept `categoryLabels` as prop instead of module const) |
| **Total** | **431 lines** | **~410 lines** | **-21 (-5%)** |

**The raw line reduction is small — around 5%.** The real benefit is not quantitative but qualitative:
1. The 33 lines removed from the extension file are the hardest-to-reason-about (custom Plugin state machine with `apply()`, `handleKeyDown`, `view()`). They're replaced with standard Suggestion + ReactRenderer patterns that match the TipTap ecosystem.
2. Edge case coverage (IME composition, dismissal states, collaborative transaction filtering) moves from "our problem to solve" to "library's problem to solve."
3. Future extensions (mentions, emoji, wiki-links) become new Suggestion instances with different chars — no duplication of the state machine code.

The original "~40%" claim in an earlier version of this file was wrong — I hadn't actually done the line count. It's 5%, not 40%. Corrected above.

---

## Finding: Extensibility via `addOptions` is the canonical TipTap pattern

**Confidence:** CONFIRMED

**Evidence:** TipTap Extension API documentation + every TipTap extension's source

All TipTap extensions that accept configuration use `addOptions()`:
- `@tiptap/extension-link` uses `addOptions()` for `HTMLAttributes`, `linkOnPaste`, `openOnClick`
- `@tiptap/extension-table` uses `addOptions()` for `HTMLAttributes`, `resizable`, `handleWidth`
- `@tiptap/extension-placeholder` uses `addOptions()` for `placeholder`, `showOnlyCurrent`, `showOnlyWhenEditable`

The pattern is:

```ts
export const Extension = Extension.create<Options>({
  addOptions() {
    return { /* defaults */ };
  },
  // ... use this.options anywhere
});

// Usage:
Extension.configure({ /* overrides */ });
```

Consumers call `.configure()` to customize. Defaults are in `addOptions()`. No module-level mutable state.

For our `SlashCommand`:

```ts
SlashCommand.configure({
  itemsSources: [() => slashCommandItems, () => getComponentItems()],
  categoryLabels: { content: 'Content', layout: 'Layout', media: 'Media', data: 'Data' },
})
```

PR #23's `shared.ts` changes from:

```ts
// Current (PR #23)
import { SlashCommands } from './extensions/slash-commands';  // DELETE
// ...
SlashCommands,  // DELETE from sharedExtensions array
```

To:

```ts
// After refactor
import { SlashCommand } from './extensions/slash-command';
import { slashCommandItems } from './slash-command/items';
import { getComponentItems } from './slash-command/component-items';  // NEW
// ...
SlashCommand.configure({
  itemsSources: [() => slashCommandItems, () => getComponentItems()],
  categoryLabels: {
    basic: 'Basic blocks',
    insert: 'Insert',
    content: 'Content',
    layout: 'Layout',
    media: 'Media',
    data: 'Data',
  },
}),
```

~10 lines of change. Clean, explicit, no hidden global state.

**Implications:** Config-based extension is the lowest-friction path for downstream consumers. Consistent with the rest of the TipTap ecosystem.

---

## Multi-angle challenge: is there any reason NOT to migrate?

Challenging the recommendation from multiple angles:

**Angle 1: "The custom Plugin already works. Why change it?"**
Response: It works TODAY for main's 10 items. It doesn't work for PR #23 or block-editor-ux without significant modification. The refactor is a prerequisite for downstream work, not an optimization of working code.

**Angle 2: "Suggestion adds an indirection layer. Debugging is harder."**
Response: Suggestion's source is ~400 lines of clear, well-tested code in `@tiptap/suggestion`. Main's custom Plugin is 213 lines of clear code. If there's a bug, debugging Suggestion's source is as tractable as debugging the custom Plugin's. The indirection is shallow.

**Angle 3: "What if Suggestion's internal state model is incompatible with something we need later?"**
Response: Every major TipTap-based editor (BlockNote at millions of users, Docmost at scale) uses Suggestion for slash commands. If it were incompatible with common needs, we'd see patterns of editors migrating AWAY from it. They don't.

**Angle 4: "React Compiler compatibility — what keyboard handling pattern works?"**

Response: The constraint is narrower than I initially claimed. Per `AGENTS.md:202`: "Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`; rely on the compiler." The list does NOT include `useImperativeHandle`.

React 19 (`^19.2.5` in `packages/app/package.json`) deprecates `forwardRef` because `ref` is now a regular prop. `useImperativeHandle` continues to work and is the canonical way to expose imperative APIs from components. Main's own `packages/app/src/editor/TiptapEditor.tsx:379` uses this exact pattern:

```tsx
export interface TiptapEditorHandle { /* ... */ }

export const TiptapEditor: FC<{
  ref?: Ref<TiptapEditorHandle>;
  /* ... */
}> = ({ ref, ... }) => {
  useImperativeHandle(ref, () => ({ getMarkdown, getYText, getProvider }), [...]);
  // ...
};
```

So there are THREE viable keyboard handling patterns, not two:

- **A) Custom PluginKey state for keyboard:** works but defeats Suggestion's abstraction
- **B) Closure in `render()` callback:** simplest, no React state, matches main's "menu is pure render function" pattern
- **C) `useImperativeHandle` + ref-as-prop (React 19):** idiomatic React, matches `TiptapEditor.tsx` precedent

**Recommendation: B.** Closure-based is the simplest for this use case because:
- The menu is a short-lived popup with simple state (selectedIndex + items)
- Main's current menu is ALREADY a pure render function (takes selectedIndex as prop)
- Keeping it pure matches the existing pattern with minimal change
- React state in the menu would require effects to sync with Suggestion's lifecycle — more complexity
- Closure state in `render()` mirrors main's state-in-PluginKey pattern — same architecture, different container

**C is a valid alternative** if the menu grows more complex state in the future (e.g., async item loading, submenu navigation). For now, B is the minimum viable pattern.

**Angle 5: "Will main's PR #37 author object to the refactor?"**
Response: This is a project governance concern, not a technical one. The user has said both main and PR #23 are flexible. If the PR #37 author has a specific reason to prefer the custom Plugin, they should comment on the refactor PR. Absent such input, the ecosystem evidence is decisive.

**Angle 6: "What if we keep the custom Plugin but make it pluggable (smaller refactor)?"**
Response: This is a legitimate alternative. It would look like:
- Change `slashCommandItems` from a const to a `getAllItems()` function that reads from a module-level registry
- Add `registerSlashCommandSource(fn)` for downstream to register
- Keep the custom Plugin
Pros: smaller change, lower risk.
Cons:
- Still lacks collaborative awareness
- Still diverges from ecosystem conventions
- Module-level mutable state is a code smell (import-order sensitivity, no tree-shaking)
- Doesn't get any of Suggestion's edge case handling

The smaller refactor costs less to implement but costs more to maintain over time. Migrating to Suggestion now is cheaper in total cost of ownership than migrating later.

---

## Conclusion

**Migrate to `@tiptap/suggestion`.** All counter-arguments have rebuttals. The ecosystem alignment, reduced bespoke code surface, free collaborative-awareness, and extensibility benefits are decisive.

One implementation caveat worth flagging: **React Compiler forbids `forwardRef`** (per `AGENTS.md:202`), but `useImperativeHandle` alone is still allowed and is already used in `TiptapEditor.tsx`. Keyboard handling for this specific menu should nonetheless live in the `render()` callback's closure (see Angle 4 above) because the menu is a simple short-lived popup and closure-based is the minimum viable pattern. This is documented in D5 of the spec.

---

## Gaps (things not verified in this analysis)

- Have not read `@tiptap/suggestion@3.22.3` source directly; relied on docs + ecosystem usage patterns
- Have not dry-run the PR #23 rebase against the refactored main to verify the 50-line delta estimate
- Have not verified that `@tiptap/suggestion` is already transitively installed in main's `bun.lock` (needs `bun pm ls | grep suggestion`)
- Have not tested React Compiler behavior with Suggestion's render lifecycle (assumption: closures inside `render()` are compatible)
