---
title: Editor portalled-surfaces inventory — resolves Q6 + validates D8
sources:
  - packages/app/src/App.tsx
  - packages/app/src/components/EditorArea.tsx
  - packages/app/src/components/GraphPanel.tsx
  - packages/app/src/components/ConnectingBanner.tsx
  - packages/app/src/editor/extensions/InternalLinkPropPanel.tsx
  - packages/app/src/editor/extensions/WikiLinkPropPanel.tsx
  - packages/app/src/editor/extensions/suggestion-floating-ui.ts
  - packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx
  - packages/app/src/editor/bubble-menu/BlockTypeSelector.tsx
captured_at: 2026-04-23
baseline_commit: 1a03f2cb
---

# Editor portalled-surfaces inventory

Triggered by audit Finding 4 + design challenge Finding 3: D8 picked inline rendering with "implementer may switch to portal" fallback, and Q6 (tooltip/popover anchoring under translate) was deferred to manual test post-implementation. Both findings demand a pre-implementation inventory.

This file enumerates every fixed-position or portalled UI surface that interacts with the editor, classifies how each one relates to the proposed `transform: translateX(var(--sidebar-width))` on `SidebarInset`, and resolves Q6 with evidence.

## CSS rule recap

Per CSS Transforms Module Level 1 §6, an element with `transform: <anything-other-than-none>` establishes a new containing block for its `position: fixed` descendants. Practical effect: a `position: fixed` element nested inside a `transform`-ed ancestor positions itself relative to that ancestor's bounds, NOT the viewport. (Source: https://developer.mozilla.org/en-US/docs/Web/CSS/transform)

Three classes of surfaces, by their relationship to `SidebarInset`:

1. **Body-portalled** — rendered into `document.body` (or another non-inset ancestor). Sibling of `SidebarInset`, not a descendant. The transform on `SidebarInset` does not affect them. They observe the editor's `getBoundingClientRect()` which DOES return post-transform coordinates — first-render position is correct.

2. **Inset-descendant fixed** — `position: fixed` inside `SidebarInset`'s subtree. The transform creates a new containing block; the element positions itself relative to inset bounds. Visually: the element translates with the inset.

3. **Inset-descendant absolute / relative** — standard flow inside the inset. Translates with the inset by default.

## Surface inventory

### Body-portalled (escape the transform — SAFE)

| Surface | File:line | Mechanism | First-render correctness | Update during animation |
|---|---|---|---|---|
| Radix `Dialog` (default Portal) used by `AuthModal`, `CommandPalette`'s `CommandDialog` | `packages/app/src/components/AuthModal.tsx:20`, `packages/app/src/components/CommandPalette.tsx:23` | Radix `Dialog.Portal` → `document.body` | Correct — anchored to viewport, not editor | n/a (modals — sidebar interaction not expected during open) |
| `InternalLinkPropPanel` (Radix Dialog) | `packages/app/src/editor/extensions/InternalLinkPropPanel.tsx:157,161` | Radix Dialog Portal | Correct | n/a |
| `WikiLinkPropPanel` (Radix Dialog) | `packages/app/src/editor/extensions/WikiLinkPropPanel.tsx:113,117` | Radix Dialog Portal | Correct | n/a |
| Suggestion popups (slash menu, wiki-link, etc.) | `packages/app/src/editor/extensions/suggestion-floating-ui.ts:52` | `document.body.appendChild(popup)` + `floating-ui`'s `computePosition` against the editor view | First call to `computePosition` reads editor's `getBoundingClientRect()` post-transform → correct | Floating-UI's `autoUpdate` watches scroll-ancestors and resize but NOT transform changes by default. During the 200ms slide, position will be stale until next scroll/resize/manual trigger. Mitigation below. |
| `BubbleMenuBar` | `packages/app/src/editor/bubble-menu/BubbleMenuBar.tsx:75` | TipTap BubbleMenu with `appendTo={() => document.body}` | Correct | Same autoUpdate caveat as suggestion popups |
| `BlockTypeSelector` (Radix DropdownMenu with `portal={false}`) | `packages/app/src/editor/bubble-menu/BlockTypeSelector.tsx:131` | Mounted INSIDE `BubbleMenuBar`, which is body-portalled. Transitively body-descendant. | Correct — same as parent | Same as parent |
| `ConnectingBanner` | `packages/app/src/components/ConnectingBanner.tsx:92,114` | `position: fixed top-0` mounted at App root (`packages/app/src/App.tsx:114`), OUTSIDE `SidebarProvider`. NOT a descendant of `SidebarInset`. | Correct — viewport-relative | Unaffected by transform |
| `Sheet` consumers: `ConflictResolver`, `EditorArea`'s `DocPanel`-as-Sheet (`<960px`) | `packages/app/src/components/ConflictResolver.tsx`, `packages/app/src/components/EditorArea.tsx:331` | Radix Dialog Portal (Sheet uses Dialog under the hood) | Correct | n/a (own modal lifecycle) |

