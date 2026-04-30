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

This is a pure render-time addition. Storage shape, MDX serialization,
and on-disk round-trip are unchanged — a fresh slash-inserted block
still serializes to `<img src="" />` and round-trips byte-identically.
