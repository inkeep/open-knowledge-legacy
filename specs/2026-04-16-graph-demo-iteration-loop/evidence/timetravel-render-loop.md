# Time-travel render loop — mechanism + fix

**Status:** fixed in this spec's PR (commit `b7f…` TBD after commit lands).
**Severity before fix:** P0 — Stage 7 time-travel crashed the Graph panel the
moment the user stepped to any historical checkpoint.
**Symptom:** `Maximum update depth exceeded` React error, graph canvas went
blank, no further interaction possible until the whole page was reloaded.
**Reproducer (pre-fix):** fullscreen Explore graph → click "Step to previous
checkpoint" → within ~1 second, canvas vanishes, console error fires.

## Chain of causation

The loop is 6 steps, and closes through the **`onStatsChange`** pipeline:

1. `GraphPanel` re-renders → `useGraphTimeline(...)` runs.
   `computeDerived(...)` allocates a fresh `overrideGraph` object whenever
   `viewSha !== null` (it calls `normalizeHistoricalNodes` /
   `normalizeHistoricalLinks`, each of which `.map()`s to a new array).
   **Separately**, the JSX `onStatsChange={(nodes, links, loading) => {…}}`
   prop is an inline arrow function — React Compiler does NOT memoize inline
   prop-arrows, so its identity changes on every render.
2. `<GraphView ... onStatsChange={new fn every render} />` — React sees a new
   prop identity.
3. `GraphView`'s stats-emit effect has `onStatsChange` in its deps array.
   A new function identity each render → effect fires every render.
4. The effect calls `onStatsChange(nodes, links, loading)`. The callback in
   `GraphPanel` pre-fix called `setStats({ nodes, links })` — a new object
   literal every call. React sees `Object.is(prev, next) === false` because
   object identity differs (even when `prev.nodes === next.nodes &&
   prev.links === next.links`), so it schedules a re-render.
5. `GraphPanel` re-renders. Goto step 1.

Before this spec, step 1 was benign: pre-Stage-7, `GraphPanel` didn't call
`useGraphTimeline` at all, so renders were only triggered by external state
changes (live fetch complete, resize, theme, etc.) — the inline
`onStatsChange` arrow had new identity on each of those renders, but there
was no render-every-render driver to close the loop. Stage 7 closed the
ring by introducing a `useGraphTimeline` call that every render eagerly
re-derived — combined with the object-identity `setStats` allocation, a
single checkpoint step produced infinite re-renders.

## The real fix

Make `setStats` idempotent — bail out when the values haven't actually
changed, so React skips re-rendering when the emit is a no-op:

```tsx
// BEFORE — new object literal each call, re-renders `GraphPanel` every emit
onStatsChange={(nodes, links, loading) => {
  if (loading) {
    setStats(null);
    return;
  }
  setStats({ nodes, links });
}}

// AFTER — functional updater that bails out when values unchanged
onStatsChange={(nodes, links, loading) => {
  if (loading) {
    setStats((prev) => (prev === null ? prev : null));
    return;
  }
  setStats((prev) => {
    if (prev && prev.nodes === nodes && prev.links === links) return prev;
    return { nodes, links };
  });
}}
```

The effect still fires on every render (because `onStatsChange` identity
still flips), but the setter bails out when the output is identical —
structurally breaks the parent-re-render feedback in step 5.

## First-hypothesis fix (partial, still shipped)

An earlier fix attempt changed the `GraphView` stats effect to depend on
**primitive counts** rather than the `displayData` object identity:

```tsx
// GraphView.tsx — effect deps: counts, not object
const displayNodeCount = displayData.nodes.length;
const displayLinkCount = displayData.links.length;
useEffect(() => {
  onStatsChange?.(displayNodeCount, displayLinkCount, loading);
}, [displayNodeCount, displayLinkCount, loading, onStatsChange]);
```

This fix by itself was insufficient — even with primitive-count deps, the
`onStatsChange` identity changing every render still made the effect fire
every render, and the object-allocating `setStats({nodes,links})` still
closed the loop. Both fixes ship together because they encode complementary
invariants:

- The primitive-count deps prevent **unnecessary effect fires** when only
  the `displayData` object identity changed (e.g. when the override-sync
  effect set the same content through different refs).
- The idempotent `setStats` prevents the **actual re-render cascade**
  structurally — even if an effect over-fires, no re-render happens unless
  values actually changed.

## Why not just memoize `onStatsChange`?

Three reasons React Compiler can't solve this automatically:

1. **React Compiler 1.0 memoizes functions defined in a component body at
   `const fn = (...) => {...}` form** — but an inline prop-arrow literal in
   JSX is syntactically distinct and the compiler does not hoist it. We
   can't use `useCallback` (CLAUDE.md bans it under the React Compiler
   discipline).
2. **Even a hoisted callback wouldn't fix the secondary issue** — the
   `setStats({...})` allocation inside the callback is opaque to the
   compiler; only a functional-update-with-bail-out structurally guarantees
   no-op when values are identical.
3. **Stable-setter via ref** (the classic escape hatch) works in principle,
   but React Compiler forbids `ref.current = x` during render. The
   state-setter-bail-out pattern is cleaner because it's the setter's own
   API — no ref, no layout effect.

## Regression coverage

- **Playwright smoke** (manual, committed as `/tmp/playwright-qa-timetravel-fix-verify.js`
  during QA): open any doc → fullscreen Explore → click "Step to previous
  checkpoint" → assert canvas still renders nodes AND `[page|console].on('error')`
  never captures `Maximum update depth exceeded`. A `.e2e.ts` port into
  `tests/stress/` is planned but not required for ship — the unit path is
  not reachable (this is a cross-component effect that only manifests
  end-to-end in a real React runtime).
- **Unit** targeted at the bail-out: the `setStats` functional-updater
  logic is inlined and trivially reviewable; no dedicated unit test — the
  Playwright smoke is the canonical regression gate.

## Related, intentionally left alone

- `onClustersChange={setClusters}` — passes the setter directly, no inline
  arrow. Stable identity. No risk of the same loop.
- `onActiveAgentsChange={setActiveAgents}` — same, stable setter. Fires on
  a 1-Hz `setInterval` inside `GraphView`, bounded re-render rate, safe.
- The over-firing stats effect (even with the fix) is mildly wasteful —
  effect runs every render, then React bails on the setter. Acceptable:
  effect is cheap (3 prop reads + one setter call), and the loop is
  structurally broken. If this becomes a perf issue, the follow-up is a
  ref-based stable callback in `GraphView`, not a `useCallback` in
  `GraphPanel`.
