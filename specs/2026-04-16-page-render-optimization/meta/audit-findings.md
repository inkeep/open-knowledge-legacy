# Audit Findings

**Artifact:** `specs/2026-04-16-page-render-optimization/SPEC.md`
**Audit date:** 2026-04-16
**Baseline commit verified against:** `572a08b` (current HEAD; SPEC.md header says `06da1ff`, which is the last pre-spec commit — the spec itself is on the current commit)
**Total findings:** 14 (3 H, 5 M, 6 L)

---

## High Severity

### [H] Finding 1: Bridge-propagation latency miscited as WebSocket initial-sync latency

**Category:** FACTUAL
**Source:** T1 (own codebase), T2 (own report)
**Location:** §1 (line 20), §10 D7 Evidence (line 352), §11 Q1 (line 371)
**Issue:** The spec repeatedly cites "500ms at ~2KL, 7.4s at ~10KL" from `reports/crdt-observer-bridge-latency-analysis/REPORT.md` as initial-sync (WebSocket) latency. But that report actually measures **observer-bridge propagation latency** (internal XmlFragment ↔ Y.Text synchronization on a single client, which runs AFTER content has arrived), not network-level initial-sync duration.

**Current text (§1, line 20):**
> "An `EditorSkeleton` is rendered conditionally on `syncState === 'connecting'` (`EditorArea.tsx:19-30, 159-161`), but it does not preserve previous content during nav — it flashes in during the sync gap, itself a form of flicker."
> "500ms at ~2KL, up to 7.4s at ~10KL per `reports/crdt-observer-bridge-latency-analysis/REPORT.md`"

**Current text (§10 D7 Evidence, line 352):**
> "Hocuspocus edge cases (`yjs/y-websocket#81`, `hocuspocus#183`) + measured 7.4s at 10KL (from `reports/crdt-observer-bridge-latency-analysis/REPORT.md`)."

**Evidence:** `reports/crdt-observer-bridge-latency-analysis/REPORT.md:26`:
> "Stress testing reveals **non-linear scaling**: propagation takes 500ms at 2K lines but 7.4s at 10K lines (14.8x), with rapid sequential writes at 10K lines taking 37s per 5-write cycle."

And `:60-70`:
> "Agent write → Y.Text mutation (~0ms) → Observer B debounce (50ms wait) → Typing defer check → mdManager.parse() → schema.nodeFromJSON() → updateYFragment() → ..."

This is client-side CRDT bridge computation time — not WebSocket wire latency.

**Status:** CONTRADICTED
**Suggested resolution:** Replace these citations with an accurate latency source (or explicitly qualify that the spec uses "sync gap" to include observer-bridge propagation after WebSocket arrival). The D7 30s timeout may still be correct, but the rationale needs a sound basis — either (a) obtain actual WebSocket initial-sync measurements, or (b) expand the timeout justification to include the bridge-propagation stage that happens AFTER `synced` fires but BEFORE content renders. Because `setupObservers()` runs ON `synced`, the full bridge propagation does count as part of the visible "sync gap" — the spec just needs to make that connection explicit rather than implying a single WebSocket number.

---

### [H] Finding 2: §9 proposed code regresses dual-editor mount pattern

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** §9 Proposed solution code snippet (lines 258-274)
**Issue:** The current `EditorArea.tsx:156-179` deliberately mounts BOTH `SourceEditor` and `TiptapEditor` concurrently using CSS `hidden` class — an explicit design choice documented in an inline comment: *"CSS-based show/hide — display:none keeps DOM alive without triggering React's effect lifecycle, so both editors survive mode switches."* The spec's proposed code snippet uses conditional rendering (`editorMode === 'source' ? <SourceEditor /> : <TiptapEditor />`) which would remount on every mode swap, regressing existing behavior.

**Current text (§9, lines 265-268):**
```tsx
<DocumentBoundary docName={entry.docName}>
  {editorMode === 'source'
    ? <SourceEditor ytext={entry.ytext} provider={entry.provider} />
    : <TiptapEditor docName={entry.docName} provider={entry.provider} />}
</DocumentBoundary>
```

