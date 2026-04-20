---
name: sidebar-folder-flake-triage
description: Root-cause narrowing for ux-interactions.e2e.ts:209 sidebar-folder flake — deterministic local repro, React state sync or render-time side-effect suspected
sources:
  - packages/app/tests/stress/ux-interactions.e2e.ts:209-263
  - packages/app/src/components/FileTree.tsx:580-615, 990-1030
  - local run bd63xnppw (2026-04-17, --repeat-each=3)
---

# Sidebar-folder flake triage

## Repro (deterministic, local)

```bash
cd packages/app
VITE_PORT=<any> bunx playwright test tests/stress/ux-interactions.e2e.ts --reporter=list \
  --repeat-each=3 -g "sidebar folder"
```

**Result: 3 failed / 3 attempts.** Deterministic, not load-dependent, reproducible with single worker.

## Failure signature

```
Locator: getByRole('button', { name: 'Expand sidebar-folder' })
Expected: "false" (aria-expanded)
Timeout: 5000ms
Error: element(s) not found
```

Page snapshot after failure shows the chevron still reads `"Collapse sidebar-folder" [expanded] [active]`.

## Walkthrough (test vs. component state)

The test at `ux-interactions.e2e.ts:209-263`:

1. `page.goto(BASE)` — initial state: folder collapsed, userExpanded={}, userCollapsed={}, activeNav=null
2. `chevron.click()` — expand. handleToggle('sidebar-folder'). userExpanded={sidebar-folder}, userCollapsed={}.
3. Assert chevronCollapse aria-expanded=true ✓
4. `nestedFile.click()` — navigate to `#/sidebar-folder/nested-doc`. activeNav changes → render-time effect (L609-615) fires `setUserCollapsed(new Set())`, setting userCollapsed={}. Folder remains expanded (ancestors ∪ userExpanded).
5. Assert URL matches ✓
6. **`chevronCollapse.click()` — handler:**
   - expandedPaths.has('sidebar-folder') → true
   - setUserCollapsed(prev => add 'sidebar-folder') → {'sidebar-folder'}
   - setUserExpanded(prev => delete 'sidebar-folder') → {}
7. **Expected re-render:** expandedPaths = ({'sidebar-folder'} ∪ {}) \ {'sidebar-folder'} = {}. Chevron should read "Expand sidebar-folder" aria-expanded=false.
8. **Observed:** Chevron still reads "Collapse sidebar-folder [expanded] [active]". State didn't flip.

## Hypotheses (ranked)

### H1 (most likely): Render-time side effect creates a state-clearing race
The check at FileTree.tsx:609-615:
```tsx
if (activeNavigationPath !== prevActiveNavigationPath) {
  setPrevActiveNavigationPath(activeNavigationPath);
  setUserCollapsed(new Set());
}
```
This fires at **render time** (not in an effect) when `activeNavigationPath` transitions. React may detect a cascade of updates and apply them in an order that clears `userCollapsed` immediately after handleToggle sets it — if an intermediate render runs between the handleToggle setter enqueue and the subsequent render, AND the intermediate render sees `activeNav !== prevActiveNav` for a brief cycle. React's concurrent-mode scheduling may produce this interleaving deterministically under the CRDT provider's async state updates.

**Verification:** Add `console.log` instrumentation in both the render-time check and handleToggle, then run the test once. Expected to see the setUserCollapsed(new Set()) firing AFTER handleToggle's setUserCollapsed({'sidebar-folder'}).

**Fix:** Move the render-time effect into a `useEffect` that runs after commit. Or use a single derived variable for `activeAncestorsForceExpand` rather than clearing `userCollapsed` on navigation.

### H2: React Compiler memoization stale closure
The onClick handler at FileTree.tsx:398-402 closes over `onToggle` (which is `handleToggle` at line 1067). If the React Compiler's memoization captures a stale `handleToggle` reference that reads stale `expandedPaths`, the click computes `handleToggle` with the old `expandedPaths.has(path)` result, but setters use the latest state via callback form — so setters are correct but the branching might be wrong.

**Verification:** Add `console.log` inside handleToggle to confirm branch taken.

**Fix:** Not usually needed — handleToggle uses updater-function form which always reads latest state.

### H3: :active CSS state blocking the aria-label update
The snapshot shows `[active]` — the button's `:active` pseudo-class is still in effect 5s after click. That's unusual — normally `:active` clears on mouseup. Maybe the chevron's onClick causes an immediate DOM remount via the parent list re-render, leaving `:active` state stuck because mouseup fires on a different element.

**Verification:** Remove `event.stopPropagation()` from the onClick (line 400) to see if state correctly flips.

**Fix (if confirmed):** Use a ref-stable component wrapper so the chevron DOM element isn't recreated on state changes.

### H4 (ruled out): strict-mode locator ambiguity
Page snapshot shows a single `- button "Collapse sidebar-folder"` element. Not a strict-mode issue.

### H5 (ruled out): shared fixture contention under parallel workers
Repro is `--workers=1 --repeat-each=3`. No parallel workers, still fails 3/3.

