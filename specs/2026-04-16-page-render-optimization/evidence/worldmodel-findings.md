---
topic: Worldmodel pass — codebase + OSS + web synthesis (supersedes prior-session-trace.md file:line citations)
sources:
  - packages/app/src/components/EditorArea.tsx (re-verified)
  - packages/app/src/editor/DocumentContext.tsx (re-verified)
  - packages/app/src/editor/provider-pool.ts (re-verified — LRU, recycle-debounce, lifecycle events)
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/App.tsx
  - packages/app/src/main.tsx
  - packages/app/src/presence/use-sync-status.ts
  - packages/app/src/components/BacklinksPanel.tsx (pattern precedent)
  - packages/app/src/components/TimelinePanel.tsx (pattern precedent)
  - packages/app/package.json (dep verification)
  - packages/server/src/standalone.ts (server config — no forceSyncInterval)
  - ~/.claude/oss-repos/outline/app/scenes/Document/components/MultiplayerEditor.tsx (dual-render pattern)
  - ~/.claude/oss-repos/hocuspocus/packages/provider/src/HocuspocusProvider.ts (forceSyncInterval default)
  - ~/.claude/oss-repos/blocknote/examples/07-collaboration/02-liveblocks/src/App.tsx (ClientSideSuspense)
  - reports/crdt-observer-bridge-latency-analysis/REPORT.md (sync-latency data)
  - https://github.com/ueberdosis/tiptap/issues/5761 (verified 2026-04-16 via gh CLI; maintainer-closed 2025-04-18)
session: Worldmodel subagent (2026-04-16)
confidence: HIGH for file:line refs, verified lib versions, gh-confirmed issue state; MEDIUM for architectural inferences
status: Active
---

# Worldmodel findings — page-render-optimization

## Headline: stale claims in predecessor artifacts — factual corrections

The prior-session research was directionally correct but several file:line refs and current-state claims are stale. Below are the load-bearing corrections.

### D-1. "No loading UI anywhere in the editor render tree" is WRONG

**An `EditorSkeleton` already exists and is shown when `syncState === 'connecting'`.**

- `packages/app/src/components/EditorArea.tsx:19-30` defines `EditorSkeleton` (shadcn Skeleton lines, tiptap-editor grid shape).
- `EditorArea.tsx:159-161` conditionally renders it: `syncState === 'connecting' ? <EditorSkeleton /> : <editors>`.
- This is NOT Suspense-based — it's a plain ternary keyed off `syncState` from DocumentContext.
- **Implication for SPEC.md §8:** current state is not "nothing"; it's a partial solution. The proposed D5 (EditorSkeleton as Suspense fallback) ships what partly exists, but the architecture changes (skeleton-via-conditional → skeleton-via-Suspense-fallback).
- **Implication for Decision Log:** D1 needs explicit treatment of the existing conditional — remove, replace, or keep-as-fallback-to-Suspense?

### D-2. EditorArea guard location drift

- Prior trace said: `EditorArea.tsx:94-100` — guard: `!activeProvider` shows "Select a document".
- Actual: **`EditorArea.tsx:116-122`**. The 94-100 range is inside a diff-preview `useEffect`.

### D-3. TipTap key is composite, not bare docName

- Prior trace said: `key={activeDocName}`.
- Actual: `` key={`${activeDocName}-${String(isNewDoc)}`} `` at `EditorArea.tsx:172`.
- **Implication:** editor remounts on BOTH doc navigation AND the `isNewDoc` boolean flipping (draft → saved). Any Suspense gate must correctly handle both remount triggers.

### D-4. DocumentContext openDocument location drift

- Prior trace said: `DocumentContext.tsx:47-96`.
- Actual: `openDocument` is at `DocumentContext.tsx:112-116`; line 47 is `EMPTY_SNAPSHOT`. The pool hookup spans `:78-133`.

### D-5. TanStack Query is deeply adopted — but is PERIPHERAL, not the core-state primitive

