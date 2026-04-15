# Evidence: MCP SDK Extraction Surface

**Dimension:** D1 — MCP SDK extraction surface
**Date:** 2026-04-14
**Sources:** `@modelcontextprotocol/sdk@1.29.0` (installed in project)

---

## Key files referenced

- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:270-293` — `_oninitialize()` + `getClientVersion()`
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:121-125` — `Server` public API
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:14-18` — `McpServer` class with `readonly server: Server`
- `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:318` — `fullExtra` construction with `sessionId`
- `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts:173-226` — `RequestHandlerExtra` type
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js` — `StdioServerTransport` (no sessionId)
- `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts:499` — `ImplementationSchema`

---

## Findings

### Finding: `Implementation` type has required `name` + `version` plus optional rich metadata
**Confidence:** CONFIRMED
**Evidence:** `types.d.ts:499`

```typescript
// ImplementationSchema fields:
{
  name: string;           // required
  version: string;        // required
  title?: string;         // optional
  description?: string;   // optional
  websiteUrl?: string;    // optional
  icons?: Array<{
    src: string;
    mimeType?: string;
    sizes?: string[];
    theme?: "light" | "dark";
  }>;                     // optional
}
```

**Implications:** `name` and `version` are guaranteed present. Rich metadata (title, description, icons) is optional and unlikely to be populated by most harnesses.

---

### Finding: `clientInfo` stored as `_clientVersion` during `initialize`, accessible via `getClientVersion()`
**Confidence:** CONFIRMED
**Evidence:** `server/index.js:270-293`

```javascript
// Server._oninitialize():
this._clientVersion = request.params.clientInfo;   // line 273

// Public accessor:
getClientVersion() {                                // line 291
    return this._clientVersion;
}
```

**Implications:** Available immediately after the `initialize` handshake completes. Returns `undefined` before handshake.

---

### Finding: `McpServer.server` is a public readonly `Server` instance
**Confidence:** CONFIRMED
**Evidence:** `server/mcp.d.ts:18`

```typescript
export declare class McpServer {
    readonly server: Server;  // <-- public access
}
```

**Access pattern:** `mcpServer.server.getClientVersion()?.name`

---

### Finding: `extra.sessionId` is always `undefined` for stdio transport
**Confidence:** CONFIRMED
**Evidence:** `server/stdio.js` — no `sessionId` property set. `protocol.js:318` constructs `fullExtra.sessionId = capturedTransport?.sessionId` which is undefined for stdio.

**Implications:** For stdio (Open Knowledge's transport), `connectionId` must be server-generated. Cannot rely on transport-provided identity.

---

### Finding: `oninitialized` callback fires after handshake, guaranteeing `clientInfo` availability
**Confidence:** CONFIRMED
**Evidence:** `server/index.d.ts:84`

```typescript
oninitialized?: () => void;
```

**Implications:** Wire `mcpServer.server.oninitialized` to capture clientInfo and generate connectionId.

---

### Finding: `extra` in tool handlers contains `requestId` (per-call) but no stable identity
**Confidence:** CONFIRMED
**Evidence:** `protocol.d.ts:173-226`

```typescript
type RequestHandlerExtra = {
  signal: AbortSignal;
  sessionId?: string;          // undefined for stdio
  requestId: RequestId;        // changes per JSON-RPC message
  authInfo?: AuthInfo;         // undefined for stdio
  requestInfo?: RequestInfo;   // undefined for stdio
  // ...
};
```

**Implications:** `requestId` is per-call, not usable for identity. `authInfo` and `requestInfo` are HTTP-only.

---

## Identity data availability by lifecycle stage

| Stage | Available Data | Accessor |
|-------|---------------|----------|
| Server creation | Nothing from client | N/A |
| After `initialize` | `clientInfo: { name, version }` | `server.server.getClientVersion()` |
| After `initialized` (callback) | Same, guaranteed populated | `server.server.oninitialized` + `getClientVersion()` |
| In tool handler | `extra.sessionId` (undefined for stdio), `extra.requestId` (per-call) | Second arg to tool callback |

---

## Gaps / follow-ups

- The SDK does not provide a `connectionId` for stdio — the server must generate one (UUID at startup)
- No mechanism exists to distinguish multiple tool calls from the same client within a session — all share the same `clientInfo`
