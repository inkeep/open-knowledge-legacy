# Provider Pool & Document Context

**Status:** Final
**Created:** 2026-04-10
**Baseline commit:** 748f63e
**Parent spec:** `specs/2026-04-10-multi-file-documents/SPEC.md`
**Parallel with:** `specs/2026-04-10-document-list-api/`, `specs/2026-04-10-mcp-write-tools/`

---

## Problem

The React UI is hardcoded to a single document (`const DOC_NAME = 'test-doc'`, TiptapEditor.tsx:23). The `HocuspocusProvider` is a module-level singleton. There is no way to open, switch, or close documents dynamically. The server already supports multi-file — the gap is the client.

## Goal

Replace the singleton provider with an LRU provider pool (cap 10) and React context so the editor can open any document by `docName`. Enable future tabbed editing without re-architecture.

## Non-Goals

- File tree sidebar UI (separate PR, consumes `openDocument()`)
- Tabbed editor chrome (pool enables it, separate PR builds it)
- URL routing / deep links (can layer on later)
- Document list API (parallel spec: `2026-04-10-document-list-api`)
- MCP tool revival (parallel spec: `2026-04-10-mcp-write-tools`)

## Package boundary

**This spec touches `packages/app/` and one fix in `packages/server/`.** No CLI or MCP changes.

---

## Design

### ProviderPool

**Location:** `packages/app/src/editor/provider-pool.ts`

Plain TypeScript class (not a React hook). Owns WebSocket connections, survives React re-renders. The pool is the single source of truth — React state is derived.

```
ProviderPool
├── entries: Map<docName, PoolEntry>
├── lruOrder: string[]
├── maxSize: 10
├── open(docName): PoolEntry
├── close(docName): void
├── setActive(docName): void
├── getActive(): PoolEntry | null
├── has(docName): boolean
└── dispose(): void

PoolEntry {
  provider: HocuspocusProvider
  observerCleanup: (() => void) | null
  syncState: 'connecting' | 'synced' | 'disconnected'
  docName: string
  lastAccessedAt: number
}
```

**Eviction:** When `entries.size >= maxSize` and a new doc opens, evict the LRU entry (never the active doc). Order: `provider.disconnect()` first (stops Y.Doc updates), then `observerCleanup()`, then remove from map. Re-opening an evicted doc is a fresh sync from server.

### DocumentContext

**Location:** `packages/app/src/editor/DocumentContext.tsx`

```typescript
interface DocumentContextValue {
  activeDocName: string | null
  activeProvider: HocuspocusProvider | null
  syncState: 'connecting' | 'synced' | 'disconnected'
  openDocument: (docName: string) => void
  closeDocument: (docName: string) => void
}
```

`<DocumentProvider>` wraps the app in `App.tsx`, holds the pool in a `useRef`, and exposes context. Pool state changes flow to React via callbacks → `setState`.

### Observer lifecycle

Each `PoolEntry` stores its own `observerCleanup` function.

Typing state is already per-document — `observers.ts` uses `WeakMap<Y.Doc, TypingState>` (line 80) and `markUserTyping(doc: Y.Doc)` takes a doc parameter (line 95). TiptapEditor already calls `markUserTyping(provider.document)` (line 183). No changes needed to observer internals for multi-document support.

`setupObservers()` returns a cleanup function. On eviction, the pool calls `provider.disconnect()` first, then the cleanup function.

### Component refactors

| Component | Change |
|-----------|--------|
| **TiptapEditor** | Remove `DOC_NAME`, `singletonProvider`, module-level `observerCleanup`. Consume provider from context. Key on `docName` to force remount on switch. |
| **SourceEditor** | Already receives `ytext` + `provider` as props — these come from context now. Key on `docName` for `yCollab` rebinding. |
| **EditorPane** | Remove `useState<HocuspocusProvider>`. Consume from context. |
| **EditorArea** | Remove `onProviderReady` callback. Consume from context. |
| **EditorHeader** | Show `activeDocName` instead of hardcoded `untitled.md`. Show sync state. |
| **AgentUndoButton** | Pass `activeDocName` in undo-status poll and undo/redo requests. Disable when null. |
| **PresenceBar** | Receives provider from context instead of prop. |
| **usePresence** | Keyed on provider instance — re-attaches awareness listener on switch. |

### Blank state

When `activeDocName` is `null` (app load, or after closing last doc):
- Editors not rendered. EditorArea shows "No document open" placeholder.
- Mode toggle, AgentUndoButton disabled. PresenceBar empty.
- Accepted regression: app is unusable until sidebar PR ships.

### Persistence bug fix

`packages/server/src/persistence.ts` line 363 — add `mkdir` before `writeFile` for nested docName support:
```typescript
await mkdir(dirname(filePath), { recursive: true });
await writeFile(tmpPath, markdown, 'utf-8');
```

### E2E test updates

Replace `window.__hocuspocusProvider` (16 refs across `ux-interactions.spec.ts`, `crdt-stress.spec.ts`) with `window.__providerPool` + `window.__activeProvider` getter.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Observer cleanup race during eviction | Medium | Disconnect provider first, then cleanup |
| Memory from 10 concurrent Y.Docs | Low | ~25KB per doc, 10 = ~250KB |
| SourceEditor/TiptapEditor flash on doc switch | Medium | Accepted trade-off — `yCollab` binding requires remount |

## Acceptance Criteria

1. Opening a document by `docName` creates a provider, syncs, and renders in both editors
2. Opening an 11th document evicts the LRU provider (not the active one)
3. Switching to a cached (non-evicted) document reuses the provider without re-syncing
4. Re-opening an evicted document creates a fresh provider and syncs from server
5. Nested docNames (e.g., `articles/my-doc`) work end-to-end: open, edit, persist, re-open
6. Persistence creates parent directories for new nested documents
7. AgentUndoButton polls/acts on the active document, not `test-doc`
8. Blank state renders when no document is open

## Agent Constraints

**SCOPE:**
- `packages/app/src/editor/` — provider-pool.ts (new), DocumentContext.tsx (new), TiptapEditor.tsx, SourceEditor.tsx, observers.ts
- `packages/app/src/components/` — App.tsx, EditorPane.tsx, EditorArea.tsx, EditorHeader.tsx
- `packages/app/src/presence/` — AgentUndoButton.tsx, PresenceBar.tsx, use-presence.ts
- `packages/server/src/persistence.ts` — mkdir fix
- E2E test files referencing `window.__hocuspocusProvider`

**EXCLUDE:**
- `packages/app/src/components/FileSidebar.tsx` (separate PR)
- `packages/server/src/api-extension.ts` (parallel spec)
- `packages/cli/` (parallel spec)

**STOP_IF:**
- Changes affect Y.Doc schema or shared extensions
- Changes break bidirectional observer sync contract
