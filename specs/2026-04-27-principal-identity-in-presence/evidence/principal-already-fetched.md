---
sources:
  - packages/server/src/principal.ts
  - packages/server/src/api-extension.ts
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/editor/provider-pool.ts
  - packages/app/src/editor/tab-identity.ts
  - packages/core/src/types/principal.ts
captured: 2026-04-27
---

# Principal data is already fetched on the client (but discarded except for `id`)

## Server side — `loadPrincipal()` ([principal.ts:32](packages/server/src/principal.ts:32))

- Reads `git config user.name` / `user.email` via `simpleGit` with a 3s timeout.
- Sanitizes via `sanitizeGitIdentity()`.
- Persists `<contentDir>/.open-knowledge/principal.json`:
  ```json
  {
    "id": "principal-<UUID>",
    "display_name": "Miles Kaming-Thanassi",
    "display_email": "miles@inkeep.com",
    "source": "git-config" | "synthesized",
    "created_at": "2026-04-22T..."
  }
  ```
- `id` and `created_at` are immutable across boots.
- `display_name` and `display_email` refresh on each boot from the live git config.
- When git config is absent, `source: 'synthesized'` and falls back to:
  - `display_name = 'Local User'`
  - `display_email = 'principal-<short-id>@openknowledge.local'`

## HTTP endpoint — `GET /api/principal` ([api-extension.ts:3339](packages/server/src/api-extension.ts:3339))

```typescript
async function handlePrincipal(req, res) {
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
  const principal = getPrincipal?.() ?? null;
  if (!principal) { json(res, 404, { error: 'Principal not available' }); return; }
  json(res, 200, principal);
}
```

- Returns the full `Principal` object as JSON.
- 404 only if `getPrincipal` returns null (rare — would indicate a server-side init failure).
- No auth gate beyond standard server access (loopback / Host-header on the server).

## Type — `Principal` ([packages/core/src/types/principal.ts:3](packages/core/src/types/principal.ts:3))

```typescript
export type Principal = {
  id: PrincipalId;
  display_name: string;
  display_email: string;
  source: 'git-config' | 'synthesized';
  created_at: string;
};
```

Exported from `@inkeep/open-knowledge-core` — already available client-side.

## Client side — DocumentContext fetches but discards display fields ([DocumentContext.tsx:363-379](packages/app/src/editor/DocumentContext.tsx:363))

```typescript
// Fetch principal and wire tab identity so HocuspocusProvider includes
// {principalId, tabSessionId} in its auth token. ...
fetch('/api/principal')
  .then((r) => (r.ok ? r.json() : null))
  .then((principal: unknown) => {
    if (principal && typeof (principal as { id?: unknown }).id === 'string') {
      p.setTabIdentity({
        principalId: (principal as { id: string }).id,
        tabSessionId,
      });
    }
  })
  .catch(() => {
    // principal unavailable — pool opens providers with anonymous auth token
  });
```

- The fetch happens at `DocumentContext` mount.
- Only `principal.id` is consumed (for `setTabIdentity` on the pool).
- `display_name`, `display_email`, `source`, `created_at` are **discarded today** — they never reach React state, never reach awareness, never reach the presence bar.

## Auth-token flow — `tabId` is already principal-scoped via `tabSessionId`

[tab-identity.ts:1-12](packages/app/src/editor/tab-identity.ts:1):

> `tabSessionId` is generated once at module load — frozen for the lifetime of the browser tab. Two tabs opening the same document will have distinct `tabSessionId` values but share the same `principalId` (fetched from the server's principal record). This gives presence distinctness (each tab is a separate cursor/awareness entry) while grouping shadow-repo writes under a single `refs/wip/<branch>/<principalId>` ref.

- The auth-token side already established the principle: tabs are distinct in awareness, but share a principal.
- Awareness has no `principalId` field today, so the "share a principal" half is enforced only on the server-write side (auth-token claim → shadow-repo ref grouping).
- This spec extends the same principle to the awareness side: tabs are distinct (own clientId, own tabSessionId), but share a principalId for presence-aggregation purposes.

## Implication for the spec

The data is already on the client when `DocumentContext` mounts. The only additions needed:

1. **Lift the principal into React state** — `useState<Principal | null>(null)` in DocumentContext, set in the `.then()`.
2. **Expose via DocumentContext value** — add `principal: Principal | null` to `DocumentContextValue`.
3. **Add `principalId` field to `AwarenessUser`** in `packages/core/src/types/awareness.ts`.
4. **Merge at the awareness publication site** — TiptapEditor's effect reads both `useIdentity()` (sync, random fallback) and `useDocumentContext().principal`, publishes the resolved name/color/principalId.
5. **Dedupe in `usePresence()`** — when humans share a `principalId`, collapse to one `HumanParticipant`.

No new endpoint, no new fetch, no async refactor of `getIdentity()`.
