# SPEC: Slash Command Generalization

**Status:** Draft
**Created:** 2026-04-10
**Baseline commit:** 8f291ac (origin/main head)
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/app/src/editor/` only — `extensions/slash-command.ts`, `slash-command/items.ts`, `slash-command/SlashCommandMenu.tsx`
**Nature:** Architectural refactor on main to unblock two downstream branches (PR #23 typed-component-nodes, and block-editor-ux spec) that both need to extend the slash command with additional item sources. Pure view-layer change with zero user-visible behavior regression.
**Target PR:** Direct to main. Small, focused, reviewable in one sitting.

**Pace:** Fast. Single-phase refactor. No new user-facing features, no schema changes, no tests break. The goal is to open up existing code, not add new code.

---

## 1. Problem Statement (SCR)

**Situation:** Main's editor has a working slash command menu (PR #37) that handles 10 formatting items across two categories (`basic`: headings/lists/quote/code, `insert`: table/separator). Implementation: custom ProseMirror Plugin with a hardcoded `slashCommandItems` array, trigger regex `(?:^|\s)\/([a-z0-9-]*)$` (mid-line capable), and a category-grouped React menu with Tailwind styling and ARIA roles.

**Complication:** Two in-flight branches need to extend this with additional item sources:

| Branch | What it needs | Current conflict with main |
|--------|--------------|---------------------------|
| **PR #23** (typed-component-nodes, OPEN) | Insert typed components (Callout, Steps, Video, etc.) from a 21-component registry. Uses `@tiptap/suggestion` with `startOfLine: true` and content/layout/media/data categories. | Duplicate slash command extension. Conflicting taxonomy (`basic/insert` vs `content/layout/media/data`). Conflicting foundation (custom Plugin vs Suggestion). Conflicting trigger rules (mid-line vs start-only). |
| **block-editor-ux spec** (this session, Path 1 dependency) | "+" button that opens the same menu at arbitrary positions for inserting blocks between existing blocks or inside empty containers. | Needs a shared items source so the "+" button and slash command share a single list. Main's current items are closed — no extension point. |

As-is, PR #23 cannot rebase on main without resolving the architectural mismatch, and the block-editor-ux "+" button has nothing to share with.

**Resolution:** Refactor main's slash command to a pluggable, library-proven architecture. Three structural changes, all backwards-compatible for main's current user-visible behavior:

1. **Migrate the extension foundation from custom Plugin to `@tiptap/suggestion`** — the community-proven standard (BlockNote, Docmost, TipTap official examples all use it). Preserves all current features via configuration; reduces bespoke code; adds collaborative-editing awareness for free.
2. **Open the item source to multiple providers via configuration** — the extension accepts an `itemsSources` array of `() => SlashCommandItem[]` functions. Each source contributes items; the extension merges and filters them on every trigger.
3. **Open the category taxonomy from a closed union to a string + extensible label map** — PR #23 can add `content`, `layout`, `media`, `data` categories without touching the extension code.

After this refactor:
- PR #23 becomes a small additive change: register a component source, register four new category labels, delete its own slash command extension.
- block-editor-ux's "+" button can import the same item sources and render the same menu component.
- Main's existing users see zero behavior change.

---

## 2. Success Criteria

### Primary: Zero user-visible behavior change
After this refactor, a user testing main's current slash command functionality must see identical behavior:
- `/` at start of a paragraph opens the menu
- `/` after whitespace mid-line opens the menu
- All 10 existing items appear in the same order, same categories, same icons, same labels
- Arrow keys, Enter, Escape, mouse click all work as before
- Menu positions in the same place relative to the cursor
- Scroll-into-view on selection works
- ARIA roles unchanged
- Tailwind styling unchanged

### Secondary: Downstream branches can extend with minimal change

**PR #23 rebase cost (after this refactor merges):**
- Delete its own `extensions/slash-commands.tsx` (conflict with this PR — we win)
- Delete its own `components/SlashCommandMenu.tsx` (redundant with main's version)
- Add `packages/app/src/editor/slash-command/component-items.ts` (~40 lines) — a `getComponentItems()` source function
- Update `packages/app/src/editor/extensions/shared.ts` (~10 lines) — pass `componentItemsSource` + category labels to `SlashCommand.configure()`
- Total addition: ~50 lines. Total deletion: ~350 lines. Net: much smaller PR.

**block-editor-ux "+" button (in block-editor-ux spec's Phase 1):**
- Import `getAllItems()` from `slash-command/items.ts`
- Render `<SlashCommandMenu />` in a floating div
- Reuse item commands and keyboard handling

### Tertiary: Collaborative-editing safety
The migration to `@tiptap/suggestion` brings collaborative-awareness that main's custom Plugin lacks:
- `shouldShow` callback can check transaction origin to avoid opening the menu on remote sync transactions
- Y.Doc-wide menu state is handled correctly (doesn't open for all peers when one user triggers)
- Tested by BlockNote at scale

This is not a user-visible feature — it's a latent bug fix for multi-client editing scenarios that haven't been exercised yet in main's slash command. Worth getting for free during the migration.

---

## 3. What to Build

### 3.1 Migrate extension foundation to `@tiptap/suggestion`

**Current (`packages/app/src/editor/extensions/slash-command.ts`, 213 lines):**

```ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import { filterItems, slashCommandItems } from '../slash-command/items';
import { SlashCommandMenu } from '../slash-command/SlashCommandMenu';