- **TanStack Query usage (peripheral):** `main.tsx:10-14` QueryClient `{retry: 1, staleTime: 10_000}`. Consumers are all DERIVED views: `BacklinksPanel` (`:44-51`), `OutlinePanel` (`:96-106`), `GraphPanel` (`:109,174`), `ForwardLinksPanel` (`:70`), `TimelinePanel` (`:319-324`), `SystemDocSubscriber` (invalidations on CC1). Pattern: `aria-busy={isLoading}` + `<PanelError>`.
- **`useSuspenseQuery` is NOT used anywhere** — confirmed by grep. The library has it; the app opted out.
- **No `<Suspense>` boundaries anywhere** — confirmed by grep. Zero.
- **Core-state primitive is DIFFERENT:** `PageListContext.tsx:41-83` is a hand-rolled async primitive for the page list (core state). Mechanism:
  - `loadPages()` async fetch, stored in local state via context.
  - Request-ID deduplication (`latestRequestIdRef`) for race-safety.
  - Manual `.then().catch().finally()`.
  - Consumed via `use()` on the context (not `useQuery`).
  - Triggers: focus, `visibilityState`, CC1 signal from `SystemDocSubscriber`.
- **Pattern insight:** the team has made a DELIBERATE separation — hand-rolled promise+context for core/foundational state (page list, document index); TanStack Query for peripheral derived views (backlinks, outline, graph panels). Not a convergence failure — a deliberate architectural line.
- **Implication for D2:** the editor-mount-gating is load-bearing/core, not peripheral. The PageListContext pattern is the more faithful precedent for syncPromise. Hand-rolled `syncPromise` + `use()` consumed via DocumentContext is the consistent choice; `useSuspenseQuery` would diverge from the deliberate core/peripheral split.
- **Caveat:** this is the OK codebase pattern. The cross-repo `~/agents` prior art is still being investigated (different team, different app, may inform whether hand-rolled core-state is conventional outside OK too).

### D-5a. `~/agents` cross-repo audit confirms the split

Sister project at `/Users/edwingomezcuellar/agents` — `agents-manage-ui` (Next.js + React 19 canary + TanStack Query `^5.90.12`) and `agent-docs`. Audited 2026-04-16.

- **`useSuspenseQuery` is NOT USED.** Zero occurrences. Library is available but opted out.
- **TanStack Query pattern:** `useQuery` with explicit `isLoading` + `initialData: []` + component-level loading logic. Consumers: `lib/query/projects.ts:24-38`, `lib/query/agents.ts:20-34`. Peripheral data fetching only.
- **`<Suspense>` is used MINIMALLY** — only for RSC/routing concerns (authentication redirect at `app/page.tsx:127-135`, PostHog at `agents-docs/src/app/layout.tsx:148`). **Never paired with TanStack Query.**
- **`react-error-boundary` IS USED** at `^6.0.0`. `FallbackComponent` at `components/traces/charts/chart-card.tsx:3,89`, `fallbackRender` at `components/dynamic-component-renderer.tsx:5,25,32`. Confirms D4's library choice and pins the version range.
- **`startTransition`** used for server actions (`components/skills/delete-skill-confirmation.tsx:27,30`, editor formatting). Not paired with queries.
- **No hand-rolled promise caches or `use()` patterns detected.** They haven't needed subscription-source bridging (HTTP-request data model).