**Evidence:** `packages/app/src/components/EditorArea.tsx:156-179`:
```tsx
{/* CSS-based show/hide — display:none keeps DOM alive without triggering
    React's effect lifecycle, so both editors survive mode switches. */}
<div className="h-full" style={{ display: isDiffMode ? 'none' : undefined }}>
  {syncState === 'connecting' ? (
    <EditorSkeleton />
  ) : (
    <>
      <div className={isSourceMode ? 'h-full' : 'hidden'}>
        <SourceEditor ... />
      </div>
      <div className={isSourceMode ? 'hidden' : 'h-full'}>
        <TiptapEditor ... />
      </div>
    </>
  )}
</div>
```

**Status:** INCOHERENT
**Suggested resolution:** Either (a) update the §9 code snippet to preserve both-editors-concurrently-mounted with CSS-hidden-class pattern (per-Activity-entry), or (b) explicitly call out in a new decision (or DX9) that mode-swap remount IS acceptable in the new model and why. DX1 ("CodeMirror SourceEditor gets the same hybrid treatment") doesn't clarify this point. Given the existing code's deliberate comment-guarded design, deliberate regression should be explicit. F10 ("Source editor (CodeMirror) path follows same architecture") does not explicitly test mode-swap behavior preservation.

---

### [H] Finding 3: Spec §8 contains a fabricated grep result about `FileTree.tsx` startTransition

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 "Known gaps" (line 209)
**Issue:** The spec claims FileTree.tsx uses `startTransition` for tree-expansion state, but grep of the entire `packages/app` directory returns ZERO matches for `startTransition` OR `useTransition`. The worldmodel-findings.md does not make this claim either (it just says "zero hits" for each).

**Current text (§8, line 209):**
> "No Suspense / useTransition / startTransition / ErrorBoundary anywhere (grep: 0 hits each — with the sole exception of FileTree.tsx's startTransition for tree-expansion state, unrelated to navigation)."

**Evidence:** `grep -r "startTransition\|useTransition" packages/app/` (run 2026-04-16 against commit `572a08b`) returns NO matches in any file. `grep` on `FileTree.tsx` specifically returns no matches for `Transition` or `startTransition`.

**Status:** CONTRADICTED
**Suggested resolution:** Remove the FileTree.tsx exception clause. Restate as: "No Suspense / useTransition / startTransition / ErrorBoundary anywhere in `packages/app/src` (grep: 0 hits each)." Minor in isolation but this is a load-bearing factual claim about current-state — if the spec gets basic grep results wrong, readers lose confidence in the rest of §8.

---

## Medium Severity

### [M] Finding 4: `hocuspocus#525` mischaracterized as "community consensus"

**Category:** FACTUAL
**Source:** T4 (web verification via gh CLI)
**Location:** §10 D8 Evidence (line 353)
**Issue:** The spec cites "community consensus from `hocuspocus#525` recommends 200ms" for `forceSyncInterval`. Verified via `gh issue view 525 --repo ueberdosis/hocuspocus`: the issue is a single user's bug report where the user proposed `forceSyncInterval: 200` as a workaround (via @varun-raj). It was closed 2023-03-30 without a canonical "recommended value" statement. One person's workaround is not "community consensus."

**Current text (§10 D8):**
> "Community consensus from `hocuspocus#525` recommends 200ms."

**Evidence:** `gh issue view 525 --repo ueberdosis/hocuspocus`:
> "I have had syncing issues from the start. From talking to @varun-raj, who had the exact same problem in combination with NextJS, he identified a temporary solution which is to set the `forceSyncInterval` to some arbitrary (relatively low) number, like 200 ms."

**Status:** CONTRADICTED
**Suggested resolution:** Reframe as: "the original reporter's workaround in `hocuspocus#525` used 200ms; we adopt the same arbitrary-but-low value as defense-in-depth." Drop "community consensus" framing. The decision to use 200ms is still defensible — just not from consensus grounds.