### Inset-descendant fixed (translate WITH the inset — COHERENT)

| Surface | File:line | Behavior under inset translate |
|---|---|---|
| `GraphPanel` expanded view (`fixed inset-0 z-50`) | `packages/app/src/components/GraphPanel.tsx:376` | When `isExpanded === true`, the panel uses `fixed inset-0` to fullscreen. With the inset translated, `inset-0` covers the inset's translated bounds — the expanded graph slides with the document. At very narrow widths, it gets cropped on the right (same as the document). Coherent UX. |

### Inset-descendant absolute / relative (translate inline — COHERENT)

| Surface | File:line | Behavior under inset translate |
|---|---|---|
| TipTap editor DOM (ProseMirror view) | `packages/app/src/editor/TiptapEditor.tsx` | Inside the inset; translates inline. Cursor position visually shifts with the document. |
| `.collaboration-cursor__caret` / `.collaboration-cursor__label` (Y.js cursor overlays) | `packages/app/src/styles/globals.css:487-509` | `position: relative` / `position: absolute` inside the editor DOM. Translate with inline content. Remote-peer cursors stay correctly placed relative to text. |

## Floating-UI `autoUpdate` mitigation

Body-portalled surfaces that use `floating-ui`'s `autoUpdate` (suggestion popups, BubbleMenu) get position updates on scroll, resize, and ResizeObserver events — but NOT on `transform` changes by default. During the 200ms sidebar slide animation, an open popup will be visually anchored to the editor's pre-transform position, then snap to the post-transform position when the next scroll/resize fires.

**Mitigations available, in order of cheapness:**

1. **Close any open popups when the sidebar toggles at small width.** Cheapest. Add to the `setOpenMobile()` call: dispatch a `keydown: Escape` to the document, OR set TipTap's selection to `null`, OR add an explicit `closePopups()` call. ProseMirror suggestion plugins typically close on selection change; setting selection should cascade.
2. **Use `autoUpdate` with `animationFrame: true`** on popups that may be open during a sidebar toggle. Higher CPU cost; only worth it if mitigation 1 is insufficient.
3. **Manually trigger `update()` on the floating-ui instance** after the 200ms transition completes (use `transitionend` listener on the inset).

**Recommended:** Mitigation 1. Closing popups on sidebar toggle is the natural UX (the user is no longer focused on the editor) and avoids the autoUpdate cost everywhere else.

## Resolution of Q6

With the inventory above, **Q6 is resolved with HIGH confidence:**

- **No editor surface is at risk of mis-anchored position-fixed during translate.** All `position: fixed` editor descendants are either body-portalled (correct first render) or inset-descendant (intentionally slide with the document).
- **The only behavioral nuance** is body-portalled popups using `floating-ui`'s `autoUpdate` may be momentarily stale during the 200ms slide. Recommended mitigation: close popups on sidebar toggle (mitigation 1).
- **Y.js collaboration cursors** are inside the editor DOM and translate inline — no issue.
- **No new pre-implementation prototype is required** for Q6. The implementation must add the popup-close-on-toggle behavior; the rest follows from CSS containing-block semantics.

## Resolution of D8 (inline vs portal)

The challenger argued D8 ("inline keeps the sidebar inside the layout coordinate space") was rhetorical because the existing inline mode already uses `position: fixed` for the visual container (`packages/app/src/components/ui/sidebar.tsx:223`). That's true — the sidebar is already out of flex flow visually.

However, the inline-rendering's load-bearing benefit is NOT "in flex flow." It's:

1. **Same DOM ancestry** as the desktop sidebar — the sidebar shares a parent with `SidebarInset`. Click events on the inset that bubble up reach a common ancestor; this is what makes the click-to-dismiss handler simple to wire (D12).
2. **CSS variable inheritance** — `--sidebar-width` is set on `SidebarProvider`. A portalled sidebar would either need its own CSS variable scope or read from a different ancestor.
3. **No new portal anchor** — the codebase has no canonical "sidebar portal" anchor in `App.tsx`; introducing one is scope-extension.

Inline rendering is a safe choice given the inventory above. **D8 holds**, with the explicit constraint added in audit Finding 5: at small widths, the sidebar's flex-occupying `sidebar-gap` must be `w-0` (or absent) so `SidebarInset` keeps full viewport width before the translate is applied.

## Failure modes still requiring manual test (residual A2)

After the inventory:

- **First-paint correctness for popups opened immediately after sidebar toggle.** If a user opens the sidebar and the agent (or local code) opens a popup during the 200ms transition, the popup's first-position calc may use mid-animation coordinates. Low likelihood; manual test once during review.
- **Future surfaces.** Any new editor-side `position: fixed` element added inside `SidebarInset`'s subtree without using a portal must be evaluated against the same matrix. No automated check; reviewer responsibility.
