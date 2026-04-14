---
title: Why awareness on __system__ beats CC1 payload extension
description: Transport decision rationale — factual findings on CC1 contract, awareness semantics, activity Y.Map scope
sources:
  - packages/server/src/cc1-broadcast.ts
  - packages/app/src/lib/cc1.ts
  - packages/app/src/components/SystemDocSubscriber.tsx
  - CLAUDE.md
---

# CC1 vs. awareness — transport decision

## CC1 is pure-signal by contract

`packages/server/src/cc1-broadcast.ts` emits `{v:1, ch, seq}` payloads to `__system__` via `doc.broadcastStateless(JSON.stringify(payload))` with a 100ms debounce. The channel name is a hard-coded enum (`'files' | 'backlinks' | 'graph'`) in `packages/app/src/lib/cc1.ts:6`.

CLAUDE.md §CC1 documents the contract: "`ch` is a flat kebab-case string; `seq` is per-channel monotonic from server startup. **No event kind, no path, no docName — clients respond by re-fetching the channel's REST endpoint.**"

Adding a path payload to CC1 would fork this contract. Every CC1 consumer currently assumes "I got a signal, refetch my data" — there's no path-dispatch logic. Extending to carry `{agentId, docName}` would require: (a) a contract version bump, (b) every consumer updating its parser to handle `v:2`, (c) documentation rework.

## Activity Y.Map is per-doc

Agent writes already update a per-document `activity` Y.Map (`packages/server/src/api-extension.ts:669-675, 976-982`) with `{agentId, timestamp, type, description}`. This is the right primitive for per-doc UI (the activity-flash animation in the editor), but it's scoped to subscribers of that specific doc.

Using activity as the nav transport would require every client to subscribe to every doc simultaneously — breaks the lazy-loading model where clients only open a Y.Doc for the file currently being viewed.

## Awareness is global per connection

Yjs awareness is a per-Y.Doc side-channel where each peer publishes an ephemeral state keyed by its `clientID`. Every client subscribes to `__system__` on mount (via the existing `ProviderPool` + `SystemDocSubscriber`), so awareness on `__system__` reaches every tab automatically.

Key properties:

- **Auto-expiry:** the Yjs awareness protocol times out stale entries when a peer disconnects. No cleanup code needed for crashed agent sessions.
- **Per-peer isolation:** each agent session opens its own `DirectConnection` to `__system__` with a unique `clientID`. Concurrent agents get separate awareness entries; `pickPrimary()` just picks the latest-ts across all agent-classified entries.
- **Native primitive:** awareness is already the mechanism Open Knowledge uses for human cursors and editor mode (editing/idle). Agent focus is semantically the same — a per-peer ephemeral state property.

## `SystemDocSubscriber` already has what we need

`packages/app/src/components/SystemDocSubscriber.tsx` mounts a `HocuspocusProvider` for `__system__` and already handles `onStateless` for CC1. Extending it to `provider.awareness.on('change', handler)` is additive — no new component, no new mount point, no new transport.

## Decision summary

| Axis | CC1 + payload | Activity Y.Map | Awareness on `__system__` |
|------|---------------|----------------|---------------------------|
| Global reach (all clients see it) | Yes | No (per-doc only) | Yes |
| Forks existing contract | Yes (v1 → v2) | No | No |
| Per-agent isolation | Manual | Manual | Native (clientID) |
| Stale-entry cleanup | Manual | Manual | Auto (protocol timeout) |
| New wire code | Payload schema + parser | Cross-doc subscribe logic | None |

Awareness wins on every axis.
