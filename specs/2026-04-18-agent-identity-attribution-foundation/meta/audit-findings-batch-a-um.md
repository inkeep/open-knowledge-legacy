---
title: Audit findings — D21-D26 (UM mechanics + origin + effect-diff)
scope: D21, D22, D23, D24, D25, D26; FR-3, FR-4, FR-11
baseline_commit: 752e35bd
date: 2026-04-18
---

# Audit findings — batch A (UM mechanics + origin + effect-diff)

Cold-read audit of D21-D26 plus consistency check on FR-3, FR-4, FR-11. Verified against yjs v13.6.30 at `node_modules/yjs/src/utils/UndoManager.js`, v14-rc at `~/.claude/oss-repos/yjs/`, and repo code in `packages/server/src/`.

**Severity:** HIGH (claim contradicts code or architecturally wrong); MEDIUM (edge-case gap or partial verification); PRAGMATISM (directive violation); LOW (clean).

**Totals:** 2 HIGH, 4 MEDIUM, 0 PRAGMATISM, 2 LOW.

---

## D21 — UM auto-adds itself; trackedOrigins = writes only

| Claim | Status | Evidence |
|---|---|---|
| UM auto-adds itself at `UndoManager.js:181` | CONFIRMED | `trackedOrigins.add(this)` |
| Auto-add required for redo stack | CONFIRMED | Filter at `:215-216`; undoing/redoing branch at `:220-227`; UM-internal transact (origin=`this`) must pass filter to populate redoStack |
| Adding `session.undoOrigin` to trackedOrigins wipes redo on replay | CONFIRMED | `:227` clears redoStack when handler fires with `!undoing && !redoing`. `applyAgentUndo`'s outer transact carrying `session.undoOrigin` fires outside `um.undo()` context, so `undoing=false` → clear branch. |
| `captureTransaction: tr => tr.origin !== session.undoOrigin` defense-in-depth | CONFIRMED | `:168,214` — first-check gate in handler. |

**Severity: LOW.** Claims hold; decision is clean.

