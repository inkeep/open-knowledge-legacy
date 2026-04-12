---
title: "applyUserDelta JSDoc + observers.test.ts divergence describe — current state"
type: raw-proof
sources:
  - packages/app/src/editor/observers.ts
  - packages/app/src/editor/observers.test.ts
  - CLAUDE.md
created: 2026-04-11
baseline-commit: 2d35736
---

## TLDR

`observers.ts:170-183` describes `applyUserDelta` as handling "the race-condition path where another source (agent, peer, file watcher) wrote to Y.Text between Observer A syncs" — correct but abstract. `observers.test.ts:1236-1260` has a richer header that enumerates the same sources but frames the test mechanism as "simulated scenarios" via `agent-write` origin. Neither names the specific peer-WYSIWYG multi-client scenario that PR #43's merge proved is a real production trigger. `CLAUDE.md` has a "Testing — per-test docName isolation" section that documents concurrent test safety but does NOT contain the observer-coverage or Playwright-on-every-PR policies.

## Detail

### `observers.ts:170-183` — current JSDoc on `applyUserDelta`

**CONFIRMED** — verbatim from `packages/app/src/editor/observers.ts`:

```typescript
/**
 * Apply ONLY the user's delta to Y.Text, when Y.Text has diverged from the last
 * synced XmlFragment state. This is used in the race-condition path where another
 * source (agent, peer, file watcher) wrote to Y.Text between Observer A syncs.
 *
 * Strategy: compute the line-level diff between the old XmlFragment md and the new
 * XmlFragment md. For each added line, insert it at the corresponding line index in
 * Y.Text (matched by anchor lines before the insertion). For each removed line,
 * delete it from Y.Text (matched by content). This preserves any lines in Y.Text
 * that weren't in either old or new XmlFragment md — i.e., content from other sources.
 *
 * This is not a perfect three-way merge, but it's correct for the common case of
 * "user appends/deletes lines while agent appends lines". When two sources modify
 * overlapping lines simultaneously, the user's change wins (applied last).
 */
```

The parenthetical "(agent, peer, file watcher)" lists the sources but treats them as equivalent. The "common case" example frames the scenario as single-client ("user appends... while agent appends"). No reference to the specific multi-client trigger.

### `observers.test.ts:1236-1260` — current test docstring

**CONFIRMED** — verbatim:

```typescript
// ─────────────────────────────────────────────────────────────
// applyUserDelta: divergence between Y.Text and lastSyncedXmlMd
// ─────────────────────────────────────────────────────────────
//
// applyUserDelta fires from runObserverASync when Y.Text has diverged
// from the last synced XmlFragment state (currentText !== lastSyncedXmlMd).
// This happens when some OTHER source (agent write to Y.Text, file
// watcher, peer) wrote to Y.Text between Observer A syncs. The function
// applies ONLY the user's XmlFragment delta while preserving the
// divergent content.
//
// The existing "Observer A defers after agent write" test covers one
// scenario (agent appends to Y.Text, user triggers re-sync via empty
// XmlFragment element). These tests exercise the three canonical
// divergence patterns: user-adds, user-deletes, user-modifies — each
// with pre-existing agent content that must survive.
//
// Mechanism: write to Y.Text with the 'agent-write' origin to create
// divergence, then mutate the XmlFragment to represent a user edit.
// Critically, we MUST call markUserTyping to defer Observer B during the
// window when Observer A runs — otherwise Observer B's debounced callback
// fires first (same 50ms delay, earlier queue insertion) and overwrites
// the XmlFragment by parsing the divergent Y.Text, destroying the user's
// edit before Observer A can apply the delta.
```

The docstring is already fairly rich. It mentions "peer" in the enumeration but frames the test mechanism as `agent-write` origin simulation, which was the implementer's perspective at the time. The header doesn't explicitly call out that the divergence was initially considered hypothetical/defensive and then validated against a real multi-client production trigger by PR #43.

### `CLAUDE.md` existing "Testing" section

**CONFIRMED** — `CLAUDE.md:172-182`:

```markdown
## Testing — per-test docName isolation

Integration tests use per-test docNames via `createTestClient(port)` which auto-generates `test-${randomUUID()}`. Tests are safe to run concurrently (`test.concurrent()`, multiple `bun test` processes in the same worktree) because:

1. Each test's Y.Doc is uniquely named and independent.
2. Observer A's typing-defer state is per-doc (`WeakMap<Y.Doc, TypingState>`).
3. `/api/test-reset` is scoped to a specific docName via `?docName=` query param.

**Exception:** tests that verify shared-state behavior (initial sync, test-reset semantics) explicitly pass `'test-doc'` and do not run concurrently with each other.

Client lifecycle is inside the test body via `try/finally` — NOT via `beforeEach/afterEach`. This is required for `test.concurrent()` correctness (the shared `let client` pattern races under concurrent mode).
```

