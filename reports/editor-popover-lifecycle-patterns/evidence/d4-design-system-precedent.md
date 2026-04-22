---
title: D4 — Design System / Component Library Precedent on Popover Open State
type: evidence
created: 2026-04-21
sources:
  - https://www.radix-ui.com/primitives/docs/components/popover
  - https://ariakit.com/components/popover
  - https://ariakit.com/reference/use-popover-store
  - https://react-aria.adobe.com/Popover
  - https://react-aria.adobe.com/useOverlayTriggerState (via WebSearch confirmation)
  - https://ui.shadcn.com/docs/components/popover
  - https://atlassian.design/components/popup/examples (limited — content not served to WebFetch)
  - GitHub issue tracker: radix-ui/primitives (search: "popover multiple open", "popover stacking")
---

## Scope

Six canonical design-system / primitive libraries: Radix UI, Ariakit, React Aria, Shadcn UI, Atlassian Design System, and for contrast Tiptap's own Popover primitive (shipped alongside the LinkPopover UI component). Focus: how do these libraries model "is this popover open?" as state, and do they have any precedent / warning about coordinating multiple simultaneously-open popovers?

## Key URLs

- Radix Popover: https://www.radix-ui.com/primitives/docs/components/popover
- Ariakit Popover: https://ariakit.com/components/popover
- Ariakit Popover Store: https://ariakit.com/reference/use-popover-store
- React Aria Popover: https://react-aria.adobe.com/Popover
- React Aria useOverlayTriggerState: https://react-spectrum.adobe.com/react-stately/useOverlayTriggerState.html
- Shadcn Popover (thin wrapper over Radix): https://ui.shadcn.com/docs/components/popover
- Tiptap Popover primitive (for comparison): https://tiptap.dev/docs/ui-components/primitives/popover
- Radix issue search: https://github.com/radix-ui/primitives/issues?q=popover+multiple+open
- Radix issue search: https://github.com/radix-ui/primitives/issues?q=popover+stacking

## Findings

### Radix UI Popover — Boolean, default component-local, controlled OR uncontrolled  ·  CONFIRMED

API (from docs):

| Prop | Type | Default |
|---|---|---|
| `defaultOpen` | `boolean` | — |
| `open` | `boolean` | — |
| `onOpenChange` | `(open: boolean) => void` | — |

- Open state is a **single boolean**.
- Uncontrolled path: `defaultOpen` seeds internal state; component owns it.
- Controlled path: parent supplies `open` + `onOpenChange`; state lives wherever the parent puts it.
- No warnings / guidance on coordinating multiple simultaneously-open popovers — the docs don't address it.
- Shadcn is a thin Radix wrapper and explicitly defers ("See the Radix UI Popover documentation") — same model, no new guidance.

### Ariakit Popover — Store-based, built-in cross-popover sync primitive  ·  CONFIRMED

API (from reference):
- `usePopoverStore()` / `PopoverProvider` externalize state into a dedicated store.
- Store surface: `open` (boolean), `setOpen`, `show()`, `hide()`, `toggle()`, `getState()`, `setState()`.
- Ariakit is the **only** surveyed library that defines an explicit multi-popover sync primitive:

  > `popover` (prop) — "A reference to another popover store that's controlling another popover to keep them in sync."
  > `disclosure` (prop) — "A reference to another disclosure store that controls another disclosure component to keep them in sync. Element states like `contentElement` and `disclosureElement` won't be synced."

- Inference: multiple independent PopoverStore instances are first-class; sync between them is opt-in, but isolation is the default. This is the strongest primitive in the sample for an editor that wants per-chip popovers with optional orchestration.
- No explicit anti-pattern documented.

### React Aria Popover — Boolean via `useOverlayTriggerState`, state-hook-first architecture  ·  CONFIRMED

API:
- `isOpen: boolean | undefined` (controlled)
- `defaultOpen: boolean | undefined` (uncontrolled)
- `onOpenChange: (isOpen: boolean) => void`
- Dedicated state hook `useOverlayTriggerState` returns `{ isOpen, open(), close(), toggle(), setOpen() }` — mirrors Ariakit's store semantics but as a React Hook instead of a Zustand-like store.
- `DialogTrigger` composes this internally by default; `Popover` can also be used standalone with `triggerRef` for custom trigger semantics. Docs: *"triggerRef … It is only required when used standalone."*
- Multi-open: no explicit guidance. Architecturally supported — each `DialogTrigger` / `Popover` instance has its own `useOverlayTriggerState`.
- "Implies developer responsibility for preventing unintended overlaps" (inferred from absence of explicit coordination primitive).

### Shadcn UI Popover — Wrapper, no new state model  ·  CONFIRMED

- Docs verbatim: *"See the Radix UI Popover documentation."*
- Only structural components exported: `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription`.
- No composition guidance for multi-open scenarios in shadcn's own docs.

### Atlassian Design System — Popup: controlled-only  ·  CONFIRMED (via indirect; direct fetch returned only nav shell)

- Atlassian docs were not served to WebFetch (only page chrome returned); cross-checked via Popup JSX examples in community references.
- Popup is historically **always-controlled** (`isOpen` + `onClose` required) — no `defaultOpen`. Lifts the state-location question entirely to the consumer; the library makes no assumption about where it lives.
- No per-selected-item pattern is codified by Atlassian for editor contexts; their editor team uses a separate internal solution (Atlaskit Editor).

### Tiptap Popover primitive (for contrast) — Boolean, component-local by default  ·  CONFIRMED

