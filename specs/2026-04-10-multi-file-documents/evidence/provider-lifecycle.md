---
title: Client-side provider lifecycle and coupling analysis
sources:
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/editor/observers.ts
  - packages/app/src/components/EditorPane.tsx
  - packages/app/src/components/EditorArea.tsx
  - packages/app/src/presence/use-presence.ts
---

## Current singleton pattern

TiptapEditor.tsx:23 — `const DOC_NAME = 'test-doc'` hardcoded.
TiptapEditor.tsx:59-100 — Module-level singleton, created once, persists for app lifetime.
Survives React StrictMode double-mount by design.

## Tight coupling points (must be addressed for provider pool)

1. **DOC_NAME is module-level constant** — needs to become dynamic prop/context
2. **Observer setup is one-shot** (TiptapEditor.tsx:72-91) — waits for `synced`, never cleaned up between provider switches
3. **observerCleanup at module level** (line 62) — breaks with multiple providers
4. **EditorPane manually tracks provider** via useState + callback (EditorPane.tsx:8, EditorArea.tsx:19-20)
5. **SourceEditor receives ytext + provider as props** (SourceEditor.tsx:11-14) — bound to specific instance
6. **usePresence() watches specific provider.awareness** (use-presence.ts:15-50) — breaks on provider switch
7. **Activity/metadata maps accessed directly** from provider.document (TiptapEditor.tsx:205, 350)

## What works well for the pool approach

- AgentUndoButton polls HTTP API — server-side is already per-document, but client currently sends NO docName param (always hits default `test-doc`). Must be updated to pass activeDocName.
- Server-side sessions already use Map<docName, DirectConnection> — same pattern
- Observer setup/cleanup functions are already paired (setupObservers returns cleanup fn)

## Abstractions needed

1. **ProviderPool** — Map<docName, HocuspocusProvider> with LRU eviction (cap: 10)
2. **React Context** for active document — replaces manual provider prop-drilling
3. **Observer lifecycle per provider** — cleanup stored in pool, called on eviction
4. **Provider ready state** — track sync status per provider in the pool