This section is specifically about test concurrency mechanics. It does NOT contain:
- A statement about multi-client observer coverage being load-bearing
- A statement about Playwright running on every PR as a policy
- Guidance for future observer bridge changes

### AGENTS.md reference

`CLAUDE.md:168-170` points to `AGENTS.md` for "CRDT bridge internals, origin-guard truth table, propagation matrix, known pitfalls (STOP/WARN rules), and debug tooling." So the architecture-level guidance is in AGENTS.md. Testing philosophy is in CLAUDE.md. The split is:
- **CLAUDE.md:** agent-session context, conventions, testing mechanics
- **AGENTS.md:** deeper architecture, pitfalls, debug

S7 lessons should go to CLAUDE.md if they're about testing philosophy; observation-mechanism details (the peer-WYSIWYG trigger) fit better in source JSDoc close to the code.

## The S7 target edits

### 1. `observers.ts:170-183` JSDoc enrichment

Replace the abstract parenthetical with the specific multi-client trigger:

```typescript
/**
 * Apply ONLY the user's delta to Y.Text, when Y.Text has diverged from the last
 * synced XmlFragment state. This is the race-condition path where another
 * source wrote to Y.Text between Observer A syncs.
 *
 * The canonical production trigger — observed during PR #43's multi-client test
 * matrix — is a remote peer's WYSIWYG edit arriving as a Y.Text-only transaction
 * while the local user is mid-sync on XmlFragment. Other sources (direct agent
 * writes to Y.Text, file-watcher external-change applies) create the same divergence
 * shape and are handled by the same code path.
 *
 * Strategy: [unchanged below]
 * ...
 */
```

### 2. `observers.test.ts:1236-1260` describe header enrichment

Replace the "simulated scenarios" framing with the explicit PR #43 lineage:

```typescript
// ─────────────────────────────────────────────────────────────
// applyUserDelta: divergence between Y.Text and lastSyncedXmlMd
// ─────────────────────────────────────────────────────────────
//
// applyUserDelta fires from runObserverASync when Y.Text has diverged
// from the last synced XmlFragment state (currentText !== lastSyncedXmlMd).
//
// The canonical production trigger (observed during PR #43's multi-client
// test matrix merge) is a remote peer's WYSIWYG edit arriving as a
// Y.Text-only transaction while the local user is mid-sync on XmlFragment.
// These tests use the 'agent-write' origin as a mechanical stand-in for
// that scenario: both produce a Y.Text mutation from a non-XmlFragment
// source, and applyUserDelta must preserve the divergent content the same
// way regardless of whether it came from an agent, a peer, or the file watcher.
//
// Assumption sharpening from PR #38: these tests were originally written
// as "simulated scenarios" (framed as defensive against a hypothetical
// race). The PR #43 merge flipped that framing — the simulated scenario
// is now known to be a real multi-client production trigger. Any
// refactor of applyUserDelta must maintain multi-client coverage, not
// just single-client divergence.
//
// [rest of docstring unchanged]
```

### 3. `CLAUDE.md` addition

Add a subsection to the existing "Testing — per-test docName isolation" section, or add a new "Testing — observer bridge coverage" subsection after it:

```markdown
### Observer bridge coverage

When modifying `src/editor/observers.ts` or anything on the XmlFragment ↔ Y.Text bridge, single-client test coverage is **insufficient**. The canonical multi-client production trigger (remote peer WYSIWYG edit arriving as Y.Text-only while local user is mid-sync) exercises a code path that single-client tests can't reach. Always add a multi-client test case via `bridge-matrix.test.ts`'s describe block, or the refactor won't be safe to merge.

Lesson source: PR #38 assumed single-client coverage was sufficient for `applyUserDelta`; PR #43's multi-client test matrix proved that assumption wrong mid-review, costing real re-work.

### Playwright policy

Playwright E2E tests (`tests/stress/*.e2e.ts`) run on every PR in CI (not just nightly). This is a belt-and-suspenders guard against PR #35-class DOM-binding regressions that unit and integration tests can't catch. Don't skip Playwright for "small" PRs — the DOM binding surface cares about React render cycles, not code size.
```

## Pointers

- `packages/app/src/editor/observers.ts:170-183` — JSDoc to enrich
- `packages/app/src/editor/observers.ts:184-205` — function body (unchanged)
- `packages/app/src/editor/observers.test.ts:1236-1260` — describe header to enrich
- `CLAUDE.md:172-182` — existing Testing section to extend
- `CLAUDE.md:168-170` — AGENTS.md pointer (where deeper architecture docs live)
