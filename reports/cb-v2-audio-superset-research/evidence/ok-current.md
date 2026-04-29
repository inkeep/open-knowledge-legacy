# Evidence: Open Knowledge's Current Audio Implementation

**Dimension:** OK current Audio implementation (baseline to extend)
**Date:** 2026-04-22
**Sources:** CB-v2 worktree source

---

## Key files / directories referenced

- `packages/app/src/editor/components/componentMap.tsx:11-47` — renderer + ship-comment
- `packages/core/src/registry/built-ins.ts:348-363, 559-569` — descriptor + manifest entry
- `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md` — un-defer framework

---

## Findings

### Finding: OK's current Audio is a 14-LoC HTML5 `<audio controls>` wrapper
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/editor/components/componentMap.tsx:34-47`:

```tsx
function Audio(props: { src?: string; title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-fd-muted/50 p-4 text-sm text-fd-muted-foreground">
      <div className="mb-1 font-medium">{props.title ?? 'Audio'}</div>
      {props.src ? (
        <audio controls src={props.src} className="w-full">
          <track kind="captions" />
        </audio>
      ) : (
        props.children
      )}
    </div>
  );
}
```

Observations:
- `controls` is hardcoded on — consistent with the report's recommendation to omit `controls` from the descriptor.
- `<track kind="captions" />` has no `src` — it is a DOM-slot placeholder with zero runtime effect. Should be removed on renderer upgrade.
- Children branch fires only when `src` is absent — useful for authoring-UX when dragging in a component before entering a URL, but the descriptor doesn't declare children as optional in `built-ins.ts`.

**Implications:** The 14-LoC wrapper is honest baseline. It advertises only what HTML5 delivers, leaves the VR14 upgrade path open, and does not lie about caption support (the empty `<track>` is tech debt to remove, not a feature to preserve).

---

### Finding: OK's Audio descriptor has two props
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/registry/built-ins.ts:348-363`:

```ts
const audioProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Audio source URL',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Audio title',
  },
];
```

Manifest entry at `built-ins.ts:559-569`:

```ts
{
  name: 'Audio',
  hasChildren: false,
  isSelfClosing: true,
  props: audioProps,
  icon: 'Volume2',
  category: 'media',
  displayName: 'Audio',
  description: 'Audio player',
  searchTerms: ['audio', 'sound', 'music', 'mp3'],
},
```

**Implications:** `hasChildren: false` + `isSelfClosing: true` conflicts with the renderer's children-passthrough branch. The report's recommendation (flip `hasChildren: true`, drop `isSelfClosing`, add `children: reactnode`) resolves the inconsistency while enabling the `<source>`/`<track>` passthrough pattern.

---

### Finding: VR14 un-defer target is AI Elements AudioPlayer
**Confidence:** CONFIRMED
**Evidence:** Ship-comment in `componentMap.tsx:11-15`:

> Audio is a minimal HTML5 <audio controls> wrapper — functional playback via the browser-native media element. VR14 envisioned a shadcn-styled player; the research + follow-up work item live at `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md` (current lean: AI Elements AudioPlayer on media-chrome).

**Implications:** The render-layer upgrade path is already scoped and does not change the descriptor. Descriptor work (this report's subject) is independent of the renderer swap.

---

## Gaps / follow-ups
- `hasChildren`/`isSelfClosing` mismatch between renderer (accepts children) and descriptor (declares none) is a nit to fix as part of the superset update.
- Empty `<track kind="captions" />` is dead code; remove on renderer upgrade.
