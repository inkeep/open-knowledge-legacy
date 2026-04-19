# Evidence: Candidate 1 — Peritext-on-Yjs-14 (Architecture C)

**Dimension:** Primary candidate
**Date:** 2026-04-16
**Sources:** `reports/peritext-on-yjs-feasibility/REPORT.md` (verified 2026-04-16 refresh), npm registry, GitHub sources

---

## A. Production Readiness (2026-04-16)

- **Version:** `@y/y@14.0.0-rc.13` (published 2026-04-14 — yesterday as of this research). Engine requires Node ≥22.
- **Ecosystem packages:** `@y/prosemirror@2.0.0-2`, `@y/codemirror@0.0.0-3`, `@y/websocket@4.0.0-rc.2`, `@y/protocols@1.0.6-rc.1`.
- **Production users on Yjs 14:** ZERO identified. Package.json forensics on production Yjs editors: AFFiNE `yjs@13.6.21`, BlockSuite `yjs@^13.6.18`, Outline `yjs@^13.6.30`, Hocuspocus itself `yjs@^13.6.8`.
- **Strongest negative signal:** `@tiptap/y-tiptap@3.0.3` published 2026-04-08 (8 days ago) STILL pins `yjs@^13.5.38`. If TipTap intended migration, this fresh release was the natural moment. They didn't.
- **Hocuspocus:** `@hocuspocus/server@4.0.0-rc.5` published 2026-04-16 (today) still pins `yjs: ^13.6.8`. v4 RC release notes mention Yjs 14 nowhere. Zero PRs or issues in Hocuspocus mention Yjs 14 migration.
- **Maintainer responsiveness:** Kevin Jahns has not publicly committed to adding Peritext boundary semantics to Yjs. Issue yjs/yjs#291 (boundary anomaly canonical reproducer) open since April 2021 — five years unresolved.

**Confidence:** CONFIRMED (direct package.json + npm registry + GitHub issue trace).

---

## B. Migration Scope — Structural

**Architecture:** Single unified `YType<DConf>` per doc. Block structure projected via delta schema (`recursiveChildren: true` for tree; `text: true` for flat-sequence). Same YType instance can structurally serve BOTH rich-text tree AND flat-sequence source view projections — this is the v14 unification.

**File-by-file 1P impact (Open Knowledge current codebase):**

Bridge code DELETED:
- `packages/server/src/server-observers.ts` (OBSERVER_SYNC_ORIGIN, Observer A, Observer B, hybrid merge3+DMP) — entire file obsolete
- `packages/server/src/server-observer-extension.ts` — extension wiring becomes unnecessary
- `packages/app/src/editor/observers.ts` (660 lines — baseline tracking for cross-CRDT sync) — observers become single-CRDT delta observers, most file deleted
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — minimal-mutation bridge primitive no longer needed
- `packages/app/src/editor/diff-lines-fast.ts` — bridge-internal diff no longer needed
- `mergeThreeWay`/`diff3`/DMP-based reconciliation paths in observers

