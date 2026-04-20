---
name: Seed 1776386718697 characterization
description: Reproduction (5 runs, 2 fail), op sequence, root cause analysis — Observer B lacks isPairedWriteOrigin short-circuit
sources:
  - packages/app/tests/stress/bridge-convergence.fuzz.test.ts
  - packages/server/src/server-observers.ts
  - packages/app/tests/integration/network-control.ts
  - packages/server/src/external-change.ts
date: 2026-04-16
---

# Seed `1776386718697` — failure characterization

Produced by Opus /explore subagent. The 19-op deterministic sequence, the corrupted final state, and the root-cause mechanism.

## Reproduction results (5 sequential runs, macOS M-series, isolated)

| Run | Result | Duration | Failure detail |
|---|---|---|---|
| 1 | **FAIL** | 5s | Oracle (d): `M5-` missing on clients 0, 1, 2 |
| 2 | PASS | 6s | All 3 oracles green |
| 3 | PASS | 5s | All 3 oracles green |
| 4 | **FAIL** | 5s | Oracle (d): `M5-` missing on clients 0, 1, 2 |
| 5 | PASS | 6s | All 3 oracles green |

**Reproduction rate: 2/5 (40%).** Op sequence is RNG-deterministic for this seed, but execution timing (real-clock CRDT propagation + 50ms server debounce) is non-deterministic — failure rate matches the CONSIDER.md observation.

Snapshot file (macOS): `/var/folders/6d/x278hdzs13n94ndq7c10s6w00000gn/T/bridge-conv-fuzz-1776386718697/snapshot.json`

## Op sequence (deterministic from seed, 3 clients, opCount=12 yielding 19 ops)

```
op 0:  external-change          newContent="M0-alpha echo\n"
op 1:  wait 500ms
op 2:  wysiwyg-type   client 0  text="M1-foxtrot echo charlie"
op 3:  sync-pause     client 0
op 4:  sync-pause     client 2
op 5:  wysiwyg-type   client 0  text="M2-foxtrot hotel"
op 6:  wysiwyg-type   client 0  text="M3-echo alpha"
op 7:  wait 50ms
op 8:  source-type    client 1  text="M4-charlie"
op 9:  wait 500ms
op 10: external-change           newContent="M5-delta charlie delta\n"   ← KEY
op 11: wait 500ms
op 12: source-type    client 0  text="M6-charlie delta"      ← still paused
op 13: wait 500ms
op 14: source-type    client 1  text="M7-alpha charlie hotel"
op 15: wait 500ms
op 16: wysiwyg-type   client 0  text="M8-alpha"              ← still paused
op 17: sync-resume    client 0
op 18: sync-resume    client 2
```

## Final corrupted ytext (run 1, all 3 clients identical post-convergence)

```
M

M6-charlie delta
5-delta charlie delta

M7-alpha charlie hotel

M7-alpha charlie hotel

M8-alpha
```

