# Trees File Sidebar Migration

## Problem Statement

The Vite app currently carries a large custom file-tree implementation in `packages/app/src/components/FileTree.tsx` plus small helper modules for tree building, selection, operations, and drag-and-drop validation. This logic duplicates behavior now provided by `@pierre/trees`, including selection, focus, search, rename, drag and drop, context-menu affordances, styling hooks, icons, Git-status decoration, row annotations, large-tree virtualization, and React/vanilla/SSR entry points.

The goal is to migrate the app sidebar to `@pierre/trees` where it reduces local maintenance while preserving Open Knowledge-specific server actions and sidebar integrations.

## Evidence

- Official docs: `https://trees.software/docs`, fetched on 2026-04-23.
- Package: `@pierre/trees@1.0.0-beta.3`, latest npm dist-tag on 2026-04-23.
- Package metadata: React and React DOM peer dependencies support `^18.3.1 || ^19.0.0`, compatible with this app's React 19.
- Existing implementation: `packages/app/src/components/FileTree.tsx`, `file-tree-utils.ts`, `file-tree-dnd.ts`, `file-tree-operations.ts`, `file-tree-selection.ts`.

## Package Capability Audit

| Capability | `@pierre/trees` | Current app | Migration decision |
|---|---|---|---|
| Path-first model | Canonical paths across React, vanilla, SSR | Uses docName/path strings | Use package path model. |
| Tree rendering | React entrypoint plus vanilla/web component | Custom recursive Radix sidebar rows | Replace row rendering. |
| Virtualization / large trees | Built-in virtualized DOM and visible-row sizing | Renders full recursive tree | Adopt package virtualization. |
| Selection/focus | Built-in selected/focused path state | Custom active row selection + scrollIntoView | Adopt, preserving active doc/folder mapping. |
| Search | Built-in `search: true` | Not present in sidebar | Enable if React API supports it without UX conflict. |
| Expand/collapse | Built-in expanded paths, keyboard interaction | Custom userExpanded/userCollapsed and ancestor priority | Preserve ancestor-priority behavior by controlling expanded paths if supported; otherwise initialize to active ancestors and package-managed toggles. |
| Rename | Built-in inline rename UI | Custom input + `/api/rename` / `/api/rename-path` | Wire package rename events to existing APIs. |
| Drag/drop move | Built-in drag/drop affordances and invalid target handling | `@dnd-kit/core` plus custom validation | Wire package move events to existing APIs; remove dnd-kit from sidebar when unused. |
| Context menu | Built-in floating trigger/menu slot | Radix context menu per row | Use package context-menu slot if available; retain Open Knowledge actions in slot. |
| File/folder creation | Docs position package around tree interactions; current exact API to verify from installed types | Custom inline create with `/api/create-page` | Prefer package create affordance if exposed; otherwise keep minimal app-side toolbar/create prompt integrated with package tree. |
| Delete | Current docs mention row action primitives indirectly; exact API to verify from installed types | Custom confirmation + `/api/delete-path` | Keep Open Knowledge confirmation and server call; attach as row action/context item. |
| Git status | Built-in Git status styling/data attributes | Not present | Audit-only outcome unless server exposes status data; document gap. |
| Row annotations | Built-in row annotations | Not present | Audit-only outcome unless app has annotation data; document gap. |
| Built-in icons / colored icons | Built-in icon sprite and file-type colors | Lucide file/folder plus agent/symlink badges | Use built-in file/folder icons where practical; preserve app-specific badges/actions. |
| Styling | CSS custom properties and data attributes | Tailwind/shadcn sidebar styling | Add scoped CSS overrides to make package visually match sidebar. |
| SSR hydration / vanilla entrypoints | Supported | Vite SPA only | No migration work required now. |

## Requirements

1. Install `@pierre/trees@1.0.0-beta.3` in `packages/app`.
2. Replace the custom recursive file-tree rendering and local drag/drop plumbing with `@pierre/trees` React APIs where the installed types support it.
3. Preserve these Open Knowledge behaviors:
   - Load documents from `/api/documents` and refresh on focus, visibility, and `documents-changed` file signals.
   - Create files/folders through `/api/create-page`.
   - Rename files through `/api/rename` and folders through `/api/rename-path`.
   - Move files/folders through the same rename endpoints.
   - Delete files/folders through `/api/delete-path` with confirmation.
   - Navigate file/folder rows via the existing hash format.
   - Keep active folder/doc selection derived from `resolveFileTreeSelection`.
   - Keep copy full/relative path and Open-in-Agent context actions.
   - Keep symlink and agent-file indicators if the package row API allows custom row decorations; otherwise document the gap.
4. Remove local code made redundant by the migration.
5. Add feature coverage for package capabilities the app did not previously have, starting with search if available in the React API.

## Non-Goals

- Do not add a backend Git-status endpoint in this migration.
- Do not add SSR rendering for the Vite SPA sidebar.
- Do not redesign the sidebar outside the tree component migration.
- Do not change server file-operation contracts unless required by the package event shape.

## Test Cases

- Unit tests: tree input conversion maps app documents to package input, including nested files, symlinks, and extension handling.
- Unit tests: rename/move/delete/create adapters call the existing API endpoints with the same payload shapes as today.
- Existing sidebar tests continue to pass or are updated to package-rendered accessible roles.
- Typecheck verifies package API usage against installed declarations.
- Manual/browser QA: sidebar loads, active file remains selected, folder rows expand/collapse, create/rename/delete/move work, context actions remain reachable, search filters rows if enabled.

## Risks

- `@pierre/trees` is beta and may not expose all docs-promised behavior through stable React props.
- Current app-specific context menu actions may require keeping a thin adapter layer if the package only supports generic action slots.
- CSS/shadow-DOM encapsulation may limit how closely the tree can match existing shadcn sidebar styling.
- If the package lacks create/delete hooks, the migration should still replace rendering/selection/rename/move/search while keeping minimal app-owned operation UI.
