---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
---

feat(cb-v2): empty-state placeholder for canonical media descriptors

Slash-inserting an `img`, `video`, or `audio` block now renders a
Notion-style "Add an image / a video / audio" pill instead of the
browser's broken-source UI. Clicking the pill opens the existing
PropPanel popover with the relevant input autofocused; once the URL is
filled in, the pill swaps for the rendered media.

The pill is descriptor-driven, so future canonicals get the same
empty-state UX automatically. A new optional field on `JsxComponentMeta`
lets a descriptor override the default copy and icon when the generic
fallback isn't natural English:

```ts
placeholder?: { label?: string; icon?: string };
```

The fallback ladder is:

- **Label** — `descriptor.placeholder.label` falls back to
  `\`Add ${descriptor.displayName.toLowerCase()}\``.
- **Icon** — `descriptor.placeholder.icon` falls back to
  `descriptor.icon`, then to `Box` if the icon name isn't registered in
  the lucide map.

The pill renders only when an `autoFocus`-flagged required string prop
is empty (`src === ''` for the media trio). Container descriptors
(`hasChildren: true` — `Callout`, `Accordion`) keep their existing
empty-state UX through `emptyChildName` and never show the pill.

The pill spans the full doc-body width and sits above the regular
hover-revealed chrome bar (gear, move-up / move-down, delete). The
chrome stays visible in placeholder mode for parity with how the
chrome's gear-hint UX already surfaces on any other unconfigured
component (e.g. `<img alt="">`) — there is no special-cased hide.

To keep the wrapper's HTML5 drag-to-reorder working through the pill,
the placeholder is rendered as `<div role="button">` rather than a
native `<button>`; native buttons capture mousedown for activation and
prevent the wrapper's drag from initiating. Keyboard activation is
covered by both the wrapper's existing `handleKeyDown` (Enter/Space
when selected) and a local `onKeyDown` on the pill.

This is a pure render-time addition. Storage shape, MDX serialization,
and on-disk round-trip are unchanged — a fresh slash-inserted block
still serializes to `<img src="" />` and round-trips byte-identically.
