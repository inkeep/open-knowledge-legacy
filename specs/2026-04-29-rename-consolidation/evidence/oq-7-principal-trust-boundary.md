---
topic: principalId trust boundary in HTTP handlers
sources:
  - packages/server/src/standalone.ts (principal-auth extension, ~385-410)
  - packages/server/src/persistence.ts (resolveWriterFromOrigin, ~76-135)
  - packages/core/src/principal.ts (loadPrincipal, ~32-98)
  - packages/server/src/api-extension.ts (handleRename ~3798, handleRollback ~3013)
  - packages/app/src/components/EditorHeader.tsx (~239-242)
  - packages/app/src/components/TimelinePanel.tsx (~537-540)
confidence: HIGH
date: 2026-04-29
status: investigated
---

# OQ-7: Should the server trust body-supplied `principalId`?

## Findings

### Architecture: single-principal server

The OK server is **strictly single-principal**. Each server instance loads ONE local human user's principal from `<contentDir>/.open-knowledge/principal.json` at boot (`standalone.ts:1223`).

The `Principal` type:
- `id` — stable UUID (`principal-<UUID>`)
- `display_name`, `display_email` — sourced from git config or synthesized
- `source` — `'git-config'` or `'synthesized'`
- `created_at` — immutable after first load

`standalone.ts:385-391` explicitly comments: this is a "single-user loopback deployment"; "when multi-principal support is ever added, upgrade this to a signed handshake."

### Where principal identity actually flows today

The HTTP layer is **stateless** with respect to principal — no handler parses `principalId` from request body today. The authenticated path is the WebSocket layer:

1. Browser calls `GET /api/principal` at startup → receives the server's single principal.
2. Client embeds principal `id` in a Hocuspocus auth token.
3. `onAuthenticate` (`standalone.ts:450-462`) parses the token; ONLY sets `connection.context.principalId` when the claim matches the loaded principal — mismatched claims are logged + dropped.
4. On Y.Doc transactions, `resolveWriterFromOrigin` (`persistence.ts:106-131`) consumes the verified `ctx.principalId` and returns the principal writer; on missing/mismatched context it falls back to `SERVICE_WRITER` (line 131). The actual verification gate is `onAuthenticate`, not `resolveWriterFromOrigin`.

So principal identity is **already authenticated** for CRDT writes via the WS auth token. The HTTP handlers don't need to re-establish identity — they can ask the server for its loaded principal directly.

### Today's UI rename / rollback payloads

- `EditorHeader.tsx:239-242` rename: `{ docName, newDocName }` — no identity field.
- `TimelinePanel.tsx:537-540` rollback: `{ docName, commitSha }` — no identity field.

Anonymous by D22 design — no `agentId`, no other identity, no contributor entry.

### Security implication of body-supplied `principalId`

If a handler trusts a body-supplied `principalId` without verification:
- A client could send `{ ..., principalId: 'principal-fake-uuid' }`.
- Severity is bounded by single-principal: there's only ONE legitimate principal ID on any server. A forged ID would be obviously wrong (won't match git config display name).
- But: it sets a precedent. Future multi-principal work would inherit a "trust the body" pattern that's incompatible with multi-principal correctness.

## Conclusion

**Don't accept `principalId` from HTTP body.** Instead:

- HTTP rename/rollback handlers call `getPrincipal()` (the server-loaded principal) directly when attributing.
- D22 amendment becomes: agent (from body) → server's principal (from `getPrincipal()`) → anonymous fallback (if `principal.json` absent or load failed, which is a server-bootstrap failure case anyway).
- UI payloads do NOT change. No `principalId` field added.
- Same approach for both `handleRenamePath` and `handleRollback`.

## Implications for spec design

This **simplifies** the spec significantly:

1. **No UI client changes needed.** FileTree.tsx and TimelinePanel.tsx payloads stay as today.
2. **Smaller blast radius.** Server-side change only.
3. **Still preserves D22 anonymity intent.** Anonymous is now the "no principal loaded" edge case (corrupt or pre-bootstrap state), not a routine path. UI clicks attribute to the principal automatically.
4. **Existing precedent reuse.** `resolveWriterFromOrigin` already verifies `principalId` from a different (auth token) path; the HTTP handlers call into the same `getPrincipal()` source of truth.

This changes:
- FR5 (was: "UI payloads include principalId"): rewrite as "Handlers fall back to `getPrincipal()` when no `agentId` is supplied."
- Decision D-A1 (D22 amendment): scope adjusted — amendment is purely server-side, no client coordination.
- Open Question OQ-6 precedence: simpler — agent (body) takes precedence over server's auto-principal lookup. No body-vs-body conflict possible.
- Section 16 SCOPE: drop FileTree.tsx and EditorPane.tsx from edit list.

## Future-proofing

If the server ever supports multi-principal:
- The HTTP layer would need an authenticated session (cookie, signed token).
- `getPrincipal(req)` would resolve from session, not from `principal.json`.
- The handler-side change is the same shape: ask `getPrincipal()` for ground truth, don't trust body.

Encoding this pattern now — even in the single-principal model — keeps the migration to multi-principal a single-site change rather than a body-trust audit.