const slashCommandKey = new PluginKey('slashCommand');

interface SlashCommandState { active, range, query, selectedIndex }

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: slashCommandKey,
      state: { init, apply(tr, prev) { /* 50 lines of state logic */ } },
      props: { handleKeyDown(view, event) { /* 30 lines of keyboard handling */ } },
      view() { /* 70 lines of ReactRenderer lifecycle */ }
    })];
  },
});
```

**Target:**

```ts
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { slashCommandItems, filterItems, type SlashCommandItem } from '../slash-command/items';
import { SlashCommandMenu } from '../slash-command/SlashCommandMenu';

const slashCommandKey = new PluginKey('slashCommand');

export interface SlashCommandOptions {
  /**
   * Item source functions. Each is called on every trigger and its results
   * are merged into the menu. Default: [() => slashCommandItems] (the
   * built-in formatting items: headings, lists, quote, code, table, separator).
   *
   * Downstream branches extend by passing additional sources via .configure():
   *   SlashCommand.configure({
   *     itemsSources: [() => slashCommandItems, () => getComponentItems()]
   *   })
   */
  itemsSources: (() => SlashCommandItem[])[];

  /**
   * Extra category labels to register alongside the defaults.
   * Default registers 'basic' → "Basic blocks" and 'insert' → "Insert".
   * Consumers can add labels like 'content' → "Content", 'layout' → "Layout", etc.
   */
  categoryLabels: Record<string, string>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      itemsSources: [() => slashCommandItems],
      categoryLabels: {
        basic: 'Basic blocks',
        insert: 'Insert',
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        pluginKey: slashCommandKey,
        char: '/',

        // Preserve main's current trigger behavior: start of line OR after whitespace.
        // @tiptap/suggestion supports this via startOfLine:false + allowedPrefixes.
        startOfLine: false,
        allowedPrefixes: [' ', '\n'],

        // Dynamic items from all registered sources
        items: ({ query }) => {
          const allItems = extension.options.itemsSources.flatMap((source) => source());
          return filterItems(allItems, query);
        },

        // Each item self-executes its command
        command: ({ editor, range, props: item }) => {
          item.command(editor, range);
        },

        // ReactRenderer-based popup (replaces the custom view() lifecycle)
        render: () => {
          let renderer: ReactRenderer | null = null;
          let popup: HTMLDivElement | null = null;

          return {
            onStart(props) {
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '50';
              document.body.appendChild(popup);

              renderer = new ReactRenderer(SlashCommandMenu, {
                props: {
                  items: props.items,
                  query: props.query,
                  selectedIndex: 0,
                  categoryLabels: extension.options.categoryLabels,
                  onSelect: (item) => props.command(item),
                },
                editor: props.editor,
              });
              popup.appendChild(renderer.element);
              updatePosition(popup, props.clientRect);
            },

            onUpdate(props) {
              if (!renderer || !popup) return;
              renderer.updateProps({
                items: props.items,
                query: props.query,
                selectedIndex: 0,  // Suggestion manages selection internally via onKeyDown
                categoryLabels: extension.options.categoryLabels,
                onSelect: (item) => props.command(item),
              });
              updatePosition(popup, props.clientRect);
            },

            onKeyDown(props) {
              // Delegate arrow/enter/escape to the menu ref (see §3.3)
              return menuHandleKeyDown(props.event);
            },

            onExit() {
              renderer?.destroy();
              renderer = null;
              popup?.remove();
              popup = null;
            },
          };
        },
      }),
    ];
  },
});

