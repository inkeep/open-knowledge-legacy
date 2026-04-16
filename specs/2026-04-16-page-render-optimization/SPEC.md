# Page Render Optimization — Document-Open UX / CRDT Sync Loading States

**Status:** In Review (pending audit)
**Owner(s):** Nick Gomez (DRI)
**Last updated:** 2026-04-16
**Baseline commit:** 06da1ff (will be overwritten at finalization)
**Links:**
- Evidence: `./evidence/` (worldmodel-findings.md is authoritative for current state)
- Meta: `./meta/_changelog.md`

---

## 1) Problem statement

**Situation.** Open Knowledge users (primarily solo developers and team members working on a local-first, CRDT-backed markdown wiki) navigate between documents by clicking files in the sidebar. Each click opens a `HocuspocusProvider` for the target docName, which streams initial content over WebSocket and binds a TipTap (WYSIWYG) or CodeMirror (source) editor to the resulting Y.Doc. The editor is the central product surface: users spend most of their session reading and editing documents routed through this path.

**Complication.** The current implementation has three co-occurring failures on every document open:

1. **Flash.** TipTap mounts via `key={activeDocName}-${isNewDoc}` (`EditorArea.tsx:172`), so every navigation unmounts the entire editor DOM subtree and remounts it synchronously — before the new provider has any content. Users see a brief white flash on every click.
2. **Silent blank gap.** The new editor mounts against an empty Y.Doc while WebSocket initial sync is in flight (500ms at ~2KL, up to 7.4s at ~10KL per `reports/crdt-observer-bridge-latency-analysis/REPORT.md`; longer in known Hocuspocus edge cases). An `EditorSkeleton` is rendered conditionally on `syncState === 'connecting'` (`EditorArea.tsx:19-30, 159-161`), but it does not preserve previous content during nav — it flashes in during the sync gap, itself a form of flicker.
3. **Silent error.** When sync fails (doc doesn't exist on disk, sustained pre-sync disconnect, upstream `hocuspocus#183` reconnect bug, `y-websocket#81` initial-content-never-arrives bug), the user sees an empty editor forever with no error surface and no retry affordance.

First-ever visits to a document and repeat visits are treated identically, even though the `ProviderPool` LRU-caches providers (and their Y.Docs) and could support instant warm switches.

**Resolution.** Replace the imperative render-immediately-and-let-it-populate flow with React 19's declarative-async primitives, composed as a **hybrid architecture**:

- **Warm path:** For each doc in `ProviderPool`, render one editor instance wrapped in `<Activity mode="visible|hidden">`. Navigation between pooled docs = visibility swap, preserving scroll/focus/editor state (React 19.2 Activity semantics).
- **Cold path:** First-visit to an unpooled doc goes through `<Suspense>` gated on `use(pool.syncPromise(docName))` with an `EditorSkeleton` fallback.
- **Transition:** `openDocument(docName)` wrapped in `startTransition` — React keeps the previous doc's rendered output visible while the next entry's promise is pending.
- **Error:** `react-error-boundary@^6.0.0` wraps the Suspense boundary, giving sync failures a recoverable "try again" UX.
- **Progress:** A `NavigationPendingBar` shows an escalating indicator (subtle → visible → "taking longer than usual" → "Try again?") tied to `isPending`, timing out at 30s.
- **Defense-in-depth:** Client-side `forceSyncInterval: 200` on `HocuspocusProvider` mitigates the documented `synced`-never-fires edge cases.

Net experience: click → old content stays on screen → new content appears in one atomic swap when ready → sync failures are visible and recoverable.

---

## 2) Goals

- **G1 — Kill the white flash.** Document navigation shows no unstyled intermediate DOM state.
- **G2 — Content continuity during pending.** Users see the previous document's content while the next one is syncing; blank editor only on genuine cold load.
- **G3 — Explicit loading feedback.** Pending navigations show a visible affordance (progress strip or skeleton) so the user knows something is happening.
- **G4 — Recoverable errors.** Sync failures render a retry UX, not a blank page. Users can distinguish "doc doesn't exist" from "sync in progress" from "network dropped."
- **G5 — State preservation across nav.** Navigating away from and back to a warm doc preserves scroll position, cursor selection, and TipTap undo history (unique to the hybrid Activity-based design).
- **G6 — Architectural precedent.** The pattern (Activity + Suspense + `use(syncPromise)` + ErrorBoundary + isPending progress) is reusable by future async surfaces (graph panel, AI suggestions, MCP agent status) and follows React 19 canonical composition.

---

## 3) Non-goals

- **[NEVER] NG1: Server-side rendering of initial doc content.** Fundamentally misaligned — Open Knowledge is a Vite SPA with CRDT-streamed content. Changing the SSR story is a different product.
- **[NEVER] NG2: TipTap editor-instance reuse across docs (hot-swap `ydoc` on a single editor).** Ruled out by `ueberdosis/tiptap#5761` — maintainer @janthurau closed 2025-04-18: *"Please re-create the editor and the provider (and the ydoc, if you pass it separately) if you want to switch to a new document, hot-changing the provider is not supported and will lead to issues."* The Activity-based hybrid (D1) satisfies this by having distinct (editor, provider, ydoc) triples per Activity instance.
- **[NOT NOW] NG3: Lazy-splitting editor code via `React.lazy`.** Orthogonal concern (bundle size, not load latency). Revisit if editor bundle exceeds 500kb or cold-load dominated by parse time.
- **[NOT NOW] NG4: Routing refactor (hash → real router).** Hash routing is load-bearing today; changing it is a separate 1-way-door decision. Revisit if URL-level requirements expand (permalinks, line anchors).
- **[NOT NOW] NG5: Diff preview / version-history loading (`EditorArea.tsx:139-146`).** Shares loading-state family but has structurally different data flow (git-blob fetch vs CRDT sync). Premature abstraction. Captured in Future Work → Identified tier.
- **[NOT UNLESS] NG6: Mobile / touch-specific loading UX.** No mobile code surface exists today. Only revisit if a mobile client is added.
- **[NOT NOW] NG7: IndexedDB offline-first persistence (Outline-style cached snapshot during sync).** Would add a genuine improvement (cold-load content continuity), but introduces a separate large architecture (offline-first, conflict resolution on reconnect, Y.Doc serialization). Hybrid architecture in this spec achieves the primary UX goals without it. Revisit if we need true offline-first.
- **[NOT NOW] NG8: Production telemetry aggregation for loading-state metrics.** Dev-mode console logs + browser-console warns are shipped; aggregated prod metrics would require new infra (no existing OTel/prometheus/Sentry pipeline in `packages/app`). Captured in Future Work → Identified.

---

## 4) Personas / consumers

- **P1 — Solo developer (local-first laptop).** WebSocket → localhost Hocuspocus. Sync gap shortest here (<100ms typical) but flash and cold-load skeleton still visible on every click. Dominant usage pattern. **Primary persona.**
- **P2 — Team member on shared collaboration workspace.** WebSocket over internet to shared Hocuspocus. Higher network variance; more likely to hit `hocuspocus#183` / `y-websocket#81` edge cases. **Primary persona.**
- **P3 — Agent-driven navigation (human in the loop).** `SystemDocSubscriber` + `AgentFocusBroadcaster` + `DocumentContext.pinnedDoc` exist precisely because agents can change `activeDocName`. Agent-triggered nav hits the same flash/sync-gap as user nav. `pinnedDoc` suppresses agent nav for the user-holds-focus case. **Primary persona.** Acceptance criterion: agent-triggered nav gets the same loading UX.
- **P4 — Developer resumed from sleep / idle.** `PageListContext.tsx:98-104` handles `visibilityState`. Post-wake reconnect during the active doc must show appropriate loading/error state without flash. **Primary persona.**

**Explicitly NOT a persona:**
- AI agent via MCP (direct UI consumer) — agents write via REST endpoints, not the React editor. Orthogonal concern. P3 covers the human-seeing-agent-nav case.
- Mobile user — no mobile code surface exists.

---

## 5) User journeys

### P1 — Solo developer, warm switch

1. **Discovery.** User has been editing two docs in this session; both are in `ProviderPool`.
2. **Setup.** N/A — app is already running.
3. **First use / aha moment.** User clicks a file in the sidebar. The sidebar row highlights; the editor **instantly swaps** to the new doc's content with its prior scroll position, cursor location, and undo history intact. No flash, no skeleton, no progress strip visible.
4. **Ongoing use.** Switching between any pair of pooled docs is a click-with-no-wait. Visible and reliable state preservation builds trust in the editor as a continuous workspace.
5. **Failure / debug.** N/A for warm switch.
6. **Growth.** User develops a pattern of alt-tabbing between docs as if they were browser tabs.

### P1 — Solo developer, cold switch (first visit this session)

1. User clicks a file that hasn't been opened this session (not in pool).
2. Sidebar row highlights immediately.
3. Editor pane: **previous doc's content stays visible**. Thin progress strip appears under the header. No flash.
4. ~50-200ms later (localhost), sync completes. Previous content is atomically replaced by the new doc's content with cursor at doc start.
5. Failure path: provider can't connect or sync fails → progress strip stays visible, escalates at 5s to a visible indicator, at 15s to "taking longer than usual," at 25s to "Try again?" prompt, at 30s → retry UI.

### P2 — Team member, variable network

1. User clicks a doc on a remote-Hocuspocus setup.
2. Sync latency is 500-2000ms (typical) over internet.
3. Previous content stays visible; progress strip shows `isPending` state.
4. 5s in: if not yet synced, strip escalates to visible loading indicator — communicates "still working" without hiding content.
5. Synced → atomic content swap.
6. Failure: mid-sync WebSocket drop → provider reconnects transparently if post-first-sync; if pre-first-sync, rejects → retry UI.

### P3 — Agent-driven nav (MCP agent focuses user on a doc)

1. Agent (e.g., via `AgentFocusBroadcaster`) changes `activeDocName` to a doc it wants the user to see.
2. If the user has pinned a different doc (`pinnedDoc`), the agent's nav is suppressed — current doc stays active; agent request is logged but not acted on.
3. Otherwise: navigation happens as if user-triggered. Same warm/cold path, same loading UX, same error handling.

### P4 — Laptop resumed from sleep

1. User wakes laptop; returns to OK in browser tab.
2. `document.visibilityState` fires; `PageListContext` refetches the file list.
3. Active doc's WebSocket may have disconnected. HocuspocusProvider handles reconnect transparently.
4. If the doc was synced before sleep: content stays rendered, `syncState` flaps `connecting → synced`, presence-bar sync dot shows the flap, editor content is never blank.
5. If the doc was mid-sync when sleep hit: on wake, sync resumes; progress strip shows `isPending` until resolved; same error-path applies.

### Failure / debug across all personas

- Error UI has: document name, error summary (one line), **"Try again"** primary button (clears syncPromise cache entry, re-attempts with a fresh provider lifecycle), **"Back to previous document"** secondary action.
- Clicking "Try again" stays in the same `<Activity>` slot — transition back to Suspense → fallback → new attempt.
- Recovery path confirmed by Playwright in `docs-open.e2e.ts`.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Editor area (warm nav) | — n/a | — n/a | (no-op — provider already synced) | Activity swap, state preserved | — n/a |
| Editor area (cold nav) | Previous doc stays visible; NavigationPendingBar visible; EditorSkeleton only if no prior doc | "Select a document" (unchanged) | DocumentErrorBoundary retry UI | Atomic swap to new doc | — n/a |
| NavigationPendingBar | Visible when `isPending === true`, 4-tier escalation (0-5-15-25-30s) | — n/a | Hidden when error UI shown | Hidden | — n/a |
| PresenceBar sync dot | Amber pulse during `connecting` | — n/a | Red solid | Green solid | Amber pulse during `connected`-but-not-synced |

---

## 6) Requirements

### Functional requirements

| # | Priority | Requirement | Acceptance criteria (Playwright-assertable unless otherwise noted) | Linked goal |
|---|---|---|---|---|
| F1 | Must | Warm-path navigation preserves content atomically | After opening doc A, then doc B, then A again — A's scroll position, cursor location, and undo history are preserved. Playwright: capture scroll/cursor state pre-nav, assert post-nav. | G1, G5 |
| F2 | Must | Cold-load: previous doc's content stays visible during pending | Playwright: navigate from doc A (synced) to doc B (not in pool); assert A's text is in the DOM for the entire transition duration until B mounts with content. | G2 |
| F3 | Must | NavigationPendingBar visible during `isPending` | Playwright: navigate; assert `[data-slot="navigation-pending-bar"]` has `aria-hidden="false"` while `isPending`. | G3 |
| F4 | Must | Cold-load skeleton only when no prior content | Playwright: first-ever page load (no prior doc), navigate → assert `EditorSkeleton` renders. Repeat visit (in pool) → assert `EditorSkeleton` does NOT render. | G3, G5 |
| F5 | Must | Sync failure shows recoverable error | Playwright: simulate 30s timeout via test hook; assert `DocumentErrorBoundary` fallback renders; click "Try again"; assert new sync attempt. | G4 |
| F6 | Must | Error UX lets user return to previous doc | Playwright: trigger error; click "Back to previous document"; assert nav to last-synced doc succeeds. | G4 |
| F7 | Must | Agent-driven nav (P3) uses same loading UX | Playwright (or unit test on `openDocument`): trigger nav via `AgentFocusBroadcaster` pathway; assert same pending + content-continuity behavior. `pinnedDoc` path: agent request logged but no nav. | G2, G3 |
| F8 | Must | Post-wake reconnect (P4) preserves content on the active doc | Unit test + Playwright: simulate `visibilityState: 'hidden' → 'visible'` with WebSocket drop; assert editor content stays rendered throughout. | G2 |
| F9 | Must | Escalating progress indicator — 4 tiers | Unit test on `NavigationPendingBar`: at t=0s strip hidden; 0-5s subtle strip visible; 5-15s visible indicator; 15-25s "taking longer" text; 25-30s "Try again?" prompt; 30s timeout → error boundary. | G3, G4 |
| F10 | Must | Source editor (CodeMirror) path follows same architecture | Same acceptance criteria as F1-F4 applied to `isSourceMode === true`. | G1, G5, G6 |
| F11 | Must | Rapid sequential navigation is correct | Playwright: click 5 files rapidly; assert final state matches last-clicked doc; no content corruption or lingering pending state. | G1, G2 |
| F12 | Must | `forceSyncInterval: 200` on client providers | Unit test on `provider-pool.ts`: new provider receives `forceSyncInterval: 200` option. | (D8) |
| F13 | Must | Accessibility — screen-reader announcement of loading state | Unit test + axe-core: editor container has `aria-busy` attribute flipping correctly; `NavigationPendingBar` has `role="status"` `aria-live="polite"`; error state has `role="alert"`. | G3, G4 |
| F14 | Should | Architectural pattern is documented as a CLAUDE.md precedent | CLAUDE.md contains a new Architectural precedent #14 describing hybrid Activity+Suspense for subscription-source async primitives. | G6 |
| F15 | Should | `syncPromise` cache invalidates on provider destroy/recycle | Unit test: destroy provider → subsequent `syncPromise(docName)` call returns a NEW promise. Same for 4s RECYCLE_DEBOUNCE path. | (D7) |
| F16 | Should | `<Activity>` state preservation works across StrictMode double-mount in dev | Manual: verify in dev mode with StrictMode that pooled docs retain state on mode flip. Unit test with StrictMode wrapper. | (A7) |

### Non-functional requirements

- **Performance:** Warm-nav perceived latency <100ms click-to-content-swap. Cold-nav pending-feedback visible within 100ms of click. 30s hard sync timeout.
- **Reliability:** Sync timeout rejection is recoverable (retry-able without page reload). Promise cache invalidates on provider destroy/recycle. `forceSyncInterval: 200` reduces timeout probability.
- **Security/privacy:** N/A — no new data surfaces, no new auth paths.
- **Operability:** Dev-mode bracket-prefix console logs (`[syncPromise]`, `[NavigationPendingBar]`, `[DocumentBoundary]`) per CLAUDE.md. Production: `console.warn` on timeout-reject in all environments so user reports can reference browser console. Aggregated telemetry deferred to NG8.
- **Memory:** Up to 10 TipTap + CodeMirror editor instances in memory (bounded by `MAX_POOL = 10`). Per-editor overhead ~10-30 MB (depends on doc size). Ceiling ~300 MB additional over baseline. Acceptable for desktop local-first target (P1/P2).
- **Cost:** New dep `react-error-boundary@^6.0.0` (~2kb gzipped). Net code addition ~600-900 LOC including tests.

---

## 7) Success metrics & instrumentation

| Metric | Baseline (measured/inferred) | Target | Instrumentation |
|---|---|---|---|
| Flash occurrence rate | 100% of navigations (current behavior — `key` forces remount before content) | 0% | Playwright snapshot diff: capture `<body>` class/style over the 50ms following click; assert no unstyled intermediate state |
| Warm-nav perceived latency (p95) | N/A (no warm path exists — all nav is cold) | <100ms click-to-new-content | Playwright `performance.mark` pair around click → content-visible |
| Cold-nav perceived latency (p95) | ~500ms localhost | <800ms localhost (allowing for Activity mount overhead) | Playwright timing test on fresh-pool scenario |
| Silent-failure rate | 100% of sync failures produce no UI | 0% — every sync failure produces visible error UI within 30s | Unit test: trigger timeout → error boundary renders. E2E: simulated WebSocket drop pre-sync |
| Content-continuity during pending | 0% (pending always shows skeleton or blank) | 100% when prior doc exists | Playwright: assert prior doc's text remains in DOM throughout transition |
| Scroll-position preservation across nav (P1 warm) | 0% (every nav resets to top due to remount) | 100% for pooled docs | Playwright: scroll doc A, nav to B, nav back to A, assert scroll position |

**What we log:**
- `[syncPromise] <docName> resolved in <Nms>` on success (dev + prod — prod gated on `DEBUG_SYNC_PROMISE` env).
- `[syncPromise] <docName> rejected: <reason>` on timeout/disconnect (dev + prod unconditional — user-actionable).
- `[NavigationPendingBar] <docName> escalated to tier <N>` at each tier boundary (dev only).
- `[DocumentErrorBoundary] rendered fallback for <docName>` when error UI shows (dev + prod).

---

## 8) Current state (how it works today)

**Authoritative source:** `evidence/worldmodel-findings.md` (supersedes file:line citations in `evidence/prior-session-trace.md`, which are from the predecessor session and partially stale).

### Navigation flow
- `FileTree.navigateTo` → `window.location.hash` → `App.tsx` hash listener → `openDocument(docName)` (synchronous; `DocumentContext.tsx:112-116`).
- `ProviderPool` (`provider-pool.ts:86-186`) creates/reuses HocuspocusProvider, sets `syncState: 'connecting'`; LRU-caches up to 10 providers; also schedules a 4s recycle on disconnect (`RECYCLE_DEBOUNCE_MS = 4000`) which this spec coordinates with.
- `EditorArea` re-renders with the new `activeProvider`. TipTap key is composite `${activeDocName}-${isNewDoc}` (`EditorArea.tsx:172`) — forces full remount on doc change AND on draft→saved transitions.
- New editor binds to empty Y.Doc; sync is in flight.
- `synced` event fires; `setupObservers` wires bridges (`provider-pool.ts:136-154`); content populates observably.

### Partial loading UI already exists (baseline is NOT zero)
- **`EditorSkeleton`** (`EditorArea.tsx:19-30`) is rendered conditionally at `EditorArea.tsx:159-161` when `syncState === 'connecting'`. This is a plain ternary, not Suspense — which is WHY content doesn't stay visible during nav (skeleton replaces old content when `syncState` flips, losing the prior doc's DOM).
- **Presence-bar sync dot** (`PresenceBar.tsx:126-130` + `use-sync-status.ts:1-61`) shows colored state.
- **Diff preview** has its own `previewLoading` spinner (`EditorArea.tsx:139-146`); unrelated data flow (git-blob fetch). NG5.