**Consistency nit:** consider noting in Implications that per-session UMs never share `trackedOrigins` Sets (a write by session B is invisible to session A's UM).

---

## D22 — Effect-diff via YTextEvent.delta, not transaction.changed

| Claim | Status | Evidence |
|---|---|---|
| `transaction.changed` is `Map<Type, Set<String\|null>>` (keys, not content) | CONFIRMED | `Transaction.js:79-81` — exact type annotation. |
| `YTextEvent.delta` is Quill Delta `{insert?, delete?, retain?}` | CONFIRMED | `YText.js:629`; lazy getter at `:655` caches `_delta`. |
| Yjs computes delta "free during observer fan-out; near-zero CPU" | PARTIAL | Lazy — computed on first access. Costs O(changed range) if read. "Free" is mild overreach. |

**Severity: LOW.** Minor prose overreach on "free." (See MEDIUM routing to FR-11 below for shape gap.)

---

## D23 — Deep-freeze origin + origin.context

| Claim | Status | Evidence |
|---|---|---|
| `Object.freeze` is shallow | CONFIRMED | ECMAScript spec / MDN. |
| Yjs never mutates origin.context | UNVERIFIABLE (high confidence) | Grep across `node_modules/yjs/src` finds no foreign-origin mutation; `Transaction.js:95` stores `this.origin = origin` by reference only. Cannot exhaustively prove. |
| Deep-freeze cost negligible | CONFIRMED | One-time, O(keys). |

**Severity: LOW.**

**Precedent alignment note:** Current `AGENT_WRITE_ORIGIN` at `agent-sessions.ts:57-61` uses `as const` + top-level literal — no `Object.freeze()` call. D23 is a net improvement; fold into the new AGENTS.md precedent entry per D48 so future origins inherit the discipline.

---

## D24 — captureTimeout = 500 (Y.UndoManager default)

| Claim | Status | Evidence |
|---|---|---|
| `captureTimeout = 500` is default | CONFIRMED | `UndoManager.js:166`. |
| Merge logic at `:231-248` collapses into prior stack item if `now-lastChange < captureTimeout` | CONFIRMED | `:239` exact condition. |
| Agent bursts typically 100-400ms between tool calls | UNVERIFIABLE (assumption) | No telemetry in repo. Plausible for sequential MCP tool calls; unvalidated against Claude Code with long-running inter-tool work. If measured gap >500ms, each write becomes its own undo step (worse UX). |

**Severity: MEDIUM.** Claim 3 is a product-UX hypothesis presented as fact; NFR-7 tier-2 perf test doesn't cover it.

**Suggested wording addition to D24 Implications:**
> "Validate empirically: measure inter-transact gap distribution during NFR-7 tier-2 perf run. If measured long-tail >500ms, reach for explicit `stopCapturing()` at reply boundaries before tuning `captureTimeout`."

---

## D25 — UM scope = [ytext, metaMap, activityMap]

| Claim | Status | Evidence |
|---|---|---|
| Agent writes touch all three inside one transact | CONFIRMED | `api-extension.ts:1086-1096, 1171-1181, 1665-1717` — `dc.document.transact(() => { applyAgentMarkdownWrite(...); activityMap.set(...) }, AGENT_WRITE_ORIGIN)`. `applyAgentMarkdownWrite` writes `metaMap` at `agent-sessions.ts:148`. |
| `agent-sessions.ts:93-163` does not call `transact` itself | CONFIRMED | No `.transact(` call; caller owns boundary. |
| UM with array scope makes one undo revert all three | CONFIRMED with caveat | `UndoManager.js:279-289` accepts array; `:215` filter fires if any scope type is changed. |

**Severity: MEDIUM.**

**GAP: `ignoreRemoteMapChanges` default is `false` for Y.Map scope members.** `UndoManager.js:170` default blocks UM from reverting Map keys that a remote peer has touched concurrently (`:134-141` JSDoc: "by default, the UndoManager will never overwrite remote changes"). Under P3 journey (two Claude instances both touching same doc's metadata/activity), D25's "one undo reverts ALL three" claim does NOT hold — silent partial undo.

**Suggested corrective wording for D25 Implications:**
> "`ignoreRemoteMapChanges` default (`false`) blocks UM from reverting metaMap/activityMap keys a remote peer has concurrently touched. Decide explicitly: (a) `ignoreRemoteMapChanges: true` on session UMs + product UX for stomp-on-concurrent; (b) scope UM to `[ytext]` only and treat metadata/activity as fire-and-forget side-channels replayed via separate mechanisms. Fold into Q104 empirical validation."

---

## D26 — Explicit session.um.destroy() on unload/delete/rename

| Claim | Status | Evidence |
|---|---|---|
| "Hocuspocus `unloadDocument()` doesn't call `ydoc.destroy()`" | **CONTRADICTED** | `oss-repos/hocuspocus/packages/server/src/Hocuspocus.ts:580` — `document.destroy()` IS called. `Document extends Doc` at `Document.ts:12`, so destroy IS `Y.Doc.destroy()` (inherited). `UndoManager.js:269-271` — `doc.on('destroy', () => this.destroy())` auto-tears-down UM. |
| UM holds stack items pointing at orphaned Y.Items → silent data loss | CONTRADICTED | Consequence of above: `document.destroy()` fires, UM auto-destroys. No orphan. |
| Explicit destruction needed on managed-rename | PARTIAL | Rename destroys old Y.Doc + constructs fresh one; UM auto-destroy still fires. Q48's "old Y.Items are gone from the new store" is correct; the rationale isn't "no auto-destroy," it's "stack migration across Y.Doc instances isn't supported." |

**Severity: HIGH.** Cited mechanism is wrong. The decision may still be sound as defense-in-depth or for session-record teardown coordination — but the rationale mischaracterizes Hocuspocus.

**Real hazard D26 should cover:** a session holding a DirectConnection that is NOT disconnected keeps `getConnectionsCount() > 0` (`Hocuspocus.ts:551`), blocks `shouldUnloadDocument`, leaves Y.Doc + UM loaded forever. The load-bearing call is `dc.disconnect()` (triggering the unload path at `DirectConnection.ts:84`); explicit `session.um.destroy()` is the defense-in-depth.

**Suggested corrective wording:**
> "D26 — Session UM destruction is coordinated with DirectConnection disconnect in `closeAllForAgent` / managed-rename / delete paths. UM auto-destroys on `doc.destroy()` (`UndoManager.js:269-271`), and Hocuspocus `Document.destroy()` IS invoked by `unloadDocument` (`Hocuspocus.ts:580`) via DirectConnection disconnect (`DirectConnection.ts:84`). The hazard is a session record retaining a DirectConnection without disconnecting — `getConnectionsCount() > 0` blocks unload (`Hocuspocus.ts:551`), leaving Y.Doc + UM loaded forever. Load-bearing: `dc.disconnect()`. Defense-in-depth: explicit `session.um.destroy()` at the same teardown sites."

Revise `evidence/um-mechanics.md` Q47 to match.

---

## FR-3, FR-4, FR-11 — internal consistency

### FR-3 — LOW

All four subclauses (`trackedOrigins`, `captureTransaction`, scope array, `captureTimeout`) align with D21 / D24 / D25. Minor: "scoped across" reads as union — clarify as "passed as UM constructor's type-scope array."

### FR-4 / §8.4 step-ordering — MEDIUM

SPEC §8.4 lines 238-242 read:
1. Call `session.um.undo()` to compute target Y.Text state.
2. "Actually: after `um.undo()`, Y.Text is in the desired post-undo state; we apply the XmlFragment-authoritative composition pattern..."
3. All wrapped in `dc.document.transact(fn, session.undoOrigin)`.

Issues:
- "wait, this is wrong direction" is a reasoning-in-progress artifact that shouldn't survive finalization.
- Step-ordering ambiguous: is `um.undo()` inside or outside the outer transact?
- XmlFragment is NOT in UM scope → after `um.undo()`, XmlFragment is stale. Step 2's explicit composition is load-bearing.
- Step 2's XmlFragment write triggers Observer A → Y.Text sync; short-circuits because `session.undoOrigin.context.paired === true`. OK.

**Suggested corrective wording for §8.4:**
> 1. Open transact with `session.undoOrigin` (paired:true → observers short-circuit).
> 2. Inside: call `session.um.undo()` — mutates Y.Text + metaMap + activityMap via UM's internal transact (nested, origin=`um`).
> 3. Still inside: read post-undo Y.Text markdown, apply to XmlFragment via `updateYFragment`, canonicalize Y.Text via `applyFastDiff` to close the bridge invariant.
> 4. Outer transact commits. Observers A/B see `session.undoOrigin`'s paired → refresh baseline, no sync fanout.

### FR-11 vs D22 — MEDIUM (direct contradiction)

FR-11 says "effect (inserted ranges + deleted ranges via `transaction.changed` + `stack-item-added` event payload)". D22 explicitly deprecates `transaction.changed` as "wrong shape." FR-11 is stale relative to D22.

Also, D22 uses `YTextEvent.delta` (Quill Delta ops); FR-11 describes "inserted_ranges + deleted_ranges" — range-based, not ops-based. These are NOT equivalent; converting delta → ranges is a separate transformation.

**Suggested corrective wording for FR-11:**
> "Each agent transaction's effect is captured as the `YTextEvent.delta` (Quill Delta ops) emitted by Y.Text's observer during that transact, persisted to the activity-log side-channel keyed by `(session_id, transact_index)` with timestamp. Derivation source is `YTextEvent.delta` per D22 (NOT `transaction.changed`, which carries keys only, not content)."

---

## Precedent & pragmatism cross-cuts

**Precedent #1 (typed origins) — ALIGNED.** Per-session `PairedWriteOrigin` objects carrying `paired:true` context work with the structural `isPairedWriteOrigin` check at `server-observers.ts:124-127`. D23 extends discipline via deep-freeze.

**Precedent #10 (XmlFragment-authoritative) — ALIGNED.** FR-4 / §8.4 undo replay uses same `updateYFragment` + `applyFastDiff` template as `applyAgentMarkdownWrite`.

**Precedent #14 (server-authoritative) — ALIGNED.** No client-side cross-CRDT write path reintroduced.

**Pragmatism check — no violations in D21-D26.** No "defer," "expedient," "blast radius," or "revisit if users complain" phrasing. D26 contains a factual error but no pragmatism smell.

**Forward-compat — ALIGNED.** D5 (y-lite) + D22 (YTextEvent.delta) leave v14 AttributionManager migration clean: `(session_id, transact_index)` keying can host v13 delta or v14 `DiffAttributionManager` record without schema change.

---

## Unverifiable claims

- D24.3 agent-burst inter-transact gap distribution (no telemetry; plausible).
- D23.2 yjs never mutates origin.context (grep-negative; not exhaustive).

## Recommended priority corrections

1. **(HIGH) D26 rationale** — replace with DC-without-disconnect hazard per wording above. Update evidence Q47.
2. **(HIGH) FR-11 vs D22** — rewrite FR-11 to cite `YTextEvent.delta` per wording above.
3. **(MEDIUM) D25 `ignoreRemoteMapChanges`** — add Implications note or fold into Q104.
4. **(MEDIUM) FR-4 / §8.4** — remove reasoning-in-progress prose; replace with ordered steps.
5. **(MEDIUM) D24 empirical validation** — add task to measure inter-transact gap during NFR-7.