Client editor integration (TipTap):
- `@tiptap/extension-collaboration` ← REPLACED by `@y/prosemirror` plugin wrapper. TipTap 3.0.3 currently pins `yjs@^13` — **cannot use @tiptap/* collaboration at all**. Must write custom TipTap-compatible wrapper around `@y/prosemirror` v2 OR use raw ProseMirror without TipTap.
- `packages/app/src/editor/TiptapEditor.tsx` (419 lines) — requires rewrite to bypass TipTap collab extension.

Source-mode integration (CodeMirror):
- **Gap:** `@y/codemirror@0.0.0-3` constructor `YSyncConfig` takes `Y.Type<{ text: true }>` — at `y-sync.js:209` hard-casts `(op.insert)` to string. **CANNOT consume a tree delta.** Two shapes to bridge:
  - (a) Custom CM-from-tree fork with tree→string flattener (original work)
  - (b) Two YTypes + `lib0` `Binding<DeltaA,DeltaB>` + transformer — which is morally the *current* dual-CRDT bridge relocated to a different layer

Server persistence (Hocuspocus):
- Hocuspocus pins `yjs@^13` — cannot upgrade. Two paths:
  - (a) Fork Hocuspocus (1-2 days) to bump yjs peerDep → keeps rest of stack but gives up Yjs 14's key unification
  - (b) Replace Hocuspocus with `@y/websocket@4.0.0-rc.2` — full server-side rewrite. `@y/websocket` is a RAW WebSocket protocol. Hocuspocus's `openDirectConnection`, lifecycle hooks (`onStoreDocument`, `onLoadDocument`), extension system, auth — ALL gone. The `agent-sessions.ts` + `external-change.ts` + `persistence.ts` + `api-extension.ts` architecture depends heavily on these. **Every one of these 7-10 server files needs rewrite.**

Fidelity invariants (I1–I10) impact:
- I1 Identity, I2 Character preservation: unchanged (still remark-prosemirror markdown pipeline).
- I3 Normalization canonicality, I4 Idempotence: unchanged.
- I5 Layer A === Layer B: layer split disappears — trivially satisfied.
- I6 Multi-client preservation: strengthened by single CRDT.
- I7 Cross-path consistency: simplified because the paths collapse.
- NG5-NG10 (entity/escape/MDX/thematicBreak): unchanged (markdown pipeline unchanged).
- NG1 blank-line normalization: unchanged.

---

## C. Ecosystem Integration

**Hocuspocus:** incompatible at peer-dep level. Must fork or replace.

**Markdown pipeline (remark-prosemirror):** unchanged. Still operates at PM JSON level, CRDT-backend-agnostic at that boundary.

**Source-mode:** `@y/codemirror` hard-cast limitation means custom source-view binding is original work. No public dual-view binding exists.

---

## D. Effort Estimate (engineer-weeks)

| Scenario | Weeks |
|---|---|
| Optimistic (Architecture C spike, no production rewiring) | 2-4 |
| Realistic (production replacement with Hocuspocus fork) | 10-16 |
| Conservative (full `@y/*` stack swap, custom CM binding, TipTap wrapper) | 16-26 |

Prior report sharpened: "2-4 weeks is the SPIKE estimate, not the production estimate. No public dual-view dual-editor binding exists."

---

## E. Risk Profile

- **Beta risk:** `@y/y@14.0.0-rc.13` is RC, ONE DAY old as of this research. Peer-dep mismatches today between `@y/prosemirror` and `@y/codemirror`.
- **Migration breakage:** ~40 bridge + observer tests (C1-C10, bridge-matrix, bridge-convergence.fuzz, bug-a/c/d, observers.test) directly test code that would be DELETED — tests also deleted. Mutation gates E/F/G invalidated.
- **Performance:** Yjs 14 performance characteristics not yet benchmarked publicly. Core Yjs is pure-JS 69KB — should retain.
- **Reverse migration cost:** HIGH. Y.Doc binary format compat across 13↔14 is claimed but production-unvalidated. No production ingest/export tooling for 14 yet.
- **Boundary anomaly:** Yjs 14 has NOT added per-mark expand semantics. `src/structs/Item.js` ContentFormat byte-identical to v13.6.30. For markdown editor with low formatting-rich concurrency, low practical exposure.

---

## F. Key Advantage

**Structural:** Single YType instance serves both views. The bridge DISAPPEARS — no observers, no baseline tracking, no mergeThreeWay. Content preservation becomes a CRDT structural property, not a post-hoc assertion. **Eliminates the Khanna-Kunal-Pierce 2007 class of counter-examples by construction.**

---

## G. Key Disadvantage

**Ecosystem cliff.** Zero production users. Two forced architectural decisions (Hocuspocus fork-or-replace, CodeMirror binding original-work) each with long tail of unknown issues. RC churn at the package level means the foundation moves under you during the migration.

---

## Gaps / follow-ups

- Empirical: does `@y/codemirror` successfully consume a tree-delta YType with a custom flattener? No published attempt.
- Does Yjs 14 handle large documents (100k chars) at parity with 13?