**Cross-repo observation (non-prescriptive):** the Inkeep engineering pattern today is (a) TanStack Query for HTTP fetch/refetch (peripheral), (b) Suspense for code-splitting/routing (never paired with query loading), (c) startTransition for non-urgent state updates, (d) react-error-boundary for generic error catching, (e) hand-rolled primitives for semantics that don't fit (a)-(d). **This is observation, not prescription** — it could equally mean the pattern wasn't needed yet. The D2 decision below rests on independent semantic-fit analysis (TkDodo's positioning + React `use()` docs), with this cross-repo data providing consistency context but not being load-bearing.

### D-6. ProviderPool has non-trivial lifecycle (RECYCLE_DEBOUNCE_MS)

- `provider-pool.ts:44`: `RECYCLE_DEBOUNCE_MS = 4000`.
- `:156-175, 269-287`: on `onDisconnect` with no unsynced changes, schedules provider recycle in 4s. Cancelled if reconnect fires within the window.
- **Implication for D7 (10s timeout):** a 4s recycle may complete BEFORE the 10s timeout fires. If user hits pre-sync disconnect, the provider will be recycled at 4s (not 10s); the 10s timeout then fires against a stale provider reference. Promise lifecycle must coordinate with recycle, not just timeout.

### D-7. Baseline state is NOT zero

- Partial fixes exist: EditorSkeleton (D-1), sync-dot in PresenceBar (`PresenceBar.tsx:126-130`), connecting/synced state machine (`use-sync-status.ts:1-61`), diff-preview spinner (`EditorArea.tsx:139-146`), LRU provider pool warming, RECYCLE_DEBOUNCE for network flap.
- Spec framing as "from nothing to everything" is misleading. Should be "from partial-ad-hoc to unified-architectural-pattern."

### D-8. `forceSyncInterval` is NOT set anywhere

- Confirmed: `HocuspocusProvider.ts:127` — default is `false`.
- OK server (`packages/server/src/standalone.ts:190-195`) does not set it.
- Client-side providers created in `provider-pool.ts:86-103` do not set it.
- **Answer to SPEC.md Q6:** not set. Decision open: add it as defense against y-websocket#81 + hocuspocus#525?
- Client-side `forceSyncInterval: 200` is the community-recommended safety net for "synced fires silently or never."

### D-9. TipTap #5761 — VERIFIED still applies (decisive maintainer response)

- Issue filed 2024-10-24 on TipTap 2.9.0.
- **Closed 2025-04-18** by TipTap maintainer `@janthurau` with direct quote:
  > "Please re-create the editor and the provider (and the ydoc, if you pass it separately) if you want to switch to a new document, hot-changing the provider is not supported and will lead to issues."
- OK is on TipTap 3.22.3. Statement is version-general, not 2.x-specific.
- **Implication:** **SPEC.md D1 stays correct.** Hot-swap is unsupported per maintainer; remount is required. But this opens a question: `<Activity mode="hidden|visible">` (React 19.2) lets us keep MULTIPLE editor instances (each with own editor+provider+ydoc — satisfying the "re-create" constraint) mounted-hidden; switching between them is NOT hot-swap. This is D-9's critical implication that reopens D1's scope — not about whether to hot-swap, but about WHICH multiple-instance model to use (remount-on-demand via Suspense vs keep-warm via Activity).

---

## New architectural options surfaced by worldmodel

The SPEC's current D1 picks one answer. Worldmodel identified two additional answers that deserve explicit alternatives-considered treatment.

### Alt-A: `<Activity mode>` (React 19.2 stable) — keep multiple editor instances warm

**Mechanism:**
```tsx
<>
  {pooledDocs.map(doc => (
    <Activity key={doc.name} mode={doc.name === activeDocName ? 'visible' : 'hidden'}>
      <Editor provider={doc.provider} docName={doc.name} />
    </Activity>
  ))}
</>
```

- Each pooled doc has its own mounted editor; Activity toggles visibility.
- Hidden editors preserve scroll position, focus, undo history, flash state.
- Satisfies TipTap #5761 constraint (each editor has its own editor+provider+ydoc — not hot-swapping).
- Memory cost scales with pool size (`MAX_POOL=10`, so up to 10 mounted editors).

**Pros:**
- Scroll position preserved across navigation.
- Warm switches are instant (editor already has content).
- No re-sync cost on repeat visits.
- State preservation is React-native (not custom caching).

**Cons:**
- Memory overhead — 10 TipTap/CodeMirror instances + ProseMirror states in memory.
- First-visit to a non-pooled doc still needs Suspense-gate (hybrid pattern).
- `<Activity>` + StrictMode + Suspense interactions are less battle-tested.
- Effects run when mode flips; provider-pool lifecycle events (`hasSynced`, `tearingDown`) need to integrate cleanly.
- Complicates the "which editor is 'the' editor" mental model — may impact observer wiring, flash state, image-upload `setCurrentDocName`.

### Alt-B: `useSuspenseQuery` for syncPromise — TanStack Query convergence

**Mechanism:**
```tsx
function DocumentBoundary({ docName }) {
  useSuspenseQuery({
    queryKey: ['sync', docName],
    queryFn: () => promisifySynced(pool.getOrCreate(docName)),
    staleTime: Infinity, // sync is not a cache with TTL
    gcTime: Infinity,
  });
  return <Editors />;
}
```

- Reuses existing TanStack Query infrastructure.
- `queryClient.invalidateQueries({ queryKey: ['sync', docName] })` → cache invalidation on provider destroy.
- Integrates with React Suspense via `useSuspenseQuery` (not plain `useQuery`).

**Pros:**
- Architectural convergence — one async-primitive library, not two.
- QueryClient already handles retry, observer lifecycle, dedup, invalidation.
- Easier to unify with existing loading patterns (Backlinks/Outline/Graph panels use `useQuery`).

**Cons:**
- TanStack Query's mental model is "fetch/refetch"; syncPromise is "subscribe-once-per-provider-lifecycle." May be force-fitting.
- The `queryFn` must return a promise that resolves when `synced` fires — still requires hand-rolled promise-ification (but reusing QueryClient infra rather than a custom Map cache).
- Retry semantics may need tuning (`retry: 1` is the existing default — probably want 0 for sync since it's a stable subscription, not a flaky HTTP request).

### Alt-C: Outline's dual-render with IndexedDB — content-continuity via cached snapshot

**Mechanism (for reference — NOT proposed; OK lacks the prerequisite):**
- Mount two editors: `readOnly cacheOnly` (shows IndexedDB cache) + hidden collaborative.
- Swap visibility when `isLocalSynced && isRemoteSynced`.
- Requires `IndexeddbPersistence` layer — OK does NOT have this (grep confirmed zero `IndexeddbPersistence` / `y-indexeddb` usage).

**Implication:** Adding IndexedDB persistence is its own large spec (offline-first architecture, Y.Doc serialization, conflict resolution on reconnect). Explicitly OUT of scope here; Alt-C is listed as rejected-for-precondition-reasons.

---

## Other findings worth persisting

### Timeout budget collision with sync-latency data

- `reports/crdt-observer-bridge-latency-analysis/REPORT.md` documents: **500ms at 2KL, 7.4s at 10KL** sync times.
- SPEC.md proposes 10s timeout. At 10KL, this is ~25% headroom — users with large docs on slow networks will hit false-positive timeouts.
- RECYCLE_DEBOUNCE_MS (4s) fires BEFORE the 10s timeout in the disconnect path — provider is recycled while promise is still pending.
- **Recommendation options:**
  - (a) Doc-size-aware timeout: `max(10s, 2 × expected_sync_time_for_size)`.
  - (b) No timeout; rely on recycle + retry semantics only.
  - (c) Very generous timeout (30s) + progress indicator that escalates over time (subtle → visible → prominent).
  - (d) Timeout is only for "error, retry" UX path; the "still loading" state is user-dismissible.

### Personas worldmodel flagged as missing

- **P3: Agent-driven navigation.** `SystemDocSubscriber` + `AgentFocusBroadcaster` + `DocumentContext.pinnedDoc` exist precisely because agents drive `activeDocName`. An agent-triggered navigation hits the same flash/blank-gap as user-driven. `pinnedDoc` explicitly exists to SUPPRESS agent navigation (user controls when an agent's focus redirects their editor). This is a real product surface omitted from SPEC.md §4.
- **P4: Developer resumed from sleep/idle.** `PageListContext.tsx:98-104` has `document.visibilityState` handler for refetch. Outline does explicit idle-disconnect. When a laptop wakes, the active provider reconnects — same sync-gap UX as first-open. Not in SPEC.md's personas.

### Two sources of sync-state truth (→ three with syncPromise)

- `PoolEntry.syncState`: `'connecting' | 'synced' | 'disconnected'`.
- `useSyncStatus`: `'connecting' | 'connected' | 'synced' | 'disconnected'` (adds intermediate `'connected'`).
- Adding `syncPromise` → three sources. Unifying is a worthwhile precedent-setting cleanup.

### Race: setCurrentDocName module-level side effect

- `TiptapEditor.tsx:145-149` calls module-level `setCurrentDocName(docName)` on mount; cleanup sets it to null.
- During rapid sequential navigation, brief null window exists between unmount and next mount. In-flight image uploads during this window may bind to null or wrong doc.
- Under Suspense-gated mount (D1), the old TipTap is still mounted during pending → `currentDocName` still points at old doc until key swap. Behavior is MORE correct than today, but the race still exists at the swap boundary.
- Not in SPEC.md failure modes table.

### Sync-dot will show new doc's state while editor shows old doc's content

- During a React transition, `activeProvider` in DocumentContext flips to the new provider before the Suspense boundary resolves (transition keeps old UI visible).
- `PresenceBar.tsx:126-130` reads `useSyncStatus(activeProvider)` — it'll show the new provider's `connecting` state while the editor still shows the old doc.
- Visual inconsistency: sync dot says "connecting" but editor content is stable → user confusion.
- Mitigation options: (a) decouple sync-dot from active provider during pending — show last-settled provider's state; (b) keep dot in sync with editor content (harder — requires distinguishing "displayed doc" from "active doc"); (c) accept inconsistency and let the new progress strip (D6) be the primary affordance.

### Agent activity flash + transition interaction

- Agent writes produce DOM-imperative flashes via `window.__agentFlashState` + `wrapperRef.current` (imperative, bypasses React).
- Across a Suspense transition, both old and new editor share the Y.Map('activity').
- If an agent writes at the moment of transition, both editors may try to apply flash decoration. Not a correctness bug, but a UX polish item.

### EditorHeader is the likely home for isPending progress strip

- `EditorHeader.tsx:77-80` has the SidebarTrigger; header is 40px tall, strip would sit at the bottom edge.
- Alternative: global top-bar spanning the whole app (Vercel/Next.js convention via `react-transition-progress`).
- Weigh visual prominence vs integration site.

## Summary: critical things the SPEC needs to address

1. **Correct stale file:line refs in prior-session-trace.md** (D-2, D-3, D-4) — silent fix.
2. **Revise §8 (current state)** to acknowledge EditorSkeleton conditional and PresenceBar sync dot already exist — silent fix.
3. **Decision fork (user judgment):** Alt-A (Activity) vs current D1 (Suspense-gate remount) vs hybrid (Activity for pooled/warm + Suspense for cold).
4. **Decision fork (user judgment):** Alt-B (useSuspenseQuery/TanStack Query convergence) vs current D2 (hand-rolled syncPromise cache).
5. **Decision (user judgment):** timeout budget — 10s, doc-size-aware, 30s-with-escalation, or no-timeout-at-all?
6. **Decision (user judgment):** P3 (agent-driven nav) and P4 (idle resume) — add as personas, or keep scope tight?
7. **Decision (user judgment):** add `forceSyncInterval` to server or client? Answer to Q6 is "not set today."
8. **Decision (user judgment):** how to handle sync-dot vs editor-content desync during pending transition?
9. **Decision (minor):** setCurrentDocName race — add explicit mitigation or note as acceptable?
