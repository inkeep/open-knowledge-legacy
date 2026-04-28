---
name: Current navigator surface in @inkeep/open-knowledge-desktop
description: 1P investigation of existing Navigator window, ProjectSwitcher, File menu, and IPC surface as of baseline commit 98199f82
sources:
  - packages/desktop/src/main/navigator-window.ts
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/menu.ts
  - packages/desktop/src/shared/bridge-contract.ts
  - packages/desktop/src/preload/index.ts
  - packages/app/src/components/ProjectSwitcher.tsx
  - packages/app/src/components/NavigatorApp.tsx
  - packages/app/src/components/CommandPalette.tsx
date: 2026-04-25
baseline-commit: 98199f82
---

# Evidence: Current navigator surface

## Key files referenced

- `packages/desktop/src/main/navigator-window.ts` — Navigator BrowserWindow factory; renders `<NavigatorApp />` via `--ok-mode=navigator` argv
- `packages/desktop/src/main/index.ts:326-354` — `openNavigator()`: focus existing window or create one
- `packages/desktop/src/main/index.ts:392-410` — `refreshApplicationMenu()`: rebuilds menu on recents change, passes `openNavigator` as a dep
- `packages/desktop/src/main/menu.ts:46-92` — `MenuDeps` interface; `openNavigator(): void` is the contract
- `packages/desktop/src/main/menu.ts:156-213` — File menu template; `New Project…` (Cmd+Shift+N) calls `deps.openNavigator()`
- `packages/desktop/src/shared/bridge-contract.ts:44` — `OkDesktopMode = 'editor' | 'navigator'`
- `packages/desktop/src/preload/index.ts:50` — preload reads `--ok-mode=` argv and types renderer-side `bridge.config.mode`
- `packages/app/src/components/ProjectSwitcher.tsx` — sidebar-bottom pill; gated on `window.okDesktop` (Electron-only)
- `packages/app/src/components/NavigatorApp.tsx` — renderer for `--ok-mode=navigator` mode
- `packages/app/src/components/CommandPalette.tsx` — present, no current navigator-related entries

## Findings

### Finding: `openNavigator()` already implements focus-or-create lifecycle
**Confidence:** CONFIRMED
**Evidence:** `packages/desktop/src/main/index.ts:326-354`

```ts
function openNavigator() {
  if (navigatorWindow) {
    (navigatorWindow as unknown as { focus: () => void }).focus();
    return;
  }
  navigatorWindow = createNavigatorWindow({ /* ... */ });
}
```

The `navigatorWindow` module-level variable is reset to `null` in the window's `closed` handler (line 343-345). Closing the navigator and re-summoning will create a fresh BrowserWindow.

**Implications:** Backend lifecycle is fully wired for the user's "continue current behavior" (Decision #5). No main-process changes needed for lifecycle.

### Finding: File menu's `New Project…` is the only renderer-reachable navigator surface today, and its label is misleading
**Confidence:** CONFIRMED
**Evidence:** `packages/desktop/src/main/menu.ts:159-163`

```ts
{
  label: 'New Project…',
  accelerator: 'CmdOrCtrl+Shift+N',
  click: () => deps.openNavigator(),
},
```

The menu item invokes `openNavigator()` — the same launcher window that exposes "Open Folder" + recent projects + create flow. The label "New Project…" implies creation only; the underlying action is broader.

**Implications:** Decision #1C (full coverage with new menu item) creates a labeling collision. Adding a second menu item that invokes the same action would be a UX anti-pattern. Cleanest resolution: relabel the existing item to match the new label "Manage Projects…" (Decision #3C).

### Finding: ProjectSwitcher is structurally an Obsidian "vault profile menu" — already styled to match
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/ProjectSwitcher.tsx`

```ts
import { ChevronsUpDown } from 'lucide-react';
// ...
<DropdownMenuTrigger asChild>
  <SidebarMenuButton ... title="Switch project">
    <span className="truncate">{bridge.config.projectName}</span>
    <ChevronsUpDown aria-hidden="true" className="opacity-60" />
  </SidebarMenuButton>
</DropdownMenuTrigger>
<DropdownMenuContent align="start" side="top" ...>
  <DropdownMenuLabel>Switch project</DropdownMenuLabel>
  {/* recents */}
  <DropdownMenuSeparator />
  <DropdownMenuItem onSelect={onOpenFolder}>
    Open folder…
  </DropdownMenuItem>
</DropdownMenuContent>
```

The `ChevronsUpDown` glyph is the same icon Obsidian uses for the vault profile pill. The dropdown opens upward (`side="top"`) into the sidebar — matching Obsidian's vault profile menu position. The "Switch project" label is identical in tone to Obsidian's "Manage Vaults…" pattern.

**Implications:** The new `Manage Projects…` item slots in cleanly without layout disruption. Decision #2B places it after the existing `Open folder…` separator-bounded section.

### Finding: ProjectSwitcher is gated on `window.okDesktop` — Electron-only by construction
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/components/ProjectSwitcher.tsx` header docstring + `bridge: OkDesktopBridge` prop signature

```ts
/**
 * Web / CLI distribution does NOT render this — it's gated on
 * `window.okDesktop` being present.
 */
```

**Implications:** Decision #4 (Electron-only) requires no new gating. The new dropdown item, the new bridge IPC, and any new CommandPalette gating must follow the same pattern.

### Finding: No `bridge.navigator.*` IPC namespace exists yet
**Confidence:** CONFIRMED
**Evidence:** `packages/desktop/src/shared/bridge-contract.ts` and `packages/desktop/src/preload/index.ts` searched for `navigator`; only `OkDesktopMode = 'editor' | 'navigator'` enum found

**Implications:** A new IPC channel `ok:navigator:open` (or equivalent) must be added: contract type in shared, handler in main `ipc-handlers.ts` calling `openNavigator()`, and exposure in the preload bridge as `bridge.navigator.open()`. This is the only main-process plumbing required.

### Finding: CommandPalette has no current navigator-related entries
**Confidence:** CONFIRMED
**Evidence:** Grep over `packages/app/src/components/CommandPalette.tsx` for `navigator|openNavigator|switchProject` returned nothing

**Implications:** Adding a CommandPalette entry per Decision #1C is greenfield — no existing entry to replace or rename. The new entry can follow the existing pattern in CommandPalette.tsx.

## Negative searches (NOT FOUND)

- **CommandPalette navigator entry** — searched `navigator|openNavigator|projectNavigator|switchProject` in CommandPalette.tsx. None.
- **Existing `bridge.navigator.*` IPC** — searched `bridge-contract.ts` and `preload/index.ts`. None; only the mode enum.
- **Project-switcher keyboard shortcut** — searched for keyboard handler attached to ProjectSwitcher; none. The component opens via mouse click on the SidebarMenuButton trigger.

## Gaps / follow-ups

- The `closed` handler resets `navigatorWindow = null` but does not check whether a "save state" or "remember selection" is needed. Out of scope here — current lifecycle is unchanged per Decision #5.
- The `--ok-mode=navigator` argv contract is set when navigator window opens; renderer reads it via preload. This contract stays unchanged.