---

### [M] Finding 5: `y-websocket#81` and `hocuspocus#183` framed as active edge cases, but both are closed (2021)

**Category:** FACTUAL / COHERENCE
**Source:** T4 (web verification via gh CLI)
**Location:** §1 Complication point 3 (line 21), §9 Failure modes table (line 321), §10 D7 (line 352)
**Issue:** Both issues are CLOSED years ago (y-websocket#81 closed 2021-10-06; hocuspocus#183 closed 2021-09-01). The underlying bug class may still recur in practice, but the spec treats the issues themselves as current — not "historically-documented patterns that may still manifest."

**Current text (§1, line 21):**
> "When sync fails (doc doesn't exist on disk, sustained pre-sync disconnect, upstream `hocuspocus#183` reconnect bug, `y-websocket#81` initial-content-never-arrives bug)"

**Evidence:**
- `gh issue view 81 --repo yjs/y-websocket`: CLOSED 2021-10-06T12:32:12Z
- `gh issue view 183 --repo ueberdosis/hocuspocus`: CLOSED 2021-09-01T10:03:01Z

**Status:** STALE
**Suggested resolution:** Add a qualifier like "documented in historically-closed issues but the underlying pattern still occurs in production per community reports" OR cite more recent reproductions if available. The timeout (D7) + forceSyncInterval (D8) mitigation design is sound regardless — this is framing precision, not a design issue.

---

### [M] Finding 6: §9 code snippet uses `entry.ytext` and `docName` props that don't exist on current types

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** §9 Proposed solution code snippet (lines 258-274)
**Issue:** The illustrative code snippet passes `docName={entry.docName}` to `<TiptapEditor />` and `ytext={entry.ytext}` to `<SourceEditor />`. Neither prop (`docName` on TiptapEditor) nor field (`ytext` on PoolEntry) exists:
- `TiptapEditorProps` (`TiptapEditor.tsx:75-78`) has only `{ provider, placeholder }` — no `docName`.
- `PoolEntry` (`provider-pool.ts:17-26`) has no `.ytext` field — Y.Text is obtained via `provider.document.getText('source')`.

The SourceEditor already takes `ytext` directly, so the caller would need to compute it. TiptapEditor doesn't currently need `docName` at all (it extracts from `provider.configuration.name` internally).

**Current text (§9 lines 266-268):**
```tsx
{editorMode === 'source'
  ? <SourceEditor ytext={entry.ytext} provider={entry.provider} />
  : <TiptapEditor docName={entry.docName} provider={entry.provider} />}
```

**Evidence:**
- `packages/app/src/editor/TiptapEditor.tsx:75-80`: `interface TiptapEditorProps { provider; placeholder? }; ... ({ provider, placeholder }) => ...`
- `packages/app/src/editor/provider-pool.ts:17-26`: `interface PoolEntry { provider; observerCleanup; syncState; docName; lastAccessedAt; hasSynced; tearingDown; pendingRecycleTimer; }` — no `ytext`.

**Status:** INCOHERENT
**Suggested resolution:** Either (a) rewrite the snippet to use `ytext={entry.provider.document.getText('source')}` and drop the unused `docName` prop on TiptapEditor, or (b) explicitly note that the snippet assumes a future PoolEntry shape with a memoized `.ytext` derivation. For the spec to be implementable from its own code snippets, the types should resolve. Minor because the snippet is illustrative, but a reader following it will write non-compiling code.

---

### [M] Finding 7: DX7 (__system__ filter) defends render but not open — doc can still enter pool

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis), L1 (cross-finding contradictions)
**Location:** §9 Shadow paths (line 312), §10 DX7 (line 360), §14 R10 (line 498), §16 ASK_FIRST (line 578)
**Issue:** DX7 says `__system__` is "excluded from EditorActivityPool iteration" — a render-time filter. But the defense-in-depth is not at the `ProviderPool.open()` / `DocumentContext.openDocument()` level. Any hash like `#/__system__` would:
1. Hit `NavigationHandler.onHashChange` (`App.tsx:22-25`).
2. Call `openDocument('__system__')`.
3. Create a `HocuspocusProvider` for it (competing with the existing `__system__` direct connection the server pre-materializes).
4. Enter the pool — just not rendered.

