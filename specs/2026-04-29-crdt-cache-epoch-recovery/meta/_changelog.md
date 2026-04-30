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
