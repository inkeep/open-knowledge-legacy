---
topic: Agent-vs-human attribution + MCP SDK structuredContent support
sources:
  - packages/server/src/shadow-branch-gc.ts:38
  - packages/server/src/shadow-repo.test.ts:173
  - packages/server/src/shadow-repo.test.ts:377
  - packages/server/src/shadow-repo.test.ts:383
  - node_modules/@modelcontextprotocol/sdk/package.json (version 1.29.0)
  - node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:257
confidence: HIGH
---

# Two verifications for D12 + D10

## 1. Agent vs human attribution is built into `WriterIdentity.id`

`shadow-branch-gc.ts:38` shows a regex that matches writer ids against:
```
/\/(human-[^/]+|agent-[^/]+|upstream|server)$/
```

So `WriterIdentity.id` follows a strict prefix scheme: `human-<...>`, `agent-<...>`, `upstream`, or `server`. Tests at `shadow-repo.test.ts:173, :377, :383` use this pattern literally (`const agent: WriterIdentity = {...}` with id prefixed `agent-`).

**Implication for FR15:** `isAgent` can be derived directly from the id prefix — no schema change needed in `WriterIdentity`. `enrichPath` maps `id.startsWith('agent-') → isAgent: true`, `id.startsWith('human-') → isAgent: false`, `upstream/server → isAgent: null`.

## 2. MCP SDK 1.29.0 supports `structuredContent`

Installed version: `@modelcontextprotocol/sdk@1.29.0`. SDK typedef at `mcp.d.ts:257` confirms: tools can return `structuredContent` **if they declare an `outputSchema`** when registered.

**Implication for FR6 / D10:** the `exec` tool registration must include an `outputSchema` (zod schema describing `{ enrichedPaths: EnrichedMeta[] }`). This is a registration-time detail, not a runtime concern.

Minor SPEC update: FR6 should note "tool registers with `outputSchema` so `structuredContent` is accepted by the SDK."