This creates a second WebSocket connection to `__system__` that the server's CC1 broadcaster expects to be singular. R10 acknowledges the risk ("edge code path") but the mitigation is "unit test on filter + belt-and-suspenders" — both at the render layer, not the open layer.

**Current text (DX7, line 360):**
> "`EditorActivityPool` iterates `pool.entries.filter(e => !isSystemDoc(e.docName))`."

**Evidence:** `packages/app/src/editor/DocumentContext.tsx:112-116` (openDocument has no __system__ guard); `packages/app/src/components/SystemDocSubscriber.tsx:64-67` (existing __system__ connection managed elsewhere). `CLAUDE.md` STOP rules section: *"Any new server-side subsystem that keys off `documentName` MUST call `isSystemDoc()` at its entry point."*

**Status:** INCOHERENT
**Suggested resolution:** Move the filter to `DocumentContext.openDocument` and/or `ProviderPool.open` — reject `__system__` at the admission boundary, not just at render. Matches the CLAUDE.md "entry point" precedent from the CC1 broadcast section. The render filter is the belt-and-suspenders; the admission check is the primary defense. Update DX7 to specify this. Also ensure `docNameFromHash` or the hash-route layer rejects `__system__`.

---

### [M] Finding 8: F1 state-preservation claim is scoped to "within pool" but §5 and F1 imply universal

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §5 Journey P1 warm switch (line 82), §6 F1 (line 140), §10 D1 Implications (line 346)
**Issue:** F1 ("Warm-path navigation preserves content atomically ... A's scroll position, cursor location, and undo history are preserved") is only true when doc A remains in the `ProviderPool` (`MAX_POOL=10`). If the user navigates through 11+ docs, the earliest doc is LRU-evicted. When they return to A, it will be a cold-load (re-sync, fresh editor, no scroll/cursor/undo preservation). The spec never states this boundary condition explicitly. §5 says "Switching between any pair of pooled docs is a click-with-no-wait" — which is correct but quietly fails when the pair isn't co-resident.

**Current text (F1, line 140):**
> "After opening doc A, then doc B, then A again — A's scroll position, cursor location, and undo history are preserved."

**Evidence:** `packages/app/src/editor/provider-pool.ts:242-251`: `evictLru()` removes the LRU non-active entry when `entries.size >= maxSize`.

**Status:** INCOHERENT (conditional claim stated unconditionally)
**Suggested resolution:** Add explicit wording: "for any doc A that remains in the ProviderPool (bounded by MAX_POOL=10)." Add a corresponding user-journey element for the ">10 docs" case — state preservation degrades gracefully to cold-load behavior when the pool evicts. This is not a design flaw; it's an unstated assumption. Also consider an acceptance criterion: Playwright test that opening 11 distinct docs evicts the first one and its state is NOT preserved on return (cold-load fallback works correctly).

---

## Low Severity

### [L] Finding 9: `prior-session-trace.md` still has internal stale refs that could confuse future readers

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** `evidence/prior-session-trace.md` (whole file)
**Issue:** The staleness banner warns readers to trust worldmodel-findings.md. But the file body still contains several concrete file:line refs that conflict with current HEAD (e.g., `EditorArea.tsx:94-100` for "Select a document" guard vs actual `:116-122`; `DocumentContext.tsx:47-96` for openDocument vs actual `:112-116`). The spec itself doesn't cite these stale refs, but if a future agent loads this file without the banner, they'll be misled. The banner mitigates but does not eliminate the risk.

