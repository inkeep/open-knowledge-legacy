# F11 docs-open flake — root-cause triage

**Test:** `tests/stress/docs-open.e2e.ts:427` — F11: rapid sequential navigation converges to final click
**Last seen failing:** main CI run `24548842566` (2026-04-17), local repro 1/10 under `--workers=4 --repeat-each=10` (port 22432, repeat #7).

## Failure mode

```
Expected substring: "doc-e"
Received string:    "#/doc-d"
```

The poll on `window.location.hash` times out at 10s. Page snapshot at failure
shows the active doc indicator (`button "doc-d.md" [active]`) — the URL hash
is stuck on `#/doc-d` after rapid sequential clicks of doc-b/c/d/e.

## Hypothesis-ranked analysis

### H1 (most likely) — `Promise.all` does not preserve click order

The test fires:

```js
await Promise.all([
  openFromSidebar(page, 'doc-b.md'),
  openFromSidebar(page, 'doc-c.md'),
  openFromSidebar(page, 'doc-d.md'),
  openFromSidebar(page, 'doc-e.md'),
]);
```

`openFromSidebar` calls `sidebar.getByText(filename, { exact: true }).click({ timeout: 10_000 })`.
Each `.click()` includes implicit Playwright actionability checks (visible,
stable, attached, receives events). Under contention, those checks settle in
**non-deterministic order** across the 4 concurrent invocations.

If the actual click dispatch order is `b, c, e, d` (e finishes its
actionability sooner than d), the hash chain becomes:

```
#/doc-b → #/doc-c → #/doc-e → #/doc-d
```

Final state = `#/doc-d`, not `#/doc-e`. Test fails.

The test's intent — "the final click in the array wins" — assumes click
dispatch order matches array order. `Promise.all` provides no such guarantee:
it only awaits completion, not initiation order. This is a **test contract
bug**, not a product navigation bug.

**Evidence:** the failure shows hash at `doc-d`, which is the second-to-last
array element. If clicks were dispatching in array order, the only way to
land at `#/doc-d` would be for the doc-e click to have failed silently —
but `.click({ timeout: 10_000 })` would have thrown a timeout error in that
case, surfacing as a different failure shape. The actual failure shape (hash
stuck at d, no Playwright timeout error) is consistent with all 4 clicks
firing successfully but in `b, c, e, d` order.

### H2 (less likely) — React Suspense + transition race

The hybrid render tree (precedent #18) wraps every nav in `startTransition`.
React may coalesce concurrent state updates differently than expected. But
React's transition contract is: the LAST `setState` inside `startTransition`
wins. As long as the `setActiveDocName('doc-e')` call lands LAST in React's
update queue, doc-e wins. This in turn requires the hash to have changed to
`#/doc-e` last, which is H1's premise.

H2 does not stand on its own — it requires H1 (clicks out of array order).
If we fix H1, H2 dissolves.

### H3 (ruled out) — Hash dedup race in NavigationHandler

`NavigationHandler` (`packages/app/src/App.tsx:31-58`) listens to
`hashchange`, calls `openTargetTransition`. There is no dedup logic — every
hashchange dispatches a transition. Even if 4 hashchanges fire in 50ms,
each gets its own transition. React's transition semantics ensure the LAST
transition's setState wins. So the chain is fully reactive on hash order.

### H4 (ruled out) — Hocuspocus connection race

`waitForActiveProviderSynced` happens AFTER the rapid clicks. Even if doc-e's
provider is mid-sync, the URL hash is set synchronously inside the click
handler (`FileTree.tsx:77`). Hash convergence is independent of provider
sync state.

## Fix

Change `Promise.all` to sequential `await` calls. This preserves the test's
intent ("no waits between them") — each click still fires as fast as
Playwright's actionability allows (~5–30ms each), and there is no
`waitForTimeout` injected — but it guarantees array-order dispatch:

```js
await openFromSidebar(page, 'doc-b.md');
await openFromSidebar(page, 'doc-c.md');
await openFromSidebar(page, 'doc-d.md');
await openFromSidebar(page, 'doc-e.md');
```

The "rapid succession" semantics survive: Playwright's actionability checks
take 5–30ms each, so the 4 clicks dispatch within ~100ms total. React's
`startTransition` coalescing logic still applies. The "final click wins"
assertion now has a deterministic referent (doc-e is genuinely last).

## Why this isn't an architectural fix

Per SPEC §16 STOP_IF: this is NOT a 1-way-door change to navigation
architecture. The fix is a single edit to the test's click sequencing —
no production code changes, no precedent #18 disturbance, no Suspense
boundary modification, no syncPromise cache change.

The product behavior — "final hash setting wins, transitions coalesce" —
already works correctly. The test was making a non-deterministic
assertion about a deterministic system.

## Verification protocol

1. Apply fix (sequential awaits).
2. Run `bunx playwright test tests/stress/docs-open.e2e.ts -g F11 --workers=4 --repeat-each=10`.
3. AC-13: 10 reps, 0 failures.
