---
topic: How yjs + ecosystem projects stress-test CRDTs
sources:
  - /Users/edwingomezcuellar/.claude/oss-repos/yjs/tests/testHelper.js (TestConnector, applyRandomTests, compare)
  - /Users/edwingomezcuellar/.claude/oss-repos/yjs/tests/y-text.tests.js (textChanges, scale ladder)
  - /Users/edwingomezcuellar/.claude/oss-repos/y-prosemirror/tests/y-prosemirror.test.js (pmChanges, checkResult)
  - /Users/edwingomezcuellar/.claude/oss-repos/y-codemirror.next/test/y-codemirror.test.js (trChange)
  - /Users/edwingomezcuellar/.claude/oss-repos/blocksuite/packages/framework/store/src/__tests__/ (anti-pattern)
  - Web: fast-check model-based testing docs, MET arxiv 2204.14129
verified_at: 2026-04-08
verified_by: subagent (general-purpose) + /worldmodel skill
---

# Prior art: CRDT stress testing in the Yjs ecosystem

## The canonical pattern (used by yjs + all official bindings)

Yjs, y-prosemirror, and y-codemirror.next all converge on the same harness:

1. **`TestConnector`** simulates an async network between N `TestYInstance` docs. Ops: `flushRandomMessage`, `flushAllMessages`, `disconnectRandom`, `reconnectRandom`, `disconnectAll`, `syncAll`. Seeded `lib0/prng` for determinism.
2. **`applyRandomTests(tc, mods, iterations, initTestObject)`** — 5 users, each iteration rolls dice: 2% disconnect/reconnect, 1% flushAll, 50% flush a random message, otherwise pick a random user and apply a random mutator from `mods`.
3. **Mutators are pure data arrays** — `(ydoc, prng, view) => void` shapes. `textChanges`, `pmChanges`, `trChange` — all exported as data, consumed by the loop.
4. **Convergence via `compare(users)`** — the critical part:
   - `toJSON()` equality on arrays, maps, xml
   - **State vectors equal** (`encodeStateVector(a) === encodeStateVector(b)`)
   - **Delete sets equal**
   - **`compareStructStores`** (internal structure)
   - **`Y.mergeUpdates` round-trip** — apply all received updates to a fresh doc, assert the result matches
   - Snapshot encoding equal
5. **Scale ladder** — same mutator set run at 2, 5, 30, 40, 70, 100, 300 iterations as separate test cases. Non-linear jumps — rare interleavings need long runs to surface.

**Confirmed negative:** neither yjs, y-prosemirror, y-codemirror.next, nor blocksuite uses `fast-check` or `jsverify`. Roll-your-own harness is the norm.

## Key insight: `toString()` equality is NOT sufficient

The agent's headline finding: **"Two docs can stringify identically but diverge on struct order — this will cause later operations to produce different results."** Yjs's `compare()` tests multiple equality layers for exactly this reason.

**Implication for our spec:** Our current strict-convergence assertion (`ytext.toString() === serialize(xmlFragment body)`) is the *necessary but not sufficient* condition. We should also verify:
- **`Y.mergeUpdates` round-trip**: `Y.applyUpdate(freshDoc, Y.encodeStateAsUpdate(ourDoc))`, then run the same assertions on `freshDoc`. Catches bugs where live-sync state can't serialize and re-hydrate correctly — a failure mode that doesn't surface in live observer tests.

Struct-store / state-vector equality doesn't directly apply to our single-doc stress (those are multi-doc convergence checks), but the round-trip check IS applicable and high-value.

## Mutator variety matters more than iteration count

The agent flagged: "Yjs mutators are often too small — `y-text.tests.js:1986` caps delete at `min(..., 2)` characters. Good for avoiding trivially empty docs, but real users paste whole paragraphs."

Also: "Charset matters. Yjs uses `prng.word()` — plain ASCII. If your editor handles emoji/CJK/combining marks, add those to mutators."

**Implication for our spec:** The synthetic generator should produce content with emoji, CJK, and combining marks, not just ASCII. The gap 2 bug was a whitespace/line-boundary bug — similar bugs likely lurk around Unicode normalization in the markdown serializer.