### Established async-loading pattern
- TanStack Query (`main.tsx:10-14`) powers 5 derived panels (BacklinksPanel, OutlinePanel, GraphPanel, ForwardLinksPanel, TimelinePanel) with `useQuery` + `isLoading` + `aria-busy` pattern.
- PageListContext (`PageListContext.tsx:41-83`) uses hand-rolled promise + `use()` on context for the one core-state async primitive in the app.

### Known gaps (this spec closes)
- EditorSkeleton is an ad-hoc conditional, not a Suspense fallback.
- No Suspense / useTransition / startTransition / ErrorBoundary anywhere (grep: 0 hits each — with the sole exception of FileTree.tsx's startTransition for tree-expansion state, unrelated to navigation).
- `syncState` is consumed by EditorSkeleton and PresenceBar but not by the editor-mount path.
- First-visit vs repeat-visit path is identical.
- Sync failures are silent.
- Server + client providers do not set `forceSyncInterval`.
- Two sync-state-truth sources (`PoolEntry.syncState` 3 states, `useSyncStatus` 4 states); adding `syncPromise` makes three (this spec accepts the count — unification is deferred to NG8 + Future Work Identified).

---

## 9) Proposed solution (vertical slice — hybrid architecture)

### User experience / surfaces

- **Editor area** — hybrid render tree:
  - For each doc currently in `ProviderPool`, render one editor instance wrapped in `<Activity mode={docName === activeDocName ? 'visible' : 'hidden'}>`. Navigation between pooled docs = visibility swap, preserving scroll/focus/TipTap editor state.
  - For the cold-load path (first-ever visit, or when the target doc isn't in pool), an outer `<ErrorBoundary><Suspense fallback={<EditorSkeleton />}><DocumentBoundary>…</DocumentBoundary></Suspense></ErrorBoundary>` gates the new Activity entry's mount on `use(pool.syncPromise(docName))`.
- **Navigation affordance** — `NavigationPendingBar`, escalating progress per D7:
  - 0–5s: 2px progress strip under `EditorHeader`, subtle (amber, low contrast).
  - 5–15s: visible indicator — 2px strip upgrades to a 3px striped animation, "Loading…" label appears.
  - 15–25s: full-width "Still loading. This is taking longer than usual." text below the header.
  - 25–30s: "Try again?" prompt with a button (immediately retry; doesn't wait for 30s).
  - 30s: `SyncTimeoutError` rejection → ErrorBoundary shows retry UI.
- **Error UX** — `DocumentErrorBoundary` `FallbackComponent`:
  - Document name.
  - One-line error summary (copy per error kind: "Sync timed out," "Connection dropped," "Document not found," "Unknown error").
  - "Try again" primary button (invalidates `syncPromise` cache entry for the docName → reset triggers new attempt).
  - "Back to previous document" secondary action (navigates to last-synced doc via hash change).
  - `resetKeys={[activeDocName]}` auto-resets when user navigates elsewhere.
- **Sidebar** — no changes; existing row-highlight on click provides immediate visual feedback.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `#/<docName>` — pooled (warm) | Editor pane | Activity mode flips instantly; scroll/focus/editor state preserved; no flash; no skeleton |
| `#/<docName>` — cold (not in pool) | Editor pane | Old content stays visible; skeleton shown only if no prior content (first page load); new editor mounts with content ready; atomic swap |
| `#/<docName>` — sync failure | Editor pane | Escalating progress → retry UI at 30s; manual "Try again?" available earlier |
| `#/<docName>` — on-wake reconnect (P4) | Editor pane | Content remains rendered throughout `connecting → synced` flap; progress strip appears only if sync exceeds 5s |
| `#/<docName>` — agent-driven nav (P3, when not `pinnedDoc`) | Editor pane | Same loading UX as user-triggered; `pinnedDoc` suppresses agent nav entirely |

### System design

- **syncPromise primitive** (`packages/app/src/editor/sync-promise.ts`): module-level `Map<docName, { promise, resolve, reject, createdAt, timeoutHandle }>`. Factory: `syncPromise(docName)` returns cached promise or creates one. Resolves when the matching `PoolEntry.hasSynced` first becomes true. Rejects on: (a) 30s timeout, (b) provider destroy, (c) 4s recycle before sync, (d) explicit `invalidate(docName)` call from retry. Promise identity is stable across renders (React Compiler-safe — module-level state is out of compiler scope).

- **DocumentBoundary** (`packages/app/src/components/DocumentBoundary.tsx`): reads `activeDocName` from DocumentContext; calls `use(pool.syncPromise(activeDocName))`. When the promise resolves, renders its children (the real editor wrapper). Used inside each Activity entry.

- **EditorActivityPool** (`packages/app/src/components/EditorActivityPool.tsx`): iterates `pool.entries` and renders an `<Activity>` per entry. React 19.2's Activity mounts/unmounts effects based on mode, preserving children's state in the hidden mode.

- **EditorArea** (modified): replaces the current `syncState === 'connecting' ? <EditorSkeleton /> : <editors>` ternary with:
  ```tsx
  <DocumentErrorBoundary resetKeys={[activeDocName]}>
    <Suspense fallback={<EditorSkeleton />}>
      <EditorActivityPool>
        {pool.entries.map(entry =>
          <Activity key={entry.docName} mode={entry.docName === activeDocName ? 'visible' : 'hidden'}>
            <DocumentBoundary docName={entry.docName}>
              {editorMode === 'source'
                ? <SourceEditor ytext={entry.ytext} provider={entry.provider} />
                : <TiptapEditor docName={entry.docName} provider={entry.provider} />}
            </DocumentBoundary>
          </Activity>
        )}
      </EditorActivityPool>
    </Suspense>
  </DocumentErrorBoundary>
  ```

- **Navigation transition** — `DocumentContext` exposes `openDocument` as wrapped in `startTransition` (new `openDocumentTransition` helper internally). The nav handler in `App.tsx` uses `useTransition()` to surface `isPending` for the progress strip.

- **NavigationPendingBar** (`packages/app/src/components/NavigationPendingBar.tsx`): local timer flips through tiers based on `(performance.now() - pendingStartedAt)`. Cleared when `isPending` becomes false. `role="status"` + `aria-live="polite"` so screen readers announce state changes.

- **EditorSkeleton** (refactor of existing): moved to `packages/app/src/components/EditorSkeleton.tsx`, becomes the Suspense fallback (not a ternary branch). Same visual design as current (shadcn Skeleton grid matching editor content). Current inline definition at `EditorArea.tsx:19-30` is removed.

- **DocumentErrorBoundary** (`packages/app/src/components/DocumentErrorBoundary.tsx`): wraps `<Suspense>` using `react-error-boundary`. `FallbackComponent` + `resetKeys` API. Distinguishes error kinds via `instanceof` checks (SyncTimeoutError, PreSyncDisconnectError, DocumentNotFoundError, unknown).

- **Data model:** No persistent changes. Module-level promise cache is ephemeral (per-session). No IndexedDB, no server state.

- **API/transport:** None added. Uses existing HocuspocusProvider `'synced'`, `'destroy'`, `'disconnect'` events. Client-side `forceSyncInterval: 200` added to `new HocuspocusProvider({...})` in `provider-pool.ts` (per D8).

- **Auth/permissions:** No change.

- **Enforcement points:**
  - Promise timeout (30s) enforced in `sync-promise.ts`.
  - Cache invalidation tied to provider-pool lifecycle (`provider-pool.ts` emits a new `'providerLifecycle'` event or we extend the `onChange` notification so `sync-promise.ts` can listen).
  - Activity mode driven by `activeDocName === entry.docName` check.

- **Observability:** Dev-mode bracket-prefix console logs per CLAUDE.md. Production: `console.warn` on `[syncPromise]` reject, `[DocumentErrorBoundary]` render. No structured telemetry (NG8).

#### Data flow

- **Warm path:** `navigateTo(docName)` → `hash` → `openDocument(docName, { transition: true })` → `pool.setActive(docName)` → `activeDocName` update → `<EditorActivityPool>` re-renders → OLD Activity flips to `hidden` (React preserves state), NEW flips to `visible` → no remount, no skeleton, instant visual swap → NavigationPendingBar stays idle.

- **Cold path:** `navigateTo(docName)` → `openDocument(docName, { transition: true })` → `pool.open(docName)` creates new PoolEntry + `syncPromise(docName)` called for the first time (creates cached promise) → new `<Activity mode="visible">` entry mounts → `DocumentBoundary` suspends on `use(syncPromise)` → Suspense catches; old Activity entry stays `visible` (transition semantics) → NavigationPendingBar starts timer → `synced` event → `syncPromise` resolves → new entry renders EditorInstance with populated Y.Doc → atomic swap, old Activity flips to `hidden`.

- **Shadow paths:**
  - **nil/missing `docName`:** DocumentContext shows "Select a document" empty state (existing at `EditorArea.tsx:116-122`).
  - **malformed hash:** Navigation no-op (existing).
  - **30s timeout:** `syncPromise` rejects → ErrorBoundary FallbackComponent.
  - **pre-sync disconnect:** `provider.onClose` fires before `hasSynced=true` → syncPromise rejects → ErrorBoundary.
  - **rapid sequential navigation:** Each `openDocument` interrupts prior transition. React transition semantics coalesce; each syncPromise independent. No content corruption (each Activity mounts its own state).
  - **reconnect post-sync:** `hasSynced` stays true; content is in Y.Doc. Transparent.
  - **on-wake from idle (P4):** `visibilityState` fires on PageListContext; provider may have disconnected. If `hasSynced` was true, content stays rendered. If pre-sync when sleep hit, ErrorBoundary catches.
  - **agent-driven nav (P3):** Same Activity-swap; `pinnedDoc` short-circuits.
  - **`__system__` pseudo-doc:** Excluded from `EditorActivityPool` iteration (pre-materialized at startup, never user-visible).

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User impact |
|---|---|---|---|---|
| syncPromise | 30s without `synced` event | `setTimeout(30_000)` in promise body | Rejects `SyncTimeoutError` | ErrorBoundary shows retry |
| Provider | Pre-sync disconnect | `provider.onClose` fires with `!entry.hasSynced` | Rejects `PreSyncDisconnectError` | ErrorBoundary shows retry |
| Provider | Post-sync disconnect + reconnect | `onDisconnect` fires; `RECYCLE_DEBOUNCE_MS=4000` timer schedules recycle | Reconnect before 4s → resume. Recycle → destroy+recreate; syncPromise cache invalidated for that docName | Transparent for warm reconnect. Recycled providers re-enter sync cycle |
| Provider | Sync-never-fires edge (y-websocket#81, hocuspocus#183) | 30s timeout (D7) + `forceSyncInterval: 200` client-side (D8) | Timeout → retry UI; forceSync periodically ensures `synced` fires | Rare; escalating progress tiers give feedback |
| ErrorBoundary | Retry click | User action | Invalidate syncPromise cache entry; re-enter Suspense; new promise created | Fresh sync attempt |
| Activity | mode flip | Context change | React preserves hidden editor state | Scroll/focus preserved (warm nav) |
| ProviderPool | LRU eviction of visible doc | Shouldn't happen — active doc is never evicted (`provider-pool.ts:242-251`) | Invariant; verified by test | N/A |
| ProviderPool | Eviction of a hidden (pooled) Activity entry | `pool.close()` destroys provider → `EditorActivityPool`'s derived list recomputes, dropping the entry → Activity unmounts | Automatic via pool-change subscription | User doesn't notice |
| StrictMode | Double-mount in dev | React dev-mode double-effect | syncPromise cache is idempotent (Map.has check); ProviderPool is idempotent (entries.has check) | Safe |
| React Compiler | Attempts to memoize module-level state | Compiler scope is component-local only | N/A — module state out of scope | Safe |

### Alternatives considered

See §10 Decision Log D1 and D2 for the alternatives-considered with rationale for each rejection. Summary:

- **Pure Suspense-gated remount:** always-remount loses state preservation UX.
- **Pure Activity (no Suspense for cold):** cold path would show a bare empty editor (no skeleton) — worse UX without IndexedDB.
- **Hybrid (chosen):** Activity for warm + Suspense-gate for cold. Best UX with bounded memory.
- **Fork TipTap for dynamic ydoc:** high maintenance cost, maintainer-rejected.
- **Outline's dual-render:** requires IndexedDB we don't have.
- **`useSuspenseQuery`:** semantic mismatch per TkDodo's positioning of `use()` vs TanStack Query.

---

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale (condensed; full in cited evidence) | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | **Hybrid: `<Activity mode>` for `ProviderPool`-resident docs; Suspense-gated remount for first-visit (cold load) before the doc enters the pool.** | T | LOCKED | Yes (precedent-setting) | TipTap hot-swap confirmed unsupported per maintainer @janthurau closing `ueberdosis/tiptap#5761` (2025-04-18). Hybrid satisfies the "re-create per doc" constraint (each Activity has own editor+provider+ydoc) while preserving scroll/focus/state across warm nav (React 19.2 Activity semantics). Cold-load still uses Suspense+use() — idiomatic React 19. Memory cost (10× editors) acceptable for desktop local-first P1/P2. | `evidence/worldmodel-findings.md#d-9`, gh-verified tiptap#5761 closing comment, [React 19.2 Activity docs](https://react.dev/reference/react/Activity) | A3 scoped to cold-load only. Scroll/focus/undo preserved across nav (G5). |
| D2 | **Hand-rolled `pool.syncPromise(docName)` + `use(promise)` via module-level Map cache + `<DocumentBoundary>`.** | T | LOCKED | No (reversible) | Semantic-fit argument (TkDodo, [React 19 and Suspense](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts)): `use()` is "the right tool for one-time data reads at render time"; TanStack Query is for "complex cache management, invalidation policies, retries, pagination, mutations." editor-sync is subscribe-once-to-event — none of Query's features apply. `useSuspenseQuery` here would require disabling its value proposition. Precedent: establishes `use(promise)` for subscription-source primitives, sets clean pattern for future async surfaces. | TkDodo blog; [React `use()` docs](https://react.dev/reference/react/use); PageListContext precedent (context only, non-decisive). | New `sync-promise.ts` (module cache + lifecycle), `DocumentBoundary.tsx` (uses `use()`). Module-level cache is React Compiler-safe. |
| D3 | **Wrap `openDocument` in `startTransition`.** | T | LOCKED | No | React docs ("[useTransition](https://react.dev/reference/react/useTransition)"): "During a Transition, React will avoid hiding already revealed content" — exactly the content-continuity property we need. Combined with Activity+Suspense, delivers G2. | React docs on useTransition + startTransition | `DocumentContext.openDocumentTransition` helper; `useTransition()` at nav handler for `isPending` surface. |
| D4 | **Use `react-error-boundary@^6.0.0`.** | T | LOCKED | No (can swap to custom class later; same surface) | Canonical 2026 React 19 Suspense + Error pairing per multiple sources. `resetKeys` + `FallbackComponent` + `onReset` provide clean retry UX. Version `^6.0.0` matches sister-project `~/agents/agents-manage-ui` — no divergence cost, no downgrade risk. | [freeCodeCamp: React 19 Suspense + use() + ErrorBoundary handbook](https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/); `evidence/worldmodel-findings.md#d-5a` (non-decisive consistency) | New dep; `DocumentErrorBoundary.tsx`. |
| D5 | **`EditorSkeleton` fallback — cold-load only.** Refactor existing inline definition at `EditorArea.tsx:19-30` to a standalone component used as the `<Suspense fallback>`. | P+T | LOCKED | No | React docs: unexpected fallback flash makes an app feel slower. With Activity in the hybrid, warm nav never shows the skeleton; only cold load (no prior content to preserve) does. The existing ternary at `EditorArea.tsx:159-161` is REMOVED — its job is now done by Suspense fallback. | React Suspense docs on fallback timing; evidence file. | Extract `EditorSkeleton.tsx`; delete the ternary; visual fidelity unchanged. |
| D6 | **`NavigationPendingBar` — thin progress strip under `EditorHeader`.** | P | LOCKED | No (aesthetic choice, revisable) | GitHub/Linear/Vercel convention: 2-3px strip under top nav during page transitions is unambiguous, unobtrusive, doesn't obscure content. Header is the natural spatial home (directly above the editor area it describes). `role="status"` + `aria-live="polite"` for a11y. | Vercel [`react-transition-progress`](https://github.com/vercel/react-transition-progress) prior art; GitHub + Linear nav patterns. | New `NavigationPendingBar.tsx`; consumed by App.tsx where `useTransition()` lives. |
| D7 | **30s hard timeout + 4-tier escalating progress indicator.** Tiers: 0-5s subtle; 5-15s visible; 15-25s "taking longer"; 25-30s "Try again?" prompt; 30s reject → ErrorBoundary. | T | LOCKED | No (budgets tunable) | Hocuspocus edge cases (`yjs/y-websocket#81`, `hocuspocus#183`) + measured 7.4s at 10KL (from `reports/crdt-observer-bridge-latency-analysis/REPORT.md`). 10s false-fires on large docs; no-timeout silently hangs; doc-size-aware is premature. Escalation matches "loading UX that communicates persistence." Coordinates with existing `RECYCLE_DEBOUNCE_MS = 4000` — recycle fires first in disconnect path; syncPromise invalidates cleanly on recycle. | `evidence/worldmodel-findings.md#timeout-budget-collision-with-sync-latency-data`; GitHub/Vercel convention. | Three visual tiers in `NavigationPendingBar`; ErrorBoundary retry resets transition. |
| D8 | **Client-side `forceSyncInterval: 200` on `HocuspocusProvider`** (in `provider-pool.ts`), not server-side. | T | LOCKED | No | Verified OK sets it nowhere today (`standalone.ts:190-195`, `provider-pool.ts:86-103`). Community consensus from `hocuspocus#525` recommends 200ms. Client-side chosen over server-side because: (1) no server-side restart needed; (2) client-provider creation is already the lifecycle boundary the sync-promise coordinates with; (3) per-provider config (not global) gives finer control — can disable for specific doc types later if needed. | hocuspocus#525; HocuspocusProvider source verification. | One-line addition to the provider-creation call site; unit test on `provider-pool.ts` verifies. |
| DX1 | **CodeMirror `SourceEditor` gets the same hybrid treatment.** | T | LOCKED | No | Same architectural family; greenfield "fix precedents" directive. Each Activity entry renders either TipTap or SourceEditor based on `editorMode`, but both are inside the DocumentBoundary Suspense boundary. | `evidence/worldmodel-findings.md#surfaces`; user-confirmed scope (Step 1). | `SourceEditor.tsx` unchanged internally (already binds to ytext via effect); wrapped by DocumentBoundary. |
| DX2 | **Diff preview / version-history loading — OUT of scope.** Captured in Future Work Identified. | P+T | LOCKED | No | Different data-flow (git-blob fetch vs CRDT sync). Forcing abstraction premature. | User-confirmed scope (Step 1). | `EditorArea.tsx:139-146` stays as-is. |
| DX3 | **`DocumentErrorBoundary` retry uses manual-only recovery, not auto-retry.** | P | LOCKED | No | Auto-retry-with-backoff adds complexity (timer, jitter, retry cap) without user-facing benefit — the user CAN click "Try again." Manual retry is the 2026 canonical pattern (`react-error-boundary` FallbackComponent API is explicitly designed for this). Escalating progress indicator (D7) already signals persistence within the 30s window. | `react-error-boundary` docs; evidence on escalation patterns. | Simpler error-recovery logic; no retry-budget state. |
| DX4 | **`resetKeys={[activeDocName]}` on DocumentErrorBoundary.** | T | LOCKED | No | Navigating away from a failed doc should clear the error state without forcing "Try again" — `resetKeys` is `react-error-boundary`'s designed API for this. | `react-error-boundary` resetKeys docs. | No additional code — just prop wiring. |
| DX5 | **Accessibility: `aria-busy`, `role="status"` + `aria-live="polite"`, `role="alert"` for error state.** | P | LOCKED | No | WAI-ARIA pattern for progressive loading + error surfaces. Screen readers announce state changes without forcing focus jumps. | ARIA Authoring Practices; existing `BacklinksPanel.tsx:59-63` precedent in the app. | Attributes on EditorActivityPool wrapper, NavigationPendingBar, DocumentErrorBoundary Fallback. |
| DX6 | **Instrumentation: dev-mode bracket-prefix console logs + prod console.warn on rejects/errors. No aggregated telemetry.** | T+P | LOCKED | No | Consistent with CLAUDE.md logging conventions. Aggregated telemetry would require new infra (no OTel/Sentry/Prometheus in `packages/app` today) — captured in NG8 + Future Work Identified. Prod `console.warn` makes failures diagnosable via user-reported browser console output. | CLAUDE.md logging conventions; NG8. | `console.log/warn` calls throughout `sync-promise.ts`, `NavigationPendingBar.tsx`, `DocumentErrorBoundary.tsx`. |
| DX7 | **`__system__` pseudo-doc excluded from `EditorActivityPool`.** Pre-materialized at startup, never user-visible. | T | LOCKED | No | Per CLAUDE.md CC1 section: `__system__` is a pure-signal push transport, not content. Rendering an editor for it is wrong. `EditorActivityPool` filters via `isSystemDoc(docName)` helper already exported from server package (if not already on client, mirror the check locally — one-liner). | CLAUDE.md CC1 section; `cc1-broadcast.ts:isSystemDoc` helper. | `EditorActivityPool.tsx` iterates `pool.entries.filter(e => !isSystemDoc(e.docName))`. |
| DX8 | **Memory budget: up to 10 mounted editors (MAX_POOL) with ~10-30MB per instance, ceiling ~300MB additional.** Acceptable for desktop local-first target. | T+P | DIRECTED (monitor via NG8 when telemetry lands) | No | Memory cost is a known trade-off of D1 hybrid. 300MB is significant but bounded; typical desktop browser tab has 500MB baseline so ~60% overhead. For P1/P2 on laptops, acceptable. Future monitoring (NG8) will surface real distributions; if median user is pool-sized <10 (common case), actual overhead will be smaller. | Provider-pool MAX_POOL=10; typical TipTap/CodeMirror instance sizes. | Document in Risks (§14). Future Work Identified for memory telemetry. |

---

## 11) Open questions — resolution table

All P0 questions from the initial backlog + systematic probes (walk-through, tensions, negative-space) resolved below. No P0 remains open post-finalization.

| ID | Question | Resolution | Link |
|---|---|---|---|
| Q1 | Is 10s the right sync timeout? | **Resolved: 30s hard timeout with 4-tier escalation (D7).** 10s false-fires for 10KL docs (measured 7.4s). Evidence: `reports/crdt-observer-bridge-latency-analysis/REPORT.md`. | D7 |
| Q2 | `isPending` strip location — editor header vs global? | **Resolved: under `EditorHeader` (D6).** Spatial locality with the editor area it describes; GitHub/Linear/Vercel convention. | D6 |
| Q3 | Error-recovery UX — auto-retry or manual? | **Resolved: manual only (DX3).** User-actionable "Try again" button; simpler state; matches `react-error-boundary` design intent. | DX3 |
| Q4 | Sidebar sync-dot animation during pending? | **Resolved: no change needed — NavigationPendingBar is the primary pending affordance; the sync-dot already animates for `connecting` state, which naturally covers the pending window.** | Defer — no spec change |
| Q5 | Skeleton shape — match editor or generic? | **Resolved: refactor existing `EditorSkeleton` (`EditorArea.tsx:19-30`) into standalone component; match editor's content column.** | D5 |
| Q6 | Hocuspocus `forceSyncInterval` — set today? add? | **Resolved: not set today; add client-side 200ms (D8).** | D8 |
| Q7 | Sidebar row-highlight sufficient click feedback? | **Resolved: yes, unchanged.** Existing highlight provides immediate visual ack; NavigationPendingBar covers "work in progress" signal. | No change |
| Q8 | `use(promise)` + key remount + Activity interaction? | **Resolved: Activity mitigates. Cold-load remount is fresh; no prior state to preserve, no interaction risk.** For composition confidence, F16 acceptance criterion covers StrictMode verification. | D1, A7 |
| Q9 | Rapid sequential navigation behavior? | **Resolved: React transition semantics coalesce; each syncPromise independent; F11 acceptance criterion verifies.** | F11 |
| Q10 | Activity-map / awareness state during sync-pending? | **Resolved: observers only wire post-sync (`provider-pool.ts:136-154`). Pre-sync window has no activity flash or awareness cursors — by design. Cold load has no content to decorate yet. Warm nav doesn't re-wire observers (same provider). Tested via F7 (agent nav) + F8 (post-wake).** | No new spec change |
| Q11 | ProviderPool eviction + syncPromise cache? | **Resolved: syncPromise cache invalidates on provider destroy + 4s recycle via pool lifecycle event.** Active provider is never evicted per `provider-pool.ts:242-251`. | F15 |
| Q12 | First-ever page load UX (empty state vs skeleton)? | **Resolved: unchanged — `"Select a document"` empty-state at `EditorArea.tsx:116-122` when no `activeDocName`.** Skeleton only shows when there's a pending sync on an active docName; no docName → empty state. | No change |
| Q13 | Screen reader announcement of loading state? | **Resolved: `aria-busy` + `role="status"` + `aria-live="polite"` (DX5 + F13).** | DX5 |
| Q14 | E2E test strategy — assert on content-continuity? | **Resolved: Playwright assertions in F1-F11 + F13 acceptance criteria.** Test fixture: open doc A, scroll to line 50, nav to B, during `isPending` assert `document.body.textContent` includes A's text. Timing via `page.evaluate(() => performance.now())` with `performance.mark` hooks on nav entry/exit in app code. | F1, F2, F11 |
| Q15 | SourceEditor parallel path? | **Resolved: same hybrid architecture (DX1).** SourceEditor unchanged internally; wrapped by DocumentBoundary inside each Activity entry. | DX1, F10 |
| Q16 | `use(promise)` + React Compiler? | **Resolved: module-level cache is out of React Compiler's memoization scope — confirmed by docs. A2 stays HIGH confidence.** | A2 |
| Q17 | Browser history / "back to prev doc"? | **Resolved: DX4 `resetKeys={[activeDocName]}` + hash-nav model means browser-back just fires `hashchange` → normal nav flow. No spec change beyond testing P4 resume.** | No change |
| Q18 | Skeleton animation style? | **Resolved: keep shadcn Skeleton default pulse — current behavior, no change.** | No change |
| Q19 | Error boundary reset triggers? | **Resolved: `resetKeys={[activeDocName]}` + manual "Try again" button (DX4 + DX3).** | DX3, DX4 |
| Q20 | Instrumentation (dev vs prod)? | **Resolved: dev bracket-prefix logs + prod console.warn on reject/error (DX6).** Aggregated telemetry deferred to NG8. | DX6 |
| Q21 | Activity vs Suspense-gate fork? | **Resolved: hybrid (D1).** | D1 |
| Q22 | TanStack Query vs hand-rolled? | **Resolved: hand-rolled on semantic-fit (D2).** | D2 |
| Q23 | P3 / P4 personas IN or OUT? | **Resolved: both IN (§4).** | §4 |
| Q24 | Sync-dot vs editor-content desync during pending? | **Resolved (by D1 hybrid): each Activity instance has its own provider; the active Activity's provider drives the sync dot. Since `activeDocName` flips before Activity swap (in transition), the dot may briefly show new provider's state while editor shows old content — this is visible for <500ms typical and serves as the "sync is happening" signal. Pending-strip (D6) is the primary affordance regardless.** | No new spec change |
| Q25 | `setCurrentDocName` race during rapid nav? | **Resolved (by D1 hybrid): each Activity has its own TipTap instance with its own `docName` via props — no module-level state. The existing `setCurrentDocName` side effect at `TiptapEditor.tsx:145-149` remains for image-upload path but is now scoped per-instance, not shared.** Note for implementation: verify this assumption in `/eng:implement`; if the image-upload subsystem uses a module-level current-doc variable, refactor to scope per-editor. | F10 (includes this in source editor parallel verification) |
| Q26 | Existing `EditorSkeleton` disposition? | **Resolved: refactor into standalone component used as Suspense fallback; REMOVE the ternary (D5).** | D5 |
| Q27 (new) | Memory cost of 10 mounted editors — acceptable? | **Resolved (DX8): DIRECTED accept — ~300MB ceiling overhead acceptable for desktop local-first.** Monitor when telemetry lands. | DX8 |
| Q28 (new) | Three-layer loading UI (skeleton + strip + escalation) coherent? | **Resolved: strip is baseline pending affordance; escalation tiers are within the strip; skeleton only when no prior content. Not three layers — one layer with two conditional shapes.** Documented in §9. | §9 |
| Q29 (new) | `__system__` pseudo-doc treatment? | **Resolved: excluded from EditorActivityPool (DX7).** | DX7 |
| Q30 (new) | Explicit acceptance criterion for Activity state preservation? | **Resolved: F1 covers.** Scroll + cursor + undo history preserved. Playwright-assertable. | F1 |
| Q31 (new) | Provider eviction + Activity binding? | **Resolved: `EditorActivityPool` subscribes to pool change; eviction removes entry → Activity unmounts naturally. F11 tests rapid-nav coverage.** | F11 |
| Q32 (new) | Production telemetry design? | **Resolved: dev bracket logs + prod console.warn (DX6). Aggregated telemetry → NG8 + Future Work Identified.** | DX6, NG8 |
| Q33 (new) | Error-boundary retry + transition interaction? | **Resolved: retry is a synchronous user action that invalidates the promise cache; re-renders the boundary with fresh Suspense resolution. No startTransition needed for retry — it's urgent.** Documented in §9. | §9 |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Status |
|---|---|---|---|---|
| A1 | `HocuspocusProvider` fires `'synced'` exactly once per provider instance on successful initial sync. | HIGH | Verified via `@hocuspocus/provider` source (`HocuspocusProvider.ts:127`) and existing `provider-pool.ts` usage (only acts on first `synced` via `hasSynced` boolean). | Confirmed |
| A2 | Module-level `Map` cache is React Compiler-safe. | HIGH | React Compiler 1.0 docs: only memoizes component-local values; module state is out of scope. | Confirmed |
| A3 | Suspense + `key` remount preserves revealed content during transition. | LOW concern for hybrid (cold-load path only — no prior state to preserve on the new Activity entry) | `F11` acceptance criterion (rapid nav) covers this indirectly. Manual verification during `/implement`. | Active but low-stakes |
| A4 | `react-error-boundary@^6.0.0` is compatible with React 19.2 + React Compiler. | HIGH | Library has React 19 in peerDeps; `~/agents` production usage at this version. | Confirmed |
| A5 | TipTap 3.22.3 + Collaboration extension matches `tiptap#5761` semantics. | HIGH | `package.json` verified; maintainer quote is version-general. | Confirmed |
| A6 | 30s is sufficient for normal-network sync; rare slow syncs degrade to retry. | MEDIUM | Per-deploy measurement via `[syncPromise] <docName> resolved in <Nms>` logs will inform future tuning. If P2 real-world network shows p99 >30s, revisit budget. | Active — monitor in prod |
| A7 | `<Activity>` + StrictMode + Suspense composes cleanly — hidden effects mount/unmount correctly, state preserved. | MEDIUM | F16 acceptance criterion: manual dev-mode verification + StrictMode-wrapped unit test. | Active — verify in `/implement` |
| A8 | `<Activity>` does not leak WebSocket connections on hidden mode. | HIGH | Providers are owned by `ProviderPool` (bounded LRU). Activity mode flip doesn't destroy provider; pool eviction does. Hidden editors bind to same pooled provider — no per-editor WS. | Confirmed |
| A9 | `EditorActivityPool` subscription to `ProviderPool` changes is React-safe (triggers re-render without infinite loop). | HIGH | Existing `DocumentContext.tsx:78-133` already uses pool-change-triggered re-render via snapshot pattern. Same mechanism. | Confirmed |
| A10 | `isSystemDoc()` helper is available on client (or can be mirrored from server). | HIGH | Server exports it from `cc1-broadcast.ts`. Client can import or mirror. | Confirmed |

---

## 13) In Scope (implement now)

### Goal
Ship the full hybrid architecture per D1-D8 + DX1-DX7, delivering G1-G6. Single-rollout (no phasing); greenfield directive.

### Deliverables

**New files:**
- `packages/app/src/editor/sync-promise.ts` — module-level cache + lifecycle API (create, resolve on sync, reject on timeout/destroy/recycle, explicit invalidate).
- `packages/app/src/components/DocumentBoundary.tsx` — uses `use(pool.syncPromise(docName))`.
- `packages/app/src/components/DocumentErrorBoundary.tsx` — `react-error-boundary` wrapper with FallbackComponent.
- `packages/app/src/components/EditorSkeleton.tsx` — refactored from `EditorArea.tsx:19-30`.
- `packages/app/src/components/NavigationPendingBar.tsx` — 4-tier escalating progress indicator.
- `packages/app/src/components/EditorActivityPool.tsx` — renders one `<Activity>` per `ProviderPool` entry.
- `packages/app/tests/e2e/docs-open.e2e.ts` — Playwright tests for F1-F11+F13.
- `packages/app/src/editor/sync-promise.test.ts` — unit tests for timeout, invalidation, idempotent creation.
- `packages/app/src/components/NavigationPendingBar.test.tsx` — tier transitions.
- `packages/app/src/components/DocumentErrorBoundary.test.tsx` — error kind copy + retry reset.

**Modified files:**
- `packages/app/src/editor/provider-pool.ts` — add `forceSyncInterval: 200` to provider creation; emit lifecycle events that `sync-promise.ts` listens to (or extend `onChange` notification payload).
- `packages/app/src/editor/DocumentContext.tsx` — expose `openDocumentTransition` helper; integrate `useTransition` for `isPending` surface.
- `packages/app/src/components/EditorArea.tsx` — replace `syncState === 'connecting' ? <EditorSkeleton /> : <editors>` ternary with `<DocumentErrorBoundary><Suspense><EditorActivityPool>...</EditorActivityPool></Suspense></DocumentErrorBoundary>`. Remove inline `EditorSkeleton` definition.
- `packages/app/src/App.tsx` — consume `useTransition` in nav handler; render `<NavigationPendingBar isPending={...}/>` under `EditorHeader`.
- `packages/app/package.json` — add `react-error-boundary@^6.0.0`.
- `CLAUDE.md` — add Architectural precedent #14 for hybrid Activity+Suspense subscription-source pattern.

**Tests (Playwright E2E):**
- `docs-open.e2e.ts::warm-nav preserves content atomically` (F1)
- `docs-open.e2e.ts::cold-nav keeps prior doc visible during pending` (F2)
- `docs-open.e2e.ts::NavigationPendingBar visible during isPending` (F3)
- `docs-open.e2e.ts::cold-load skeleton only without prior content` (F4)
- `docs-open.e2e.ts::sync failure shows recoverable error + retry reset` (F5)
- `docs-open.e2e.ts::error UX returns to previous doc` (F6)
- `docs-open.e2e.ts::agent-driven nav gets same UX` (F7)
- `docs-open.e2e.ts::post-wake reconnect preserves content` (F8)
- `docs-open.e2e.ts::rapid sequential navigation converges correctly` (F11)
- `docs-open.e2e.ts::a11y attributes for loading/error states` (F13)
- `docs-open.e2e.ts::source editor path follows same architecture` (F10)

### Owner(s) / DRI
Nick Gomez.

### Next actions (after finalization)
1. `/eng:decompose` → spec.json.
2. `/eng:implement` → iteration loop.
3. `/eng:docs` → CLAUDE.md precedent + inline docs.
4. `/eng:review-local` pre-QA + post-QA gates.
5. `/eng:qa-plan` + `/eng:qa`.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Dev env only (not yet shipped to users) | Single rollout; no phasing | `bun run check` full green; Playwright E2E suite passes |
| React 19.2 + Compiler + Activity compatibility | Explicit testing | F16; unit tests with `<StrictMode>` wrapper; manual dev-mode verification |
| Memory footprint (bounded by MAX_POOL=10) | Accept per DX8; monitor when telemetry infra lands | Observable via browser DevTools memory panel during QA |
| Breaking change to EditorArea render tree | Greenfield directive — no backwards compat needed | Existing E2E test suite runs + new tests added |

---

## 14) Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | `<Activity>` + StrictMode double-mount causes transient state inconsistencies in dev | Medium | Low (dev-only) | F16 + Outline's `useLayoutEffect` precedent for provider init if needed. Existing `ProviderPool` is already idempotent. | Nick |
| R2 | `<Activity>` hidden effect-unmount timing causes `provider-pool.ts` race with pool eviction | Low | Medium | `EditorActivityPool` subscribes to pool state (snapshot pattern), unmounts Activity when entry drops. Unit test. | Nick |
| R3 | `use(promise)` + cold-load remount semantics: promise re-thrown on remount — infinite suspend loop if not careful | Low | High | Module-level cache ensures stable promise ref; same docName returns same promise. Unit test with remount simulation. | Nick |
| R4 | `forceSyncInterval: 200` generates unexpected network chatter that surprises users on metered connections | Low | Low | It's 2 messages/sec per open provider; bounded by MAX_POOL=10 → ~20 msgs/sec worst case. Negligible. Monitor via NG8. | Nick |
| R5 | Memory footprint exceeds DX8 ceiling (300MB) on very large docs | Low | Medium | Pool is bounded (MAX_POOL=10); per-editor cost scales with doc size but median case is small. Add dev-mode memory log. Future: monitor via NG8. | Nick |
| R6 | Rapid sequential navigation triggers pool thrashing (provider creation + eviction within same transition) | Low | Low | React transition semantics coalesce. Pool LRU tolerates churn. F11 verifies. | Nick |
| R7 | `EditorActivityPool` snapshot subscription causes infinite render loop | Low | High | Use `useSyncExternalStore` pattern (React-canonical) or the existing `DocumentContext` snapshot pattern verbatim. | Nick |
| R8 | React 19.2 `<Activity>` has undocumented gotchas with ProseMirror / CodeMirror lifecycle | Medium | Medium | F16 manual testing. Fallback: pure Suspense-gate (D1 original-A) if Activity causes regressions. | Nick |
| R9 | `syncPromise` timeout conflicts with user-scrolling during pending (user doesn't want "Try again" if still waiting) | Low | Low | "Try again?" prompt at 25s is a button, not a modal — doesn't block. User scrolling continues. Timeout is 30s hard. | Nick |
| R10 | `__system__` pseudo-doc gets into pool via some edge code path, breaks the filter | Low | Low | Unit test on `isSystemDoc` filter. Guard in `EditorActivityPool` as belt-and-suspenders. | Nick |

---

## 15) Future Work

### Explored

- **Outline-style dual-render with IndexedDB persistence.** Would eliminate cold-load skeleton entirely by showing cached last-known content while syncing. Prerequisites: IndexedDB layer, Y.Doc serialization strategy, conflict resolution on reconnect. Separate large spec. Triggers to revisit: (1) telemetry (NG8 land) shows cold-load p95 >2s for P2, (2) offline-first requirement lands on the roadmap.

### Identified

- **Diff preview / version-history loading (NG5).**
  - Known: `EditorArea.tsx:139-146` has `previewLoading` spinner; fetch-based data (git blob).
  - Matters: same architectural family; different semantics.
  - Investigation needed: trace end-to-end; evaluate whether a shared loading primitive would reduce complexity.

- **Bundle splitting / `React.lazy` on editor (NG3).**
  - Known: editor bundle non-trivial; no split today.
  - Matters: cold-load time bounded by parse + download.
  - Investigation: measure current bundle; evaluate Suspense-boundary composition with `React.lazy`.

- **Aggregated loading-state telemetry (NG8).**
  - Known: no OTel/Sentry/Prometheus pipeline in `packages/app` today.
  - Matters: would surface real distributions for timeout tuning (A6), memory usage (DX8), cold vs warm hit rates.
  - Investigation: choose a pipeline (consumer telemetry — Vercel Analytics? Self-hosted?); instrument the decision points.

- **Unify sync-state-truth sources.** Three sources post-spec (`PoolEntry.syncState`, `useSyncStatus`, `syncPromise`). A single context-exposed state machine would be cleaner. Defer until a second consumer needs it.

- **Prefetch on hover** — hovering a sidebar row could warm the provider + syncPromise. Measurable UX win at cost of WebSocket overhead per hover. Revisit if cold-load perceived latency becomes a P1 complaint.

### Noted

- **Progressive content rendering during sync.** Render content as Y.Doc updates arrive (partial sync visibility). Requires Y.Doc streaming semantics; much deeper work. Possible revisit when IndexedDB lands.
- **Keyboard-navigation a11y across hidden Activity entries.** Tab order through hidden content is React-handled. Verify in F13; if issues, explicit `tabIndex={-1}` on hidden editor wrappers.
- **Coalescing rapid agent-driven navs (P3).** If agents stream many focus changes (e.g., tool-call cascade), debounce at the `openDocument` layer. Not needed today; watch for it.

---

## 16) Agent constraints

- **SCOPE:**
  - `packages/app/src/editor/` (primary)
  - `packages/app/src/components/EditorArea.tsx` (modified)
  - `packages/app/src/components/EditorSkeleton.tsx` (new, extract from EditorArea)
  - `packages/app/src/components/DocumentBoundary.tsx` (new)
  - `packages/app/src/components/DocumentErrorBoundary.tsx` (new)
  - `packages/app/src/components/NavigationPendingBar.tsx` (new)
  - `packages/app/src/components/EditorActivityPool.tsx` (new)
  - `packages/app/src/App.tsx` (modified)
  - `packages/app/src/editor/DocumentContext.tsx` (modified — expose openDocumentTransition)
  - `packages/app/src/editor/provider-pool.ts` (modified — forceSyncInterval + lifecycle events)
  - `packages/app/src/editor/sync-promise.ts` (new)
  - `packages/app/package.json` (add `react-error-boundary@^6.0.0`)
  - `packages/app/tests/e2e/docs-open.e2e.ts` (new)
  - `packages/app/src/editor/sync-promise.test.ts` (new)
  - `packages/app/src/components/NavigationPendingBar.test.tsx` (new)
  - `packages/app/src/components/DocumentErrorBoundary.test.tsx` (new)
  - `CLAUDE.md` (add Architectural precedent #14)

- **EXCLUDE:**
  - Server-side code (`packages/server/`) — except where CLAUDE.md Architectural precedent #14 needs referencing.
  - MCP-related paths.
  - `packages/core/` (CRDT bridge logic, schema).
  - Docs site (`docs/`).
  - `packages/cli/`.
  - Diff-view loading path (`EditorArea.tsx:139-146`'s `previewLoading` — stays as-is per NG5).
  - Any refactor of `ProviderPool.evictLru` beyond adding lifecycle events for syncPromise invalidation.

- **STOP_IF:**
  - TipTap Collaboration extension source is touched (must use library APIs only).
  - Y.Doc transaction semantics are modified.
  - Server Hocuspocus config is changed (forceSyncInterval is added client-side per D8; no server change).
  - `syncState` enum in `DocumentContext` is widened or narrowed (three-source-truth is accepted as-is; unification is Future Work).
  - Any addition of IndexedDB / `y-indexeddb` / `IndexeddbPersistence` (that's NG7).
  - Any new client-side dependency beyond `react-error-boundary`.

- **ASK_FIRST:**
  - Changing `MAX_POOL` constant in `provider-pool.ts`.
  - Introducing aggregated telemetry (NG8 is explicit).
  - Changing the `__system__` filter pattern.
  - Touching any code in `packages/server/` or `packages/core/`.