- Tiptap ships its own Popover primitive alongside the LinkPopover UI component (per their UI Components docs).
- API shape mirrors Radix: `PopoverTrigger` + `PopoverContent`, open state internal by default.
- `LinkPopover` (a consumer of this primitive) adds `autoOpenOnLinkActive` (default `true`) and `onOpenChange` (observational) — visibility is *coupled to selection* by the editor-level orchestrator, not the primitive. The primitive itself remains canonical (boolean, controlled/uncontrolled).

### GitHub issue tracker — Radix multi-popover discussions  ·  CONFIRMED

Searched `popover multiple open` and `popover stacking`:

- **#1458 [Popover] Nested popover is not closing by clicking trigger in Safari** — Safari-specific nested-popover bug.
- **#2848 Nested popovers cause problems on Safari and Firefox** — nested popover rendering issues.
- **#2180 Popover nested in Dialog does not open** — dismiss composition bug.
- **#3585 Alert Dialog overlay conflicts when popover modal prop is true** — layer coordination.
- **#3612 Popover portal with forceMount inside a dialog closes unexpectedly** — dismiss chain bug.
- **#3320 Can't control Popover with open props** — controlled-API regression.
- **#163 Popover: arrow positioning when content creates a new stacking context** — z-index / stacking.
- **#446 [Popover] Controlled version mounts twice when opened externally** — controlled edge.

**Pattern:** the recurring multi-popover issue shape is **nested** or **portal-inside-dialog** (A-contains-B composition), not **sibling multi-open** (A and B both anchored to peer chips). The sibling multi-open scenario is mechanically supported everywhere but is absent from issue tracker discussion — the community has not surfaced it as a failure mode, and the libraries have not surfaced it as a documented pattern.

## Cross-library summary

| Library | Open state type | Default location | Controlled API | Coordination primitive | Explicit multi-open guidance |
|---|---|---|---|---|---|
| Radix UI | `boolean` | Component-local | `open` + `onOpenChange` + `defaultOpen` | None | None |
| Ariakit | `boolean` (in store) | `PopoverStore` (default per-instance) | `open` / `setOpen` + store `popover` ref | YES — `popover` sync prop | None (but sync primitive exists) |
| React Aria | `boolean` (via hook) | `useOverlayTriggerState` (per-trigger) | `isOpen` + `onOpenChange` + `defaultOpen` | None (but state hook is composable) | None |
| Shadcn UI | Radix-wrapped | Component-local | Inherited from Radix | None | None |
| Atlassian Popup | `boolean` | **Always parent-owned** | `isOpen` + `onClose` required | None | None |
| Tiptap Popover | `boolean` | Component-local | Radix-like | None | None (editor orchestrator couples to selection) |

## Cross-cutting observations

1. **All surveyed libraries model open as a single boolean.** None ship a tri-state or mode-enum at the primitive level. Mode enums (Plate's `'' | 'edit' | 'insert'`, BlockSuite's `'create' | 'edit'`) are *editor-level* concerns stacked on top of the boolean.
2. **All surveyed libraries default to per-instance isolation.** Two `<Popover>` siblings do not share a store or a parent registry unless the consumer wires one. Multi-open is thus mechanically free — but also mechanically coordination-free.
3. **Only Ariakit ships a named cross-popover sync primitive** (`popover` prop on the store). Radix / React Aria / Atlassian / Shadcn / Tiptap expect the consumer to coordinate externally if they want to.
4. **No library documents a "popover-per-selected-item" UX as a named pattern.** It is implementable on every library but uncodified. Closest precedent: React Aria's `useOverlayTriggerState` hook is composable per-item; Ariakit's per-store isolation is similarly per-item-friendly.
5. **"Anti-pattern" warnings are absent.** No library calls out simultaneous siblings as problematic. The issue tracker data corroborates this — users do not file bugs against sibling multi-open, only against nested / Dialog-inside-Popover / portal / z-index composition.
6. **Controlled APIs are universal.** Every library exposes `open` / `onOpenChange` (or equivalents). An editor that wants to externalize popover state into an editor-plugin store (Plate's pattern) is a supported consumer shape everywhere.

## Negative searches

- No library documents a "close all other popovers when one opens" coordinator (the menubar-style coordination that Select / DropdownMenu enforce *within* one trigger is not lifted to cross-trigger coordination in any popover spec).
- Radix issue tracker: no issue titled "multiple popovers" or "sibling popovers" or "coexisting popovers." The coordination problem is absent from the community's bug surface.
- Atlassian `/components/popup/examples` and `/components/popup` returned only page chrome via WebFetch; `isOpen` prop shape is confirmed from community JSX but Atlassian's own guidance text could not be extracted directly.

## Gaps / UNCERTAIN / NOT FOUND

- **NOT FOUND: explicit anti-pattern against multi-open siblings** in any library's docs. Consistent silence across six libraries is itself a signal ("not seen as a problem worth documenting") but is not a positive endorsement.
- **UNCERTAIN: Atlassian Design System guidance depth** — WebFetch surfaced only nav shell. Could be worth hitting via browser with cookies in a future pass.
- **NOT FOUND: per-selected-item popover canonical recipe.** Every library supports it; none documents it.
- **Ariakit `popover` sync prop** — docs describe syncing two stores together but don't exhaustively demonstrate "three peer popovers, only one open at a time" coordination. The primitive exists; the recipe is uncodified.
- React Aria `useOverlayTriggerState` — confirmed via WebSearch (Adobe docs served a redirect that resolved only partially); the API shape `{ isOpen, open, close, toggle, setOpen }` is consistent across all consulted sources.
