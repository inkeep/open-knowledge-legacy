# Changelog

## 2026-04-08 — Pass 2 audit complete, all critical findings resolved

- F5 (CRITICAL): Browser-side UndoManager cannot capture remote origins. Architecture changed to server-side UndoManager with HTTP endpoints (D4 updated, D12 added, FR10 rewritten, §3.8 rewritten)
- F1: Activity map write moved inside transaction (code sample fixed)
- F2: Removed `affectedRange` from FR6 (contradicted D10 design)
- F3: Fixed package naming: CollaborationCursor (not Caret), @tiptap/extension-collaboration-cursor
- F7: Fixed Radix package: `radix-ui` monorepo (not `@radix-ui/react-tooltip`)
- F8: Fixed "blue tint" → "agent-colored tint" in FR7
- F9: Fixed mode field nesting in FR3 (top-level, not inside user)
- F10: Fixed selectionRender return type (DecorationAttrs, not HTMLElement)
- F11: Marked Q12 as superseded by C2 audit fix
- F14: Fixed React key to use awareness clientID instead of tabId

## 2026-04-08 — Approved (full scope, all 10 components)

- Status: Draft → Approved
- User decision: full v0 scope (rejected challenger's 6-component cut)
- Audit findings incorporated: C2 (UndoManager tracks only ytext), C3 (same-transaction mandate), I1/I6 (raw endpoint migration), I3 (server restart cleanup), M6 (mode awareness update on toggle)
- Worldmodel finding: TipTap renamed CollaborationCursor → CollaborationCaret (v3); package not in package.json
- ProseMirror decoration finding: CSS transitions don't survive re-renders → use @keyframes or direct DOM
- All P0 open questions resolved, all LOCKED decisions have source-verified evidence

## 2026-04-08 — Initial scaffold

- Created SPEC.md from intake findings
- Problem framing: SCR drafted and stress-tested (5 probes)
- Three parallel research investigations completed:
  1. Existing reports (9 reports read in full): multiplayer topologies, CRDT patterns, agent edit surfaces, conflict UX
  2. Fresh ecosystem research: TipTap collab ecosystem, y-codemirror.next awareness, Yjs awareness protocol, Hocuspocus v4, prior art (Liveblocks, Cursor, Copilot, Notion, Figma)
  3. Targeted source-code verification: DirectConnection awareness, origin propagation, UndoManager per-origin
- Key decisions locked: D1 (no suggest mode), D3 (agent-write origin), D4 (three UndoManagers), D5 (DirectConnection awareness), D7 (no fake cursor)
- Key assumptions verified from source: A1 (awareness broadcasts), A2 (UndoManagers don't conflict), A3 (origin lost in binding)
- Scaffold complete, worldmodel and backlog extraction pending
