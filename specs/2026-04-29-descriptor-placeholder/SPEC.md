# Plan — Notion-style empty-state placeholder for canonical descriptors

## Context

After the slash-command auto-open fix, fresh-inserted descriptors with empty required props (e.g., `<img src="" />`) render as the browser default — a broken-image icon for img, empty `<video controls>` chrome for video, etc. This is the explicit signal in `JsxComponentView`'s `needsConfig` predicate (L296-302) but currently has no UI affordance beyond the gear in the chrome bar.

The user's reference is Notion: when an image has no source yet, you see a dashed-border pill with an icon and "Add an image" — clicking opens an inline picker (the equivalent of OK's PropPanel). This is much better than a broken-image icon and gives every descriptor a clean "needs configuration" state.

The infrastructure for this is mostly already in place:
- `getAutoFocusedPropName` (`PropPanel.tsx:112`, exported) tells us which prop the user should fill in next.
- `setPopoverOpen` controls the existing PropPanel popover.
- The slash-insert auto-open path already chains `setNodeSelection + setPopoverOpen(true)` — same operations a click-on-placeholder needs.
- `PopoverAnchor` (Radix) lets the placeholder be the popover's positional anchor without owning the trigger.

What's missing: the placeholder UI itself, a render branch, a click handler, and a stricter trigger predicate.

## Approach — B+C hybrid (descriptor-declared with generic fallback)

A new pure-UI `DescriptorPlaceholder` component renders when an autoFocus-flagged required prop is empty. Default copy/icon is derived from existing descriptor metadata (`displayName`, `icon`); descriptors can override with optional `placeholder?: { label?: string; icon?: string }` metadata when generic copy isn't enough (e.g., future Mermaid: `"Add a diagram"`).

**Label fallback rule:** `\`Add ${descriptor.displayName.toLowerCase()}\`` → `"Add image"`, `"Add video"`, `"Add audio"`. No article logic in the fallback. The 5-pack's canonical descriptors get explicit Notion-style overrides via `placeholder.label` for natural English (see "Per-descriptor overrides" below). Future descriptors get the fallback automatically — overrides only when needed.

**Per-descriptor overrides** (added to `packages/core/src/registry/built-ins.ts`):
- `img`: `placeholder: { label: "Add an image" }`
- `video`: `placeholder: { label: "Add a video" }`
- `audio`: `placeholder: { label: "Add audio" }` (no article — matches Apple/Spotify convention)
- Callout / Accordion: no override (not eligible — `hasChildren: true`)

**Visual weight — subtle (Notion match):** dashed border (`border-dashed border-border`), muted icon + text (`text-muted-foreground`), hover lift (`hover:bg-muted/50`), pointer cursor (`cursor-pointer`). Selected state inherits OK's existing selection-indicator pattern from the wrapper's `data-selected` attribute (no special selected styling on the placeholder itself — the wrapper handles it consistently with the rest of the chrome).

**Rollout — direct ship, no feature flag.** Existing behavior (broken-image icon for empty src) is strictly worse; new e2e tests are the regression guard. Per the no-deferred-debt directive on greenfield work.

Critical correction from initial design: do **NOT** trigger on `needsConfig`. That predicate flags ANY non-hidden, non-advanced empty string prop — including `alt=""` on a fully-rendered image. `selection-indicator.e2e.ts:326-335` (test S9) explicitly relies on this: `<img src="/p.png" alt="" />` has `data-needs-config="true"` while still rendering the actual image. Use a stricter predicate:

```ts
shouldRenderPlaceholder(descriptor, props) =
     !descriptor.hasChildren                       // exclude Callout/Accordion
  && getAutoFocusedPropName(descriptor.props) !== null
  && props[autoFocusedPropName] === ''             // empty, not undefined
```

`needsConfig` stays as-is for the gear-hint nudge in the chrome bar — it answers a different question ("nag the user about a missing optional-but-recommended prop") than the placeholder predicate ("the component literally cannot render anything useful").

Click flow:

```ts
const openPanel = () => {
  const p = getPos();
  if (typeof p !== 'number') return;
  editor.chain().focus().setNodeSelection(p).run();
  setPopoverOpen(true);
};
```

Render shape inside `JsxComponentView`:

