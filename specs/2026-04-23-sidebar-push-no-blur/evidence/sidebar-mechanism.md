---
title: Sidebar mechanism — current implementation trace
sources:
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/ui/sidebar.tsx
  - packages/app/src/components/ui/sheet.tsx
  - packages/app/src/hooks/use-mobile.ts
  - packages/app/src/App.tsx
captured_at: 2026-04-23
baseline_commit: 1a03f2cb
---

# Sidebar mechanism — current implementation trace

Captures how the FileSidebar renders today, what triggers the small-width Sheet path, where the blur originates, and what surrounding code consumes the same primitives.

## Layout shell

`packages/app/src/App.tsx:125-130`:

```tsx
<SidebarProvider className="h-screen overflow-hidden">
  <FileSidebar />
  <SidebarInset className="overflow-hidden h-[calc(100vh-var(--layout-inset-offset))]">
    <EditorPane />
  </SidebarInset>
</SidebarProvider>
```

`SidebarProvider` is a `flex` container with `--sidebar-width: 18rem` set as a CSS variable. `SidebarInset` is a `<main>` with `flex-1 bg-background`.

## Breakpoint

`packages/app/src/hooks/use-mobile.ts`:

```ts
const SIDEBAR_SHEET_BREAKPOINT = 1280;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < SIDEBAR_SHEET_BREAKPOINT);
  // matchMedia listener updates on resize
  return isMobile;
}
```

Below 1280px viewport width, `isMobile` is true. The threshold is unusually high for a "mobile" cutoff because the sidebar itself is 18rem (288px) and the inset has 2px padding/margins; below ~1280 the main panel reading width becomes uncomfortable.

## Two rendering paths in `Sidebar`

`packages/app/src/components/ui/sidebar.tsx:172-241`:

**Path A — `isMobile === true` (Sheet mode):**
```tsx
return (
  <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
    <SheetContent
      data-mobile="true"
      className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
      side={side}
    >
      ...
    </SheetContent>
  </Sheet>
);
```

`Sheet` is a thin wrapper over Radix `Dialog` (`packages/app/src/components/ui/sheet.tsx`). `SheetContent` is rendered inside `SheetPortal` (Radix `Dialog.Portal`), which appends to `document.body`. The portalled subtree is removed from the layout flow — the `SidebarInset` flex sibling does not change width when the sheet opens.

**Path B — `isMobile === false` (inline mode):**
```tsx
return (
  <div className="group peer hidden text-sidebar-foreground md:block" data-state={state} ...>
    {/* sidebar-gap: a flex item that animates width */}
    <div data-slot="sidebar-gap"
         className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear ..." />
    {/* sidebar-container: position-fixed, slides via left/right */}
    <div data-slot="sidebar-container"
         className="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 ...">
      ...
    </div>
  </div>
);
```

Inline mode uses a `peer` flex item (`sidebar-gap`) to take width in the layout, plus a `position: fixed` container that visually sits at that width. The `SidebarInset` (a flex sibling) reflows to fill the remaining width. Collapsing slides the container off-canvas via `left: calc(var(--sidebar-width) * -1)`.

## The blur

`packages/app/src/components/ui/sheet.tsx:33`:

```tsx
<SheetPrimitive.Overlay
  className={cn(
    'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs ...',
    className,
  )}
/>
```

Two visual effects:
- `bg-black/10` — semi-transparent dim
- `supports-backdrop-filter:backdrop-blur-xs` — Tailwind `backdrop-blur-xs` (4px blur) when the browser supports `backdrop-filter`

`SheetOverlay` is rendered inside `SheetPortal` and sits between the document viewport and the `SheetContent`. It also acts as the click-to-dismiss surface (Radix Dialog default).

## State model

Two separate state variables in `SidebarProvider`:
- `open` / `setOpen` — desktop state. React `useState` initialized from `defaultOpen` (default `true`). The `setOpen` setter writes a `sidebar_state` cookie at `sidebar.tsx:80` with 7-day max-age, BUT THE COOKIE IS NEVER READ on mount or anywhere else. State is React-only across renders (the component does not unmount across resizes). The cookie is currently dead code.
- `openMobile` / `setOpenMobile` — Sheet state (in-memory only, no cookie)

