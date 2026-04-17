---
name: Bug-D — post-undo XmlFragment-rebuild destroys concurrent user content
sources:
  - packages/server/src/agent-sessions.ts:53-86 (syncTextToFragment)
  - packages/app/tests/integration/bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts
  - projects/v0-launch/PROJECT.md:107-148 (V0-14 per-agent UM design)
confidence: HIGH
status: HANDED OFF TO V0-14 — fix shape documented, regression test committed skip-guarded
---

# Bug-D mechanism

## What it is

The analog of Bug-A on the **undo** path. When a future V0-14 per-agent `Y.UndoManager` calls `um.undo()`, the CLAUDE.md STOP rule (pre-this-spec) directs the implementer to call `syncTextToFragment()` afterward. `syncTextToFragment` reads Y.Text as authoritative and rebuilds XmlFragment from it. If a user is typing in WYSIWYG concurrent with the undo, XmlFragment has user content the reverted Y.Text does not — `syncTextToFragment` then destroys that content via structural diff, exactly the same way Bug-A's server stomp destroys user XmlFragment content.

## Reproducer

`packages/app/tests/integration/bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts` — two tests:

1. **D-iso-1 (mechanism):** synthetic Y.Doc. Seed XmlFragment with user+agent content; Y.Text captures agent-only state (simulating post-undo); call local replica of `syncTextToFragment`. Result: XmlFragment stomped to agent-only state. User content destroyed.
2. **D-iso-2 (V0-14 flow):** real Hocuspocus server + client. Simulate full V0-14 flow: agent write → user concurrent type → server-side UM undo → server calls `syncTextToFragment`. Result: user's concurrent typing is destroyed on the post-undo rebuild.

Both tests empirically confirm the mechanism. Neither fires today because no `um.undo()` caller exists (V0-16 removed the undo scaffold per TQ13).

## Why this spec does not fix it

Bug-D's fix is **design-coupled to V0-14's undo contract**, not purely a bridge-invariant concern:

- **What does undo mean in a multi-agent world?** Product decision: snapshot-restore (revert entire edit region, potentially absorbing user's concurrent typing — user can redo) vs. contribution-scoped (revert only agent's Items, preserve user's concurrent Items). Both are defensible; different products (Google Docs, Notion, Figma) make different calls.
- **Where does the UM live?** Server-side per-agent UM (Miles's design) vs. client-local UM vs. hybrid. Affects which origin the post-undo rebuild uses and how the rebuild propagates.
- **What is the post-undo-rebuild origin?** If the rebuild fires under `AGENT_WRITE_ORIGIN`, the next undo captures it (infinite loop). If under a new origin, what's its relationship to UM tracking? V0-14 call.
- **Does the server broadcast after undo, or does each client undo locally?** Affects the bridge cycle.

None of these are bridge invariants. They are contract decisions Miles owns for V0-14. This spec's Bug-A fix establishes the **pattern** V0-14 should follow — XmlFragment-authoritative composition, minimal Y.Text mirror. V0-14's agent-undo handler is "the same shape" with origin + topology decisions made by its owner.

## What this spec contributes to the Bug-D resolution

1. **Deletes `syncTextToFragment` entirely** (FR-9). After this spec's Bug-A migration, the function has zero callers (verified via transitive-dependency trace; see spec §8 OQ-8). Keeping it would actively direct V0-14's implementer toward the known-buggy pattern. Deletion forces V0-14 to design the agent-undo rebuild fresh using the XmlFragment-authoritative pattern established by `applyAgentMarkdownWrite`.
2. **Rewrites the CLAUDE.md STOP rule** (FR-9). Old: "Always call `syncTextToFragment` after `um.undo()` / `um.redo()`." New: points at the XmlFragment-authoritative pattern template and warns that a naive rebuild-from-Y.Text destroys concurrent user content.
3. **Commits the Bug-D regression test skip-guarded** (FR-10). V0-14 unskips it when wiring the per-agent UM. The test then fails until V0-14 implements the correct pattern. This turns Bug-D from "documented future concern" into a named gate on V0-14's delivery.
4. **Documents the fix shape** (this file + spec §7e Future Work). V0-14's implementer has a named template — `applyAgentUndo` mirroring `applyAgentMarkdownWrite`'s structure: read XmlFragment post-undo, compose with user's concurrent XmlFragment state, write both sides in one transaction. Origin and topology are V0-14's call.

## V0-14 pickup points (for Miles)

When V0-14 wires per-agent UM + agent-undo endpoint, the post-undo rebuild handler must:

- **NOT** use `syncTextToFragment`-style rebuild-from-Y.Text (deleted in this spec).
- **DO** follow the `applyAgentMarkdownWrite` pattern: XmlFragment is authoritative; Y.Text mirrors under minimal mutation via `applyByPrefixSuffix`.
- Choose an undo-origin (e.g., `AGENT_UNDO_ORIGIN`) that is NOT in `trackedOrigins: Set([AGENT_WRITE_ORIGIN])` to avoid infinite capture loops.
- Unskip `bug-d-isolation-repro.test.ts` and make it pass.
- Expect conversations about the snapshot-vs-contribution-scoped undo semantics — this spec takes no position, only ensures the bridge invariant is preserved regardless of which semantic is chosen.

## Coordination with Miles's PR #134 (attribution)

Miles's in-flight PR #134 explicitly defers per-agent UM to V0-14 (his D7 LOCKED: "Per-agent undo: OUT OF SCOPE. Deferred to V0-14"). PR #134 touches the same 3 agent-write handlers this spec migrates, but for identity threading — not for sync mechanics. The two PRs have no architectural dependency: whichever lands first, the other rebases cleanly (either Miles's identity threading adopts `applyAgentMarkdownWrite`'s identity-aware signature, or this spec's migration moves Miles's already-threaded identity into the new helper). See spec §9 D13.