function updatePosition(popup: HTMLDivElement, clientRect: (() => DOMRect | null) | null) {
  const rect = clientRect?.();
  if (!rect) return;
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;
}
```

**Result:** ~130 lines (down from 213), standard TipTap patterns, collaborative-safe.

### 3.2 Change item source from hardcoded const to source functions

**Current (`packages/app/src/editor/slash-command/items.ts`):**

```ts
export interface SlashCommandItem {
  name: string;
  label: string;
  icon: ComponentType;
  category: 'basic' | 'insert';  // CLOSED UNION
  command: (editor: Editor) => void;
  aliases?: string[];
}

export const slashCommandItems: SlashCommandItem[] = [
  { name: 'heading1', category: 'basic', ... },
  // ... 10 hardcoded items
];
```

**Target:**

```ts
export interface SlashCommandItem {
  name: string;
  label: string;
  icon: ComponentType;
  category: string;  // OPEN STRING — allows 'content', 'layout', 'media', 'data', etc.
  command: (editor: Editor, range?: Range) => void;  // optional range for Suggestion integration
  aliases?: string[];
  description?: string;  // NEW: optional subtext for rich menu rendering (used by component items)
}

/**
 * Main's built-in formatting items. Exported as a stable reference that
 * downstream branches can compose with their own sources.
 */
export const slashCommandItems: SlashCommandItem[] = [
  { name: 'heading1', category: 'basic', ... },
  // ... same 10 items, unchanged
];

export function filterItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  // unchanged
}
```

**Changes:**
- `category: 'basic' | 'insert'` → `category: string`
- `SlashCommandItem.command` gains an optional `range` parameter (`(editor, range?) => void`). Existing items ignore it; Suggestion passes it for consumers that need to replace text (e.g., component insertion with `deleteRange(range)` before `insertContent`).
- Add optional `description?: string` field for future subtext rendering. No behavior change today; used by PR #23's component items.

All 10 existing items keep their current definitions. Zero behavior change.

### 3.3 Update menu to read category labels from props

**Current (`packages/app/src/editor/slash-command/SlashCommandMenu.tsx`):**

```ts
const categoryLabels: Record<string, string> = {
  basic: 'Basic blocks',
  insert: 'Insert',
};
```

**Target:**

```ts
interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  query: string;
  selectedIndex: number;
  categoryLabels: Record<string, string>;  // NEW: passed in from extension options
  onSelect: (item: SlashCommandItem) => void;
}

// Remove the module-level categoryLabels const