**Current text (prior-session-trace.md top banner):**
> "File:line references here are off-by-~20 lines vs current HEAD."

**Status:** STALE (acknowledged; not load-bearing in SPEC.md)
**Suggested resolution:** Optional: delete the stale file:line refs and replace with "see worldmodel-findings.md" pointers in-line, OR leave as-is since SPEC.md doesn't reference them. The banner is sufficient for well-informed readers.

---

### [L] Finding 10: Spec cites `packages/app/src/presence/use-sync-status.ts:1-61` but file is 60 lines

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 line 200
**Issue:** Off-by-one — file is 60 lines; range `:1-61` extends one line beyond file end.

**Evidence:** `wc -l packages/app/src/presence/use-sync-status.ts` → `60`

**Status:** STALE
**Suggested resolution:** Change to `:1-60` or just drop the range ("see `use-sync-status.ts`").

---

### [L] Finding 11: Architectural precedent #14 claimed in F14, but CLAUDE.md precedent list ends at #13

**Category:** COHERENCE
**Source:** L1 (cross-finding)
**Location:** §6 F14 (line 153), §13 Modified files (line 449), §16 SCOPE (line 556)
**Issue:** F14 and the deliverables claim "add a new Architectural precedent #14" to CLAUDE.md. Currently CLAUDE.md has precedents #1-#13. This is correct in sequence, BUT there was a *different* architectural precedent named "precedent #14 (server-authoritative observer bridge)" in commit `9ce56ee` — suggesting #14 may have been used previously. Verify the precedent numbering hasn't already been claimed or that this spec's "precedent #14" is actually a DIFFERENT addition that would shift numbering.

**Current text (F14):**
> "CLAUDE.md contains a new Architectural precedent #14 describing hybrid Activity+Suspense for subscription-source async primitives."

**Evidence:**
- `grep -n "precedent #" CLAUDE.md` shows precedents #1-#13 currently.
- Commit `9ce56ee`: "Server-authoritative observer bridge (precedent #14)" — merged 4 commits before HEAD. But current CLAUDE.md does not contain precedent #14 (the commit message may have been aspirational or precedent #14 was subsequently renumbered/removed).

**Status:** UNVERIFIABLE (numbering may just be "next available" which is currently #14 — but the claim should be verified at implementation time, not just assumed).
**Suggested resolution:** In §6 F14 and §13, change "#14" to "the next available precedent number" OR verify at spec-finalization what number CLAUDE.md actually has. Low severity because implementation trivially resolves this.

---

### [L] Finding 12: §9 "ProviderPool lifecycle event — new event or extend onChange" is an unmade design decision

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis)
**Location:** §9 Enforcement points (line 292), §13 Modified files (line 444)
**Issue:** The spec says:
> "Cache invalidation tied to provider-pool lifecycle (`provider-pool.ts` emits a new `'providerLifecycle'` event or we extend the `onChange` notification so `sync-promise.ts` can listen)."

This is an unresolved design fork, deferred to implementation. All other decisions are LOCKED; this one is ambiguous. In §13 Modified files it's described as: "emit lifecycle events that `sync-promise.ts` listens to (or extend `onChange` notification payload)." No acceptance criterion pins the choice. Might fail the resolution completeness gate if a reviewer interprets "decisions made" strictly.

**Current text (§9, line 292):**
> "Cache invalidation tied to provider-pool lifecycle (`provider-pool.ts` emits a new `'providerLifecycle'` event or we extend the `onChange` notification so `sync-promise.ts` can listen)."

**Status:** INCOHERENT (design fork without resolution)
**Suggested resolution:** Either (a) promote to a DX-decision with a locked choice + rationale (e.g., "DX9: extend `onChange` signature to carry `{ change: 'open' | 'close' | 'recycle' | 'sync', docName }` — simpler than a new event type; keeps ProviderPool's single-callback surface"), or (b) explicitly mark as DELEGATED-to-implementation with a test-constraint acceptance criterion. Current phrasing reads like an unmade decision.

