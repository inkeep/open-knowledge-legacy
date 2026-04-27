# Evidence: D6 — Maintenance signals (3P, compact)

**Dimension:** Commit activity, maintainer engagement, production incidents, ecosystem adoption for each viable candidate.
**Date:** 2026-04-24
**Sources:** GitHub commit history, npm registry metadata, prior y-indexeddb report D6, parallel survey agents.

---

## y-indexeddb (upstream)

- **Latest version:** 9.0.12 (2023-11-02).
- **Last commit:** 2025-02-12 (typo fix; the only 2025 commit).
- **Weekly downloads:** ~80,515.
- **Maintainer:** Kevin Jahns (Yjs project lead).
- **Open issues:** 5. Two load-bearing: #44 (Mobile Safari fetch failures, Aug 2025, unresolved) and #31 (doc growth on passive refresh, Jun 2023, unresolved).
- **License:** MIT.

**Characterization:** "Low-activity but stable." Library is 184 LOC; the API surface has been settled since 2021. The IDB + Yjs substrates are both stable. Community patches exist for #31 and a PR is open for #44. Upstream hasn't merged fixes in 2+ years, but the ecosystem routes around this via `patchedDependencies`.

**Risk level for OK:** Low. OK already maintains `patchedDependencies` for `remark-prosemirror` (per CLAUDE.md markdown-pipeline section). Pattern transfer is clean.

## @toeverything/y-indexeddb — NOT VIABLE

- Deleted from AFFiNE monorepo in April 2024 ([PR #6728](https://github.com/toeverything/AFFiNE/issues/6728)). npm package still present but effectively dead.
- Transitive dep `@toeverything/y-provider@0.10.0-canary.9` is NOT PUBLISHED to public npm — any new `npm install` could fail once caches expire. Supply-chain risk.
- Do not adopt.

## DIY paths

For DIY approaches, "maintenance signals" means: how much work would WE commit to maintaining in-house.

| Path | In-house maintenance cost | Risk of diverging from Yjs spec |
|------|---------------------------|----------------------------------|
| DIY IDB | Medium (~200-300 LOC, stable API, shallow deps) | Low (Yjs update/state APIs are stable) |
| DIY OPFS | High (Worker plumbing + multi-tab coordination) | Low |
| DIY SQLite-WASM | Very high (schema + WASM + Worker) | Low (but no Yjs precedent to cross-reference) |

**OK's pattern** for similar decisions: forked or vendored exists (e.g., `@tiptap/y-tiptap` fork), but only when upstream is a material drag. The bar for in-house maintenance is "upstream is actively blocking OK's delivery." y-indexeddb isn't at that bar — low-activity ≠ blocking.

## Ecosystem adoption weight

y-indexeddb is the default persistence layer in:
- [Tiptap + Hocuspocus canonical docs](https://tiptap.dev/docs/editor/collaboration/guides/offline-support)
- Yjs docs (canonical example)
- AFFiNE (until 2024-04 when they moved to private nbstore)
- Most Yjs consumers on GitHub (cursor check: the npm download count is dominated by y-indexeddb in the Yjs-persistence namespace)

Switching to DIY means stepping off this gravity well. The cost is "OK's recipe is non-standard"; the benefit is "OK controls the failure modes." Worth tracking.

## Yjs 14 compatibility

Yjs 14 is partially released but not the default peer for most ecosystem libraries, including y-indexeddb. If OK ever upgrades to Yjs 14:
- y-indexeddb: no announcement; risk of compat break. Would need upstream PR or our fork.
- DIY: we control compat entirely.

OK's plan for Yjs 14 migration is documented in `reports/yjs-14-ecosystem-adoption/`. Adoption is not imminent. Parkable concern.

## Verdict for D6

**y-indexeddb is acceptable low-risk.** In-house DIY is also acceptable but unnecessary overhead for the baseline work. Recommendation: adopt y-indexeddb for now; pivot to DIY if and when upstream stalls block us.

Consider applying `patchedDependencies` for issue #31's 3-line fix at adoption time. Low-risk; prevents storage bloat on users who refresh frequently without editing.
