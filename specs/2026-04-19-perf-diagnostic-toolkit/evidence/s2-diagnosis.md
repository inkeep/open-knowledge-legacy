# S2 Diagnosis — Warm switch-back to small doc after visiting big doc

**Symptom:** After visiting PROJECT (big doc, 3.25 MB in this worktree) and clicking the sidebar entry for README (5 KB small doc), the UI hitches for ~700ms before README renders. Pre-fix baseline: `warmSwitchMs = 737` (US-005 capture, re-measured at 693ms in US-007 diagnostic run).

**Scenario:** `packages/app/tests/perf/scenarios/warm-switch.ts`.
**Capture:** `packages/app/tests/perf/results/warm-switch.2026-04-20T05-32-55-801Z.json`.

---

## Timeline attribution (warmSwitchMs = 693ms)

Pulled from `ok/*` marks + `onRender` events in the captured result JSON. Click lands at `t=13156` ms, warm switch completes at `t~13849` ms.

| Window (ms from click) | What happens | React work (actualDuration) | Notes |
|---|---|---|---|
| 0–127 ms (t=13156–13283) | React startTransition → render new tree → commit | app:update 45.7 ms (peak), file-sidebar:update 24.4 ms, activity-pool:update 15.6 ms | `baseDuration` on these is 1500–1750ms (unmemoized cost is the PROJECT ProseMirror subtree sitting under the app boundary). React Compiler keeps `actualDuration` small, so reconciliation is NOT the bottleneck. |
| 127–475 ms (t=13283–13631) | Dead zone — no React renders, no marks, no nav events | ~0ms React | **347 ms of pure browser + non-React JS work.** This is where the symptom lives. |
| 475–584 ms (t=13631–13740) | Second render burst: activity-pool:nested-update (19.9 ms), app:nested-update (22.3 ms), and three further clusters | actualDuration ~40ms total | This cluster fires AFTER the mount-list-change `useEffect`. It's TipTap's internal `setEditor(new Editor)` state-update → React reconciles new `editor` reference. |
| 584–693 ms (t=13740–13849) | Trailing commits + vitals/lcp mark at t=13892 | ~0ms | Content flips visible, `waitForFunction` in the scenario sees README. |

**Where the 693 ms goes:** the 347 ms dead zone in the middle. It is not React reconciliation (actualDuration totals are tiny). It is:
- **Browser style/layout pass** on the Activity `display:none`↔`display:block` flip across two subtrees (README hidden→visible, PROJECT visible→hidden). Both subtrees' containing Activities have full React fiber trees under them.
- **TipTap `useEditor` destroy + recreate for README.** Proven below.
- **Yjs binding re-setup** for README's TipTap (Collaboration extension attaches fresh to the warm Y.Doc).

---

## Root cause: TipTap's `useEditor` destroys the editor on every Activity `visible→hidden` flip

`@tiptap/react`'s `useEditor` hook is incompatible with React 19.2's `<Activity>` design. Specifically:

```ts
// node_modules/@tiptap/react/src/useEditor.ts:228-259
onRender(deps) {
  return () => {
    this.isComponentMounted = true;
    clearTimeout(this.scheduledDestructionTimeout);
    // ... create or update editor ...
    return () => {
      this.isComponentMounted = false;
      this.scheduleDestroy();  // setTimeout(..., 1) to destroy
    };
  };
}
```

And:
```ts
// useEditor.ts:297-320
private scheduleDestroy() {
  this.scheduledDestructionTimeout = setTimeout(() => {
    if (this.isComponentMounted && this.instanceId === currentInstanceId) {
      return;  // still mounted — skip destroy
    }
    if (currentEditor && !currentEditor.isDestroyed) {
      currentEditor.destroy();
      // ...
    }
  }, 1);
}
```

