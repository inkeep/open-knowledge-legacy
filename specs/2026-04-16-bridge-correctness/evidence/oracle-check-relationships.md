# Oracle-check relationship table (SPEC §6 R8)

Four independent correctness checks run over every bridge transaction +
every fuzz-generated op sequence. This table maps each to what it catches,
which surface it fires on, and how it relates to the others.

| Check | What it catches | Surface it fires on | Relationship to others |
| --- | --- | --- | --- |
| **Fuzz oracle (d) — marker prefix** (`assertMarkerPrefix` in `bridge-convergence.fuzz.test.ts`) | Missing marker prefix in the final Y.Text (a pre-inserted distinctive substring that every op preserves) | At end-of-fuzz-seed, once all clients have converged | **Subsumed by post-condition (c)** when (c) is assertion-guarded. Retained as a harness-level safety net until US-008 full-run empirically confirms (c) catches every oracle-d miss. Decision: keep both in parallel for US-008's validation run; retire (d) in a follow-up story if (c) is a strict superset. |
| **Fuzz oracle (e) — content-set membership** (`assertContentSet` in `bridge-convergence.fuzz.test.ts`) | Full-body line set mismatch — every agent-write/agent-patch op's canonical line must appear in final state | End-of-seed | Complementary to (c): (e) tracks patch-chain reachability over multi-op sequences across clients; (c) is a per-transaction structural check inside mergeThreeWay. Neither subsumes the other. (e) catches multi-agent-patch interactions where intermediate states are not individually loss-inducing but their composition is; (c) catches per-merge algorithmic failures regardless of op chain. |
| **`attachBridgeInvariantWatcher`** (`test-harness.ts`) | Y.Text ↔ XmlFragment serialization divergence at a transaction boundary | Per-transaction, for every enforcing origin in `BRIDGE_ENFORCING_ORIGINS` (US-001 now includes MANAGED_RENAME_ORIGIN) | Catches STATE divergence (the two CRDTs disagree on what the document should be). Does NOT catch CONTENT LOSS — a merge that drops content equally on both sides converges quietly and passes this watcher. (c) is the complement that catches content loss. |
| **Post-condition (c) + order-preservation** (`assertContentPreservation` in `merge-three-way.ts`) | `mergeThreeWay` output dropped content unique to `mine \ base` or `theirs \ base`, OR reordered content from one side across unique segments | Inside every `mergeThreeWay` call (prod + test). Dev/test: throws. Prod: caller (Observer A Path B) catches, logs structured event, writes silent checkpoint, applies merge as-computed (SPEC §10 D3 LOCKED). | **Primary correctness gate.** Subsumes (d) at the bridge layer; complements (e) at the multi-op layer; complements the invariant watcher at the state-divergence layer. Raises `BridgeMergeContentLossError` with discriminated `{side, which, lostSubstrings}` payload for telemetry. |

## Decision trace

- **A4 (`specs/2026-04-16-bridge-correctness/SPEC.md` §12):** assumed oracle
  (d) is subsumable by post-condition (c). US-008 will verify empirically
  over the elevated 1000-seed run by logging whenever (d) fires but (c)
  didn't, and vice versa.
- **K3 (SPEC §13):** post-condition false-positive risk mitigated by the
  K3 calibration in `extractUniqueSegments` (line-split + whitespace drop)
  plus the 10k-seed nightly run.

## Retirement criteria for oracle (d)

Retire (d) in a follow-up story once:
1. Post-condition (c) is running in production (US-005, done).
2. A full 10k-seed nightly run logs zero cases where (d) fires without (c)
   having fired earlier in the same seed.
3. A full 10k-seed nightly run logs zero cases where (c) fires without (d)
   eventually firing (i.e., (c) is observably a superset).

Until both conditions hold, the oracles run in parallel — (c) as the
authoritative gate, (d) as a belt-and-suspenders harness check.