---

### [L] Finding 13: §8 three-source-truth observation conflicts with STOP_IF rule that forbids narrowing

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §8 Known gaps (line 214), §16 STOP_IF (line 572)
**Issue:** §8 line 214 says "adding `syncPromise` makes three" sync-state-truth sources and unification is deferred. §16 STOP_IF says: *"`syncState` enum in `DocumentContext` is widened or narrowed (three-source-truth is accepted as-is; unification is Future Work)."* These are compatible on their face. But the phrasing creates a subtle trap: a well-intentioned implementer might add `'pending'` to syncState to model the new Suspense-pending state, which would widen the enum and trip STOP_IF. The new primitive (`syncPromise`) should be cleanly distinct from `syncState`, but the spec doesn't explicitly state "do NOT widen syncState to cover the new pending semantics."

**Current text (§16 STOP_IF):**
> "`syncState` enum in `DocumentContext` is widened or narrowed (three-source-truth is accepted as-is; unification is Future Work)."

**Status:** INCOHERENT (compatible but trap-prone)
**Suggested resolution:** Add one sentence to §9 or §16 clarifying: "The new primitive's pending semantics live entirely in `syncPromise` + Suspense + `isPending` — NOT as a new `syncState` enum value. Do not touch `syncState`."

---

### [L] Finding 14: R6 risk rating likely understates pool thrashing on rapid nav through >10 docs

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis)
**Location:** §14 R6 (line 494)
**Issue:** R6 rates rapid-sequential-nav pool thrashing as Low/Low. But: if the user clicks 15 distinct docs rapidly and the pool is bounded at 10, LRU eviction fires 5 times, each destroying a Y.Doc + WebSocket + observer bridge (`destroyEntry` at `provider-pool.ts:253-267`). Each eviction also cancels pending sync promises (F15). During React transitions, this churn is concurrent with Activity mount/unmount. Plausibly Medium/Low rather than Low/Low.

**Current text (R6):**
> "R6 | Rapid sequential navigation triggers pool thrashing (provider creation + eviction within same transition) | Low | Low | React transition semantics coalesce. Pool LRU tolerates churn. F11 verifies."

**Status:** INCOHERENT (risk-rating optimistic given mechanics)
**Suggested resolution:** Upgrade R6 likelihood to Medium (given real users CAN click 15 files fast) and add a failure mode to §9 failure-modes table: "Rapid-nav + pool-full: each subsequent nav evicts LRU, cancelling its syncPromise. F11's 5-click test should be extended to test MAX_POOL+5 = 15 clicks to exercise full LRU eviction cycling."

---

## Confirmed Claims (summary)

### Factual claims verified against current HEAD (`572a08b`):

