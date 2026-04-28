# Evidence: D6 — Integration constraints + risks (3P)

**Dimension:** Practical risks of adopting y-indexeddb. Maintenance signals, Yjs-version compatibility, platform edge cases, and known production pain points. Weighed against OK's durability + UX requirements.
**Date:** 2026-04-24
**Sources:** [y-indexeddb GitHub issues](https://github.com/yjs/y-indexeddb/issues), npm metadata, local clone commit history, [MDN — storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Yjs #479](https://github.com/yjs/yjs/issues/479).

---

## Maintenance signals

### Finding: y-indexeddb is in low-activity maintenance mode

**Confidence:** CONFIRMED (npm + GitHub issues inspection)

- **Latest version:** 9.0.12, published ~2 years ago.
- **Weekly npm downloads:** ~80,515. Non-trivial usage but not at the scale of yjs itself (millions).
- **Commit frequency:** One merge in 2025 (typo fix, Feb 2025). Before that, multi-month gaps.
- **Open issues:** 5 (as of inspection). Some significant, some 2+ years old with no maintainer response.
- **Maintainer:** Kevin Jahns (Yjs project lead). Active on yjs core, less active on peripheral libraries.

**Implications:**
- Adoption risk: If we hit a novel bug, we cannot rely on a fast upstream fix. Must be prepared to fork + patch via `patchedDependencies` (the pattern OK already uses for `remark-prosemirror`, per CLAUDE.md).
- Stability benefit: The library is small (184 LOC), the API surface is narrow, and it hasn't needed changes because the IndexedDB API and Yjs binary format are both stable. "Low activity" could read as "settled" rather than "abandoned."
- Precedent: The ecosystem treats y-indexeddb as a reference implementation; Tiptap + Yjs docs still recommend it. No signal of a successor.

### Finding: Issue #44 — Mobile Safari fetch failure (unresolved, Aug 2025)

**Confidence:** CONFIRMED ([Issue #44](https://github.com/yjs/y-indexeddb/issues/44))

**Summary:** On iOS 18.6.1 Safari, y-indexeddb sometimes fails with "Connection to Indexed Database server lost" — an uncatchable error that crashes page load. No workaround documented, no maintainer response, open PR #45 pending.

**Implications for OK:**
- OK has no stated iOS Safari requirement today — primary targets are desktop browsers (Chrome, Firefox, Safari on macOS) + Electron for desktop app. Safari-iOS is low priority.
- But Safari-macOS shares the WebKit engine and could exhibit the same fetch transient.
- **Mitigation:** Wrap y-indexeddb construction in try/catch. If IDB fails to initialize, fall through to Hocuspocus-only mode (same behavior as today). UX impact: reload feels slower, but no regression vs current behavior.
- **Defensive:** Add a one-time health-check `await provider.whenSynced.catch(err => log({event: 'idb-init-failed', err}))` so we can measure the incidence rate.

### Finding: Issue #31 — document grows on every refresh (unresolved, Jun 2023)

**Confidence:** CONFIRMED ([Issue #31](https://github.com/yjs/y-indexeddb/issues/31))

**Summary:** When instantiating `IndexeddbPersistence` on a document that hasn't changed, y-indexeddb writes a new update containing the full encoded state (via `beforeApplyUpdatesCallback`). Over many refreshes, the `updates` store grows. Compaction only triggers at PREFERRED_TRIM_SIZE=500 updates, so for documents that see hundreds of refreshes but few edits, storage bloat is noticeable.

**Implications for OK:**
- The code path: every `new IndexeddbPersistence(name, doc)` constructor call, hydration runs `addAutoKey(store, Y.encodeStateAsUpdate(doc))` **BEFORE** replaying stored updates. That's a deliberate checkpoint, but it's done unconditionally.
- For OK's usage pattern (one IDB per open doc; provider-pool evicts on LRU), a user's active edit session creates ~1 provider per doc. Refresh or navigate-back-to-doc creates ~1 more. After 500 refreshes without edit → compaction. At ~1 KB per encoded-state write (small docs) to ~1 MB (large docs), pre-compaction bloat is 500× the doc size.
- Realistic scenario: user keeps their knowledge base for years. Some docs edited daily, some opened infrequently. Infrequently-opened docs could accumulate state writes per open.
- **Mitigation:** Apply the community-suggested patch via `patchedDependencies`: change `beforeApplyUpdatesCallback` to check `if (updates.length > 0) ...` before writing a new snapshot. Reduces to "write snapshot only when there are existing updates to merge." Small patch, low risk. Or: fork if patching is fragile across versions.
- **Alternative:** accept the bloat as an acceptable cost given compaction + reasonable PREFERRED_TRIM_SIZE. Quota pressure is primary concern; with compaction + modern disk sizes (50-100MB IDB quota typical), 500× overhead on small docs is still within budget.

### Finding: Library is tiny + patchable via `patchedDependencies`

**Confidence:** CONFIRMED (184 LOC total)

OK already uses `patchedDependencies` for `remark-prosemirror` (per CLAUDE.md markdown-pipeline section). The pattern is known in the codebase. A patch against y-indexeddb (e.g., to fix #31 or add an error callback for #44) is feasible and maintainable.

---

## Platform edge cases

### Finding: Browser IDB eviction policy is aggressive in private/incognito + long-unused origins

**Confidence:** CONFIRMED ([MDN — storage eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))

- **Chrome (80% disk full):** Begins evicting least-recently-used origins.
- **Firefox (90% disk full / 10GB group limit):** Evicts silent origin storage.
- **Safari (ITP):** After 7 days of non-interaction, clears script-writable storage for an origin.
- **Electron:** Chrome-based; follows Chrome policy but with more aggressive quotas due to app-sandbox. Depends on how Electron's partition is configured.

**Implications for OK:**
- User's IDB cache is not durable across weeks of non-use on Safari. Acceptable — server markdown is authoritative; IDB is optimization.
- Electron's quota may be tighter. OK's Electron app stores user content on local disk (markdown); IDB mirrors it. Quota eviction equals "rehydrate from disk on next open." Not a correctness issue.
- For users who keep OK as their primary editor open all day, eviction is unlikely. For users who open monthly to jot a note, eviction is likely.
- **Defense:** Use `navigator.storage.persist()` to request persistent storage on first use. User prompt acceptable for desktop browser; auto-granted in Electron packaged app. Well-documented pattern.

### Finding: Safari private browsing has historical issues with IDB

**Confidence:** CONFIRMED (Safari version-dependent)

Older Safari versions (< 14) threw `QuotaExceededError` on any IDB write in private mode. Newer versions allow ephemeral IDB. y-indexeddb does not detect this.

**Implications for OK:**
- Users in private browsing get y-indexeddb failure at construction → wraps in try/catch (above mitigation) → fall through to Hocuspocus-only.
- No UX regression; reload simply requires server sync as today.

### Finding: Electron IDB is per-session partition; cleared on uninstall-reinstall

**Confidence:** CONFIRMED (Electron `session.defaultSession` + user-data path)

OK's Electron desktop app persists user content on disk at the configured `contentDir`. IDB lives in the Electron user-data dir (Chromium partition). Uninstalling/reinstalling the app MAY preserve user-data (Electron default) or wipe it (app packaging choice).

**Implications for OK:**
- Users who uninstall+reinstall would lose IDB cache but retain markdown. On next open, Hocuspocus rebuilds Y.Doc from markdown. Server-instance-ID still matches within the same server process. No bug.
- Documents open during uninstall would not lose work because IDB alone was never the truth; markdown is.

---

## Yjs-version compatibility

### Finding: y-indexeddb 9.0.12 is compatible with yjs 13.6.x line

**Confidence:** CONFIRMED (package.json peerDep analysis)

- y-indexeddb lists `yjs` as a peer dep (not pinned). Compatible with yjs 13.x.
- OK currently uses yjs 13.6.30 (per `bun.lock`).
- No known breaking changes in yjs 13.6.x that would affect y-indexeddb.

**Risk:** Yjs 14.x announced (partial) — potential future incompat. y-indexeddb has NOT been updated for yjs 14 at time of writing. If OK upgrades to yjs 14 before y-indexeddb catches up, either (a) delay OK's yjs upgrade, (b) fork y-indexeddb for yjs 14 compat.

**Mitigation:** Pin y-indexeddb at 9.0.12 in package.json. Run fidelity tests if y-indexeddb or yjs is ever bumped. Apply the CLAUDE.md "markdown dep upgrade protocol" pattern to Yjs ecosystem bumps too.

---

## Interaction risks with OK's architecture

### Finding: OK's bridge observer relies on transaction origin semantics — must verify IDB-originated updates are origin-correctly tagged

**Confidence:** INFERRED (code reading, D2 understanding)

From D2: y-indexeddb fires `Y.transact(doc, fn, idbPersistenceInstance, false)` — the transaction origin is the provider instance itself.

OK's bridge code (`server-observers.ts`) checks origin against `OBSERVER_SYNC_ORIGIN` and the paired-write marker. The IDB provider instance is NEITHER. So:
- On the server: IDB is NEVER attached server-side (Node env, no IDB). Zero risk.
- On the client: IDB-originated hydration flows through `doc.on('update')` handlers that happen to be attached. OK's client-side observers are "baseline tracking only" (precedent #14). They don't write back. IDB hydration is observed for baseline purposes (e.g., Observer A's `lastSyncedXmlMd` refresh) but doesn't trigger cross-CRDT writes.
- **Verify:** Run the existing client-side bridge-invariant tests under a fake-indexeddb harness to confirm no new invariant violations. This is a valid test addition in Commit 7 (or equivalent).

### Finding: OK's `paired-write` marker (precedent #1 extension, SPEC §6 R0) MUST be preserved on IDB-hydrated updates

**Confidence:** INFERRED (code reading)

Some origins (e.g., `applyAgentMarkdownWrite`, `managed-rename`) are tagged with `context: { paired: true }` to tell the bridge "this transaction atomically mutates both XmlFragment AND Y.Text; skip amplification."

When y-indexeddb hydrates, the REPLAY is under origin `idbPersistenceInstance`. The context flag is NOT encoded in the replay (Y.encodeStateAsUpdate is purely the Yjs item stream; origin + context are in-memory-only transaction metadata).

**Implication:**
- On IDB hydration of a Y.Doc that received paired-writes BEFORE reload, those paired-write items are applied in ONE transaction with origin=idbPersistence, NOT paired-write-tagged.
- If the client-side bridge observers fire for that replay (they're baseline-tracking only, but `lastSyncedXmlMd` refresh still counts), they would see items arriving under a non-paired origin.
- **Does this cause any bridge invariant failure?** Baseline-tracking writes only refresh `lastSyncedXmlMd`; they don't amplify. Safe.
- But: the SERVER-side Observer A runs on the server, not the client. IDB is client-only. Zero server-side risk.

**Verification:** T10 test (Y.Text source-mode restart) + bridge-invariant assertion in tests should catch any issue. T10 currently passes in PR #311 with server-side sidecar. Under Scenario A with y-indexeddb, the test mechanism shifts (client-side preservation rather than server-side), but the invariant to verify is the same: content settles, no duplication, no bridge failure.

### Finding: OK's `multi-agent attribution` (precedent #24, #25) is orthogonal — IDB does NOT affect writer-ID taxonomy

**Confidence:** CONFIRMED (code reading)

Writer-ID taxonomy (`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`) is a SERVER-SIDE attribution layer for the shadow repo. y-indexeddb stores Y.Doc binary on the client; server-side shadow repo writes proceed independently.

When the client re-connects post-reload with IDB-preserved state, the server's `onAuthenticate` runs → client's `expectedServerInstanceId` validated → if OK, sync proceeds. Subsequent writes from the re-connected client are tagged by the SERVER (via session origin) as `principal-<UUID>` for human principals. IDB is not part of this chain.

**Implication:** No attribution regression from y-indexeddb adoption. Same WIP refs, same writer taxonomy.

---

## Testing risks

### Finding: Bun test environment does NOT have native IDB — requires `fake-indexeddb` polyfill

**Confidence:** CONFIRMED (bun runtime)

`fake-indexeddb` is a well-maintained, production-quality polyfill. Works under Bun via jest-like auto-mocking pattern. One `bunfig.toml` preload line adds it globally.

**Risk:** Polyfill ≠ real browser IDB. Behavior under quota exceeded, eviction, or tab-close semantics is stubbed. For strict production-parity tests, Playwright (real Chrome) remains necessary for IDB-heavy paths.

**Mitigation:** Use Bun + fake-indexeddb for unit + integration (T1-T11). Use Playwright for user-facing UX verification (cold-start from empty IDB, warm-start from populated IDB, cross-tab). Small number of Playwright tests; scoped to IDB-specific UX.

### Finding: Test isolation needs per-test IDB database names (or reset between tests)

**Confidence:** INFERRED (test-harness patterns)

`fake-indexeddb/auto` resets between test files by default (per preload convention). Within a single test file, multiple tests may share state if they use the same `docName`.

**Mitigation:** Existing OK test harness pattern generates unique doc names (`test-${randomUUID()}`) — same pattern applies naturally to IDB (database name = doc name).

---

## Production risk summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Mobile Safari fetch failure (#44) | Low (OK doesn't target mobile) | try/catch + fall-through to Hocuspocus-only |
| IDB bloat on passive refresh (#31) | Medium (bandwidth/storage) | `patchedDependencies` or accept + set lower PREFERRED_TRIM_SIZE |
| Quota eviction | Low (markdown is truth) | `navigator.storage.persist()`; Hocuspocus rebuilds |
| Safari private browsing IDB failure | Low (degrades to current behavior) | try/catch + fall-through |
| Y.applyUpdate infinite loop on corrupt bytes (#479) | Low probability / high consequence | Document manual recovery (clear IDB via DevTools) |
| yjs 14 incompat | Low (future concern) | Pin at 9.0.12; upgrade only after y-indexeddb catches up |
| Library low-activity maintenance | Low (small library, stable API) | Fork-ready via `patchedDependencies`; OK has the pattern |
| Bridge invariant interaction | Low (verified via tests) | Existing T1-T11 + bridge-invariant assertions cover |
| Attribution taxonomy interaction | Zero (orthogonal) | None needed |

**None of these are blocking.** Most are "monitor in production" class, with straightforward mitigations. The highest-consequence item (#479 corrupt-bytes infinite loop) is a pre-existing risk that applies to any Yjs consumer using `applyUpdate` on untrusted bytes — including the server-side sidecar path in PR #311 Commit 6. It's not a y-indexeddb-specific new risk.

---

## Risk comparison: PR #311 server-side sidecar vs y-indexeddb client-side

| Risk | PR #311 sidecar (server) | y-indexeddb (client) |
|------|--------------------------|----------------------|
| Corrupt bytes → infinite loop | Same risk (Y.applyUpdate either side) | Same risk |
| Storage bloat | Fresh write per L1 debounce; no accumulating bloat (atomic overwrite) | Accumulates updates until PREFERRED_TRIM_SIZE (500) |
| Storage eviction | Node disk ~unlimited for typical use | Browser quota; evicts LRU origin storage |
| Multi-writer race | Single-server L1 flow; no race | Multi-tab same-origin writes to same IDB — resolved by IDB transactions |
| Schema migration | Sidecar header versioned (PR #311 has) | No per-user migration path; clearData-and-refetch |
| Cross-platform consistency | Node fs is consistent | IDB varies by browser + platform |
| Divergence from source-of-truth | PR #311 catches via Strategy A; deletes sidecar | N/A — client IDB NEVER source of truth; always second-fiddle to Hocuspocus |

**Neither option is risk-free.** Server-side sidecar has fewer edge cases per unit of code, because server env is controlled. Client-side IDB has more edge cases but they're all "degrades gracefully to current behavior" (no regressions), not correctness failures.

---

## Gaps / follow-ups

- Actual quota behavior test under real Chrome (not fake-indexeddb) — defer to post-merge verification.
- Decision on the #31 bloat patch (apply via `patchedDependencies` vs accept compaction) — small tactical decision, can be made at adoption time.
- Electron-specific IDB quota measurements — nice to have, not blocker for decision.
- Measure upstream y-indexeddb release cadence over the next 6 months to re-evaluate "low-activity" signal.