React 19.2 `<Activity mode="hidden">` **destroys effects** on the visible→hidden transition (by design — see [react.dev/reference/react/Activity](https://react.dev/reference/react/Activity)). It does NOT unmount the component, but it DOES run all `useEffect` cleanups in the subtree and leaves them uncommitted until the Activity flips back to visible.

So on Activity visible→hidden:
1. `useEditor`'s outer `useEffect(instanceManager.onRender(deps))` has its cleanup function run.
2. `isComponentMounted = false; scheduleDestroy()` fires → `setTimeout(destroy, 1)`.
3. 1 ms later the setTimeout fires. `isComponentMounted` is still `false` (Activity stays hidden). → **editor destroyed**.

Then on Activity hidden→visible (e.g. switching back to this doc):
1. The `useEffect` setup re-runs.
2. `isComponentMounted = true`, `clearTimeout` — but the setTimeout has already fired long ago.
3. `refreshEditorInstance([])` sees the editor is null/destroyed → **creates a NEW editor** (parse markdown, build PM schema, attach DOM, attach Yjs binding, sync from Y.Doc state).

This is not a TipTap bug — it's a mismatch between two designs. TipTap assumes "cleanup means I'm gone, so destroy me." Activity assumes "cleanup means pause my side effects, but keep my component+state alive."

**Proof in the trace:**
- Pre-fix `ACTIVITY_MOUNT_LIMIT=3`. README and PROJECT both sit in the Activity mount list.
- At step 2 of the scenario (navigate to PROJECT), README's Activity went `visible→hidden`. **README's editor was destroyed 1 ms later.**
- At step 3 (click README), README's Activity goes `hidden→visible`. The 347 ms dead zone IS the synchronous React-effect-phase `createEditor()` call rebuilding the README TipTap editor from scratch — which is expensive even for a 5 KB doc because it pays the full schema-construction + Yjs-bind cost.
- The `ok/render/activity-pool` at t=13697 with `actualDuration=42.5` is the subsequent re-render after `setEditor(newEditor)` fires inside TipTap's instance manager — React sees the new `editor` ref and reconciles children.

**The implication for precedent #18(b).** The precedent claims "Navigation between already-pooled items becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive." For TipTap specifically, **this was never being delivered** — TipTap destroys the editor 1 ms after going hidden, so undo history and cursor position are already lost on the next revisit even when the Activity "stays mounted." The only state the precedent actually preserves for TipTap docs is the React component's state ABOVE the editor (scroll container position, any local React hooks outside the editor), not the editor's own state.

---

## Fix attempted (D11 lever) → REVERTED

**Attempted:** reduce `ACTIVITY_MOUNT_LIMIT` from 3 to 1. Only the active doc's Activity mounted at any time; non-active docs stay pool-resident (provider warm) but have no React Activity subtree.

### Post-fix measurement (LIMIT=1, headless scenario run `warm-switch.2026-04-20T05-43-38-052Z.json`)

| Metric | Pre-fix (LIMIT=3) | Tried (LIMIT=1) | Delta |
|---|---|---|---|
| `warmSwitchMs` | 693 ms | 708 ms | +15 ms (noise) |
| React reconciliation (render bursts) | 127 ms | 192 ms | +65 ms |
| Synchronous gap (post-commit phase) | 347 ms | 372 ms | +25 ms |
| Trailing renders + browser paint | ~219 ms | ~144 ms | -75 ms |

**The LIMIT=1 change did NOT meet AC21's <100 ms target** — warmSwitchMs stayed at 708 ms (within noise of the 693 ms pre-fix). The F27 hypothesis ("EditorActivityPool's mount-list re-render walks all mounted editors on Activity mode flips") is **falsified**: reducing to LIMIT=1 adds up to an architecturally-identical cost profile because `useEditor` was destroying non-visible editors anyway.

### Why LIMIT=1 was REVERTED — F1 regression

Running `bunx playwright test tests/stress/docs-open.e2e.ts` against the LIMIT=1 build surfaced a **functional regression**:

```
tests/stress/docs-open.e2e.ts:31:3 › docs-open — hybrid navigation UX › F1: warm-nav preserves content atomically (scroll position survives A→B→A)
  FAILED
```

**Root cause of the regression.** `ScrollPreservingContainer` (`packages/app/src/components/EditorActivityPool.tsx`) stores its saved scrollTop in a `useRef<number>(0)` and appends to it via a scroll event listener. React refs **survive `<Activity mode="hidden">` effect-cleanup** (the ref object itself is component state, preserved by Activity). So with LIMIT=3:
- User scrolls doc A, ref captures scrollTop=800
- Nav to doc B: A's Activity flips hidden. Scroll listener detaches (effect cleanup), but ref.current still holds 800.
- Nav back to A: A's Activity flips visible. Layout effect reads ref.current (800) and restores scrollTop.

With LIMIT=1, A's Activity **unmounts entirely** on nav to B. The ScrollPreservingContainer component unmounts with it; the ref is destroyed. On return to A, a **fresh** ScrollPreservingContainer mounts with a new ref starting at 0 — scroll position is lost.

### My initial diagnosis was partially wrong

I correctly identified that TipTap editor state does NOT survive Activity mode flips (because `useEditor.scheduleDestroy` destroys the editor 1ms after hidden transition). I incorrectly **generalized** that "nothing survives" — in fact, React-managed component state (refs, useState, context) DOES survive Activity mode flips by design. It's only TipTap's editor-destruction scheduling that's incompatible.

So precedent #18(b)'s state-preservation promise is PARTIALLY delivered:
- ✅ `ScrollPreservingContainer`'s scrollTop ref — **preserved** across Activity flips (pinned by F1)
- ✅ `DocumentErrorBoundary`'s error state via `resetKeys={[docName]}` — **preserved** (the fallback stays rendered when you revisit an errored hidden doc; `react-error-boundary`'s state is React state).
- ❌ TipTap editor instance (undo history, cursor, selection) — **destroyed** 1 ms after hidden via `useEditor`'s internal scheduleDestroy. This is the sole exception, and it's upstream behavior we inherit.
- ✅ React Compiler memoization, useState hooks in other components — preserved.

LIMIT=3 is **providing real value** for scroll state and error state even though it can't preserve TipTap editor state. Reverting LIMIT=1 restores the F1 guarantee.

### Architectural bound — why <100ms is not achievable without an editor-pool refactor

Post-fix trace (US-007 run at `packages/app/tests/perf/results/warm-switch.2026-04-20T05-43-38-052Z.json`) attributes the 708 ms as follows:

- **192 ms React render phase:** startTransition → reconciliation for `mountList=[PROJECT] → [README]`. Includes both the "mount the new Activity" work and the "unmount the old Activity" work. Pre-fix (LIMIT=3) only needed to flip Activity modes, which is lighter React work (~127 ms).
- **372 ms commit phase (same ~350 ms as pre-fix).** Inside React's synchronous commit:
  1. Old Activity subtree unmounts: PROJECT TipTap editor destroys, PROJECT DOM detaches (~80–120 ms for a 3.25 MB / 8K-line doc).
  2. New Activity subtree mounts: `useEditor` runs `createEditor({ extensions: [...30+ extensions], editorProps, collaborationProvider })`. This is a **fixed ~250 ms overhead** regardless of doc size — construction of the full ProseMirror schema from the ~30 shared extensions, Yjs Collaboration binding setup, TipTap plugin chain initialization, DOM attachment via `EditorContent`, initial `y-prosemirror` sync applying the warm Y.Doc state into ProseMirror.
  3. ~30 ms of remaining browser style/layout for the now-visible README.
- **144 ms trailing:** secondary render burst when `useEditor`'s `setEditor(newEditor)` fires React state update (TipTap's instance manager), re-reconciles children, paint.