```tsx
<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
  <NodeViewWrapper data-jsx-component data-needs-config={needsConfig}>
    {!showPlaceholder && <ChromeBar>{/* gear is PopoverTrigger */}</ChromeBar>}

    {showPlaceholder ? (
      <PopoverAnchor asChild>
        <DescriptorPlaceholder
          label={resolved.label}
          Icon={resolved.Icon}
          onClick={openPanel}
          selected={selected}
        />
      </PopoverAnchor>
    ) : (
      <Comp {...renderProps}><NodeViewContent /></Comp>
    )}
  </NodeViewWrapper>

  <PopoverContent>{/* PropPanel — autoFocus on src input */}</PopoverContent>
</Popover>
```

The placeholder branch lives **after** the existing stuck/needsConversion early-returns (L459, L549) so wildcard/errored/expression nodes don't get hijacked.

## Files to modify

| Path | Touch type | What changes |
|------|------------|--------------|
| `packages/core/src/registry/types.ts` | Add | `placeholder?: { label?: string; icon?: string }` field on `JsxComponentMeta`. Optional, additive — no migration. |
| `packages/core/src/registry/built-ins.ts` | Edit | Add `placeholder` to img / video / audio canonical entries: `{ label: "Add an image" }` / `{ label: "Add a video" }` / `{ label: "Add audio" }`. ~3 lines. |
| `packages/app/src/editor/registry/icons.ts` | NEW | Extract `ICON_COMPONENTS` map + `resolveIcon(name)` from `slash-command/component-items.ts:43-59`. Shared between slash menu and placeholder. |
| `packages/app/src/editor/utils/editor-strings.ts` | Edit | Export `humanizePropName` (currently private at `PropPanel.tsx:36`) — moved here next to `formatContainerAriaLabel`. Updates PropPanel.tsx import. |
| `packages/app/src/editor/registry/resolve-descriptor-placeholder.ts` | NEW | `shouldRenderPlaceholder(descriptor, props)` predicate + `resolveDescriptorPlaceholder(descriptor)` → `{ label, Icon }`. Uses `getAutoFocusedPropName` from PropPanel, `resolveIcon` from new icons.ts, fallback ladder: `descriptor.placeholder.label ?? \`Add ${descriptor.displayName.toLowerCase()}\``. Pure functions. |
| `packages/app/src/editor/registry/resolve-descriptor-placeholder.test.ts` | NEW | Unit tests for both predicate + resolver. |
| `packages/app/src/editor/components/DescriptorPlaceholder.tsx` | NEW | Pure UI: dashed-border pill, icon + label, hover state (`cursor: pointer`), `data-descriptor-placeholder=""` test selector, focus-ring on `selected`. Props: `{ label, Icon, onClick, selected? }`. |
| `packages/app/src/components/ui/popover.tsx` | Edit | Re-export `PopoverAnchor` from `@radix-ui/react-popover` if not already exposed (verify; shadcn stub may omit it). |
| `packages/app/src/editor/extensions/JsxComponentView.tsx` | Edit | Import + use `shouldRenderPlaceholder`, `resolveDescriptorPlaceholder`, `DescriptorPlaceholder`. New `openPanel` handler near `handleBodyClick` (L574). Render branch placed **after** L549's needsConversion check and **before** the Branch 2 main render. Chrome bar conditionally hidden in placeholder mode (`{!showPlaceholder && <chromeBar>}`). `handleBodyClick` early-returns when `showPlaceholder` so click events don't double-fire (placeholder owns its onClick). |
| `packages/app/src/editor/slash-command/component-items.ts` | Edit | Import `resolveIcon` from new `icons.ts` instead of local definition. Mechanical refactor. |
| `packages/app/tests/stress/slash-command-auto-open.e2e.ts` | Edit | Add 3 e2e tests: PLACEHOLDER-RENDERS, PLACEHOLDER-CLICK-OPENS-PANEL, PLACEHOLDER-CONTAINER-EXCLUDED. |
| `packages/app/tests/stress/selection-indicator.e2e.ts` | Verify only | Test S9 seeds `alt=""` with valid src — must continue asserting `data-needs-config="true"` AND that the actual image renders (not placeholder). With the stricter predicate this should pass unchanged; verify, no edits expected. |

## Reusable utilities (cited file:line)

- `getAutoFocusedPropName(props)` — `PropPanel.tsx:112` — already exported, pure, safe to call in render. Reuse directly.
- `humanizePropName(name)` — `PropPanel.tsx:36` — extract to `editor/utils/editor-strings.ts` next to `formatContainerAriaLabel`.
- `ICON_COMPONENTS` + `resolveIcon` — `slash-command/component-items.ts:43-59` — extract to `editor/registry/icons.ts`. Both slash menu and placeholder use it.
- `consumeAutoOpen` / `setPendingAutoOpen` — `slash-command/component-items.ts:122-153` — used by slash-insert auto-open path; placeholder click does NOT need them (calls `setPopoverOpen` directly).
- `hasEditableProps` inline expression — `JsxComponentView.tsx:277` and `component-items.ts:165` — same predicate twice; reuse pattern, don't introduce a third copy.