`App.tsx:125` does not pass `defaultOpen`, so initial state is always `true`.

`toggleSidebar()` dispatches based on `isMobile`:
```ts
function toggleSidebar() {
  return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
}
```

The two states are independent. Resizing across the breakpoint does not synchronize them. If you open the sidebar at narrow width, then resize to wide, you see the desktop sidebar in its previous state (cookie-persisted), regardless of the mobile state. Acceptable today because the user always sees a coherent open-or-closed view in their current breakpoint mode.

## Triggers that toggle the sidebar

- `SidebarTrigger` button rendered in `EditorHeader.tsx:326` (visible at all widths)
- Keyboard: `Cmd/Ctrl + \` (window listener in `SidebarProvider`)
- Sheet-only: ESC (Radix Dialog default), backdrop-click (overlay click → onOpenChange(false))
- Inline-only: `SidebarRail` (a hover-resize affordance on the right edge of the sidebar)

## Blast radius

- `useIsMobile` is consumed only by `sidebar.tsx`. Verified via `grep -rln 'use-mobile\|useIsMobile' packages/app/src packages/app/tests`. Note: `useDocPanelLayout` (`packages/app/src/hooks/use-doc-panel-layout.ts`) is a separate hook with its own breakpoint constants (`DOC_PANEL_SHEET_BREAKPOINT = 960`, `DOC_PANEL_COLLAPSE_BREAKPOINT = 1024`) — initial `grep` for `mobile` was a false positive on substring.
- **`Sheet` primitive consumers (verified via `grep -rln 'from.*ui/sheet'`):**
  - `packages/app/src/components/ConflictResolver.tsx` — modal dialog for resolving git/CRDT conflicts
  - `packages/app/src/components/EditorArea.tsx:331` — renders the right-side `DocPanel` (Backlinks, Forward links, Timeline) as a Sheet at viewport widths `< 960px` per `useDocPanelLayout()`
  - `packages/app/src/components/ui/sidebar.tsx` — the file being modified
  - `AuthModal.tsx` and `CommandPalette.tsx` do **NOT** use `Sheet` — they use Radix `Dialog` directly (verified via `grep -n 'import' packages/app/src/components/AuthModal.tsx` and same for CommandPalette).
- **DocPanel breakpoint overlaps:** at viewport widths between 960px and 1280px, the FileSidebar will render in push mode (no blur) under this spec while the DocPanel still renders as a Sheet with `bg-black/10 backdrop-blur-xs`. Implementer should verify the two surfaces interact cleanly. (Cross-cutting concern surfaced in design challenge Finding 1; resolution captured in SPEC.md.)
- No Playwright/integration tests pin the small-width Sheet rendering for the FileSidebar. Verified via `grep` over `packages/app/tests/` for sidebar-mobile combinations — no hits.

## Reading-width math at sub-1280 widths

If we change the small-width path from Sheet (overlay, no impact on main panel) to push (sidebar takes width from main panel):

| Viewport | Main panel after push (1280px sidebar = 18rem = 288px) |
|---|---|
| 1280px | 992px (workable) |
| 1024px | 736px (comfortable for prose) |
| 800px | 512px (cramped but usable) |
| 768px | 480px (cramped) |
| 480px | 192px (broken) |
| 375px | 87px (unusable — entire content width is one short word) |

Push-via-translate (sidebar overlays the main panel's right edge while preserving the panel's intrinsic width) sidesteps reading-width concerns: the panel keeps its full width, and the visible portion is just narrower. Document content does not re-wrap.

## What Tailwind class actually produces the blur

`backdrop-blur-xs` in this codebase resolves to `--tw-backdrop-blur: blur(4px);` (Tailwind 4 default for `xs`). Check `packages/app/tailwind.config.*` or the generated CSS for any local override (none observed in this trace, but confirm before relying on the exact pixel value in spec language).