export function SlashCommandMenu({ items, query, selectedIndex, categoryLabels, onSelect }: SlashCommandMenuProps) {
  // ... existing logic unchanged
  // Only change: `categoryLabels[cat.key] ?? cat.key` uses the prop instead of the module const
}
```

**Menu also needs to expose a keyboard handler for Suggestion's `onKeyDown` callback.** The current menu just renders; keyboard handling lives in the custom Plugin. With Suggestion, the render lifecycle calls the menu's `onKeyDown` on every keystroke, and the menu must:
1. Return `true` if it consumed the event (arrow up/down, enter, escape)
2. Return `false` otherwise (typing continues into the editor)

Use React's `useImperativeHandle` + forwardRef pattern so the extension can call `menuRef.current.onKeyDown(event)`. This is how TipTap's official Suggestion examples handle it. See https://tiptap.dev/docs/editor/api/utilities/suggestion for the canonical pattern.

**Result:** Menu component grows by ~30 lines (forwardRef + imperative handle + keyboard logic that was previously in the Plugin's `handleKeyDown`). Net change across extension + menu: roughly flat line count, but better separation of concerns (menu owns its keyboard; extension owns triggering).

### 3.4 Preserve all existing test behavior

- All existing unit tests (if any) pass unchanged
- Manual QA checklist:
  - [ ] `/` in empty paragraph opens menu with 10 items
  - [ ] `/h` filters to heading items
  - [ ] Arrow down selects next; arrow up selects previous
  - [ ] Enter inserts selected item
  - [ ] Escape closes menu
  - [ ] Mouse click inserts item
  - [ ] Scroll into view works when navigating past visible items
  - [ ] Mid-line trigger: typing ` /t` after some text opens menu at the `/`
  - [ ] Table insertion still works
  - [ ] Category grouping renders "Basic blocks" and "Insert" headers
  - [ ] Menu positions correctly relative to cursor

---

## 4. Implementation Order

Single phase. Order within the phase:

1. **Update `slash-command/items.ts`**: Open the `category` type to `string`, add optional `description` field, add optional `range` param to `command` signature. All 10 existing items continue to compile.
2. **Update `slash-command/SlashCommandMenu.tsx`**: Accept `categoryLabels` as a prop, remove the module-level const. Add forwardRef + useImperativeHandle for keyboard handling. Move arrow/enter/escape logic from the old extension into the menu's imperative handle.
3. **Rewrite `extensions/slash-command.ts`**: Replace custom Plugin with `Suggestion(...)` config. Pass `itemsSources` and `categoryLabels` via `addOptions`. Move positioning logic into `render()` lifecycle. Delete the old PluginKey state machine.
4. **Verify `shared.ts`** unchanged (still imports `SlashCommand`). Zero call-site changes for consumers.
5. **Manual QA** the checklist above.

---

## 5. Tech Stack

### New Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@tiptap/suggestion@3.22.3` | Foundation for the slash command menu | Already transitively present via `@tiptap/extension-mention` and other suggestion-using extensions. Needs explicit `bun add @tiptap/suggestion` if not. |

### Existing (unchanged)

- `@tiptap/core`, `@tiptap/react`, `@tiptap/pm/state` — all still used
- `lucide-react` — icons for formatting items
- Tailwind + shadcn `ui` tokens — menu styling

---

## 6. Scope Boundaries

### In Scope
- Refactor `packages/app/src/editor/extensions/slash-command.ts` to use `@tiptap/suggestion`
- Refactor `packages/app/src/editor/slash-command/items.ts` to open the `category` type and add optional fields
- Refactor `packages/app/src/editor/slash-command/SlashCommandMenu.tsx` to accept `categoryLabels` as a prop and handle keyboard via forwardRef
- Preserve all 10 existing formatting items unchanged
- Preserve mid-line trigger, ARIA roles, Tailwind styling, scroll-into-view, category grouping

