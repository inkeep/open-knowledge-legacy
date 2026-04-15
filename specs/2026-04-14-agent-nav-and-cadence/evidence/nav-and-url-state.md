---
title: Browser navigation state — URL hash as the nav mechanism
description: How the editor currently determines which document is open; what programmatic nav looks like
sources:
  - packages/app/src/App.tsx
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/lib/doc-hash.ts
  - packages/app/src/editor/internal-link-helpers.ts
---

# URL-hash navigation

## Current state

- `DocumentContext` (`packages/app/src/editor/DocumentContext.tsx:6`) tracks `activeDocName` in React state.
- `NavigationHandler` in `App.tsx:14-29` syncs `window.location.hash` → `openDocument()` via `hashchange` event.
- Hash format: `#/<docName>?anchor=<anchor>` (`packages/app/src/lib/doc-hash.ts:23-26`).
- Internal links already navigate programmatically: `window.location.assign(toInternalHashHref(resolved))` in `packages/app/src/editor/internal-link-helpers.ts:20`.

## Programmatic nav primitive

Setting `window.location.hash = toInternalHashHref(docName)` fires `hashchange`, which the existing handler consumes. No new routing code needed.

The existing `toInternalHashHref` helper handles URL encoding of docName, preserving the existing format contract.

## Multi-tab semantics

URL hash is per-tab. Two browser tabs on the same origin don't share hash state. Each `hashchange` fires only in the tab whose URL changed.

This means agent-driven nav via `window.location.hash` will navigate whichever tabs are subscribed to the awareness change — all of them, independently. This is the documented v1 behavior (D5, non-goal: multi-tab leader election).

## Anchor preservation

Current hash format supports `#/<docName>?anchor=<anchor>`. When following agent nav, we don't preserve anchor — agent focus is at the doc level, not sub-doc. If a user was on `#/foo.md?anchor=heading-5` when pinned, and unpinned to follow the agent, the anchor would be dropped. Acceptable for v1.
