---
title: Hocuspocus subscriber-presence check — cost & feasibility (SUPERSEDED)
type: evidence
status: superseded
superseded_by: evidence/hocuspocus-subscriber-api.md
sources:
  - packages/server/src/standalone.ts
  - packages/server/src/api-extension.ts
  - '@hocuspocus/server@4.0.0-rc.1 (external)'
---

> **SUPERSEDED 2026-04-15.** The factual claim below — that Hocuspocus has no public subscriber API — is **wrong**. `@hocuspocus/server`'s `Document` class exposes `connections`, `getConnectionsCount`, `getConnections`, `getClients`, and `hasConnection` publicly. See `evidence/hocuspocus-subscriber-api.md` for the corrected finding. Kept here only as a trail of what was believed during the first round of investigation, because D4 was demoted on this basis and later reopened.


# Subscriber-presence check — what it really costs

## What was assumed in conversation

Treating "is a client attached to `{docName}`?" as a cheap introspection lookup.

## What investigation showed

Hocuspocus 4.0-rc.1 does **not** expose a public API for per-room subscriber enumeration. There is no `.getConnections()` / `.getSubscribers()` / `.getClients()` on either the `Server` or `Document` classes.

What's available:
- `hocuspocus.documents.get(docName)` — tells you the room is *loaded*, not whether anyone is subscribed.
- `hocuspocus.closeConnections(docName)` — internal connection tracking exists but isn't publicly iterable.

## Plumbing required to actually implement D4

1. Register a Hocuspocus Extension with `onConnect` / `onDisconnect` / `onAuthenticate` hooks.
2. Maintain an in-memory `Map<docName, Set<connectionId>>` inside that extension.
3. Expose it to MCP tools either by:
   - Calling through a shared in-process module (works only if MCP server and Hocuspocus are same process — true today in local, unclear in cloud), or
   - Adding an HTTP endpoint on the existing `api-extension.ts` (works in all deploy shapes, slight latency).
4. Write tools hit that interface per edit call and decorate the response with a `warning` when count is 0.

## Implications

- Non-trivial. Not "one-liner." Adds a new extension + new IPC surface + new test matrix (connect/disconnect timing, room loaded but no subscribers, etc.).
- Only works robustly when MCP and Hocuspocus are co-located (same process). In a split cloud deploy (MCP stdio subprocess + Hocuspocus on a separate host), we need the HTTP route *and* the MCP server has to be configured with the Hocuspocus admin URL.
- Value proposition: catches the "agent edits; user's tab is closed/wrong doc" case. Without it, agent blindly assumes preview is attached.

## Options for the spec

- **(a) Keep D4 as P0 (full plumbing now).** Correct but adds real work to the MVP. Adds ~1–2 days.
- **(b) Demote to Future Work (Identified).** Ship `previewUrl` + CLAUDE.md guidance first; measure how often the "preview not open" problem actually happens before investing.
- **(c) Lighter variant: client-side heartbeat.** Browser editor writes a short-TTL key to Hocuspocus (or localStorage visible to server) every N seconds; MCP reads the key. Similar plumbing, different shape, same amount of work.

## Recommendation

(b) — demote to Future Work unless the user considers the feature gap blocking. Evidence is that the agent can *already* include the `previewUrl` in its own chat output before editing, giving the user a one-click way to open the doc; that's ~80% of the value for ~10% of the work.
