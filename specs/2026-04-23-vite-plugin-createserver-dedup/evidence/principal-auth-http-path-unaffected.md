---
name: principalAuthExtension is WS-only — HTTP agent paths unaffected
description: Resolves DC-M5. Confirms that adding principalAuthExtension in dev mode does not change agent-sim or Playwright seed-path behavior. HTTP writes use extractAgentIdentity; principalAuthExtension runs on Hocuspocus onAuthenticate (WS handshake).
sources:
  - packages/server/src/standalone.ts:270-311 (principalAuthExtension definition)
  - packages/server/src/api-extension.ts (extractAgentIdentity call sites)
gathered: 2026-04-23
confidence: HIGH (code-traced)
---

# HTTP agent paths are not touched by `principalAuthExtension`

## The separation of concerns

`principalAuthExtension` (`standalone.ts:270-311`) is a Hocuspocus **Extension** whose only hook is `onAuthenticate`. This fires during the WebSocket handshake (the browser's `HocuspocusProvider` passes a token in its CONNECT message; Hocuspocus surfaces that token via `onAuthenticate`'s payload).

HTTP paths (`/api/agent-write`, `/api/agent-write-md`, `/api/agent-patch`, `/api/agent-undo`, `/api/save-version`, `/api/test-reset`, etc.) go through Hocuspocus's `onRequest` hook → `createApiExtension` → `extractAgentIdentity`. That function (`api-extension.ts:1146`) reads the body for `agentId` / `agentType` / `agentSessionId` / etc. fields. It never touches the `onAuthenticate` path.

Grep verification:

```bash
$ grep -c "onAuthenticate" packages/server/src/api-extension.ts
0

$ grep -c "extractAgentIdentity" packages/server/src/api-extension.ts
13
```

Every mutating HTTP handler in `api-extension.ts` routes identity through `extractAgentIdentity`. None of them consult a principalAuthExtension-populated context.

## Agent-sim is HTTP-only

`packages/app/src/server/agent-sim.ts` — the agent simulator — hits HTTP endpoints (`/api/agent-write`, `/api/agent-write-md`). It does not open a WS connection. `principalAuthExtension` fires on WS only, so the sim is unaffected.

## Playwright seeding is HTTP-only

`packages/app/tests/stress/*.e2e.ts` seeds docs via `POST /api/create-page` and `POST /api/agent-write-md` (per `docs-open.e2e.ts`'s `seedDocs` helper referenced in AGENTS.md "Per-test docName isolation"). All HTTP. Unaffected.

## The WS path degrades gracefully for tokenless connections

Even for the WS path, `principalAuthExtension.onAuthenticate` early-returns on missing token:

```ts
// standalone.ts:270+
async onAuthenticate(payload) {
  try {
    const tokenStr = payload.token;
    if (!tokenStr) return;  // ← tokenless connection: no-op
    // ... parse + pin principal ...
  } catch {
    // Invalid/missing token — connection proceeds without principal context
  }
}
```

The outer `try/catch` swallows any parse failure. Tokenless or invalid-token connections proceed with `ctx.principalId` unset — same behavior as today's dev mode (which has no principalAuthExtension at all).

## Conclusion

Adding `principalAuthExtension` to dev via `createServer()` affects exactly one behavior: a browser tab that passes a valid token gets `ctx.principalId` pinned server-side. Every other code path (HTTP agent writes, MCP `ok mcp` WS, agent-sim, Playwright seeders, tokenless browser connections) is unchanged.

**R4 (the LOW-severity risk entry for this concern) stands as written.** DC-M5's concern is addressable with this trace — no additional SCOPE item or test-seeding adjustment is required.