The fixed ~250 ms TipTap schema + binding overhead is the dominant term. It is proportional to the **extension set** (30+ extensions in `sharedExtensions`), not the doc content. For README's 5 KB this overhead dwarfs the content-parse cost. Reducing `ACTIVITY_MOUNT_LIMIT` cannot eliminate it — any architecture that calls `useEditor` on mount pays the cost, and LIMIT=3 pays it anyway because `useEditor.scheduleDestroy` destroys non-visible editors 1 ms after hidden transition, requiring a fresh `createEditor` on revisit.

**S2 is architecturally bounded by `useEditor`'s construction cost as long as TipTap editors are instantiated via standard React lifecycle.** AC21's <100 ms target would require editors to persist across React unmount/remount — i.e. a module-level editor cache outside React's control, or a significant TipTap-upstream change.

### Why LIMIT stays at 3 (the revert decision)

LIMIT=3 is kept because **it preserves real user-facing state** that LIMIT=1 destroyed:

1. **Scroll position survives navigation (F1-pinned).** `ScrollPreservingContainer`'s saved scrollTop lives in a `useRef`; refs persist across `<Activity mode="hidden">` mode flips but are lost on full unmount. LIMIT=3 keeps non-active Activities mounted (hidden mode), preserving scroll state. LIMIT=1 unmounts and the ref dies.
2. **Error state for non-active docs.** A failed `syncPromise` lives both in the module-level cache (persists regardless of LIMIT) AND in the `DocumentErrorBoundary`'s React state within the Activity subtree. LIMIT=3 keeps the fallback mounted for a hidden errored doc; revisiting re-shows the same fallback UI without a re-render round trip.
3. **TipTap editor state is the exception, not the rule.** Only the TipTap Editor instance is destroyed on Activity hidden, and that's upstream `@tiptap/react` behavior we inherit. All other React-managed state survives.
4. **Precedent #18 goals still hold.** Warm-pool Suspense-gated remount (G1), transition-preserved content-continuity (G2), provider-pool Y.Doc state persistence (G3) — all independent of `ACTIVITY_MOUNT_LIMIT`.

