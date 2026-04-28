# Sidebar Event-Driven File Invalidation

**Status:** Implemented
**Created:** 2026-04-28
**Feature branch:** `feat/sidebar-event-invalidation`

---

## Problem Statement

`FileSidebar` should update from server/file-system change signals instead of relying on static state or recurring polling. When a new markdown file appears on disk, including files written outside the UI path, the sidebar should pick it up promptly without requiring manual refresh or waiting for a polling interval.

This completes the client-side consumer implied by the prior push-based sidebar work: CC1 file signals already provide a reusable invalidation mechanism, and the sidebar should use that mechanism as the source of truth for file-list refresh.

## Goals

- Replace recurring sidebar polling with event-driven invalidation from the existing file-change signal path.
- Ensure new, deleted, renamed, or moved markdown files on disk appear in the sidebar after the signal-driven refresh.
- Keep a bounded recovery path for missed events: initial load, reconnect, and tab visibility/focus should reconcile with `GET /api/documents`.
- Preserve current sidebar layout, file tree interactions, active document selection, and small-width push behavior.

## Non-Goals

- No sidebar visual redesign.
- No replacement of the file tree implementation or migration to `@pierre/trees`.
- No new transport such as SSE or a dedicated WebSocket endpoint.
- No optimistic UI for file writes before the server/file watcher confirms the change.
- No changes to server-side CC1 signal payload shape unless investigation proves the existing contract is missing.

## Current State

- Prior CC1 work defines the sidebar freshness contract as a pure signal payload `{ v: 1, ch: string, seq: number }`, with clients resolving the signal by fetching the canonical endpoint ([V0-2 sidebar push spec](../2026-04-13-v0-2-sidebar-push/SPEC.md)).
- The app mounts `SystemDocSubscriber` at the root, and that subscriber bridges CC1 derived-view signals into `emitDocumentsChanged([p.ch])` for app-local consumers (`packages/app/src/App.tsx`, `packages/app/src/components/SystemDocSubscriber.tsx`, `packages/app/src/lib/documents-events.ts`).
- `FileSidebar` is a layout shell; document-list freshness currently lives in `FileTree` (`packages/app/src/components/FileSidebar.tsx`, `packages/app/src/components/FileTree.tsx`).
- `FileTree` already performs an initial `/api/documents` fetch, refreshes on window focus/visibility, and subscribes to `subscribeToDocumentsChanged`; when `channels` includes `files`, it fetches `/api/documents` again (`packages/app/src/components/FileTree.tsx`).
- The current implementation is event-driven, not interval-polling: no recurring document-list `setInterval` was found in `FileTree`/`FileSidebar` (`packages/app/src/components/FileTree.tsx`, `packages/app/src/components/FileSidebar.tsx`).
- The remaining gap is request discipline and regression coverage: every `files` event calls `refreshDocs()` immediately, so a burst of signals can create overlapping `/api/documents` fetches instead of one in-flight request plus one trailing refresh (`packages/app/src/components/FileTree.tsx`).

## Requirements

### Functional

1. `FileSidebar` performs an initial `GET /api/documents` on mount or equivalent bootstrap.
2. `FileSidebar` subscribes to the app's existing CC1/file-signal mechanism and refreshes the document list when it receives a `files` invalidation signal.
3. The sidebar does not use a recurring `setInterval` or static-only document list as its freshness mechanism.
4. Multiple rapid file signals coalesce on the client so at most one refresh is in flight, with one trailing refresh if another signal arrives while fetching.
5. Unknown/malformed non-file signals are ignored without crashing the app.
6. Reconnect or provider recycle paths continue to trigger one full refresh so missed file-system events are repaired.
7. The refreshed document list preserves current active-document highlighting and expanded-folder behavior as far as existing logic allows.
8. Local UI file operations (`create`, `rename`, `delete`, `move`) keep emitting the same documents-changed channels they emit today so backlinks/graph consumers are not regressed.

### Acceptance Criteria

- Creating a new `.md` file on disk while the app is open causes the file to appear in the sidebar without manual reload.
- Deleting a `.md` file on disk while the app is open removes it from the sidebar after the signal-driven refresh.
- Renaming or moving a `.md` file on disk updates the sidebar to show the new path and remove the old path.
- A burst of many disk file changes does not produce unbounded concurrent `/api/documents` requests.
- Existing user-driven file create, rename, delete, navigation, and active selection behaviors continue to work.
- Tests fail if a recurring sidebar polling interval is reintroduced.

## Technical Direction

Use the existing Hocuspocus/ProviderPool `__system__` CC1 path and the existing `documents-events` DOM event bridge. Do not introduce a second event bus or transport. The implementation should likely stay in `FileTree`, because that is where the document list state and `/api/documents` fetch already live.

The refresh policy should be signal-then-fetch, not delta patching. The canonical file list remains `/api/documents`; CC1 only invalidates that cache.

The main code change should be a small refresh scheduler around the existing fetch:

- `requestRefresh()` starts a refresh immediately when none is running.
- If a refresh is already in flight, it records one pending refresh instead of starting another request.
- When the current refresh settles, a pending refresh runs once.
- Unmount prevents state updates and prevents the scheduler from issuing further fetches.

## Implementation Notes

- Added `createRefreshScheduler` in `packages/app/src/lib/refresh-scheduler.ts` as a small pure helper for one-in-flight-plus-one-trailing refresh semantics.
- Wired `FileTree`'s initial document load, focus/visibility recovery, and `files` invalidation subscription through that scheduler.
- Hardened `packages/app/src/lib/documents-events.ts` so malformed app-local custom events are normalized before subscribers receive channel lists.
- Preserved the existing `SystemDocSubscriber` -> `emitDocumentsChanged([p.ch])` CC1 bridge and the local file-operation emissions of `['files', 'backlinks', 'graph']`.

## Test Plan

- Unit or component-level coverage for the sidebar refresh scheduler: duplicate or burst `files` signals collapse to bounded fetches.
- Integration coverage around the existing CC1-derived `emitDocumentsChanged(['files'])` path if an existing harness supports stateless messages.
- Playwright or equivalent browser coverage: write/create a page via API or disk-triggering endpoint and assert the sidebar row appears without waiting for a polling interval.
- Regression search/test that `FileSidebar` no longer contains a recurring `setInterval` polling loop for documents.

## Verification

- `bun test packages/app/src/lib/documents-events.test.ts packages/app/src/lib/refresh-scheduler.test.ts packages/app/src/components/file-tree-refresh.test.ts` passes.
- `bun run lint && bun run typecheck && bun test packages/app/src/lib/documents-events.test.ts packages/app/src/lib/refresh-scheduler.test.ts packages/app/src/components/file-tree-refresh.test.ts` passes.

## Open Questions

1. Should the scheduler live inline in `FileTree` or be extracted to a small hook/helper for direct unit testing?
2. Which existing test layer gives the most stable assertion for "new disk file appears in sidebar": integration harness, Playwright, or a component-level test around `emitDocumentsChanged`?
3. Which existing tests should be extended: older CC1 sidebar E2E, file sidebar tests, or provider-pool tests?
4. Do we need a user-facing loading state on trailing refresh, or should event-driven refreshes stay silent unless they fail?
