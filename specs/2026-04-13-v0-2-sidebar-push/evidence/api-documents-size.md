---
name: /api/documents response size measurement
description: Empirical measurement of the document list response payload — the load-bearing input that resolved Design-challenge Finding H2 (hybrid vs. pure signal).
type: factual
sources:
  - open-knowledge repo itself (this worktree)
  - packages/server/src/api-extension.ts:405-456
date: 2026-04-13
---

# `/api/documents` response size — measurement

**Context.** Design-challenge Finding H2 questioned D7's rejection of pure-signal contract on the grounds that `/api/documents` response size was never measured. The original rejection rationale cited "~100 KB/event × 10 clients in a 3000-file vault." This file records the empirical measurement that pivoted D7.

**Method.** Walked the open-knowledge repo (excluding `node_modules`, `.git`, `.next`, `dist`, `build`) and collected every `.md` file. Built a JSON payload matching the shape produced by `handleDocumentList` (`api-extension.ts:427-456`): `{ok: true, documents: [{docName, size, modified}, ...]}`. Measured uncompressed serialized size and gzipped size.

**Result.**

| Metric | Value |
|---|---|
| `.md` files indexed | 1,807 |
| Uncompressed JSON | 243,277 bytes (237.6 KB) |
| **Gzipped** | **26,412 bytes (25.8 KB)** |
| Per-entry average (uncompressed) | ~135 bytes |

**Implications for D7.**
- At 1,807 files, gzipped response is 26 KB — an order of magnitude smaller than the "100 KB" original estimate.
- For typical vaults (500-1,000 files), gzipped would be ~7-15 KB.
- 10 concurrent clients receiving one re-fetch each on a burst = 260 KB total over the local network — negligible.
- Meanwhile, the hybrid contract's three re-fetch paths (reconnect, gap, resync) force re-fetch anyway; the typed-event payload saves a fetch only in the pure-happy-path single-event case.

**Conclusion.** The bandwidth argument that motivated the hybrid contract doesn't hold. Pure signal (A) wins on every axis: simpler contract for V0-3/V0-11 to inherit, matches CC1 charter text literally, zero per-kind schema discipline, and the "cost" is negligible and bounded.

**D7 pivoted to pure signal** on 2026-04-13.