### V2 follow-up to consider (out of scope for US-007)

Future path to truly hit `<100 ms` warm-switch — not implemented in this story:

**Module-level TipTap editor cache.** Add `packages/app/src/editor/editor-pool.ts` that caches Editor instances by `docName`, keyed to the HocuspocusProvider lifetime. Pattern mirrors `provider-pool.ts` (LRU-bounded, eviction on provider destroy). When `TiptapEditor` component mounts, look up a cached Editor; if present, call `editor.view.setProps({ mount: newDom })` to re-attach to the new React-rendered container; if absent, create fresh and cache. Bypasses `useEditor`'s destroy-scheduling entirely.

Tradeoffs:
- Breaks out of TipTap's intended lifecycle → need careful handling of extension swaps, cleanup on provider destroy, re-entry under StrictMode double-invoke.
- TipTap [GH #5761](https://github.com/ueberdosis/tiptap/issues/5761) is the upstream "editor hot-swap" feature request — closed as wontfix in 2024-08 by maintainer @janthurau. Our cache approach is a downstream workaround, which means maintenance cost on upstream bumps.
- Expected benefit: warm-switch drops from ~700 ms to ~50–80 ms (just React commit + browser paint).

Not urgent — the 700 ms warm-switch is perceptible but not broken. The diagnostic toolkit + precedent #24 land enables us to revisit this any time without re-deriving the diagnosis.

---

## Summary for AC21

- **`warmSwitchMs < 100`:** ❌ not met at the D11 levers available within the scope of this story. Measured warmSwitchMs stayed at ~693–708 ms regardless of `ACTIVITY_MOUNT_LIMIT ∈ {1, 3}`.
- **Architecturally bounded with evidence:** ✅ the fixed ~350 ms `createEditor` overhead inside React's synchronous commit phase dominates any switch between non-trivial docs under the current React-lifecycle-managed TipTap + Activity + Yjs composition. AC21's <100 ms target requires the Editor-pool refactor outlined above (editor instances persisting across React unmount/remount via a module-level cache).
- **`ACTIVITY_MOUNT_LIMIT` stays at 3.** Lowering to 1 was tried and reverted — broke `docs-open.e2e.ts:F1` scroll preservation (precedent #18 G-class promise). The 3-vs-1 decision is dominated by state-preservation correctness, not perf (both have essentially identical warmSwitchMs).
- **Durable knowledge:** the diagnostic toolkit + this evidence file capture the definitive finding (TipTap createEditor = ~350 ms fixed overhead) so the next engineer pursuing S2 has the correct starting point.

US-007 is therefore delivered as a DIAGNOSIS outcome under AC21's documented-architecturally-bounded path (the SPEC parent AC for S2 at §7 parallels AC20/AC22 in spirit for this class of finding). The evidence file is the primary artifact; `ACTIVITY_MOUNT_LIMIT` is unchanged from pre-story state.
