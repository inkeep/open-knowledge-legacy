# Fullscreen Graph Select-To-Open UX

## Problem Statement

The fullscreen graph currently reuses the same node-click behavior as the docked graph: clicking a document node updates the app hash and navigates the underlying active document. In the docked graph this is legible because the document pane is visible. In fullscreen, the document pane is hidden, so the same click appears to do little or nothing beyond a subtle re-center/re-highlight. The result is an ambiguous interaction: users cannot tell whether navigation happened, what node is currently selected for opening, or how to intentionally leave fullscreen and open the destination document.

## Goals

- Make fullscreen graph clicks feel intentional and legible.
- Preserve fullscreen graph as an exploration surface instead of a fragile one-click escape hatch.
- Separate "inspect/select this node" from "open this document in the editor".
- Keep the docked graph behavior unchanged.

## Non-Goals

- Redesign the docked graph panel UX.
- Add rich edge/link inspection in this iteration.
- Change the backend graph API or graph ranking/layout logic.

## Proposed Direction

Implement Option B in fullscreen graph mode:

- Single-click on a document node selects it inside the fullscreen graph.
- Selection visibly differs from the currently active document.
- A compact floating strip appears over the fullscreen graph with the selected document's title, doc path, and an explicit open action.
- Activating the open action exits fullscreen and navigates to the selected document.
- External nodes continue to open in a new tab immediately.
- Docked graph mode keeps today's click-to-navigate behavior.

## Initial Requirements

### Functional

- In fullscreen explore mode, clicking a document node must not immediately exit fullscreen.
- In fullscreen explore mode, clicking a document node must update a visible selected-node state.
- The selected-node affordance must expose an explicit action to open the document in the editor.
- Opening the selected document must both navigate and exit fullscreen in one user-visible action.
- In non-fullscreen graph mode, node clicks must keep the current immediate-navigation behavior.
- External-node clicks must keep opening a new tab.

### Visual / UX

- The selected node must have a distinct visual treatment from the active/current document node.
- The floating strip must remain readable against the fullscreen canvas in light and dark themes.
- The floating strip must communicate both human-readable title and machine path (`docName`).
- The fullscreen interaction must make it obvious that the user is still exploring until they explicitly open.

## Acceptance Criteria

1. In fullscreen explore mode, clicking an internal document node highlights it as selected and shows a floating info strip without exiting fullscreen.
2. The currently active document remains visually distinguishable from the selected node when they differ.
3. Using the strip's open action exits fullscreen and navigates to the selected document.
4. In docked mode, clicking a document node still navigates immediately.
5. Clicking an external node still opens its URL in a new tab from both fullscreen and docked modes.
6. If the selected node is already the active document, the fullscreen UI still makes that state legible and does not feel broken.

## Technical Constraints

- The implementation should fit the existing `GraphPanel` / `GraphView` split, where `GraphPanel` owns fullscreen state and `GraphView` owns graph rendering and click handling.
- The fullscreen implementation should avoid introducing a second navigation model for non-fullscreen graph use.
- The graph already distinguishes active nodes by size/color/ring; selected-node visuals must layer on without making active-state ambiguous.
- This repo prefers existing UI primitives and Tailwind utility styling rather than bespoke inline styles.
- Graph node selection must preserve the same navigation payload the graph already uses today, including `anchor` when present, so delayed open does not lose deep-link targets.

## Current-System Findings

- `GraphPanel` already owns fullscreen-only state (`isFullscreen`, mode toggles, fullscreen element ref), so the selected-node state should live there rather than in global app state.
- `GraphView` is shared by docked and fullscreen explore mode, so fullscreen behavior should be introduced as an explicit prop/callback split instead of forking the component.
- App navigation is hash-based (`hashFromDocName(...)` plus `window.location.assign(...)`), and graph clicks feed the same document-opening flow as the rest of the app.
- The graph library supports `onBackgroundClick`, which makes "clear selection by clicking empty canvas" viable.
- The graph library does not expose a native node double-click hook, so double-click-to-open would require custom timing/state logic.

## Proposed Technical Design

### State ownership

- `GraphPanel` will own fullscreen selected-node state, likely as a lightweight payload containing the selected node's `docName`, `label`, and optional `anchor`.
- Selected-node state is fullscreen-local and is not the same thing as `activeDocName`.
- Selected-node state clears when leaving fullscreen, switching away from fullscreen explore mode, or clicking the fullscreen graph background.

### Interaction model

- In docked graph mode, internal document nodes keep the current immediate-navigation behavior.
- In fullscreen explore mode, internal document node clicks update the selected-node state instead of navigating immediately.
- In fullscreen explore mode, external node clicks still open a new tab immediately.
- In fullscreen explore mode, background clicks clear selected-node state.
- For this iteration, opening a selected node happens only through the explicit strip button; double-click-to-open is out of scope.
- Edge/link clicks remain unchanged and out of scope for this iteration.

### Presentation

- `GraphPanel` renders the floating info strip as fullscreen-only chrome layered above `GraphView`.
- The strip shows the selected document title, the `docName`, and an explicit open action.
- The canvas distinguishes three meaningful states:
  - active document
  - selected document
  - active-and-selected document
- If the selected node is already the active document, the strip remains visible and the state is still rendered as intentional rather than hidden.

## Test Cases To Cover

- Fullscreen internal-node click selects and reveals the strip.
- Fullscreen selected-node open action exits fullscreen and navigates.
- Fullscreen background click clears selection and hides the strip.
- Fullscreen active node vs selected node styling remains distinct.
- Fullscreen selected-node state preserves anchors when opening anchored graph nodes.
- Docked graph click behavior is unchanged.
- External node behavior is unchanged.
- Selection state remains coherent when the active document changes after opening a selection.

## Assumptions For Handoff

- No double-click shortcut in v1; explicit open action only.
- Selected-node state is ephemeral fullscreen UI state and does not persist across fullscreen exit/re-entry.
- Clicking an already-selected node leaves it selected; no toggle-to-clear behavior is required.
- Edge/link click UX is explicitly deferred.
