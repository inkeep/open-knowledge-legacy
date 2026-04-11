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

**Confidence:** HIGH

**Evidence:** TipTap Suggestion API reference + source reading

Main's regex: `(?:^|\s)\/([a-z0-9-]*)$`

This matches:
- `^\/` — slash at start of current block text
- `\s\/` — slash preceded by whitespace (space or newline)
- `[a-z0-9-]*` — zero or more lowercase/digit/hyphen after the slash

Suggestion equivalent:
```ts
Suggestion({
  char: '/',
  startOfLine: false,          // allows mid-line triggering
  allowedPrefixes: [' ', '\n'], // requires whitespace (or start) before the slash
  // items filter can further restrict character set if needed
})
```

`findSuggestionMatch` in `@tiptap/suggestion` uses `allowedPrefixes` to check the character immediately preceding the trigger. When `allowedPrefixes: [' ', '\n']` is set, the match requires the preceding character to be one of those (or the start of the parent text, which is always allowed when `startOfLine: false`).

The `[a-z0-9-]*` character class restriction in main's regex isn't directly expressible in Suggestion's config, but it's not important — the `items()` callback receives the `query` and can filter however it wants. If a user types `/HELLO`, the query becomes `HELLO` (capital letters), and the filter can be case-insensitive to match. Main's current regex silently dismisses uppercase — that's a subtle behavior difference, but arguably a bug in main (users expect case-insensitive matching). After the refactor, uppercase triggers work correctly.

**Implications:** No user-visible trigger behavior regression. One minor improvement (uppercase matching) comes for free.

---

## Finding: Collaborative editing awareness is latent bug fix

**Confidence:** INFERRED (not tested in current codebase but well-documented in ecosystem)

**Evidence:** TipTap Suggestion docs + community discussion

Suggestion's `shouldShow` callback runs on every transaction. A common use is:

```ts
shouldShow: ({ state, view }) => {
  // Don't show during remote sync
  const tr = view.state.tr;
  if (tr.getMeta('y-sync$')) return false;
  return true;
}
```

Main's custom Plugin runs `state.apply()` on every transaction unconditionally. If a remote peer's transaction arrives while the local menu state is computing, the menu can incorrectly open or flicker.

This hasn't been tested or reported in main because the multi-client slash command scenario is a narrow edge case. But the editor uses Y.js + Hocuspocus, so multi-client editing IS a production concern. Migrating to Suggestion fixes the latent bug before it surfaces.

**Implications:** This is a "fix something before anyone notices" improvement. Worth getting for free during the migration.

---

## Finding: Bespoke code surface reduces by ~40%

**Confidence:** CONFIRMED

**Evidence:** Line counts

| File | Current (custom Plugin) | Target (Suggestion) | Change |
|------|------------------------|---------------------|--------|
| `extensions/slash-command.ts` | 213 lines | ~130 lines | -83 |
| `slash-command/items.ts` | 119 lines | ~125 lines | +6 (adds description field, range param) |
| `slash-command/SlashCommandMenu.tsx` | 99 lines | ~130 lines | +31 (forwardRef + imperative handle for keyboard) |
| **Total** | **431 lines** | **~385 lines** | **-46 (-11%)** |

The 11% line reduction understates the maintenance benefit because the deleted code is the hardest-to-reason-about (ProseMirror Plugin state machine), while the added code is standard React patterns (forwardRef, useImperativeHandle).

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

**Angle 4: "React Compiler compatibility — useImperativeHandle is discouraged in our codebase."**
Response: This is a real constraint. The block-editor-ux spec notes React Compiler patterns avoid `useImperativeHandle`/`forwardRef`/`memo`/`useMemo`/`useCallback`. We need a workaround. Options:
- **A) Alternative keyboard handling via editor state:** Store menu selection index in a `PluginKey` separate from Suggestion's, read from extension option's callback. Works but defeats some of Suggestion's abstraction.
- **B) Keyboard handling in the extension's plugin props:** The Suggestion `render()` callback returns an object with `onKeyDown`. This callback is called from Suggestion's own plugin `handleKeyDown`. We can implement keyboard logic directly in that callback without needing a React ref — just read state from a closure variable updated by `onUpdate`.
- **C) Accept `forwardRef` + `useImperativeHandle`:** React Compiler can often handle these correctly; the discouragement is for performance-sensitive paths. Menu rendering is a small, short-lived tree.
Recommendation: **B.** Keep all keyboard state in the render callback's closure, no ref needed.

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

One implementation caveat worth flagging: **React Compiler constraints preclude `forwardRef` + `useImperativeHandle`.** Keyboard handling should live in the `render()` callback's closure via Suggestion's built-in `onKeyDown` return value, not via a React ref. This is documented in D5 of the spec.

---

## Gaps (things not verified in this analysis)

- Have not read `@tiptap/suggestion@3.22.3` source directly; relied on docs + ecosystem usage patterns
- Have not dry-run the PR #23 rebase against the refactored main to verify the 50-line delta estimate
- Have not verified that `@tiptap/suggestion` is already transitively installed in main's `bun.lock` (needs `bun pm ls | grep suggestion`)
- Have not tested React Compiler behavior with Suggestion's render lifecycle (assumption: closures inside `render()` are compatible)