- `EditorArea.tsx:172` composite key `${activeDocName}-${String(isNewDoc)}` — ✓ exact match.
- `EditorArea.tsx:139-146` diff preview `previewLoading` spinner — ✓ block matches (`:139-147` in the exact sense).
- `EditorArea.tsx:19-30` `EditorSkeleton` definition — ✓ exact match.
- `EditorArea.tsx:159-161` `syncState === 'connecting' ? <EditorSkeleton /> : <editors>` ternary — ✓ exact match.
- `EditorArea.tsx:116-122` "Select a document" guard — ✓ exact match.
- `provider-pool.ts:86-186` `open()` method — ✓ matches (ends at line 186).
- `provider-pool.ts:242-251` `evictLru()` — ✓ exact match.
- `provider-pool.ts:136-154` observer wiring in `onSynced` — ✓ exact match.
- `DocumentContext.tsx:112-116` `openDocument` — ✓ exact match.
- `main.tsx:10-14` `QueryClient` with `retry: 1, staleTime: 10_000` — ✓ exact match.
- `PresenceBar.tsx:126-130` `SYNC_CONFIG` — ✓ exact match.
- TipTap `^3.22.3` in `packages/app/package.json` — ✓ confirmed.
- React `^19.2.5` in `packages/app/package.json` — ✓ confirmed.
- `HocuspocusProvider.ts:127` `forceSyncInterval: false` default — ✓ confirmed.
- `standalone.ts:190-195` no `forceSyncInterval` on server — ✓ confirmed.
- `RECYCLE_DEBOUNCE_MS = 4000` at `provider-pool.ts:44` — ✓ exact match.
- `packages/server/src/cc1-broadcast.ts` exports `isSystemDoc` — ✓ confirmed.
- Zero `Suspense`/`useTransition`/`startTransition`/`ErrorBoundary` in `packages/app/src` — ✓ confirmed (modulo Finding 3's FileTree.tsx exception claim, which is wrong).

### External / web-verified claims:

- `tiptap#5761` closed 2025-04-18 by @janthurau with the exact quote cited in D1 — ✓ confirmed via `gh issue view 5761 --repo ueberdosis/tiptap`.
- `react-error-boundary@^6.0.0` exists on npm and matches `~/agents/agents-manage-ui` version — ✓ confirmed.
- React 19.2 `Activity` API is stable (released 2025-10-01) — ✓ confirmed via React 19.2 release notes.
- `useSuspenseQuery` NOT used in `packages/app` or `~/agents` — ✓ confirmed.

### Structural / coherence:

- All P0 open questions (Q1-Q33) have resolutions with cross-refs — ✓ coherent.
- Decisions D1-D8 + DX1-DX8 all have Resolution: LOCKED (DX8 is DIRECTED) — ✓ coherent.
- Assumptions A1-A10 each have confidence + verification plan — ✓ coherent.
- All 6 goals (G1-G6) trace to requirements (F1-F16) — ✓ coherent.
- Non-goals NG1-NG8 all have temporal tags and rationale — ✓ coherent.
- Agent constraints (§16) SCOPE maps cleanly to §13 Deliverables — ✓ coherent.

---

## Unverifiable Claims

- **A6 ("30s is sufficient for normal-network sync")**: verification plan says "monitor in prod" — cannot be falsified pre-implementation without telemetry (which is itself out of scope per NG8). Accepted as-is.
- **DX8 memory ceiling (~300 MB)**: "10-30 MB per editor" is an order-of-magnitude estimate; no measurement cited. Validated only qualitatively. Reasonable given typical TipTap/ProseMirror/CodeMirror state sizes but unverified.
- **R8 "React 19.2 Activity + ProseMirror/CodeMirror undocumented gotchas"**: definitionally unverifiable until implementation exercises them. F16 is the planned validation. Accepted.
- **"Activity + StrictMode + Suspense composes cleanly" (A7)**: Medium confidence with "verify in /implement" as the plan. Unverifiable statically.

---

## Audit summary

**Strengths.** The spec is unusually thorough for its stage: 33 open questions all resolved, 16 decisions all locked, explicit P1-P4 personas with failure paths, Playwright-assertable acceptance criteria for all functional requirements, and a clear "hybrid architecture" rationale grounded in verified TipTap maintainer position. Cross-references between §10 decisions and §11 question resolutions are consistent. Evidence files (worldmodel-findings.md in particular) are rigorous.

**Risks to address before implementation.**
1. **Finding 1 (H)** — the 7.4s citation is materially misrepresented as WebSocket sync latency when it's actually bridge-propagation latency. D7's 30s timeout may still be correct, but the rationale needs repair.
2. **Finding 2 (H)** — §9 code snippet would regress the dual-editor CSS-hidden mount pattern. Either fix the snippet or explicitly accept the regression.
3. **Finding 3 (H)** — the FileTree.tsx startTransition exception clause is factually wrong and should be removed.

**Lower-priority polish.** Findings 4-14 affect precision and robustness but don't block spec completion. Findings 7 (__system__ defense layer) and 8 (F1 within-pool scoping) are the most substantive of the Medium tier and worth resolving before implementation to avoid re-opening the spec mid-ship.
