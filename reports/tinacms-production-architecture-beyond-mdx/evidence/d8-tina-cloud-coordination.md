Dimension: D8 — Tina Cloud Coordination Layer
Date: 2026-04-13
Sources: TinaCMS monorepo (packages/tinacms/, packages/@tinacms/datalayer/), tina.io docs, tina.io/pricing, tina.io/blog, tina.io changelog, GitHub discussions, competitor marketing

## Key Files Referenced

- `packages/tinacms/src/components/TinaCloudProvider.tsx` — cloud feature flag checks (only 'editorial-workflow')
- `packages/@tinacms/datalayer/src/index.ts` — Bridge interface definition, IsomorphicBridge.put (no version param)
- `packages/@tinacms/graphql/src/database/index.ts` — Database.put, no OCC/versioning
- `packages/@tinacms/cli/src/next/commands/dev/` — editorial-workflow-constants.ts

## Findings

### CONFIRMED: Zero real-time presence or awareness [Confidence: HIGH]

Exhaustive search across all TinaCMS packages, documentation, pricing pages, blog posts, and changelog confirms: Tina Cloud adds zero real-time presence, cursor sharing, awareness broadcasting, or any form of "who else is editing this document" UX.

Search terms that returned zero meaningful results across all sources:
- `presence`, `cursor sharing`, `awareness`, `who is editing`, `active editors`
- `real-time collaboration`, `co-editing`, `multiplayer`, `simultaneous editing`
- `yjs`, `automerge`, `CRDT`, `hocuspocus`, `operational transform`
- `websocket` (for editor sync — WebSocket exists only for Tina Cloud's live preview, not collaboration)

### CONFIRMED: No document locking [Confidence: HIGH]

No document-level, page-level, or field-level locking exists in Tina Cloud. The blog post "Tina Joins SSW" (2024) described locking as "down the road" — it was never shipped.

Search terms returning zero results: `editLock`, `docLock`, `pageLock`, `fileLock`, `lockFor`, `isLocked`, `acquireLock`, `lock` (as user-facing feature). The only `Lock` in the codebase is `AsyncLock` used for HTTP response cache deduplication — not user-facing.

A competitor (React Bricks) publicly contrasts their document locking feature against Tina's absence: "Unlike TinaCMS, React Bricks provides built-in document locking to prevent editing conflicts." This external signal corroborates the absence.

### Editorial Workflow is branch+PR automation, not collaboration [Confidence: HIGH]

The Editorial Workflow (Tina Cloud feature, not in OSS) provides:
- Branch creation per content change
- PR creation when content is "submitted for review"
- PR merge from the CMS UI
- FSM-tracked indexing state per branch

It does NOT provide:
- Merge conflict resolution UI
- Three-way merge logic
- Content diff visualization
- Any awareness of concurrent editors on the same branch/document

GitHub handles all merging. If two editors create conflicting changes on the same branch, GitHub's merge UI is the resolution path — Tina Cloud adds nothing on top.

### Content API adds zero concurrency control [Confidence: HIGH]

The Bridge interface's `put` method signature is:
```ts
put(filepath: string, data: string): Promise<void>;
```

No version parameter, no ETag, no `If-Match`, no compare-and-swap. `IsomorphicBridge.put` (local git) does `writeBlob → updateTree → writeCommit → writeRef` with no freshness check. The `GitHubProvider` uses `force: true` on `writeRef`, explicitly overriding any remote state.

The `Database.put` method follows the same pattern — no versioning, no OCC tokens, pure last-writer-wins.

### RBAC exists but with zero multi-editor awareness [Confidence: HIGH]

Tina Cloud provides role-based access control:
- Admin role (full access)
- Editor role (content editing, no schema changes)
- Enterprise SSO (via WorkOS integration, on roadmap)

These are authorization gates (who CAN edit), not coordination mechanisms (who IS editing). Two Admins or two Editors can edit the same document simultaneously with no warning, no lock, and no awareness of each other. The last save wins silently.

### Only cloud feature flag in OSS is 'editorial-workflow' [Confidence: HIGH]

`TinaCloudProvider.tsx` checks a single feature flag: `'editorial-workflow'`. No other cloud feature flags exist in the OSS codebase. This means all other Tina Cloud features are either:
- Entirely server-side (not visible in client code)
- Enabled for all cloud users without feature gating

Given the absence of any collaboration-related code paths in the client, the "entirely server-side" option would require a collaboration protocol with zero client-side code — implausible for real-time features.

### tinaLockVersion is schema metadata, not concurrency control [Confidence: HIGH]

The `tinaLockVersion` field appears in the database layer and is sometimes confused with document locking. It is a schema format version marker (tracking which version of TinaCMS's internal schema representation was used to generate the lock file). It has no relationship to document-level concurrency control or editor locking.

## Negative Searches

- No evidence of any WebSocket-based collaboration protocol in Tina Cloud client code
- No evidence of presence/awareness API endpoints in the Tina Cloud API surface
- No evidence of document locking in any Tina Cloud pricing tier (Free, Team, Enterprise)
- No evidence of merge conflict resolution UI beyond GitHub's native PR merge interface
- No evidence of OCC (optimistic concurrency control) tokens on any write path

## Gaps

- Whether Tina Cloud's server-side code (not in OSS) includes any unpublished collaboration features — extremely unlikely given the total absence of client-side hooks, but cannot be 100% confirmed without access to the proprietary codebase
- Whether the "MCP Server (Coming Soon)" roadmap item might bundle locking/presence — no signals either way
- Whether SSW's enterprise consulting clients have requested or received custom locking solutions outside the product — possible but would be bespoke, not productized