### Out of Scope
- Adding new slash command items (headings beyond current, new formatting blocks, components, emoji, mentions)
- Changing the menu's visual design (colors, spacing, layout)
- Adding new categories (that's PR #23's job)
- Removing or changing existing items
- Changes to `BubbleMenuBar`, `InlineFormatButtons`, or any other editor UI
- Changes to `JsxComponentView`, `Callout`, or any node view code
- Changes to tests (unless a test is exercising the removed custom Plugin internals, in which case it needs to be rewritten as a Suggestion-based test)
- Changes to core, server, or CLI packages
- Typed component registry (that's PR #23)
- Hover handle, keyboard navigation, error boundaries (that's block-editor-ux spec)
- Schema changes
- Changes to `package.json` beyond adding `@tiptap/suggestion` if needed

### Future Work

These are out of scope for this refactor but become easier to tackle after it lands:

| Item | Why it's easier after this refactor |
|------|------------------------------------|
| PR #23 component items integration | Just register a new source via `SlashCommand.configure({ itemsSources: [...] })` |
| block-editor-ux "+" button | Share `SlashCommandMenu` and `getAllItems()` helper |
| Mentions (`@user`) | New Suggestion instance with `char: '@'` and its own items source |
| Emoji (`:smile:`) | New Suggestion instance with `char: ':'` |
| Wiki-link insertion (`[[page]]`) | Coordinate with PR #42 on whether it shares the same architecture |
| Rich item metadata (badges, hotkeys, subtext) | Already supported via optional `description` field; extend further as needed |

---

## 7. Test Scenarios

### Regression (P0 — must pass after refactor)

| ID | Scenario | Expected |
|----|----------|----------|
| R01 | Type `/` in empty paragraph | Menu opens, all 10 items visible, Heading 1 selected |
| R02 | Type `/heading` | Menu filters to heading items only |
| R03 | Type `/h2` then Enter | Current block becomes H2 |
| R04 | Type `/table` then Enter | 3x3 table inserts with header row |
| R05 | Type some text then ` /bullet` then Enter | Current paragraph becomes bullet list (mid-line trigger works) |
| R06 | Type `/` then Escape | Menu closes, cursor stays where it was |
| R07 | Type `/` then arrow down 3 times | Selection moves to item 4 |
| R08 | Type `/` then click item with mouse | Menu closes, item inserted |
| R09 | Type `/xyz` (no match) | Menu closes (no items to show) |
| R10 | Verify menu ARIA: `role="listbox"`, items have `role="option"` + `aria-selected` | Inspector confirms |
| R11 | Verify category headers render: "Basic blocks" and "Insert" | Visually present |
| R12 | Verify Tailwind classes unchanged on menu wrapper and items | grep or screenshot diff |
| R13 | Scroll into view when navigating past last visible item | Selected item is in viewport |

### Extensibility (P0 — must work for downstream)

| ID | Scenario | Expected |
|----|----------|----------|
| E01 | Pass additional source via `SlashCommand.configure({ itemsSources: [() => slashCommandItems, () => [{name: 'test', label: 'Test Item', category: 'custom', command: () => {}}]] })` | Menu shows all 10 + 1 items, "Custom" shows as category key or label depending on `categoryLabels` |
| E02 | Pass custom `categoryLabels: { custom: 'My Category' }` | Menu shows "My Category" as the group header for custom items |
| E03 | Pass only a custom source (replacing defaults) | Menu shows only the custom items, no formatting blocks |
| E04 | Item command receives `range` parameter | Command can call `editor.chain().deleteRange(range).insertContent(...).run()` |

### Collaborative (P1 — new latent behavior from Suggestion)

| ID | Scenario | Expected |
|----|----------|----------|
| C01 | Two peers in a Y.Doc; peer A types `/` to open menu; peer B's view does NOT open a menu | Suggestion's built-in transaction-origin filtering handles this |
| C02 | Peer A's menu open; peer B types in a different paragraph; peer A's menu stays open | No cross-peer interference |

---

## 8. Delivery

Single PR to main. Target: ~200 lines changed (net), split across 3 files. Reviewable in one sitting.

**Before merging:** verify the rebase path for PR #23 is clean by dry-running it (create a test branch, apply main's refactor, attempt PR #23 rebase, observe conflicts). If conflicts emerge beyond the expected `extensions/slash-commands.tsx` deletion, adjust this spec's scope.

---

## 9. Decision Log

| # | Decision | Resolution | Status | Confidence |
|---|----------|-----------|--------|------------|
| D1 | Foundation: `@tiptap/suggestion` vs custom `Plugin` | **Migrate to `@tiptap/suggestion`.** Community-proven (BlockNote, Docmost, TipTap official examples all use it). Collaborative-editing aware. Smaller bespoke code surface. All of main's current features are reproducible via Suggestion configuration. See `evidence/slash-command-architecture-analysis.md` for the full multi-angle analysis performed in the prior session. | LOCKED | HIGH |
| D2 | Item source API: single const vs config array vs module-level registry | **Config array via `addOptions`.** `SlashCommand.configure({ itemsSources: [...] })`. Standard TipTap extension pattern. Explicit, no module-level mutable state, consumers declare their dependencies at configure time. | LOCKED | HIGH |
| D3 | Category taxonomy: closed union vs open string | **Open string.** Enables PR #23's `content`/`layout`/`media`/`data` without editing this code. Label mapping is extensible via `categoryLabels` option. | LOCKED | HIGH |
| D4 | Category labels: module const vs prop vs option | **Extension option passed as prop to menu.** Consumers configure via `SlashCommand.configure({ categoryLabels: {...} })`. Menu receives it as a prop on every render. No module-level mutable state. | LOCKED | HIGH |
| D5 | Keyboard handling location | **In the menu component via `forwardRef` + `useImperativeHandle`.** Follows TipTap's canonical Suggestion pattern. Separates concerns: extension owns triggering, menu owns its keyboard. | LOCKED | HIGH |
| D6 | Trigger rule preservation: mid-line after whitespace | **Use `startOfLine: false` + `allowedPrefixes: [' ', '\n']`.** Reproduces main's current regex `(?:^|\s)\/([a-z0-9-]*)$` via Suggestion configuration. Verified from TipTap Suggestion API docs. | LOCKED | HIGH |
| D7 | Preserve existing item definitions exactly | **Yes. All 10 items keep their name, label, category, icon, command, aliases.** Zero user-visible behavior change is a P0 success criterion. | LOCKED | HIGH |
| D8 | Add optional `description` field to SlashCommandItem | **Yes.** Not used by main's current items; used by PR #23's component items for subtext. Optional field, no migration cost. | LOCKED | HIGH |
| D9 | Add optional `range` parameter to `command` signature | **Yes.** Main's current items ignore it (they call editor commands that don't care about range). PR #23's component items use it for `deleteRange(range).insertContent(...)`. Optional parameter, no migration cost. | LOCKED | HIGH |

---

## 10. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | `@tiptap/suggestion@3.22.3` is API-compatible with main's `@tiptap/core` + `@tiptap/react` versions | HIGH | Same major version (3.x), monorepo releases together |
| A2 | `allowedPrefixes: [' ', '\n']` with `startOfLine: false` reproduces main's `(?:^|\s)\/([a-z0-9-]*)$` regex behavior | HIGH | Verified from TipTap Suggestion source (`findSuggestionMatch`): when `allowedPrefixes` is set, the match requires the character preceding the trigger to be one of the prefixes (or the start of the parent text). Equivalent to main's `(?:^|\s)` alternation. |
| A3 | `ReactRenderer` inside Suggestion's `render()` callback is the canonical pattern for menu rendering | HIGH | TipTap's official Suggestion example uses exactly this pattern. |
| A4 | PR #23 can be rebased to use `SlashCommand.configure()` without touching its own typed-component-nodes schema work | HIGH | The slash command extension change is orthogonal to the registry/factory/NodeView work. PR #23 already has a `getComponentItems` equivalent; it just needs to be wired into `shared.ts` differently. |
| A5 | Main's existing 10 items' commands (editor.chain().toggleX().run(), insertTable, setHorizontalRule) work identically when called from Suggestion's `command` callback | HIGH | The editor commands are library-level; they don't depend on how the slash command extension triggers them. |

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Suggestion's trigger semantics differ subtly from main's regex in edge cases (IME composition, paste events, code block context) | Low | Medium | Manual QA of the Regression scenarios (R01-R13) covers the common cases. If an edge case emerges, Suggestion's `shouldShow` option provides a fine-grained escape hatch. |
| R2 | forwardRef + useImperativeHandle pattern in the menu doesn't integrate cleanly with ReactRenderer's updateProps lifecycle | Low | Medium | This is the pattern TipTap's official Suggestion example uses. If issues arise, the fallback is to hoist keyboard state into the extension via `PluginKey` metadata (still Suggestion-based, just more plumbing). |
| R3 | PR #23's rebase reveals that the `categoryLabels` option isn't sufficient for its needs (e.g., it needs per-item badges, hotkeys, or nested categories) | Medium | Low | The `description` field is already added for future-proofing. If more fields are needed, they can be added in a follow-up — the architecture is extensible by design. |
| R4 | Module-level `slashCommandItems` const being used as both default option AND re-exported for PR #23 to compose creates import cycles | Low | Low | `items.ts` has no dependency on the extension. The extension imports from `items.ts`. PR #23 would also import from `items.ts`. No cycle. |
| R5 | The refactor accidentally breaks a test that depends on the custom PluginKey state shape | Low | Medium | Grep for `slashCommandKey` usages outside the extension file. If any test imports the key to inspect state, rewrite it to use Suggestion's patterns. |
| R6 | Dropping to `@tiptap/suggestion` as an explicit dependency produces a peer-dep conflict if it's currently transitively installed at a different version | Low | Low | `bun add @tiptap/suggestion@^3.22.3` pins the version. The monorepo already pins all `@tiptap/*` packages to 3.22.3. |

---

## 12. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Should `itemsSources` be an array of functions `(() => Item[])[]` or an array of item arrays `Item[][]`? Function-based is more flexible (dynamic, can access editor state); array-based is simpler. | API design | Medium | **RESOLVED** → Function-based. PR #23's component items are derived from a registry that might change at runtime (hot reload during dev). Static arrays can't handle that. Function-based costs nothing for static sources (`() => [...]`). |
| OQ2 | Should the menu's selected index state live in the extension's PluginKey or in React state inside the menu? | API design | Medium | **RESOLVED** → React state inside the menu via forwardRef. Matches TipTap's canonical pattern. Keeps extension simple. |
| OQ3 | Should `categoryLabels` merge with defaults or replace them? | API design | Low | **RESOLVED** → Merge. Default options include `{ basic, insert }`; consumers passing additional labels should have theirs merged in, not replace the defaults. Implement via object spread in `addOptions` or in the menu's label lookup. |
| OQ4 | Should items have explicit ordering (sort key) or rely on registration order? | API design | Low | **OPEN for P0** → Registration order. Simpler. If PR #23 needs to intersperse component items with formatting items (e.g., put Callout next to Quote), add a sort key field in a follow-up. |
| OQ5 | Should the extension expose its `PluginKey` for external state inspection? | API | Low | **OPEN for P0** → No. Internal. If an external consumer needs menu state, use Suggestion's own pluginKey introspection. |

---

## 13. Agent Constraints

**SCOPE:**
- `packages/app/src/editor/extensions/slash-command.ts`
- `packages/app/src/editor/slash-command/items.ts`
- `packages/app/src/editor/slash-command/SlashCommandMenu.tsx`
- `packages/app/package.json` (only to add `@tiptap/suggestion` if not already present)
- `bun.lock` (only as a side-effect of dependency install)

**EXCLUDE:** All other files in the repo. Specifically:
- No changes to `packages/core/`, `packages/server/`, `packages/cli/`
- No changes to other `packages/app/src/editor/` files (extensions/jsx-component.ts, components/, bubble-menu/, etc.)
- No test additions or deletions unless a test breaks because of the refactor
- No new files outside the SCOPE list

**STOP_IF:**
- Any regression test scenario (R01-R13) fails after the refactor
- Any existing unit test breaks and rewriting it requires changing the test's assertion semantics
- `@tiptap/suggestion` introduces a peer-dep conflict
- The forwardRef + useImperativeHandle pattern produces React warnings about stale closures or detached refs
- Manual QA reveals a behavior difference between the custom Plugin and Suggestion foundations
- PR #23 rebase dry-run reveals unexpected conflicts (not just the expected `slash-commands.tsx` deletion)

**ASK_FIRST:**
- If the menu's visual design needs adjustment to accommodate the `description` field layout (not needed for main's current items, only for PR #23's components)
- If an existing test references `slashCommandKey` as a PluginKey and needs to be rewritten non-trivially
- If migrating to `forwardRef` + `useImperativeHandle` conflicts with React Compiler expectations (this codebase uses React Compiler; the block-editor-ux spec notes that `useMemo`/`useCallback`/`forwardRef`/`memo` are discouraged — so `useImperativeHandle` might need an alternative pattern)

---

## 14. Key Research References

| Source | Relevance |
|--------|-----------|
| `reports/block-editor-component-ux-patterns/REPORT.md` | Deep research on 30+ editors' slash command patterns. BlockNote, Docmost, TipTap official examples all use `@tiptap/suggestion`. |
| `reports/block-editor-component-ux-patterns/evidence/d4-block-insertion-ux.md` | Cross-editor comparison of slash command insertion UX |
| [TipTap Suggestion utility docs](https://tiptap.dev/docs/editor/api/utilities/suggestion) | Official API reference for the foundation |
| [TipTap Slash Commands example](https://tiptap.dev/docs/examples/experiments/slash-commands) | Canonical pattern for Suggestion-based slash commands |
| [BlockNote slash command source](https://deepwiki.com/TypeCellOS/BlockNote/2.2-prosemirror-and-tiptap-integration) | Reference implementation at production scale |
| `specs/2026-04-10-block-editor-ux/SPEC.md` (in the block-editor-ux worktree) | Downstream consumer of this refactor — references the unified architecture for its "+" button |
| PR #23 (typed-component-nodes, OPEN) | Downstream consumer that will rebase on this work |
| PR #37 (table support, merged 2026-04-10) | The PR that added main's current slash command — the starting point this refactor builds from |

---

## 15. Rebase Path Diagram (for downstream consumers)

```
Today:
    origin/main ────────────────────► [refactor: generalize slash command]
                                       │
                                       ▼
                              spec/slash-command-generalization
                                       │
                                       │ merge to main
                                       ▼
    origin/main (+ generalized slash) ───────────┐
                                                  │
                                                  ├──► PR #23 (typed-component-nodes)
                                                  │    rebases here:
                                                  │    - DELETES its slash-commands.tsx (~164 lines)
                                                  │    - DELETES its components/SlashCommandMenu.tsx (~184 lines)
                                                  │    - ADDS slash-command/component-items.ts (~40 lines)
                                                  │    - UPDATES extensions/shared.ts (~10 lines — configure SlashCommand with component source)
                                                  │    - Keeps all its core/registry/, factory, NodeView work unchanged
                                                  │
                                                  └──► block-editor-ux spec (this session)
                                                       updates §3.3 to reference the unified items source
                                                       "+" button imports getAllItems() from slash-command/items.ts
                                                       "+" button reuses SlashCommandMenu for rendering
```

After this refactor merges:
- Main has a cleaner, library-based slash command architecture
- PR #23's merge conflict with main is reduced from "two extensions, incompatible" to "just add a source"
- block-editor-ux spec's "+" button has a well-defined extension point to plug into
- Future work (mentions, emoji, wiki-links) has a template to follow (new Suggestion instance + registered items source)
