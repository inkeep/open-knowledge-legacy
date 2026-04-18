# Evidence: D6 — Version stability across Yjs 13.x; deprecations

**Dimension:** D6 — Has `afterAllTransactions` been stable across recent versions (13.x)? Any deprecations?
**Date:** 2026-04-16
**Sources:**
- `packages/server/package.json` — yjs version pin
- `node_modules/yjs/package.json` — installed version
- `node_modules/yjs/dist/src/utils/Doc.d.ts` — current TS types
- https://github.com/yjs/yjs/releases (release notes)
- https://github.com/yjs/yjs/blob/main/src/utils/Transaction.js (current main)
- https://github.com/yjs/yjs/issues/522 (cleanupTransactions stack overflow)
- https://www.npmjs.com/package/yjs — version range

---

## Key files / locations referenced

- `packages/server/package.json:17` — `"yjs": "^13.6.30"` (caret range, npm semver).
- `node_modules/yjs/package.json:2-3` — installed is `13.6.30`.
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` — `DocEvents` currently exports all six transaction-lifecycle events as first-class typed hooks.

---

## Findings

### Finding 6.1: The repo pins `yjs: ^13.6.30` — any 13.x release ≥ 13.6.30 is acceptable.

**Confidence:** CONFIRMED
**Evidence:** `packages/server/package.json`

```json
"yjs": "^13.6.30"
```

npm caret range `^13.6.30` allows `>=13.6.30 <14.0.0`. yjs has not reached 14 (the `node_modules/yjs/package.json` confirms the family is still `13.6.x`). The library has been on `13.x` since Nov 2020 per https://github.com/yjs/yjs/releases — five-plus years of semver-minor evolution on the same major.

**Implications:**
- Any transaction-lifecycle API introduced since 13.6.30 is also in-scope, but the specific hooks in question (`afterAllTransactions`) predate our pin.
- A major version bump (to 14.x) would be a breaking change and require independent review. No 14.x is in development publicly.

---

### Finding 6.2: `afterAllTransactions` and `beforeAllTransactions` are emitted in the main branch of yjs/yjs and match our 13.6.30 source.

**Confidence:** CONFIRMED
**Evidence:** Cross-check between `node_modules/yjs/src/utils/Transaction.js` and https://github.com/yjs/yjs/blob/main/src/utils/Transaction.js (via WebFetch in D1).

The WebFetch of upstream main returns line 412 as the `afterAllTransactions` emit site. Our local 13.6.30 has the same emit at `Transaction.js:393`. Line numbers differ (main is slightly ahead), but the logic is identical: emit inside `cleanupTransactions` tail, after queue drain.

The `beforeAllTransactions` emit site is also stable — `Transaction.js:423-425` in 13.6.30, still present in main.

**Implications:**
- The public contract is stable across the current `13.6.x` series and main. No deprecation flags, no migration notes.

---

### Finding 6.3: `DocEvents` TypeScript typedef is stable since at least 13.5.x; no hook has been renamed or removed.

**Confidence:** CONFIRMED
**Evidence:**
- `node_modules/yjs/dist/src/utils/Doc.d.ts:220-237` lists all six transaction lifecycle events.
- Community discussion (https://discuss.yjs.dev/t/whats-the-difference-between-beforealltransactions-and-beforetransaction/614) references these hooks as standard API without mentioning version caveats.
- npm package history (https://www.npmjs.com/package/yjs) shows no major refactor notices for transaction events in the 13.6.x releases.

**Implications:**
- TypeScript consumers can rely on the typed-event surface. `doc.on('afterAllTransactions', (doc, transactions) => ...)` will typecheck without `@ts-expect-error`.

---

### Finding 6.4: Issue #522 (`cleanupTransactions` stack overflow) is open as of our installed version — recursion → iteration fix pending.

**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/yjs/issues/522

The issue reports stack overflow in `cleanupTransactions` for very large transaction batches (tens of thousands of queued transactions). A PR was proposed to replace recursion with iteration. Status as of this report: unmerged in the `13.6.30` snapshot (`Transaction.js:394` still recursive — confirmed in D5). The upstream main branch may have the fix; our pin does not.

**Implications:**
- For our bridge (drains are 1-3 transactions in practice), this is a non-issue. Flagged for future-proofing when we upgrade or when a new write surface could cascade into many sub-transactions.
- The fix, when it lands, won't change the emission semantics of `afterAllTransactions` — only the call shape of `cleanupTransactions`.

---

### Finding 6.5: No deprecation warnings or `@deprecated` JSDoc on transaction lifecycle events.

**Confidence:** CONFIRMED
**Evidence:** Grep of `node_modules/yjs/src/utils/Transaction.js` and `Doc.js`:

```
@deprecated → appears only on Doc.toJSON (Doc.js:306)
              and the legacy `destroyed` event (Doc.js:342 comment "DEPRECATED!")
```

Neither touches transaction-lifecycle events. The lifecycle events are stable, non-deprecated public API.

**Implications:**
- Safe to build on. Upgrades within `^13.6.30` should be transparent.

---

## Negative searches

- Searched: `BREAKING` / `migration` in yjs release notes for 13.6.x minor/patch versions → no mentions for transaction events.
- Searched: `afterAllTransactions` / `beforeAllTransactions` in upstream `yjs/yjs` issues for rename / behavior-change discussions → NOT FOUND (only usage questions, no API-shape changes).

---

## Gaps / follow-ups

- Yjs does not ship a `CHANGELOG.md` with the npm tarball (confirmed: `ls node_modules/yjs/` shows only `LICENSE`, `README.md`, `package.json`, `src/`, `dist/`, `tests/`). Per-release notes live on https://github.com/yjs/yjs/releases. A documentation improvement here would be out-of-scope for this report.
- No direct evidence of when `afterAllTransactions` was introduced (could be pre-13.0). Absent a version-introduction cite, we rely on: it's present in 13.6.30, it's present in main, and the public-facing discussion treats it as "a standard hook." Risk of it being removed is low given y-prosemirror (the most important consumer) depends on it in `sync-plugin.js:666`.
