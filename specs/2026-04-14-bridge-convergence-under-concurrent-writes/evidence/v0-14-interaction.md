---
name: V0-14 per-agent UM interaction under proposed fixes
sources:
  - projects/v0-launch/PROJECT.md:107-148
  - specs/2026-04-13-observer-a-origin-aware-diff/SPEC.md (PR #128)
  - packages/server/src/agent-sessions.ts
confidence: HIGH
---

# V0-14 per-agent UM under Bug-A and Bug-B fixes

## V0-14 design reminder

V0-14 wires `Y.UndoManager(ytext, { trackedOrigins: new Set([AGENT_WRITE_ORIGIN]), captureTimeout: 0 })` per agent, keyed by `AgentIdentity.connectionId`. The UM tracks Y.Text Items whose transaction origin matches the `AGENT_WRITE_ORIGIN` object reference (precedent #1: origins are `LocalTransactionOrigin` objects, not strings; Y.js `UndoManager` matches via `Set.has(tx.origin)` which is identity-based for objects — a string `'agent-write'` in the set would never match). `um.undo()` reverts those Items.

PR #128 ensured Observer A does not launder origins through re-emission. V0-14 inherits that.

## Agent write flow under the Bug-A fix (XmlFragment-first)

1. User types in WYSIWYG on client → XmlFragment local tx → propagates via CRDT to server's XmlFragment (but not yet to server's Y.Text because client's Observer A debounce hasn't fired).
2. Agent writes via `/api/agent-write*`. New handler path (Bug-A fix):
   - Read server's XmlFragment: `currentBody = serialize(xmlFragment)` — **includes user's typing via CRDT**
   - Compose agent's delta: `newBody = applyPosition(currentBody, agent's markdown, position)`
   - `updateYFragment(xmlFragment, parse(newBody))` — structural diff preserves user content Items, adds agent content Items under `AGENT_WRITE_ORIGIN`
   - `applyByPrefixSuffix(ytext, ytext.toString(), prependFrontmatter(fm, newBody))` — mirror Y.Text with minimal mutation. Touches only the agent-delta region. Agent region Items: `AGENT_WRITE_ORIGIN` ✓. User region in Y.Text (if any): preserved at prior origin ✓.
3. Server broadcasts the transaction to clients. Client CRDT merges — user content preserved, agent content added.

**Per-agent UM behavior:**
- `um.undoStack` gains one entry for the agent's Y.Text insert under `AGENT_WRITE_ORIGIN` ✓
- `um.undo()` reverts the Y.Text insert → Y.Text post-undo has user content only ✓
- Subsequent `syncTextToFragment`-after-undo call (per CLAUDE.md STOP rule) runs `updateYFragment(xmlFragment, parse(post-undo Y.Text))` → user content preserved via structural diff (both sides have user content); agent paragraphs removed ✓

## Peer WYSIWYG typing under the Bug-B fix (drift catcher)

1. Peer A and peer B type concurrently on same line in WYSIWYG.
2. XmlFragments converge via CRDT tree sync on both clients.
3. Both clients' Observer A remote-tx branches refresh baselines to include both contributions. Both debounces fire with `lastSyncedXmlMd === md`.
4. **New code** (Bug-B fix): detects `ytext.toString() !== md`, runs `applyByPrefixSuffix(ytext, currentText, md)` under `ORIGIN_TREE_TO_TEXT`.
5. Y.Text now contains both A's and B's edits. CRDT propagates between peers.

**Per-agent UM behavior:**
- Peer typing goes through Observer A → Y.Text Items created under `ORIGIN_TREE_TO_TEXT` origin (NOT `'agent-write'`)
- `trackedOrigins: Set(['agent-write'])` does NOT include `'sync-from-tree'`, so peer typing doesn't enter the agent's undo stack ✓
- When an agent writes later, its Items go under `AGENT_WRITE_ORIGIN` → added to agent UM stack ✓
- `um.undo()` reverts agent Items only, user typing preserved ✓

## Combined: agent + user concurrent scenario (the Bug-A + Bug-B spec flow)

1. User types in WYSIWYG (XmlFragment). Observer A schedules debounce.
2. Before debounce fires (< 50ms), agent writes via `/api/agent-write`. Server path uses Bug-A fix: reads XmlFragment (has user content via CRDT), composes agent delta, updateYFragment + applyByPrefixSuffix on Y.Text.
3. Server broadcasts. Client receives:
   - XmlFragment update: user content preserved, agent content added
   - Y.Text update: agent's region added under AGENT_WRITE_ORIGIN (from server transaction)
4. Client's Observer A remote-tx branch fires. Baseline refresh captures the combined state. Under Bug-B fix: if Y.Text drifted from XmlFragment (e.g., user's local XmlFragment typing hadn't reached Y.Text locally yet), the drift-catcher fires Path A-equivalent sync.
5. State converges: XmlFragment + Y.Text identical on client. Agent UM has one agent-origin entry.

`um.undo()` on the agent's UM (**V0-14 scope — NOT this spec**):
- Reverts agent Y.Text Items → Y.Text = user content (from either 'sync-from-tree' local sync or CRDT from server)
- **Bug-D applies if V0-14's undo handler uses the rebuild-from-Y.Text pattern.** If V0-14 inherits the old `syncTextToFragment`-style rebuild, concurrent user XmlFragment typing during the undo window is destroyed (same stomp shape as Bug-A, undo side). Empirically confirmed by `packages/app/tests/integration/bug-d-isolation-repro.test.ts` (D-iso-1 + D-iso-2).
- **This spec's handoff for Bug-D** (§7e, D12, FR-9, FR-10): `syncTextToFragment` deleted so V0-14 cannot inherit the mechanism; CLAUDE.md STOP rule rewritten to point at the XmlFragment-authoritative pattern; regression test committed skip-guarded; fix template in `bug-d-mechanism.md`.
- **When V0-14 implements `applyAgentUndo` correctly** (mirroring `applyAgentMarkdownWrite`'s XmlFragment-authoritative shape): user content preserved, agent content reverted, bridge invariant holds. No zombie content. No user content loss.

## Verification plan (for the spec's own tests)

The `P0` + `P0-stress` + `CONTROL` tests in `observer-a-baseline-absorption-repro.test.ts` are the failing harness. Post-fix, all four assertions must pass:
- P0: `expect(finalYtext).toContain('edited by user');` AND `expect(finalYtext).toContain('agent line X');`
- P0-stress: 10/10 user markers and 10/10 agent markers present
- P1: already passing (not affected)
- CONTROL: both clients' Y.Text contain both peer contributions

Plus a new integration test: agent write during user typing → agent undo → user typing preserved. This tests V0-14's product invariant end-to-end.