## "applyUserDelta is the bug surface"

The agent's framing: **"Your `applyUserDelta` is the bug surface, not Yjs."** Yjs is well-fuzzed upstream. Our custom code — observers, `applyUserDelta`, XmlFragment↔Text bridge — is where bugs live.

**Implication for our spec:** Scenarios should target paths that cross *our* bridge. Concurrent edits to XmlFragment AND Text, undo while another "user" is mid-edit, server-side UndoManager racing with client commits. Not just "big content in, big content out."

## Anti-pattern: "trust Yjs and skip CRDT fuzzing" (BlockSuite)

BlockSuite does NOT fuzz its CRDT layer. Their reliance on upstream Yjs correctness missed real bugs in their custom reactive proxy layer (`ReactiveFlatYMap`, `createYProxy`). Same risk profile as our observers + diff bridge — the bugs live in the glue, not the core.

## Anti-pattern: "deterministic tests only" (ProseMirror collab)

ProseMirror collab module's `test-collab.ts` uses named, deterministic cases: "converges for simple changes", "handles conflicting steps", etc. No randomization, no fuzzing. Missed schedule-dependent bugs that only surface under rare interleavings.

**Implication:** Our current spec is heavy on deterministic-timing tests (by design — reproducibility). But we should consider adding a "randomized mode" as Future Work at minimum.

## What's genuinely novel about our setup

- **Server-side per-origin `UndoManager` with concurrent users.** The agent: "genuinely uncharted territory — budget extra mutator variety and assertion work there." No yjs/y-prosemirror upstream tests exercise this path.
- **Custom `applyUserDelta` for three-way delta reconciliation.** Not a standard Yjs pattern.
- **Bidirectional observers with origin guards + typing-defer windows.** Custom to our project.

These are the three places to concentrate test variety.

## Recommended changes for our spec (summary)

1. **Add S7: `mergeUpdates` round-trip assertion** to scenario matrix. Cheap to implement (one helper function), high signal for state-serialization bugs.
2. **Strengthen the convergence assertion** to include the round-trip check in addition to `toString()` equality.
3. **Add Unicode variety to the synthetic generator** — emoji, CJK, combining marks. Not all lorem ipsum.
4. **Document `applyUserDelta` as the primary bug surface** in §8 Current State — this shapes where scenarios should concentrate.
5. **Add a "randomized fuzz tier" to Future Work** — adopt a simplified `applyRandomTests`-style harness later. Scope is too large for this spec (it's really a separate testing methodology), but note it explicitly so it doesn't get forgotten.
6. **Consider `fast-check` for the bridge layer in Future Work** — the agent notes shrinking is high-value for the bridge specifically. Not now (scope), but worth naming.

## Additional watch-outs

- **`Y.mergeUpdates` is a separate code path from live sync.** Server persistence paths and live sync paths can diverge. Worth testing explicitly.
- **Disconnect/reconnect timing is where real bugs live.** Yjs gives it a low nonzero probability (2%). We don't test this because our stress is single-client. Out of scope for this spec but worth noting — NG3 deferral.
- **BlockSuite's "we trust Yjs" stance is a cautionary tale.** Their reactive proxies had bugs Yjs tests couldn't catch. Our bridge is the same risk profile.

## Sources (full reference)

- [Yjs GitHub](https://github.com/yjs/yjs)
- [y-prosemirror GitHub](https://github.com/yjs/y-prosemirror)
- [y-codemirror.next GitHub](https://github.com/yjs/y-codemirror.next)
- [ProseMirror collab module](https://github.com/ProseMirror/prosemirror-collab)
- [fast-check model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/)
- [MET: Model Checking-Driven Explorative Testing of CRDTs](https://arxiv.org/abs/2204.14129)
- [Kevin Jahns — Are CRDTs suitable for shared editing?](https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing)
- [Seph Gentle — CRDTs go brrr](https://josephg.com/blog/crdts-go-brrr/)
