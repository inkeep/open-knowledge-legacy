# SPEC: Slash Command Generalization

**Status:** Draft
**Created:** 2026-04-10
**Baseline commit:** 748f63e (origin/main head; rebased from 8f291ac during /ship Phase 0)
**Baseline delta from original spec:** PR #48 "Slash command polish" landed after this spec was written. It adds `@floating-ui/dom@^1.7.6` and rewrites positioning to use `computePosition` + `autoUpdate` + `flip`/`offset`/`size` middleware. It introduces a `--suggestion-menu-max-height` CSS variable driven by the `size` middleware and consumed by `SlashCommandMenu.tsx` (inline style `maxHeight: var(--suggestion-menu-max-height, 40vh)`). PR #43 "Fix per-document observer typing state" also landed; not relevant to slash command. **The refactor MUST preserve all Floating UI positioning behavior** — virtual element pattern, `contextElement` scroll-ancestor detection, `autoUpdate` lifecycle, dynamic max-height CSS variable. The §3.1 target code below is updated accordingly.
**Implementer:** AI coding agent (Claude Code)
**Location:** `packages/app/src/editor/` only — `extensions/slash-command.ts`, `slash-command/items.ts`, `slash-command/SlashCommandMenu.tsx`
**Nature:** Architectural refactor on main to unblock two downstream branches (PR #23 typed-component-nodes, and block-editor-ux spec) that both need to extend the slash command with additional item sources. Pure view-layer change with zero user-visible behavior regression.
**Target PR:** Direct to main. Small, focused, reviewable in one sitting.

**Pace:** Fast. Single-phase refactor. No new user-facing features, no schema changes, no tests break. The goal is to open up existing code, not add new code.

---

## 1. Problem Statement (SCR)

**Situation:** Main's editor has a working slash command menu (PR #37) that handles 10 formatting items across two categories (`basic`: headings/lists/quote/code, `insert`: table/separator). Implementation: custom ProseMirror Plugin with a hardcoded `slashCommandItems` array, trigger regex `/(?:^|\s)\/([a-z0-9-]*)$/i` (mid-line capable, case-insensitive via the `/i` flag), and a category-grouped React menu with Tailwind styling and ARIA roles. Keyboard handling includes Tab as an alias for Enter (line 111 of slash-command.ts).

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

### Tertiary: Collaborative-editing safety (available, not automatic)
The migration to `@tiptap/suggestion` makes collaborative-editing awareness **available as an optional configuration**, which main's custom Plugin lacks entirely.

- `@tiptap/suggestion` exposes a `shouldShow` callback that runs on transactions where the plugin finds a valid match (NOT on every transaction — it's a filter on matches, not a global interceptor).
- The canonical pattern for collaborative filtering is: check if the transaction originated from `y-prosemirror` sync via `isChangeOrigin` helper (from `@tiptap/extension-collaboration`), and return `false` to suppress the menu.
- **This is not configured in the target code for this spec.** Collaborative awareness is _available_ after the migration, but gating it requires an explicit `shouldShow` implementation that this refactor does NOT include.
- Downstream consumers (PR #23, block-editor-ux, future mentions/emoji extensions) can opt into collaborative filtering if they encounter the edge case.

Framing: "migration unlocks collaborative filtering as a configurable option" — NOT "migration brings it for free." The current scope does not include validation or configuration of the collaborative path; tests C01-C02 are moved to Future Work.

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

**Target (updated for 748f63e baseline with Floating UI):**

```ts
import { autoUpdate, computePosition, flip, offset, size } from '@floating-ui/dom';
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

        // Preserve main's current trigger behavior: start of block OR after whitespace.
        // Main's regex is /(?:^|\s)\/([a-z0-9-]*)$/i (note the /i flag — case-insensitive).
        // @tiptap/suggestion's default `allowedPrefixes: [' ']` + `startOfLine: false`
        // matches "after space" and "at start of block" (position 0 is always allowed
        // regardless of allowedPrefixes). Implementation must verify that start-of-block
        // triggering works; if not, fallback is `allowedPrefixes: null` with a manual
        // character-class filter in `items()`.
        startOfLine: false,
        // allowedPrefixes defaults to [' '] — we accept the default.

        // Dynamic items from all registered sources
        items: ({ query }) => {
          const allItems = extension.options.itemsSources.flatMap((source) => source());
          return filterItems(allItems, query);
        },

        // Extension ALWAYS deletes the trigger range first, then runs the item command.
        // This matches main's current behavior (slash-command.ts:116-119) and ensures
        // existing items don't need to know about the range. PR #23 component items
        // can just call `insertContent()` — the range is already deleted.
        command: ({ editor, range, props: item }) => {
          editor.chain().focus().deleteRange(range).run();
          item.command(editor);
        },

        // ReactRenderer-based popup (replaces the custom view() lifecycle).
        // Positioning uses @floating-ui/dom (from PR #48 polish) — preserved.
        // Keyboard state lives in closure variables — no React ref, no useImperativeHandle.
        // The menu component is a pure render function receiving selectedIndex as a prop.
        render: () => {
          let renderer: ReactRenderer | null = null;
          let popup: HTMLDivElement | null = null;
          let currentProps: {
            items: SlashCommandItem[];
            query: string;
            command: (item: SlashCommandItem) => void;
            clientRect: (() => DOMRect | null) | null;
            editor: Editor;
          } | null = null;
          let selectedIndex = 0;
          let stopAutoUpdate: (() => void) | null = null;

          // Virtual reference element — always reflects current cursor position via
          // Suggestion's clientRect callback. `contextElement` lets Floating UI's
          // autoUpdate find scroll ancestors (e.g. the overflow-y-auto editor
          // container) so the menu repositions on inner-container scroll.
          const virtualEl = {
            getBoundingClientRect: () => currentProps?.clientRect?.() ?? new DOMRect(),
            get contextElement() {
              return currentProps?.editor.view.dom;
            },
          };

          const doPosition = () => {
            if (!popup) return;
            computePosition(virtualEl, popup, {
              placement: 'bottom-start',
              middleware: [
                offset(4),
                flip(),
                size({
                  apply({ availableHeight }) {
                    if (popup) {
                      popup.style.setProperty(
                        '--suggestion-menu-max-height',
                        `${Math.min(availableHeight, window.innerHeight * 0.4)}px`,
                      );
                    }
                  },
                }),
              ],
            })
              .then(({ x, y }) => {
                if (popup) {
                  popup.style.left = `${x}px`;
                  popup.style.top = `${y}px`;
                }
              })
              .catch(() => {
                // Position calc failed (detached element during rapid state changes) — menu will be destroyed shortly
              });
          };

          const rerender = () => {
            if (!renderer || !currentProps) return;
            renderer.updateProps({
              items: currentProps.items,
              query: currentProps.query,
              selectedIndex,
              categoryLabels: extension.options.categoryLabels,
              onSelect: currentProps.command,
            });
          };

          return {
            onStart(props) {
              currentProps = props;
              selectedIndex = 0;

              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '50';
              document.body.appendChild(popup);

              renderer = new ReactRenderer(SlashCommandMenu, {
                props: {
                  items: props.items,
                  query: props.query,
                  selectedIndex,
                  categoryLabels: extension.options.categoryLabels,
                  onSelect: props.command,
                },
                editor: props.editor,
              });
              popup.appendChild(renderer.element);
              stopAutoUpdate = autoUpdate(virtualEl, popup, doPosition);
              doPosition();
            },

            onUpdate(props) {
              currentProps = props;
              // Clamp selected index if the items list shrank
              selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
              rerender();
              doPosition();
            },

            onKeyDown({ event }) {
              if (!currentProps || currentProps.items.length === 0) return false;
              const items = currentProps.items;

              if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % items.length;
                rerender();
                return true;
              }
              if (event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                rerender();
                return true;
              }
              // Tab is an alias for Enter (matches main's current behavior — do not remove)
              if (event.key === 'Enter' || event.key === 'Tab') {
                const item = items[selectedIndex];
                if (item) currentProps.command(item);
                return true;
              }
              if (event.key === 'Escape') {
                return false; // Suggestion's default Escape handling closes the menu
              }
              return false;
            },

            onExit() {
              stopAutoUpdate?.();
              stopAutoUpdate = null;
              renderer?.destroy();
              renderer = null;
              popup?.remove();
              popup = null;
              currentProps = null;
              selectedIndex = 0;
            },
          };
        },
      }),
    ];
  },
});
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
  command: (editor: Editor) => void;  // UNCHANGED from main — range deletion happens in extension
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
- `SlashCommandItem.command` signature **unchanged** — `(editor: Editor) => void`. Range deletion is handled by the extension's Suggestion `command` callback before the item command runs (matches main's current behavior). This eliminates the need for items to know about the range and prevents the "forgot to delete the slash text" regression.
- Add optional `description?: string` field for future subtext rendering. No behavior change today; used by PR #23's component items.

All 10 existing items keep their current definitions. Zero behavior change.

**PR #23 implication:** PR #23's component items currently do `editor.chain().focus().deleteRange(range).insertContent(...).run()`. After the refactor, they become `editor.chain().focus().insertContent(...).run()` — the `deleteRange` is handled by the extension. Simpler items, no custom range handling needed.

### 3.3 Update menu to read category labels from props

**Current (`packages/app/src/editor/slash-command/SlashCommandMenu.tsx` at 748f63e):**

```tsx
const categoryLabels: Record<string, string> = {
  basic: 'Basic blocks',
  insert: 'Insert',
};

// ... inside the return:
<div
  ref={containerRef}
  role="listbox"
  aria-label="Slash commands"
  className="w-56 overflow-y-auto subtle-scrollbar rounded-lg border bg-popover p-1 shadow-md"
  style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}
>
```

**Target:**

```tsx
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
  // PRESERVE the inline `style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}`
  // and the `overflow-y-auto subtle-scrollbar` classes exactly — driven by the extension's
  // Floating UI `size` middleware.
}
```

**Menu stays a pure render function.** No refs, no imperative handles, no internal state. Keyboard handling lives in the extension's `render().onKeyDown` callback (see §3.1 target code) — the callback holds `selectedIndex` in a closure variable and calls `renderer.updateProps({ selectedIndex })` when it changes. The menu simply receives `selectedIndex` as a prop and renders accordingly.

**Why closure-based keyboard handling (not forwardRef + useImperativeHandle):**
- React Compiler is enabled in this repo (`AGENTS.md:202`: "Do not add `forwardRef`, `memo`, `useMemo`, or `useCallback`"). `forwardRef` is explicitly forbidden.
- The React 19 ref-as-prop pattern with `useImperativeHandle` is technically allowed (see `TiptapEditor.tsx:379`), but it's overkill for a short-lived popup menu where the extension already owns the render lifecycle.
- Suggestion's `render()` callback IS the natural coordination point. Keeping keyboard state there matches main's current pattern (main's custom Plugin holds keyboard state in PluginKey state, updated via `handleKeyDown`; our closure is analogous but in Suggestion's render lifecycle).
- The menu component becomes trivially testable — pure props in, DOM out. No React state to mock.

**Result:** Menu component has ~5 line delta (add `categoryLabels` to props, replace module const). Extension adds ~30 lines for the closure-based keyboard logic. Net change: ~35 lines added vs main.

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

1. **Update `slash-command/items.ts`**: Open the `category` type to `string`, add optional `description` field. All 10 existing items continue to compile. Item signature stays `(editor: Editor) => void` per D9.
2. **Update `slash-command/SlashCommandMenu.tsx`**: Accept `categoryLabels` as a prop, remove the module-level const. **Preserve** the inline `style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh) }}` and `overflow-y-auto subtle-scrollbar` classes (driven by PR #48 Floating UI size middleware). Menu stays a pure render function per D5.
3. **Rewrite `extensions/slash-command.ts`**: Replace custom Plugin with `Suggestion(...)` config. Pass `itemsSources` and `categoryLabels` via `addOptions`. Move positioning logic into `render()` lifecycle. **Preserve** the Floating UI integration from PR #48: `computePosition` + `autoUpdate` + `flip`/`offset`/`size` middleware, via a virtual element pattern that reads `props.clientRect()` from the Suggestion callback (instead of `posToDOMRect`). Delete the old PluginKey state machine.
4. **Install `@tiptap/suggestion@^3.22.3`** via `bun add @tiptap/suggestion@^3.22.3 --filter @inkeep/open-knowledge-app` (from repo root) or `bun add @tiptap/suggestion@^3.22.3` from `packages/app/`.
5. **Verify `shared.ts`** unchanged (still imports `SlashCommand`). Zero call-site changes for consumers.
6. **Manual QA** the checklist above — especially R01 (start-of-block trigger) and positioning regression tests.

---

## 5. Tech Stack

### New Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@tiptap/suggestion@^3.22.3` | Foundation for the slash command menu | **NEW dependency — must be explicitly added.** Verified NOT in `bun.lock` (zero matches). Verified NOT installed in `node_modules`. No currently-installed `@tiptap/*` package depends on it transitively. Zero transitive dependencies itself; part of the TipTap monorepo version-locked to the same major as `@tiptap/core@3.22.3` already in use. Install via `bun add @tiptap/suggestion@^3.22.3`. |