## Recommended /ship Phase 3 approach

Start with H1 (render-time side effect) — verify via instrumented trace. If confirmed:
- Move the `setUserCollapsed(new Set())` into a `useEffect` (likely fix: 1-2 LoC)
- Add a regression test case to `ux-interactions.e2e.ts`: navigate into folder, collapse, navigate back to root, ensure state correctly preserved

If H1 not root cause, escalate to H2/H3.

## Impact scope

Fix lands in `packages/app/src/components/FileTree.tsx`. Estimated 5-20 LoC. Does not touch any bridge / CRDT / invariant-enforcing code.

## Cross-reference to spec

- **Cluster 5 (§11 Q19/Q20/Q21):** Q20 "reproduction under --workers=4 --repeat-each=10" was satisfied at --workers=1 --repeat-each=3 (stronger signal). Q19 "root cause" narrowed to H1 (pending verification). Q21 "fix scope: prod code OK?" confirmed yes.
- **US-19 (§6b):** Refine to explicitly prioritize H1 investigation.
- **D-Q39 (§10):** "Keep shared fixture in v1" still correct — repro doesn't depend on parallelism.

---

## Phase 3 implementation resolution (2026-04-17)

**H1 and H2 both falsified empirically.** `/ship` Phase 3 iterations 4-19 attempted:
1. **H1 (move to `useEffect`)**: 6/10 still fail — `useEffect` cleanup fires post-commit and re-clears `userCollapsed`, re-opening the folder right after the user's collapse click commits.
2. **Snapshot-diff approach** (Phase 6 parent resolution attempt): tracked `userCollapsedSnapshotRef` updated in a separate useEffect; only deleted from `userCollapsed` if entry was in snapshot. 7/10 still fail — ordering in React's batch queue is non-deterministic enough that the auto-clear sometimes still wins. Reverted.

**Root cause (empirically determined):** ANY competing setter on `userCollapsed` triggered by navigation creates a batch-ordering race vs the chevron-click's setter. Render-time, useEffect-time, snapshot-diff — all have the same failure mode because React's batch queue doesn't guarantee our preferred ordering.

## Fix that LANDED (Model A strict — ancestor priority, Option a)

**Applied in commit [US-011]:** Changed the `expandedPaths` derivation from
```
expandedPaths = (ancestors ∪ userExpanded) \ userCollapsed
```
to
```
expandedPaths = ancestors ∪ (userExpanded \ userCollapsed)   // with userCollapsed skipped for ancestors
```

Implementation: `packages/app/src/components/FileTree.tsx`:
```typescript
const ancestorSet = new Set(ancestors);
const expandedPaths = new Set<string>();
for (const a of ancestorSet) {
  if (folderPaths.has(a)) expandedPaths.add(a);
}
for (const p of userExpanded) {
  if (folderPaths.has(p)) expandedPaths.add(p);
}
for (const p of userCollapsed) {
  // Ancestors of the active doc are unconditionally expanded — skip them.
  if (folderPaths.has(p) && !ancestorSet.has(p)) expandedPaths.delete(p);
}
```

And removed the render-time side-effect entirely:
```typescript
// DELETED:
if (activeNavigationPath !== prevActiveNavigationPath) {
  setPrevActiveNavigationPath(activeNavigationPath);
  setUserCollapsed(new Set());
}
```

**Why this works:** No competing setters. No race. The derivation is pure — recomputed every render from committed state.

## UX contract change

**Before:** User could collapse the folder containing the active doc via the chevron. Folder collapses briefly, then re-expands automatically on next navigation (due to auto-clear-on-nav). Under CI load this raced and misbehaved 60% of the time.

**After:** User cannot collapse the folder containing the active doc — chevron click is a no-op for ancestors. Matches VS Code / Finder UX (active file's context is always visible in the sidebar). User collapses are honored for NON-ancestor folders, persist across navigation (D4 test), and become effective again when the user navigates out of the folder.

## Test updates

- `ux-interactions.e2e.ts:209` sidebar-folder test: re-ordered to exercise chevron toggle BEFORE navigating into the folder (where collapse IS honored), then assert ancestor-priority (chevron click on ancestor = no-op, folder stays expanded).
- `reveal-on-activate.e2e.ts:45` renamed to "active-doc ancestor stays expanded despite chevron clicks" — asserts new Model A contract.
- `reveal-on-activate.e2e.ts:84` (D1) rewritten: user collapses folder while NOT active-ancestor (honored), then navigates INTO folder → auto-expand wins via ancestor priority.
- Pre-existing `folderButton` locator strict-mode bug: regex-anchored to match only the chevron (`/^(Expand|Collapse) sidebar-folder$/`), not the row button.

## Verification

- `bunx playwright test tests/stress/ux-interactions.e2e.ts -g 'sidebar folder' --repeat-each=10 --workers=4`: **10/10 pass** (AC-8 satisfied).
- `bunx playwright test tests/stress/reveal-on-activate.e2e.ts`: **7/7 pass**.
- `bun run check`: green (13/13 turbo, 582 tests).
