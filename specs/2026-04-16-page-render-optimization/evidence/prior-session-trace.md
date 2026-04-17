> **⚠️ Partial staleness — see `worldmodel-findings.md` for corrections.** This file is preserved for historical context. Several file:line references here are off-by-~20 lines vs current HEAD (`06da1ff`). Key factual corrections: EditorSkeleton ALREADY EXISTS (claim "no loading UI anywhere" is wrong); TipTap `key` is composite `${docName}-${isNewDoc}` not bare `activeDocName`; `openDocument` is at `DocumentContext.tsx:112-116` not `:76-79`. Trust `worldmodel-findings.md` where they conflict.

---

topic: Current file-open lifecycle — code trace
sources:
  - packages/app/src/components/FileTree.tsx
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/editor/provider-pool.ts
  - packages/app/src/components/EditorArea.tsx
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/presence/PresenceBar.tsx
  - packages/app/src/presence/use-sync-status.ts
session: Predecessor conversation (branched at /branch boundary)
confidence: HIGH
status: Active
---

# Prior-session trace — file-open lifecycle

Reified from the Explore-agent trace in the predecessor session. File:line references verified against `origin/main@06da1ff`.

## 6-stage timeline from click to synced editor

### 1. User clicks file in sidebar → `navigateTo(docName)`
- `packages/app/src/components/FileTree.tsx:71-72` — `window.location.hash = '#/<docName>'`.
- **Visible state:** file highlights in sidebar; editor still shows previous doc (or fallback text on first click).

### 2. Hash change → `NavigationHandler` → `openDocument(docName)`
- `packages/app/src/App.tsx:16-31` — `hashchange` listener parses docName via `doc-hash.ts:7-20` and calls `openDocument(docName)`.
- `packages/app/src/editor/DocumentContext.tsx:76-79` — delegates to `pool.open(docName)` + `pool.setActive(docName)`.
- **Visible state:** previous editor content still visible.

### 3. ProviderPool opens/reuses provider → `syncState: 'connecting'`
- `packages/app/src/editor/provider-pool.ts:86-186`.
- Provider created synchronously (`:100-103`), entry initialized `syncState: 'connecting'` (`:108`), WebSocket listeners attached (`:117-179`).
- `pool.notify()` (`:183`) triggers DocumentContext re-render.
- **Visible state:** old editor content still visible (editor hasn't re-bound yet).

### 4. React re-renders EditorArea → TipTap **unmounts + remounts**
- `packages/app/src/components/EditorArea.tsx:94-100` — guard: `!activeProvider` shows "Select a document" placeholder.
- `:136-145` — TipTap rendered with `key={activeDocName}` → full unmount on doc change, fresh mount with new provider.
- SourceEditor (CodeMirror) receives new `ytext` + `provider` props (`:138-141`).
- Both editors create fresh state in their effects.
- **Visible state:** **brief white flash** (old DOM torn down; new editor mounts with empty Y.Doc not yet populated).

### 5. HocuspocusProvider syncs → `syncState: 'synced'`
- `provider-pool.ts:124-155` — `'synced'` event fires → `entry.syncState = 'synced'`, `entry.hasSynced = true`.
- Only AFTER first sync, `setupObservers()` runs (`:140`) wiring Y.Text ↔ Y.Fragment bridges.
- `pool.notify()` updates DocumentContext.
- **Duration:** ~50-500ms depending on network latency.
- **Visible state:** editor briefly blank (Y.Doc populating), then content appears. **No spinner, skeleton, or loading UI** — jarring transition "previous content → blank → new content."

### 6. Editors bind to populated Y.Doc
- `TiptapEditor.tsx:92-134` — `useEditor()` binds `Collaboration` extension to `provider.document` (`:106-107`).
- `SourceEditor.tsx:57-102` — binds `yCollab(ytext, provider.awareness)` (`:65`).
- Both subscribe to Y.Doc mutations.
- **Visible state:** final content rendered; editor fully interactive.

## What the user sees (moment-by-moment)

| Stage | Visible state | UI feedback |
|---|---|---|
| Click file in sidebar | Previous content still in editor | File row highlights |
| Hash sets | Previous content still visible | (no change) |
| Provider opens (syncing) | Previous content OR blank (depends on remount timing) | No indicator |
| TiptapEditor remounts | **Brief white flash** (DOM torn down, not yet populated) | Jarring; no skeleton |
| Y.Doc syncs (~100-500ms) | **Blank editor** waiting for first sync | **Nothing visual** |
| Content appears | New document fully rendered | Finally interactive |

## Loading / pending infrastructure

**Skeletons/Loading UI (current):**
- `packages/app/src/components/ui/skeleton.tsx` exists but **only used in sidebar menu**.
- EditorArea shows "Select a document to edit" static text when `!activeProvider` (`EditorArea.tsx:97`).
- **No Suspense boundary anywhere in editor tree.**
- Diff preview has `previewLoading` spinner (`EditorArea.tsx:117-124`) — **separate from doc-change flow**.

**Sync status exposure:**
- `syncState: 'connecting' | 'synced' | 'disconnected'` tracked in `DocumentContext.tsx:8`.
- Consumed by `packages/app/src/presence/PresenceBar.tsx:91-120` for the colored sync dot.
- **EditorArea and editors do NOT consume it** to show loading states.

**Imperative flow (no useTransition):**
- Hash change → `openDocument()` is synchronous.
- No `startTransition()` wrapping the doc switch anywhere.
- EditorArea change detection is automatic via `activeProvider` context change.

## Obvious gaps (as-is)

1. **No visual feedback during sync gap** — user sees blank/flickering editor with zero progress indication.
2. **No skeleton/placeholder** — diff preview has spinner, doc-load has nothing.
3. **Editor remount happens before Y.Doc syncs** — content renders blank then populates visibly.
4. **No `useTransition`** — on slow networks, stale render happens before sync; UI doesn't prioritize the sync.
5. **TipTap `key={activeDocName}`** forces full remount every doc change.
6. **Silent sync failures** — no error boundary, no retry UI.
7. **First-visit vs repeat-visit identical** — no cache-aware short-circuit in UX.

## Critical paths

- `packages/app/src/components/FileTree.tsx:71-72` — navigateTo
- `packages/app/src/App.tsx:16-31` — hash listener → openDocument
- `packages/app/src/editor/DocumentContext.tsx:47-96` — provider pool hookup, syncState exposure
- `packages/app/src/editor/provider-pool.ts:86-186` — provider lifecycle, sync timing
- `packages/app/src/components/EditorArea.tsx:94-145` — editor remount, no loading UI

## Verification

Trace was performed against the predecessor session's `spec/github-sync` branch. File:line offsets verified against `origin/main@06da1ff` where these files are unchanged. Will re-verify if any of these files change during iteration (baseline commit tracked in SPEC.md).