## Testing strategy (per /tdd skill)

**Vertical slices, RED→GREEN per slice. Don't write all tests first.**

### Slice 1 — Pure helpers (`shouldRenderPlaceholder` + `resolveDescriptorPlaceholder`)

Unit test (`resolve-descriptor-placeholder.test.ts`). Bun test, pure-function altitude (no DOM, no editor).

For `shouldRenderPlaceholder`:
| Scenario | Expected |
|---|---|
| img descriptor, props = `{ src: '' }` | true |
| img descriptor, props = `{ src: '/p.png' }` | false |
| img descriptor, props = `{ src: '/p.png', alt: '' }` | false (alt is not the autoFocus prop) |
| img descriptor, props = `{ src: undefined }` | false (undefined ≠ '', preserves authored-empty semantics) |
| Callout descriptor, props = `{ title: '' }` | false (hasChildren = true) |
| Accordion descriptor, props = `{ title: '' }` | false (hasChildren = true) |
| wildcard `'*'` descriptor | false (no editable props → no autoFocus) |
| descriptor without any autoFocus prop | false |

For `resolveDescriptorPlaceholder`:
| Scenario | Expected label | Expected Icon |
|---|---|---|
| img with `placeholder: { label: "Add an image" }` (post-built-ins update) | `"Add an image"` | `ZoomIn` (from `descriptor.icon`) |
| img with no override (hypothetical) | `"Add image"` (from `displayName.toLowerCase()`) | `ZoomIn` |
| descriptor with `placeholder.icon: "Workflow"` | label fallback | `Workflow` |
| descriptor with neither override nor `descriptor.icon` | label fallback | `Box` (resolveIcon final fallback) |

### Slice 2 — Placeholder renders on fresh insert (e2e)

`SLASH-AUTOOPEN-IMG` already exists and covers the auto-open. Add a stricter test:

```ts
test('PLACEHOLDER-RENDERS-FRESH: slash-inserted img shows placeholder until src is set')
```

- Empty doc, slash-insert /image
- Assert `[data-descriptor-placeholder]` is visible
- Assert no `<img>` element rendered (the broken-image icon today)
- Assert `[data-prop-panel]` is visible (existing auto-open)

### Slice 3 — Click placeholder opens panel (e2e)

```ts
test('PLACEHOLDER-CLICK-OPENS-PANEL: clicking placeholder NodeSelects + opens PropPanel')
```

- Slash-insert /image, close panel via Escape (without filling src)
- Assert `[data-prop-panel]` not visible, `[data-descriptor-placeholder]` still visible
- Click `[data-descriptor-placeholder]`
- Assert `[data-prop-panel]` visible
- Assert PM selection is NodeSelection on the img (verify via `__activeEditor.state.selection.node.attrs.componentName === 'img'`)

### Slice 4 — Placeholder disappears once configured (e2e)

```ts
test('PLACEHOLDER-FILL-DISMISSES: filling src dismisses placeholder, real img renders')
```

- Slash-insert /image (placeholder + panel visible)
- Type `/test.png` into src input + tab away
- Assert `[data-descriptor-placeholder]` no longer in DOM
- Assert `<img src="/test.png">` rendered

### Slice 5 — Container descriptors don't get placeholder (e2e)

```ts
test('PLACEHOLDER-CONTAINER-EXCLUDED: slash-inserting Callout does NOT show placeholder')
```

- Slash-insert /callout
- Assert `[data-descriptor-placeholder]` NOT present in DOM
- Assert Callout's regular component DOM is rendered (existing behavior)

### Slice 6 — alt="" image regression (verify existing test S9)

`selection-indicator.e2e.ts:326-335` (test S9) seeds `<img src="/p.png" alt="" />`:
- Must continue to assert `data-needs-config="true"`
- Must NOT show placeholder (verify `[data-descriptor-placeholder]` absent)
- This is the regression-canary that the predicate split (placeholder ≠ needsConfig) is correct.

### Slice 7 — Hover cursor (e2e, optional)

Could test via `getComputedStyle` in Playwright, but it's CSS-only. Defer unless we want belt-and-suspenders coverage. Mark as optional.

### What we're NOT testing (and why)