**Corruption signature:**
1. `M5-delta charlie delta` line is **split** into `M` (orphan) + `5-delta charlie delta` with `\n\nM6-charlie delta\n` wedged between them
2. **Oracle (d) fires** because `ytext.toString().includes("M5-")` is `false`
3. `M7-alpha charlie hotel` appears **twice** — `mergeThreeWay` Path B absorbed both copies
4. M0-M4 are correctly absent (op 10's external-change wholesale-replaced them)

## Root cause: Observer B paired-write asymmetry

The proximate cause is a known asymmetry in `server-observers.ts`:

**Observer A** (`server-observers.ts:214`) — when a paired-write origin (`AGENT_WRITE_ORIGIN`/`FILE_WATCHER_ORIGIN`) fires:
```ts
if (isPairedWriteOrigin(transaction.origin)) {
  lastSyncedXmlMd = prependFrontmatter(frontmatter, body);  // sync baseline
  if (debounceA) { sched.clearTimeout(debounceA); debounceA = null; }  // cancel pending
  return;
}
```

**Observer B** (`server-observers.ts:378-388`) — does NOT special-case paired-write origins. Comment at lines 382-384 (verbatim):
> // Already-paired writes: agent-write and file-watcher both write both
> // sides atomically. runObserverBSync will early-exit at the already-in-sync
> // gate, but we skip scheduling entirely to avoid unnecessary work.

(**Note**: the comment's final clause "we skip scheduling entirely" is itself misleading — the code at `:386-387` schedules `debounceB` unconditionally. This is a comment-vs-code bug worth flagging for the implementation pass.)

This relies on the assumption that **by the time Observer B's debounced `runObserverBSync` fires (50 ms later), Y.Text and XmlFragment are still in sync**. That assumption breaks when a concurrent Y.Text mutation lands during the debounce window.

## Mechanism (op-by-op replay)

1. **op 8** (t=0): client 1's `M4-charlie` source-mode insert. Server's Y.Text appends. Server Observer B fires, schedules `debounceB = setTimeout(..., 50ms)`. After 50ms, `runObserverBSync` parses Y.Text → `updateYFragment` writes XmlFragment.

2. **op 10** (after 500ms wait): `applyExternalChange` runs `document.transact(... FILE_WATCHER_ORIGIN)` which atomically writes BOTH XmlFragment (`updateYFragment` to canonical M5) AND Y.Text (`applyFastDiff` to `M5-delta charlie delta\n`). Wholesale replace.
   - Server's Observer A fires. Takes the `isPairedWriteOrigin` branch: refreshes `lastSyncedXmlMd = "M5-delta charlie delta"`, cancels pending `debounceA`. ✓ correct.
   - Server's Observer B fires. **Does NOT take a paired-write branch.** Schedules `debounceB = setTimeout(runObserverBSync, 50ms)`. ✗ asymmetric.

3. **op 12** (after 500ms wait): client 0 (paused since op 3) inserts `\n\nM6-charlie delta\n` at its local Y.Text end. **Client 0's local Y.Text is stale** — it doesn't have the M5 content; it still reflects the pre-pause server state (M0-M3). The outbound CRDT update reaches the server.
   - At the server, the update wants to insert at client 0's local-end position. Y.js RGA semantics resolve that position relative to the original Item references. Because client 0's "end" Item references no longer represent the post-FILE_WATCHER server end, the insert lands at an **unintended position INSIDE the M5 content** — splitting `M5-delta charlie delta` into `M` + `5-delta charlie delta` with `\n\nM6-charlie delta\n` between them.

4. **subsequent ops** + harness's `driveToConvergence` — Observer A's Path B `mergeThreeWay` fires against the corrupted Y.Text, preserves the corruption rather than fixing it.

## Class of interleaving

> **Server-side `FILE_WATCHER_ORIGIN` paired-write + concurrent paused-client outbound source-type insertion at a position that cannot be reasonably translated post-paired-write.**

The structural class is shared with the existing fuzz-seed-1776325179241 regression (which uses `AGENT_WRITE_ORIGIN`). That existing test exercises Observer A's symmetric paired-write fix. The asymmetric Observer B counterpart was never written and the bug class was never tested — until this seed reached it.

## Confidence

- **HIGH**: Reproduction rate (5 runs, 2 fail), op sequence (snapshot-verified), corruption pattern (snapshot-verified), Observer A/B asymmetry (source-verified).
- **MEDIUM**: That Observer B's lack of paired-write short-circuit is the proximate cause vs. CRDT RGA position-resolution alone. Confirming would require instrumenting `runObserverBSync` and re-running. The hypothesis matches the observed split-and-reorder pattern; the prior seed-1776325179241 regression test is precedent for the same fix shape on Observer A.

## Implication for fix

**Important framing** (post-follow-up investigation): Observer B paired-write
symmetry is **harm reduction, not proximate fix**. The initial RGA
placement is done by Yjs's sync protocol in `Item.integrate:429-482` when
a paused-client outbound insert arrives with a tombstoned origin
reference — BEFORE any observer fires. Bucket 0 (Observer B symmetry)
prevents Observer B from RE-PROPAGATING the corruption on a subsequent
debounced fire; it does NOT prevent the initial placement.

Three fixes compose to bound the failure class within the dual-CRDT
architecture's limits:
1. **Observer B paired-write symmetry** (harm reduction) — match Observer
   A's `isPairedWriteOrigin` handling: sync baseline + cancel pending
   debounce on paired origins (widened to all 4 paired writers including
   ROLLBACK + MANAGED_RENAME).
2. **Settlement-based propagation** — replace the 50ms debounce with
   `afterAllTransactions`, eliminating the window in which a concurrent
   Y.Text mutation can land between paired-write and Observer B's
   deferred fire.
3. **Content-preservation post-condition** in `mergeThreeWay` — even with
   (1) and (2), the algorithm has academic limits; assert + fail loud on
   content loss, with a silent named-checkpoint recovery artifact for the
   Notion-esque UX pattern.

Whether Bucket 0 alone closes seed `1776386718697` empirically is an open
empirical question (Q4). Because the initial RGA placement is not
prevented by Bucket 0, the expected outcome is RESIDUAL rate at this seed,
not 100/100 pass. The residual feeds SS-1 (single-CRDT collapse)
urgency-calibration telemetry. Only single-CRDT collapse prevents the
RGA-level mechanism structurally — that's a separate spec being explored
in parallel.
