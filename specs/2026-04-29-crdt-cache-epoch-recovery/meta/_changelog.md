# Changelog — CRDT Cache Epoch Recovery Spec

## 2026-04-29

### Changes

- Created initial `SPEC.md` for stale browser CRDT cache / Markdown-rebuilt server duplication recovery.
- Captured current system trace evidence:
  - server Markdown load/rebuild path
  - Hocuspocus unload suppression from `627a5c52`
  - client IndexedDB branch+doc naming
  - global IDB-associated server-instance marker
  - mismatch buffer/clear/recycle/replay path
  - persistence warning-then-write duplication detector
- Captured incident shape from user-provided logs for `.changeset/README.md` duplication.
- Captured test coverage gap around cross-document stale-cache masking.
- Initialized pending decisions D1-D4 and open questions Q1-Q5.

### Pending (carried forward)

- D1: Confirm architecture posture — server/Markdown canonical with disposable client cache vs true offline-first durable CRDT canonical.
- D2: Choose per-doc marker keys vs epoch-scoped IndexedDB database names.
- D3: Choose persistence tripwire policy — warn-only vs block+rescue.
- D4: Choose no-baseline unsynced replay policy.

## 2026-04-29 — Decision update

### Changes

- **D1 decided:** User confirmed server/Markdown canonical posture for this fix.
  - Evidence: `evidence/current-system-trace.md`
  - Affected sections: SPEC.md §10 Decision Log, §11 Open Questions, §13 In Scope.
- **Q1 resolved:** True long-lived offline CRDT canonical behavior remains Future Work, not in scope for this fix.

### Pending (carried forward)

- D2: Choose per-doc marker keys vs epoch-scoped IndexedDB database names.
- D3: Choose persistence tripwire policy, with user preference against adding rescue checkpoint UI.
- D4: Choose no-baseline unsynced replay policy; user leaning toward dropping local state (Option A), pending explanation of when baseline is absent.

## 2026-04-29 — Epoch cache decisions

### Changes

- **D2 decided:** User chose server-epoch-scoped IndexedDB names (`ok-ydoc:${branch}:${serverInstanceId}:${docName}`) over per-doc marker keys.
  - Evidence: `evidence/current-system-trace.md`, `evidence/incident-shape.md`
  - Affected sections: SPEC.md §9 Proposed solution, §10 Decision Log, §11 Open Questions, §13 In Scope, §14 Risks.
- **D4 decided:** User chose no-baseline drop-local-state policy. If mismatch recovery has no trusted baseline, do not replay the whole local Y.Doc.
  - Evidence: `provider-pool.ts` current baseline-selection behavior in `evidence/current-system-trace.md`
  - Affected sections: SPEC.md §9 Proposed solution, §10 Decision Log, §13 In Scope, §14 Risks.
- **D3 refined:** User prefers no rescue checkpoint UI; remaining question is whether high-confidence block/recycle is acceptable given false-positive risk.

### Pending (carried forward)

- D3: Decide persistence tripwire threshold/policy — high-confidence block+recycle vs warn-only for ambiguous cases.

## 2026-04-29 — Tripwire decision

### Changes

- **D3 decided:** User accepted narrow tripwire recommendation.
  - Policy: block exact/near-exact normalized current-base body duplication; warn-only for ambiguous suspicious cases; no rescue checkpoint UI.
  - Recovery shape: keep disk unchanged, emit structured event, and reset/recycle live document from disk/base state.
  - Affected sections: SPEC.md §9 Proposed solution, §10 Decision Log, §11 Open Questions, §13 In Scope, §14 Risks.
- **Q3 resolved:** The blocking threshold is policy-resolved; implementation must validate with incident and intentional-duplicate tests.

### Pending (carried forward)

- Scope freeze / implementation-readiness pass: confirm provider-open gating details for serverInstanceId availability and tripwire reset mechanism.

## 2026-04-29 — Batch-gated persistence addendum

### Changes

- **evidence/batch-gated-persistence-drop.md:** Created — traced the live/disk divergence where server CRDT state contained the user's edit but disk and `currentDiskAckSVs` did not advance.
- **SPEC.md §16 added:** Brief addendum for batch-gated L1 persistence.
  - Proposed D9: batch-gated L1 stores defer, not drop.
  - Proposed D10: separate L1 Markdown durability from L2 shadow/git commit gating.
  - Proposed D11: treat index.lock-only/no-HEAD-move batches as low-risk within-branch noise.
  - Affected sections: SPEC.md links and new §16 amendment.

### Pending (carried forward)

- Confirm D9-D11, especially cross-branch behavior for deferred stores.
- Implementation should add regression coverage for browser-style edits whose L1 store fires while `batchInProgress` is true.

## 2026-04-29 — Batch persistence decisions accepted

### Changes

- **D9 decided:** Batch-gated L1 stores must be deferred, not dropped.
- **D10 decided:** L1 Markdown durability is separate from L2 shadow/git commit gating.
- **D11 decided:** `index.lock`-only batches with no HEAD movement are low-risk within-branch noise.
- **SPEC.md §16 updated:** D9-D11 statuses changed from Proposed to Decided.

### Pending (carried forward)

- Implement deferred-store queue/drain with cross-branch safeguards.
- Add regression coverage for browser-style edits whose L1 store fires while `batchInProgress` is true.