### Existing (unchanged)

- `@tiptap/core`, `@tiptap/react`, `@tiptap/pm/state` — all still used
- `@floating-ui/dom@^1.7.6` — positioning (added by PR #48); **preserved** via `computePosition` + `autoUpdate` + `flip`/`offset`/`size` middleware wired into Suggestion's `render()` lifecycle
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
| R01 | Type `/` in empty paragraph | Menu opens, all 10 items visible, first item selected. **Critical test** — validates start-of-block triggering with default `allowedPrefixes: [' ']`. If this fails, the implementation must switch to `allowedPrefixes: null` + manual filter. |
| R02 | Type `/heading` | Menu filters to heading items only |
| R03 | Type `/h2` then Enter | Current block becomes H2 (no `/h2` trigger text remaining) |
| R04 | Type `/table` then Enter | 3x3 table inserts with header row (no `/table` trigger text remaining) |
| R05 | Type some text then ` /bullet` then Enter | Current paragraph becomes bullet list (mid-line trigger after whitespace works). No `/bullet` remnant. |
| R06 | Type `/` then Escape | Menu closes, cursor stays where it was, `/` character remains as typed |
| R07 | Type `/` then arrow down 3 times | Selection moves to item 4 (visible via `aria-selected` and `data-selected` attributes) |
| R08 | Type `/` then click item with mouse | Menu closes, item inserted, trigger range deleted |
| R09 | Type `/xyz` (no match) | Menu closes (no items to show). `/xyz` text remains in editor. |
| R10 | Verify menu ARIA: `role="listbox"`, items have `role="option"` + `aria-selected` | Inspector confirms |
| R11 | Verify category headers render: "Basic blocks" and "Insert" | Visually present, matching main's current layout |
| R12 | Verify Tailwind classes unchanged on menu wrapper and items | Screenshot diff vs main's current menu |
| R13 | Scroll into view when navigating past last visible item | Selected item is in viewport |
| R14 | **Tab key inserts** — Type `/h2` then **Tab** (not Enter) | Current block becomes H2. Main currently treats Tab as Enter alias at `slash-command.ts:111`. Regression if omitted. |
| R15 | **Case-insensitive trigger** — Type `/HEADING` | Menu shows heading items. Main is already case-insensitive via regex `/i` flag + `filterItems` lowercase. |
| R16 | **Rapid insert** — Type `/` then Enter immediately (before menu visibly renders) | First item inserts. No stale trigger text left behind. |
| R17 | **Delete range verification** — After any insertion, search for remaining `/query` text in the document | None found. All insertions replace the trigger range. |

### Extensibility (P0 — must work for downstream)

| ID | Scenario | Expected |
|----|----------|----------|
| E01 | Pass additional source via `SlashCommand.configure({ itemsSources: [() => slashCommandItems, () => [{name: 'test', label: 'Test Item', category: 'custom', command: () => {}}]] })` | Menu shows all 10 + 1 items, "Custom" shows as category key or label depending on `categoryLabels` |
| E02 | Pass custom `categoryLabels: { custom: 'My Category' }` | Menu shows "My Category" as the group header for custom items |
| E03 | Pass only a custom source (replacing defaults) | Menu shows only the custom items, no formatting blocks |
| E04 | Item command receives `range` parameter | Command can call `editor.chain().deleteRange(range).insertContent(...).run()` |

### Collaborative — DEFERRED TO FUTURE WORK

Collaborative filtering is **NOT** configured in this refactor. `@tiptap/suggestion`'s `shouldShow` callback is available for downstream consumers who need it, but no `shouldShow` implementation ships with this spec. A follow-up can add `shouldShow: isChangeOrigin(/* ... */)` if multi-client slash command bugs surface.

Tests previously numbered C01-C02 moved to Future Work.

---

## 8. Delivery

Single PR to main. Target: ~200 lines changed (net), split across 3 files. Reviewable in one sitting.

### Pre-merge verification checklist

**1. PR #23 rebase dry-run (15 min, mandatory):**
Create a throwaway branch `rebase-dryrun/pr-23-on-slash-refactor` by merging this refactor's branch into origin/main, then rebasing PR #23 (worktree-typed-component-nodes) onto that. Observe:
- Are the only conflicts in `packages/app/src/editor/extensions/slash-commands.tsx`, `packages/app/src/editor/components/SlashCommandMenu.tsx`, and `packages/app/src/editor/extensions/shared.ts`?
- Does the expected delta (~50 lines added, ~350 deleted) hold within ±100 lines?
- If unexpected entanglement emerges (shared type exports, test imports, etc.), adjust this spec's scope before merging.

**2. Manual QA regression sweep (30 min, mandatory):**
Run all R01-R17 scenarios against the refactored branch. R01 and R14 are critical — failures require implementation adjustments before merging (not post-merge fixes).

**3. Governance (10 min, mandatory):**
Tag the PR #37 author (who authored the feature being refactored) as a required reviewer. This is a social/collaboration consideration — rewriting a contributor's code the day after their PR merges is a signal that warrants explicit communication. Include a note in the PR description explaining: (a) this is an unblocking refactor for two downstream branches, (b) zero user-visible behavior change, (c) the analysis that led to the refactor (link to this spec + evidence file).

### Merge order
1. This refactor merges first → main
2. PR #23 rebases on updated main, merges second
3. block-editor-ux spec rebases on (main + PR #23), ships third

---

## 9. Decision Log

| # | Decision | Resolution | Status | Confidence |
|---|----------|-----------|--------|------------|
| D1 | Foundation: `@tiptap/suggestion` vs custom `Plugin` | **Migrate to `@tiptap/suggestion`.** Community-proven (BlockNote, Docmost, TipTap official examples all use it). Collaborative-editing aware. Smaller bespoke code surface. All of main's current features are reproducible via Suggestion configuration. See `evidence/slash-command-architecture-analysis.md` for the full multi-angle analysis performed in the prior session. | LOCKED | HIGH |
| D2 | Item source API: single const vs config array vs module-level registry | **Config array via `addOptions`.** `SlashCommand.configure({ itemsSources: [...] })`. Standard TipTap extension pattern. Explicit, no module-level mutable state, consumers declare their dependencies at configure time. | LOCKED | HIGH |
| D3 | Category taxonomy: closed union vs open string | **Open string.** Enables PR #23's `content`/`layout`/`media`/`data` without editing this code. Label mapping is extensible via `categoryLabels` option. | LOCKED | HIGH |
| D4 | Category labels: module const vs prop vs option | **Extension option passed as prop to menu.** Consumers configure via `SlashCommand.configure({ categoryLabels: {...} })`. Menu receives it as a prop on every render. No module-level mutable state. | LOCKED | HIGH |
| D5 | Keyboard handling location | **In the extension's `render().onKeyDown` callback via closure variables.** Menu stays a pure render function receiving `selectedIndex` as a prop. Rationale: (1) React Compiler forbids `forwardRef` per AGENTS.md:202. (2) `useImperativeHandle` + ref-as-prop is allowed but overkill for a short-lived popup. (3) Closure-based matches main's current menu pattern (menu is already a pure render function taking `selectedIndex` as prop). (4) Keyboard state in `render()` mirrors main's state-in-PluginKey pattern — same architecture, different runtime. | LOCKED | HIGH |
| D6 | Trigger rule preservation: mid-line after whitespace | **Use `startOfLine: false` + accept Suggestion's default `allowedPrefixes: [' ']`.** Suggestion's default behavior triggers after space OR at position 0 of a block (start-of-block is always allowed when `startOfLine: false` regardless of allowedPrefixes — needs implementation verification). Main's regex `(?:^|\s)\/([a-z0-9-]*)$/i` is effectively equivalent: `\s` matches space in practice for editor text nodes (no `\n` or tab in ProseMirror text). The `/i` flag makes main's regex case-insensitive; Suggestion passes the raw query to `items()` where `filterItems()` lowercases both sides — end-to-end case-insensitive preserved. | LOCKED | MEDIUM (flagged for implementation verification of start-of-block behavior) |
| D7 | Preserve existing item definitions exactly | **Yes. All 10 items keep their name, label, category, icon, command, aliases.** Zero user-visible behavior change is a P0 success criterion. | LOCKED | HIGH |
| D8 | Add optional `description` field to SlashCommandItem | **Yes.** Not used by main's current items; used by PR #23's component items for subtext. Optional field, no migration cost. | LOCKED | HIGH |
| D9 | ~~Add optional `range` parameter to `command` signature~~ | **REMOVED — not needed.** Item signature stays `(editor: Editor) => void`, unchanged from main. The extension's Suggestion `command` callback handles `deleteRange(range)` BEFORE calling the item command — matches main's current behavior at `slash-command.ts:116-119`. PR #23's component items adapt: remove their own `deleteRange(range)` call (the extension handles it). Caught by challenger Finding 1: original D9 would have caused a catastrophic regression where existing items left the slash trigger text in the document. | LOCKED | HIGH |
| D10 | Tab key as Enter alias | **Preserved.** Main's current code at `slash-command.ts:111` handles Tab identically to Enter (inserts selected item). The closure-based `onKeyDown` in §3.1 preserves this (`event.key === 'Enter' || event.key === 'Tab'`). Missing this would be a silent regression. | LOCKED | HIGH |

---

## 10. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|-------------|
| A1 | `@tiptap/suggestion@^3.22.3` is API-compatible with main's `@tiptap/core@3.22.3` and `@tiptap/react@3.22.3` | HIGH | Same major version, released together from the TipTap monorepo. No peer-dep conflict expected. |
| A2 | Suggestion's default `allowedPrefixes: [' ']` + `startOfLine: false` triggers at start-of-block AND after whitespace | MEDIUM | `allowedPrefixes` is confirmed to exist from TipTap docs. Start-of-block behavior (triggering when there's no preceding character at position 0 of a block) is assumed to be allowed but has NOT been verified from `@tiptap/suggestion` source. **Implementation must test:** type `/` in an empty paragraph → menu opens. If it fails, fallback is `allowedPrefixes: null` (allow anywhere) + a manual character-class filter in `items()` that checks the character immediately before the trigger. |
| A3 | `ReactRenderer` inside Suggestion's `render()` callback is the canonical pattern for menu rendering | HIGH | TipTap's official Suggestion example uses exactly this pattern. |
| A4 | PR #23 can be rebased to use `SlashCommand.configure()` without touching its own typed-component-nodes schema work | MEDIUM | The slash command extension change is orthogonal to the registry/factory/NodeView work. PR #23 already has a `getComponentItems`-equivalent function. Estimated delta: ~50 lines added (component items source), ~350 lines deleted (old slash command + menu). **NOT verified by dry-run rebase yet.** See §8 Delivery — should verify before merging this refactor. |
| A5 | Main's existing 10 items' commands (editor.chain().toggleX().run(), insertTable, setHorizontalRule) work identically when called from Suggestion's `command` callback after the extension has run `deleteRange(range)` | HIGH | The editor commands are library-level and operate on the current selection. Pre-deleting the range leaves the cursor at the deletion point, where the item command then runs. Matches main's current pattern at `slash-command.ts:116-119`. |
| A6 | `useImperativeHandle` is forbidden by React Compiler — **REFUTED** | — | False. `AGENTS.md:202` forbids only `forwardRef`, `memo`, `useMemo`, `useCallback`. `useImperativeHandle` is allowed and is already used in `packages/app/src/editor/TiptapEditor.tsx:379`. However, we still go with closure-based keyboard handling per D5 because it's simpler for this specific use case (short-lived popup menu), not because `useImperativeHandle` is forbidden. |

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Suggestion's trigger semantics differ from main's regex in edge cases (IME composition, paste events, non-breaking spaces, start-of-block at position 0) | Medium | Medium | Manual QA of the Regression scenarios (R01-R14) covers the common cases. Specifically R01 validates start-of-block triggering. If R01 fails, fallback is `allowedPrefixes: null` + character-class filter in `items()`. |
| R2 | PR #23's rebase reveals that the `categoryLabels` option or item source API is insufficient (e.g., needs per-item badges, hotkeys, or nested categories) | Low | Low | The `description` field is already added for future-proofing. If more fields are needed, they can be added in a follow-up — the architecture is extensible by design. |
| R3 | Module-level `slashCommandItems` const being used as both default option AND re-exported for PR #23 to compose creates import cycles | Low | Low | `items.ts` has no dependency on the extension. The extension imports from `items.ts`. PR #23 would also import from `items.ts`. No cycle. |
| R4 | Range deletion timing: if the item command runs before `deleteRange` completes, the item operates on stale document state | Low | High | The target code uses `editor.chain().focus().deleteRange(range).run()` which completes synchronously, THEN `item.command(editor)` runs. No race. Confirmed against main's existing pattern at `slash-command.ts:116-119`. |
| R5 | **REMOVED** — the original R5 described breaking tests dependent on `slashCommandKey` state. Verified via grep that no test files reference `slashCommandKey` or `SlashCommand` on main. Zero-probability risk. |
| R6 | Suggestion's default `allowedPrefixes: [' ']` does not trigger at start-of-block, causing regression on empty paragraphs | Medium | High | R01 test scenario explicitly validates this. If the test fails, switch to `allowedPrefixes: null` + manual filter in `items()` that checks the preceding character (or lack thereof) before returning matches. See A2. |
| R7 | PR #23's rebase reveals unexpected entanglement with other shared state (type exports, test infrastructure) beyond the two files mentioned | Low | Medium | Dry-run rebase before merging this refactor — see §8 Delivery. If entanglement emerges, adjust scope or sequence. |

---

## 12. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Should `itemsSources` be an array of functions `(() => Item[])[]` or an array of item arrays `Item[][]`? Function-based is more flexible (dynamic, can access editor state); array-based is simpler. | API design | Medium | **RESOLVED** → Function-based. PR #23's component items are derived from a registry that might change at runtime (hot reload during dev). Static arrays can't handle that. Function-based costs nothing for static sources (`() => [...]`). |
| OQ2 | Should the menu's selected index state live in the extension's PluginKey or in React state inside the menu? | API design | Medium | **RESOLVED** → React state inside the menu via forwardRef. Matches TipTap's canonical pattern. Keeps extension simple. |
| OQ3 | Should `categoryLabels` merge with defaults or replace them? | API design | Low | **RESOLVED** → Merge. Default options include `{ basic, insert }`; consumers passing additional labels should have theirs merged in, not replace the defaults. Implement via object spread in `addOptions` or in the menu's label lookup. |
| OQ4 | Should items have explicit ordering (sort key) or rely on registration order? | API design | Low | **OPEN for P0** → Registration order. Simpler. If PR #23 needs to intersperse component items with formatting items (e.g., put Callout next to Quote), add a sort key field in a follow-up. |
| OQ5 | Should the extension expose its `PluginKey` for external state inspection? | API | Low | **OPEN for P0** → No. Internal. If an external consumer needs menu state, use Suggestion's own pluginKey introspection. |
| OQ6 | Does Suggestion's default `allowedPrefixes: [' ']` trigger at position 0 of an empty block? | Technical | P0 | **OPEN — implementation must verify via test R01.** If it fails, fallback is `allowedPrefixes: null` + manual character-class filter in `items()` that checks the character preceding the trigger (or its absence). Added as assumption A2 with MEDIUM confidence. |

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
