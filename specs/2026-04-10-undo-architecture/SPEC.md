# Undo/Redo Architecture — Spec

**Status:** Draft
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-10
**Baseline commit:** `cee96da`
**Links:**
- Evidence: `./evidence/`
- Prior PR: [#34 — bridge integration test matrix](https://github.com/inkeep/open-knowledge/pull/34) (surfaced R4-R8)
- Prior PR: [#20 — CRDT stress testing suite](https://github.com/inkeep/open-knowledge/pull/20)
- Prior spec: `specs/2026-04-08-crdt-stress-testing/SPEC.md`
- Prior spec: `specs/2026-04-07-bidirectional-observer-sync/SPEC.md`

---

## 1) Problem statement

**Situation.** Open Knowledge is a CRDT collaborative editor where AI agents and humans co-edit markdown documents through a dual-representation bridge: Y.XmlFragment for WYSIWYG (TipTap/ProseMirror) and Y.Text for Source mode (CodeMirror). Bidirectional observers sync between representations. The product shipped a spike-quality undo scaffold (PR #7) limited to agent-only undo via a server-side `Y.UndoManager` tracking the `'agent-write'` origin, exposed through HTTP polling and an "Undo Agent Edit" button. ProseMirror's native Cmd+Z was disabled entirely (`StarterKit.configure({ undoRedo: false })`).

**Complication.** The scaffold has five interlocking problems that together mean the product has no viable undo story:

1. **Users cannot undo their own edits** — the most fundamental editor operation is missing. ProseMirror undo is disabled; no Y.UndoManager-based replacement was configured.
2. **Agent undo leaks content** — Observer A's line-level `diffLines` merges user and agent contributions on the same Y.Text line item. Server-side `UndoManager.undo()` reverses `'agent-write'` items but `'sync-from-tree'` items (containing mixed content) survive. Measured: ~257 chars of zombie content per undo cycle.
3. **Sub-line concurrent edits cause silent data loss** — when agent patches and user keystrokes touch the same line, Observer A creates a single merged item. Undo removes both contributors' work.
4. **Both observers run unconditionally** — no modal architecture pauses the inactive observer during mode toggles. Rapid WYSIWYG↔Source switches during mid-propagation can violate the bridge invariant.
5. **Markdown round-trip normalization silently rewrites content** — every agent write gets re-serialized through the ProseMirror schema, changing formatting with no notification or API contract.

These share root causes (line-level diffing, no observer modal architecture, no client-server undo coordination) and compound as the product adds agent capabilities. The scaffold is actively misleading — it suggests undo "works" when it's architecturally broken.

**Resolution.** Remove the broken scaffold and specify what correct undo requires — architecture, user stories, constraints, and the root causes that must be addressed. This spec becomes the reference for implementing undo correctly.

## 2) Goals

- **G1:** Document the architecture requirements for correct undo/redo across the dual-representation CRDT bridge — what must be true for user undo, agent undo, and their interaction.
- **G2:** Catalog the root causes (R4-R8) with reproduction evidence so implementers don't rediscover them.
- **G3:** Define user stories with acceptance criteria that validate undo correctness — including the edge cases the scaffold failed on.
- **G4:** Identify architectural options (shared UndoManager, per-editor managers with coordination, observer granularity changes) with tradeoffs.
- **G5:** Specify the scaffold removal scope — what to delete, what to keep (origin tracking is load-bearing), and what tests to preserve vs remove.

## 3) Non-goals

- **[NOT NOW]** NG1: **Implement undo/redo.** This spec defines the requirements and architecture; implementation is a separate story. — Revisit if: spec is approved and prioritized.
- **[NOT NOW]** NG2: **Multi-user undo coordination.** Two humans editing simultaneously with independent undo stacks. Current product is single-user-per-process. — Revisit if: hosted multi-user deployment becomes P0.
- **[NOT NOW]** NG3: **Streaming agent undo.** Agent writes via token streaming where one "agent action" spans multiple transactions. — Revisit if: streaming agent writes are implemented (captureTimeout grouping would matter).
- **[NOT UNLESS]** NG4: **Document-level version history.** Snapshots/revisions beyond per-operation undo. — Only if: users need "go back to yesterday" rather than "undo last 3 actions."
- **[NEVER]** NG5: **Modifying Yjs UndoManager internals.** We treat Y.UndoManager as a black box and work within its API surface.

## 4) Personas / consumers

- **P1: Human editor** — Types in WYSIWYG or Source mode. Needs Cmd+Z/Ctrl+Z for their own mistakes. Expects undo to work like every other editor they've used.
- **P2: AI agent (via MCP/API)** — Writes markdown through `/api/agent-write-md`. Needs its writes to be revertable by the human without affecting the human's own content.
- **P3: CRDT-layer developer** — Implementing undo. Needs clear architecture requirements, known constraints, and documented pitfalls so they don't repeat the scaffold's mistakes.
- **P4: Product engineer** — Building the undo UI/UX. Needs to understand what state to expose (canUndo, canRedo), how to surface it (reactive vs polling), and how it behaves across mode switches.

## 5) User journeys

### P1: Human editor — happy path

1. User opens document in WYSIWYG mode
2. Types several paragraphs
3. Presses Cmd+Z — last paragraph disappears (undo)
4. Presses Cmd+Shift+Z — paragraph reappears (redo)
5. Switches to Source mode
6. Edits markdown text
7. Presses Cmd+Z — last source edit undoes
8. Switches back to WYSIWYG — content is consistent

### P1: Human editor — interleaved with agent

1. User is typing in WYSIWYG
2. Agent writes a section via API (appears in real-time with flash animation)
3. User continues typing in a different section
4. User presses Cmd+Z — **their own last edit undoes, agent content preserved**
5. User clicks "Undo Agent Edit" — agent's section disappears, user's content preserved
6. Undo state updates reactively (no 2s polling delay)

### P1: Human editor — failure/recovery

1. User and agent edit the **same line** concurrently
2. User presses Cmd+Z — **only the user's characters on that line undo, agent's characters preserved**
3. If undo produces unexpected state, user presses Cmd+Z again to continue reverting, or Cmd+Shift+Z to restore

### P2: AI agent — undo via MCP

1. Agent writes content via `write_document` MCP tool
2. Agent realizes the write was wrong
3. Agent calls `undo_agent_edit` MCP tool — its own write reverts
4. User's concurrent edits are preserved
5. Agent gets confirmation with updated canUndo/canRedo state

### Interaction state matrix

| Surface | No undo history | User can undo | Agent can undo | Both can undo | Undo in progress |
|---|---|---|---|---|---|
| WYSIWYG editor | Cmd+Z disabled | Cmd+Z active | "Undo Agent Edit" visible | Both active | Brief: content updating |
| Source editor | Cmd+Z disabled | Cmd+Z active | "Undo Agent Edit" visible | Both active | Brief: content updating |
| MCP tools | undo_agent_edit returns canUndo:false | N/A (user doesn't use MCP) | undo_agent_edit returns canUndo:true | N/A | Tool returns updated state |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR-1 | User can undo/redo their own edits via Cmd+Z/Cmd+Shift+Z in WYSIWYG mode | Pressing Cmd+Z reverts the user's last edit. Agent content is not affected. Works for text insertion, deletion, formatting changes. | Currently disabled — `StarterKit.configure({ undoRedo: false })` |
| Must | FR-2 | User can undo/redo their own edits via Cmd+Z/Cmd+Shift+Z in Source mode | Same as FR-1 but in CodeMirror. | CodeMirror's y-codemirror.next already supports this if configured |
| Must | FR-3 | Agent writes can be reverted without affecting user content | After agent write + user edit (on different lines), reverting agent write preserves all user content. Zero zombie residue. | The ~257 char/turn residue from R5 must not occur |
| Must | FR-4 | Undo correctly handles interleaved user+agent edits on the same line | User types "Hello" on line 5, agent appends " World" on line 5. User undo removes "Hello", agent's " World" preserved (or vice versa). | Requires character-level undo granularity — R5/R6 root cause |
| Must | FR-5 | Undo state (canUndo/canRedo) is reactive, not polled | UI updates within 100ms of undo state change. No HTTP polling. | Prior scaffold polled every 2s |
| Must | FR-6 | Undo works correctly across WYSIWYG↔Source mode switches | User types in WYSIWYG, switches to Source, presses Cmd+Z. The last WYSIWYG edit undoes (reflected in Source). No bridge invariant violation. | Depends on shared vs per-editor UndoManager decision (D1) |
| Should | FR-7 | Agent undo is available via MCP tool | `undo_agent_edit` tool reverts the agent's last write. Returns updated canUndo/canRedo state. | Keep MCP surface but fix the underlying mechanism |
| Should | FR-8 | Undo UI shows clear indication of what will be undone | User knows whether Cmd+Z will undo their edit or an agent edit before pressing it. | UX design decision — tooltip, separate buttons, or unified stack |
| Could | FR-9 | Undo groups "one agent action" into one undo step | If agent writes 3 paragraphs in one API call, one undo removes all 3 (not paragraph-by-paragraph). | Y.UndoManager `captureTimeout: 0` already does this for single-transaction writes |

### Non-functional requirements

- **Performance:** Undo/redo must execute in <50ms for documents up to 50K characters. Observer A character-level diff must add <5ms per sync.
- **Reliability:** Zero zombie content accumulation across 20+ undo cycles (regression from R5).
- **Consistency:** Bridge invariant (Y.Text == serialized Y.XmlFragment) must hold after every undo/redo operation.

## 7) Success metrics & instrumentation

- **Metric 1: Undo correctness**
  - Baseline: ~257 chars zombie residue per cycle (measured in PR #34)
  - Target: 0 chars residue across 20 cycles
  - Instrumentation: Stress test assertion in bridge matrix tests
- **Metric 2: Undo latency**
  - Baseline: N/A (no user undo exists)
  - Target: <50ms for undo operation, <100ms for UI state update
  - Instrumentation: Performance test in stress suite
- **Metric 3: Undo adoption**
  - Baseline: N/A
  - Target: Cmd+Z keyboard shortcut works in both modes
  - Instrumentation: Telemetry event on undo/redo action

## 8) Current state (how it works today)

### What exists

The editor has a dual-representation CRDT bridge:

```
Y.Doc
├── Y.XmlFragment('default')  ← TipTap/ProseMirror (WYSIWYG)
├── Y.Text('source')          ← CodeMirror (Source mode)
├── Y.Map('metadata')         ← frontmatter cache
└── Y.Map('activity')         ← agent write attribution

Observer A: XmlFragment → Text (diffLines, origin: 'sync-from-tree')
Observer B: Text → XmlFragment (parse + updateYFragment, origin: 'sync-from-text')
```

Agent writes go through Y.Text with origin `'agent-write'`, then `syncTextToFragment()` updates XmlFragment.

### What's broken (scaffold)

1. **ProseMirror undo disabled:** `StarterKit.configure({ undoRedo: false })` in `packages/core/src/extensions/shared.ts:15`
2. **Server-side UndoManager:** Tracked only `'agent-write'` origin on Y.Text — could not undo user edits, and leaked content when user+agent touched same line
3. **HTTP polling UI:** `AgentUndoButton` polled `/api/agent-undo-status` every 2-30s
4. **No client-side undo integration:** Neither TipTap's `yUndoPlugin` nor CodeMirror's `yCollab` undo were configured
5. **Line-level Observer A:** `diffLines` treats lines as atomic, preventing character-level undo isolation

### Key constraints (load-bearing, cannot change)

- `AGENT_WRITE_ORIGIN = 'agent-write'` — used by `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` in all agent write paths. This is load-bearing for observer origin guards.
- `ORIGIN_TREE_TO_TEXT = 'sync-from-tree'` and `ORIGIN_TEXT_TO_TREE = 'sync-from-text'` — load-bearing for preventing infinite observer loops.
- The dual-representation bridge (XmlFragment + Y.Text) is the product architecture — undo must work within it.
- Both TipTap and CodeMirror accept external Y.UndoManager instances (verified in evidence/yjs-undomanager-api.md).

### Known gaps discovered during research

- TipTap's `@tiptap/extension-collaboration` provides `yUndoPlugin` which wraps Y.UndoManager — but the extension is NOT currently used. The editor uses `HocuspocusProvider` with `ySyncPlugin` and `yCollaborationCursor` directly.
- CodeMirror's `yCollab()` creates its own Y.UndoManager by default, or accepts an external one. The `undoManager` option can also be set to `false` to disable.
- Y.UndoManager can scope to **multiple Y.Types** simultaneously — `new Y.UndoManager([yxmlFragment, ytext])` is valid. This enables a shared UndoManager pattern.

## 9) Proposed solution (vertical slice)

### Architecture decision: Shared vs separate UndoManagers (D1)

This is the central 1-way-door decision. See Decision Log D1.

**Recommended: Option B — Per-editor UndoManagers with agent UndoManager**

Three Y.UndoManagers:
1. **WYSIWYG UndoManager** — scoped to Y.XmlFragment, tracks `ySyncPluginKey` origin (user edits via ProseMirror). Created by TipTap's `yUndoPlugin`.
2. **Source UndoManager** — scoped to Y.Text, tracks local origin (user edits via CodeMirror). Created by `yCollab()`.
3. **Agent UndoManager** — scoped to Y.Text, tracks `'agent-write'` origin. Server-side, exposed via API/MCP.

**Why not shared:** A shared UndoManager tracking both Y.Types would capture Observer A/B sync transactions (they write to the "other" Y.Type). Excluding sync origins (`sync-from-tree`, `sync-from-text`) means the shared manager only sees direct edits — but undo on Y.XmlFragment doesn't automatically propagate to Y.Text (Observer A only fires on `observeDeep`, not on undo-originated changes). The observers would need to detect and propagate undo, which re-introduces the line-level diffLines problem.

Per-editor managers avoid this: each editor undoes its own Y.Type, and the observers propagate the result to the other Y.Type naturally.

### System design

```
┌─────────────────────────────────────────────────┐
│                    Y.Doc                         │
│                                                  │
│  ┌─────────────────┐     ┌──────────────────┐   │
│  │ Y.XmlFragment   │     │ Y.Text('source') │   │
│  │ ('default')     │     │                  │   │
│  └────────┬────────┘     └────────┬─────────┘   │
│           │                       │              │
│     ┌─────┴──────┐         ┌─────┴──────┐       │
│     │ WYSIWYG UM │         │ Source UM  │       │
│     │ (client)   │         │ (client)   │       │
│     │ tracks:    │         │ tracks:    │       │
│     │ ySyncKey   │         │ local/null │       │
│     └────────────┘         └────────────┘       │
│                                                  │
│                       ┌──────────────┐           │
│                       │ Agent UM     │           │
│                       │ (server)     │           │
│                       │ tracks:      │           │
│                       │ agent-write  │           │
│                       └──────────────┘           │
│                                                  │
│     Observer A ──────────────────► (tree→text)   │
│     Observer B ◄────────────────── (text→tree)   │
└─────────────────────────────────────────────────┘
```

**Data flow for user undo in WYSIWYG:**
1. User presses Cmd+Z → TipTap dispatches undo command
2. WYSIWYG UndoManager reverts last user edit on Y.XmlFragment
3. Observer A detects XmlFragment change → computes diff → writes delta to Y.Text (origin: `sync-from-tree`)
4. CodeMirror view updates from Y.Text change
5. Bridge invariant holds

**Data flow for user undo in Source:**
1. User presses Cmd+Z → CodeMirror dispatches undo
2. Source UndoManager reverts last user edit on Y.Text
3. Observer B detects Y.Text change → parses markdown → updates XmlFragment (origin: `sync-from-text`)
4. TipTap view updates from XmlFragment change
5. Bridge invariant holds

**Data flow for agent undo (via API/MCP):**
1. Agent calls `undo_agent_edit` → server-side Agent UndoManager reverts on Y.Text
2. Server calls `syncTextToFragment()` → updates XmlFragment
3. Changes propagate to clients via Hocuspocus WebSocket
4. Both editors update from remote Y.Doc changes
5. Undo state broadcast via Y.Map or awareness channel

### Prerequisites: Observer A granularity fix (R5/R6)

FR-3 and FR-4 require Observer A to produce character-level diffs instead of line-level diffs. Without this, undo residue and sub-line data loss persist regardless of UndoManager architecture.

**Current:** `diffLines(oldMd, newMd)` treats lines as atomic units.
**Required:** Character-level or word-level diff that produces fine-grained Y.Text operations, so each contributor's characters are separate Y.Text items with distinct origins.

This is a prerequisite for correct undo, not part of the undo implementation itself. It should be its own story.

### Prerequisites: Observer modal architecture (R7)

FR-6 requires that mode switches don't cause observer races. The cleanest fix is pausing the inactive observer:
- In WYSIWYG mode: Observer A active, Observer B paused
- In Source mode: Observer B active, Observer A paused
- During mode switch: brief coordination window

This is also a prerequisite, not part of the undo implementation.

### Undo state reactivity (FR-5)

Replace HTTP polling with Y.UndoManager event observation:

**Option A: Y.Map undo state channel.** Server writes `{ canUndo, canRedo }` to `Y.Map('undoState')` after every agent write/undo/redo. Client reads reactively.

**Option B: Awareness channel.** Server sets undo state in agent's awareness. Client reads from provider awareness.

**Option C: Y.UndoManager `stack-item-added`/`stack-item-popped` events.** Client-side UndoManagers emit events directly. For agent undo, the server-side state change propagates via Y.Doc sync and the client observes the Y.Text change.

Recommendation: Option C for user undo (events are local, zero latency). Option A for agent undo state (Y.Map is the simplest persistent channel).

### Alternatives considered

**Option A: Shared UndoManager** — Single Y.UndoManager scoped to both Y.XmlFragment and Y.Text. Rejected because observer sync transactions would need special handling (exclude from tracking, but then undo on one Y.Type doesn't propagate to the other). Creates more complexity than it solves.

**Option C: No agent undo, user undo only** — Remove agent undo entirely, rely on Cmd+Z only. Rejected because P2 (AI agent) needs to self-correct without user intervention, and the MCP tool surface is valuable.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Per-editor UndoManagers (not shared) | T | DIRECTED | Yes | Shared UndoManager can't cleanly handle observer sync origins; per-editor managers let each editor undo its own Y.Type and observers propagate naturally | evidence/yjs-undomanager-api.md | Three UndoManagers to manage; undo history is per-mode not unified |
| D2 | Keep `AGENT_WRITE_ORIGIN` and origin tracking | T | LOCKED | Yes | Load-bearing for observer guards, agent undo isolation, and activity attribution | evidence/prior-scaffold-problems.md | All agent writes must continue using `dc.document.transact(fn, AGENT_WRITE_ORIGIN)` |
| D3 | Observer A must move to character-level diff | T | DIRECTED | No | Line-level diffLines is the root cause of R5 (residue) and R6 (sub-line data loss); no undo architecture works correctly without this | PR #34 stress test measurements | Moderate refactor of Observer A; ~1-5ms per sync; separate story |
| D4 | Undo state for user is event-driven (not polled) | T | DIRECTED | No | Y.UndoManager emits `stack-item-added`/`stack-item-popped` events; TipTap and CodeMirror bindings already use these | evidence/yjs-undomanager-api.md | No HTTP polling needed for user undo state |
| D5 | Remove prior scaffold before implementing | T | LOCKED | No | Scaffold is misleading and leaks content; clean slate is better starting point | evidence/prior-scaffold-problems.md | See §13 In Scope for removal list |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Should undo history be unified across modes or per-mode? | P | P0 | Yes | User test: does Cmd+Z in Source after typing in WYSIWYG undo the WYSIWYG edit? D1 says per-editor, but product intent matters. | Open |
| Q2 | What should the "Undo Agent Edit" UX look like? | P | P0 | No | Separate button vs unified Cmd+Z stack vs contextual menu. Depends on Q1. | Open |
| Q3 | How should markdown normalization (R8) be communicated? | P/T | P0 | No | Options: pre-normalize before write, document as API contract, or fix the round-trip to be identity. | Open |
| Q4 | Character-level diff algorithm for Observer A? | T | P0 | Yes (prereq) | Evaluate: diff-match-patch (Google), fast-diff (used by Yjs internally), or word-level diff as compromise. | Open |
| Q5 | Should mode switch pause observers or use a coordination lock? | T | P2 | No | Modal pause is simpler but may cause brief desync during switch. Lock is more complex but avoids any gap. | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | TipTap's yUndoPlugin accepts external UndoManager and works with HocuspocusProvider | HIGH | Verified from source: `yUndoPlugin({ undoManager })` parameter exists | Before implementation | Active |
| A2 | CodeMirror's yCollab accepts external UndoManager | HIGH | Verified from source: `yCollab(ytext, awareness, { undoManager })` | Before implementation | Active |
| A3 | Per-editor UndoManagers don't interfere with each other when observers propagate changes | MEDIUM | Need integration test: user undo in WYSIWYG → Observer A writes to Y.Text → Source UndoManager must NOT capture that as an undo step | Before implementation | Active |
| A4 | Character-level diff adds <5ms per Observer A sync for documents up to 50K chars | LOW | Benchmark with diff-match-patch and fast-diff on realistic fixtures | During Observer A refactor | Active |

## 13) In Scope (implement now)

### Scaffold removal

**Goal:** Remove the broken undo scaffold so it doesn't mislead implementers.

**What to remove:**
- Server: UndoManager lifecycle in `agent-sessions.ts`, undo/redo/status endpoints in `api-extension.ts`
- Client: `AgentUndoButton.tsx` (entire file), import in `EditorHeader.tsx`
- CLI: `undo_agent_edit` and `redo_agent_edit` MCP tools
- Tests: Undo-specific test suites (keep origin guard tests)
- Docs: Undo references in `AGENTS.md`
- Agent sim: Undo status polling

**What to keep:**
- `AGENT_WRITE_ORIGIN` constant and its use in `dc.document.transact()` — load-bearing for observer guards
- Origin tracking (`ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE`) — load-bearing for observer loop prevention
- All non-undo tests (propagation matrix, conversion fidelity, stress tests minus undo scenarios)

**Acceptance criteria:**
- All undo code removed
- `bun run lint`, `bunx tsc --noEmit`, `bun test` pass in all packages
- App starts without undo button, agent writes still work
- MCP tools list shows 6 tools (not 8)
- `AGENT_WRITE_ORIGIN` still used in agent write paths

### Spec document (this document)

**Goal:** Provide the architecture reference for implementing undo correctly.

**Acceptance criteria:**
- All 5 risks (R4-R8) documented with root causes and reproduction evidence
- User stories with acceptance criteria that cover the edge cases the scaffold failed on
- Architecture options evaluated with tradeoffs
- Prerequisites identified (Observer A granularity, observer modal architecture)
- Decision log records the architectural choices and their rationale

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| R-NEW-1: Removing scaffold blocks agent self-correction | Medium | Medium | Agent can still use `write_document` with `mode: replace` to overwrite. Undo is convenience, not sole mechanism. | Implementer |
| R-NEW-2: Per-editor UndoManagers create confusing UX (undo in Source doesn't undo WYSIWYG edit) | Medium | Medium | Q1 and Q2 must resolve UX expectations before implementation. May need unified undo UI even with per-editor managers. | Product |
| R-NEW-3: Observer A character-level diff is slower than line-level | Low | Low | A4 assumption includes benchmark plan. Even 5ms overhead is acceptable for documents up to 50K chars. | Implementer |
| R-NEW-4: Scaffold removal breaks existing agent workflows | Low | Medium | No published agent relies on undo MCP tools yet (product is pre-release). | Product |

## 15) Future Work

### Explored

- **FR-1/FR-2: User undo/redo in both modes**
  - What we learned: TipTap's `yUndoPlugin` and CodeMirror's `yCollab` both accept external UndoManagers. Per-editor managers avoid observer sync complications. The collaboration extension provides undo commands that map to Y.UndoManager.
  - Recommended approach: Enable TipTap collaboration extension with `yUndoPlugin`, configure CodeMirror `yCollab` with undo enabled. Both use their default Y.UndoManager creation (scoped to their respective Y.Type).
  - Why not in scope now: Requires Observer A granularity fix first (character-level diff). Without it, undo correctness can't be guaranteed for interleaved edits.
  - Triggers to revisit: After Observer A refactor lands.
  - Implementation sketch: In `TiptapEditor.tsx`, add `yUndoPlugin()` to ProseMirror plugins (via collaboration extension or directly). In `SourceEditor.tsx`, ensure `yCollab()` has `undoManager` not set to `false`. Test with bridge matrix.

- **FR-3/FR-4: Agent undo without content leakage**
  - What we learned: The root cause is Observer A's line-level diffLines, not the UndoManager itself. Server-side Agent UndoManager with `trackedOrigins: Set(['agent-write'])` is the correct approach, but it only works if Observer A produces character-level Y.Text items so agent and user contributions don't merge.
  - Recommended approach: Keep server-side Agent UndoManager pattern, but implement after Observer A refactor.
  - Why not in scope now: Same prerequisite — Observer A granularity.
  - Triggers to revisit: After Observer A refactor lands and bridge matrix tests pass with character-level diff.

- **Observer A character-level diff (prerequisite for FR-3/FR-4)**
  - What we learned: `diffLines` (from `diff` npm package) is the bottleneck. Yjs internally uses `fast-diff` for character-level operations. Google's `diff-match-patch` is another option. The key constraint: character-level diff produces many more Y.Text operations per sync, which may affect performance and captureTimeout grouping.
  - Recommended approach: Replace `diffLines` with `fast-diff` (already a Yjs dependency) or `diff-match-patch`. Benchmark on 10K, 50K, 100K char fixtures.
  - Why not in scope now: Moderate refactor with performance implications — needs its own story with benchmarks.
  - Triggers to revisit: When undo implementation is prioritized.

### Identified

- **Observer modal architecture (R7 fix)**
  - What we know: Both observers run unconditionally. Origin guards and timing defers provide partial protection. Rapid mode toggles can race.
  - Why it matters: FR-6 (undo across mode switches) requires no observer races. Also improves correctness for all operations, not just undo.
  - What investigation is needed: Determine whether "pause inactive observer" or "coordination lock" is the right approach. Check if pausing creates a desync window during switch.

- **Markdown normalization contract (R8)**
  - What we know: ProseMirror schema normalization is inherent — the round-trip can't be identity without modifying the schema. Pre-normalization (normalizing agent input before writing) was investigated in PR #20 and reverted.
  - Why it matters: Agents doing multi-turn editing see phantom diffs. Needs either pre-normalization, a documented API contract ("your input may be normalized"), or both.
  - What investigation is needed: Why was pre-normalization reverted in PR #20? Can it be done at the API boundary (before Y.Text write) with acceptable performance?

- **Reactive agent undo state**
  - What we know: HTTP polling (2s) was the scaffold's approach. Y.Map or awareness channel would be reactive. Y.UndoManager emits events but server-side events don't auto-propagate to clients.
  - Why it matters: FR-5 requires <100ms state update.
  - What investigation is needed: Determine whether Y.Map('undoState') or awareness channel is the better transport for server→client undo state.

### Noted

- **Unified undo history across modes** — If product decides undo should work across mode switches (Q1), a more complex coordination layer is needed. Per-editor managers don't automatically provide this.
- **Undo for concurrent multi-agent writes** — Multiple agents editing the same document, each with independent undo. Current design assumes single agent.
- **Undo instrumentation/telemetry** — Track undo usage patterns to inform future UX decisions.

## 16) Agent constraints

- **SCOPE:** `packages/server/src/agent-sessions.ts`, `packages/server/src/api-extension.ts`, `packages/app/src/presence/AgentUndoButton.tsx`, `packages/app/src/components/EditorHeader.tsx`, `packages/cli/src/mcp/tools.ts`, `packages/app/src/server/agent-sim.ts`, undo-specific test suites, `AGENTS.md`
- **EXCLUDE:** `packages/app/src/editor/observers.ts` (Observer A refactor is a separate story), `packages/core/src/extensions/shared.ts` (keep `undoRedo: false` until user undo is implemented), `packages/server/src/persistence.ts`, `packages/server/src/file-watcher.ts`
- **STOP_IF:** Any change would break the `AGENT_WRITE_ORIGIN` transaction pattern or observer origin guards. Any change would remove non-undo tests.
- **ASK_FIRST:** If removing code that appears load-bearing beyond undo (e.g., `syncTextToFragment` is used by both undo and agent write — only remove the undo call sites, not the function).
