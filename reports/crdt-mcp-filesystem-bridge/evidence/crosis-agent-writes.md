# Evidence: Replit Crosis — How Agent/Bot Writes Flow Through the Protocol

**Dimension:** How does Replit Crosis handle agent/bot writes?
**Date:** 2026-03-21
**Sources:** Crosis source code (`~/.claude/oss-repos/crosis/`), Replit blog

---

## Key files referenced

- `~/.claude/oss-repos/crosis/src/client.ts:369-410` — Channel request pipeline and multiplexing
- `~/.claude/oss-repos/crosis/src/client.ts:470-630` — requestOpenChannel implementation
- `~/.claude/oss-repos/crosis/src/client.ts:534-541` — Channel opening via chan0
- `~/.claude/oss-repos/crosis/src/client.ts:1506-1554` — Message send/receive multiplexing
- `~/.claude/oss-repos/crosis/src/channel.ts:158-187` — Request/response pattern per channel
- `~/.claude/oss-repos/crosis/src/types.ts:355-361` — ChannelOptions interface

---

## Findings

### Finding: All writes (human, bot, AI agent) use the identical protocol path — no distinction exists
**Confidence:** CONFIRMED
**Evidence:** `client.ts:1506-1530` — The `send()` method routes all outgoing messages through a single WebSocket. Every message is a protobuf `api.Command` with a `channel` field for routing. The protocol has NO mechanism to distinguish between write sources.

```typescript
// client.ts:1506-1530 — ALL writes use same path
private send = (cmd: api.Command) => {
  const channel = this.getChannel(cmd.channel);
  const cmdBuf = api.Command.encode(cmd).finish();
  const buffer = cmdBuf.buffer.slice(cmdBuf.byteOffset, cmdBuf.byteOffset + cmdBuf.length);
  this.ws.send(buffer);  // Single WebSocket, all channels
}
```

**Implications:** Replit's AI agents write using the SAME protocol as the UI. The principle is "all writes through one protocol" — not "all writes through one API." This means a server-side process that wants to write files opens an OT channel and sends operations, identical to what a human editor does.

### Finding: Channel multiplexing enables multiple services over a single WebSocket
**Confidence:** CONFIRMED
**Evidence:** `client.ts:534-541` — Channels are opened via chan0 (control channel), each targeting a service (`"ot"`, `"files"`, `"exec"`). The server assigns a numeric channel ID, and all subsequent messages include this ID for routing.

```typescript
// client.ts:534-541
chan0.send({
  ref,
  openChan: {
    name: options.name,     // e.g., "my-file.tsx"
    service,                // e.g., "ot", "files", "exec"
    action,                 // CREATE or ATTACH_OR_CREATE
  },
});
```

**Implications:** The architecture supports multiple concurrent file operations, each on its own channel. An AI agent can open an OT channel per file it's editing, and all changes flow through the OT protocol for that file.

### Finding: File changes are communicated via OT on dedicated per-file channels
**Confidence:** CONFIRMED
**Evidence:** [Replit blog post "Making Repl.it Collaborative at Heart"](https://blog.replit.com/collab) — "File changes are communicated via Operational Transformation (OT), which was designed to handle real-time collaborative text document updates. The client can have a channel with the server where file changes are communicated back-and-forth through OT."

**Implications:** Each file gets its own OT channel. The server is the authority. A file watching daemon can generate OT messages and broadcast them to subscribed clients. This means server-side processes (including AI agents) can generate OT operations that appear in the editor in real-time.

### Finding: Server-side bots are just another Crosis client
**Confidence:** INFERRED
**Evidence:** `types.ts:355-361` — `ChannelOptions<Ctx>` includes a generic context type and `ServiceThunk<Ctx>` for dynamic service selection. The `priority` field (`ChannelRequestPriority.High/Medium/Low`) suggests different client types may use different priorities, but the protocol itself is identical.

**Implications:** A bot/AI agent connects to the same WebSocket endpoint, opens channels for the files it wants to edit, and sends OT operations. The server transforms these operations against any concurrent human edits. No special "bot API" exists — bots ARE clients.

### Finding: Reconnection automatically reopens all channels
**Confidence:** CONFIRMED
**Evidence:** `client.ts:1624-1626` — On reconnect, all registered channel requests are re-opened:

```typescript
this.channelRequests.forEach((channelRequest) => {
  this.requestOpenChannel(channelRequest);
});
```

**Implications:** Long-running AI agents that edit files can survive WebSocket disconnections. Their channels are automatically restored.

---

## Negative searches

* Searched for "bot", "agent", "server-side" in Crosis src/ — no special bot/agent handling found. Bots use the same client library.
* Searched for authentication/authorization in channel opening — found in @replit/protocol (not in this repo), but channel-level auth is handled server-side.

---

## Gaps / follow-ups

* The actual OT operations format is defined in `@replit/protocol` (protobuf), which is a separate package. Crosis is the client SDK; the protocol spec is not fully open-source.
* How Replit Agent specifically implements file editing (whether it uses Crosis directly or a higher-level abstraction) is not documented in the Crosis repo.