- DOM structure of `DescriptorPlaceholder` in isolation — repo convention is no `@testing-library/react` (per memory), pure-function altitude tests + e2e cover behavior. The component is trivial UI; e2e proves it renders.
- Multi-instance placeholder (two empty imgs in one doc) — the same code path handles it; e2e Slice 3 implicitly verifies the data-attribute selector matches the right instance because slash-insert auto-selects the new node.

### Vertical-slice implementation order

Per /tdd's tracer-bullet rule: write Slice 1 RED, GREEN it, then Slice 2 RED, GREEN, etc. Don't pre-write later slices — each test is informed by what the previous step reveals about the implementation.

1. Slice 1 RED → `shouldRenderPlaceholder` + `resolveDescriptorPlaceholder` impls → GREEN
2. Build `DescriptorPlaceholder.tsx` (no dedicated test, e2e covers)
3. Slice 2 RED → wire JsxComponentView render branch → GREEN
4. Slice 3 RED → `openPanel` handler + PopoverAnchor wiring → GREEN
5. Slice 4 RED → already passes if 2+3+4 are right; sanity-check
6. Slice 5 RED → already passes if `shouldRenderPlaceholder`'s `!hasChildren` gate works; sanity-check
7. Slice 6 verify → run existing `selection-indicator.e2e.ts:326`; it should pass without edits
8. Slice 7 (optional) → hover cursor sanity check

## Critical risks + mitigations

1. **Predicate conflation.** Already addressed in plan — separate `shouldRenderPlaceholder` from `needsConfig`. S9 in `selection-indicator.e2e.ts` is the regression canary.
2. **PopoverTrigger absence in placeholder mode.** Radix permits controlled-open `<Popover>` without a `<PopoverTrigger>` if `open` + `onOpenChange` are wired and an `<PopoverAnchor>` exists. Verify against Radix docs during Slice 4. Fallback: render a hidden `<PopoverTrigger asChild><span sr-only /></PopoverTrigger>`.
3. **`PopoverAnchor` not exposed by shadcn wrapper.** `packages/app/src/components/ui/popover.tsx` may not re-export it (shadcn stubs only what they use). Add the re-export — one line.
4. **`handleBodyClick` double-fire on placeholder click.** `handleBodyClick` runs on body clicks for self-closing components. Placeholder's onClick will bubble through. Fix: early-return in `handleBodyClick` when `showPlaceholder` is true; placeholder owns its own click semantics (NodeSelect + setPopoverOpen).
5. **Placeholder + auto-open simultaneous render on slash-insert.** Intended UX — placeholder is the anchor, popover opens against it. Verify autoFocus on the src input still gets focus (Radix preserves child autoFocus on Popover open). Existing `SLASH-AUTOOPEN-IMG` test will catch a regression here.
6. **Cleanup opportunity (not required for ship):** Once placeholder ships, `globals.css:1918-1932` (`data-needs-config` chrome-bar nudge styles) becomes purely the gear-hint mode (valid src + empty alt). Document in a CSS comment so future contributors don't conflate.

## Verification

```bash
# Pure-function tests (instant)
cd packages/app && bun test src/editor/registry/resolve-descriptor-placeholder.test.ts

# E2E tests (~10s for the 4-test file)
cd packages/app && bunx playwright test tests/stress/slash-command-auto-open.e2e.ts
cd packages/app && bunx playwright test tests/stress/selection-indicator.e2e.ts  # S9 regression check

# Full quality gate
bun run check    # 18/18 turbo tasks

# Manual smoke (dev server already running on :5174)
# 1. Refresh /#/<doc>, slash-insert /image → placeholder + panel both visible
# 2. Type src in panel, tab → placeholder disappears, real img renders
# 3. Slash-insert /image, Esc to close panel → placeholder visible alone
# 4. Click placeholder → panel re-opens, src input autoFocused
# 5. Slash-insert /callout → no placeholder, Callout renders normally
# 6. Verify hover cursor: cursor changes to pointer over placeholder
```

## Estimate

~2 hours total:
- 30 min: extract shared utils (`icons.ts`, `humanizePropName` move) — purely mechanical
- 30 min: predicate + resolver helpers + their unit tests (Slices 1-2)
- 20 min: `DescriptorPlaceholder.tsx` component
- 30 min: `JsxComponentView` wiring (render branch, openPanel, PopoverAnchor, chrome gating, handleBodyClick early-return)
- 20 min: e2e tests Slices 3-6 + S9 verify
- 20 min: `bun run check` + manual smoke + cleanup
