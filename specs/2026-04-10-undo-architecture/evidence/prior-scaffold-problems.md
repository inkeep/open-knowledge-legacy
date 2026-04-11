---
title: Prior undo scaffold problems — R4-R8 from PR #34
type: investigation
sources:
  - https://github.com/inkeep/open-knowledge/pull/34
  - packages/app/src/editor/observers.ts
  - packages/server/src/agent-sessions.ts
  - packages/server/src/api-extension.ts
  - packages/app/src/presence/AgentUndoButton.tsx
  - packages/core/src/extensions/shared.ts
date: 2026-04-10
---

# Prior undo scaffold problems

Surfaced as risks R4-R8 in PR #34 (bridge integration test matrix).

## R4 (HIGH): No user undo — ProseMirror Cmd+Z disabled

**What:** `StarterKit.configure({ undoRedo: false })` at `packages/core/src/extensions/shared.ts:15`. The only undo was a server-side Y.UndoManager tracking `'agent-write'` origin, exposed via HTTP polling (2s interval) and an "Undo Agent Edit" button.

**Root cause:** The scaffold disabled ProseMirror undo to avoid split-brain but never replaced it with a Y.UndoManager-based user undo. The collaboration extension (`@tiptap/extension-collaboration`) provides its own undo via `yUndoPlugin`, but it was never configured.

**Current state (confirmed):** `undoRedo: false` is still set. TipTap's collaboration extension is not loaded (the editor uses `HocuspocusProvider` directly with `ySyncPlugin` and `yCollaborationCursor` but no `yUndoPlugin`).

## R5: Undo residue accumulates ~257 chars/turn

**What:** Observer A uses `diffLines` (line-level granularity) to sync XmlFragment→Y.Text. When user and agent edits touch the same line, Observer A creates a single `'sync-from-tree'` origin item covering both. Server-side UndoManager only tracks `'agent-write'` origin, so the `'sync-from-tree'` items survive undo.

**Measured:** ~257 chars of zombie content per undo cycle with 10K fixture. Only 3 cycles tested. The stress test used a proportional threshold (`ytext.length < FIXTURE.length * 0.3`) rather than content-based assertion — masking the residue.

**Root cause:** Line-level diff granularity in Observer A. Character-level diff would allow more precise undo, but adds ~1-3ms per sync.

## R6: Sub-line concurrent writes cause silent data loss

**What:** Agent patches within a user's active line produce merged Y.Text items where undo affects both contributors. Not yet triggered in production because no sub-line agent write API exists yet, but `agent-patch` is planned.

**Root cause:** Same as R5 — line-level diffLines treats lines as atomic units.

## R7: Observer race during rapid mode toggles

**What:** Both Observer A and Observer B run unconditionally regardless of active editor mode. No modal architecture. Origin guards and timing deferrals (300ms typing defer) provide partial protection, but rapid WYSIWYG↔Source toggles during mid-propagation can cause bridge invariant violations.

**Root cause:** No observer lifecycle management tied to active mode.

## R8: Markdown round-trip normalization silently modifies content

**What:** `syncTextToFragment()` in `agent-sessions.ts:43-66` parses Y.Text markdown, updates XmlFragment, then re-serializes to canonical form and overwrites Y.Text if different. This happens on every agent write.

**Example:** `## Heading\nContent` becomes `## Heading\n\nContent` (adds blank line between heading and paragraph).

**Root cause:** ProseMirror's schema normalizes document structure during parsing. The round-trip (markdown → ProseMirror JSON → markdown) is not identity.

## Scaffold code inventory (for removal)

### Server
- `packages/server/src/agent-sessions.ts`: undoManagers map, getUndoManager(), getExistingUndoManager(), UndoManager destroy in closeSession()
- `packages/server/src/api-extension.ts`: handleAgentUndoStatus (lines 182-205), handleAgentUndo (lines 207-239), handleAgentRedo (lines 241-273), 3 route entries

### Client
- `packages/app/src/presence/AgentUndoButton.tsx`: entire file (133 lines)
- `packages/app/src/components/EditorHeader.tsx`: AgentUndoButton import and render (lines 5, 45)

### CLI
- `packages/cli/src/mcp/tools.ts`: undo_agent_edit tool (lines 165-174), redo_agent_edit tool (lines 176-185)

### Tests (undo-specific, not origin guards)
- `packages/app/src/editor/observers.test.ts`: "Per-origin undo" suite (lines 446-625)
- `packages/app/src/editor/observer-sync.test.ts`: "Undo isolation" suite (lines 333-386)
- `packages/app/tests/stress/observers.stress.test.ts`: S4 undo during typing, S3 undo chain
- `packages/app/tests/stress/observers.fuzz.test.ts`: agentUndo/agentRedo fuzz actions
- `packages/app/tests/stress/stress-api.ts`: S3 undo chain scenario
- `packages/app/tests/stress/crdt-stress.spec.ts`: undo button assertions in S6

### Documentation
- `AGENTS.md`: undo API endpoint rows, UndoManager architecture reference, AgentUndoButton reference

### Agent simulator
- `packages/app/src/server/agent-sim.ts`: checkUndoStatus(), undo status output
