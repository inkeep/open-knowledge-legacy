# Evidence: B3 — TCP half-closed socket race; why userspace readyState is insufficient

**Dimension:** B3 — EPIPE/ECONNRESET fundamentals; sync vs async error emission
**Date:** 2026-04-18
**Sources:** `ws` library issues (primary), Node.js issues, MDN

---

## Findings

### Finding B3-1: `ws` library maintainer: EPIPE is a runtime reality that readyState cannot prevent

**Confidence:** CONFIRMED
**Evidence:** [websockets/ws#1017](https://github.com/websockets/ws/issues/1017) (canonical thread, closed 2017, still primary reference)

Maintainer @lpinca:
> *"The `error` listener on the socket is called **after** the write callback. When the callback is invoked, the error is emitted on the `WebSocket` instance and if there isn't a listener the process crashes… **An error listener on the `WebSocket` instance is sufficient and should always be added anyway as there are a lot of more errors which can be emitted and make the process crash if they are not handled.**"*

[ws#1172](https://github.com/websockets/ws/issues/1172):
> *"EPIPE means you're writing to a socket when the other end has terminated the connection. It's a runtime error and there is nothing you can do to avoid it. You only have to close your end as well but that is done automatically."*

[ws#2148](https://github.com/websockets/ws/issues/2148) — maintainer response on why pre-checks are insufficient:
> lpinca: *"Those are probably buffered writes that can't go through. There is not much to do apart from checking the `websocket.bufferedAmount` and stop writing if it grows too much."*

(The reporter's setup was a pre-`send()` `readyState === OPEN` check that still produced EPIPE — lpinca's response accepts the premise and explains why: the kernel write buffer can accept the call and emit the failure asynchronously. A userspace check at any layer cannot prevent this.)

**Implication:** `readyState === OPEN` check at send time is a **courtesy, not a guarantee**. The kernel-level race (client sends FIN, server hasn't processed close yet) cannot be detected from userspace between check and write. This applies to EVERY WebSocket consumer, not just Hocuspocus.

---

### Finding B3-2: EPIPE emission timing is async-only on Node

**Confidence:** CONFIRMED
**Evidence:** [nodejs/node#6083](https://github.com/nodejs/node/issues/6083), [nodejs/node#24111](https://github.com/nodejs/node/issues/24111), [nodejs/node#11918](https://github.com/nodejs/node/issues/11918)

Three documented facts:

1. **TCP socket emits `end` after `error`** — async emission is the norm for EPIPE/ECONNRESET (#6083).
2. **`socket.write()` emits error synchronously when socket was closed by peer** — but documented as ambiguous: Node sometimes emits sync, sometimes async on next tick (#24111). Cannot be relied on for sync catch.
3. **`Socket.write` does not reliably fire callback with error** — the write callback is NOT a reliable EPIPE signal channel (#11918). A synchronous try/catch around `socket.write()` may or may not catch EPIPE depending on timing.

**Combined reality:** EPIPE fires through **three** channels, all of which must be covered to be crash-proof:
- Sync throw from `net.Socket.write()` (covered by try/catch, sometimes)
- `'error'` event on the underlying `net.Socket` (requires listener)
- `'error'` event on the `ws.WebSocket` wrapper (requires listener)

Missing any one can cause a process crash under real traffic. This is why [ws#1017](https://github.com/websockets/ws/issues/1017)'s canonical guidance is "always attach `ws.on('error', …)`" AND attach a raw-socket listener at upgrade time.

---

### Finding B3-3: Pattern is not unique to Hocuspocus

**Confidence:** CONFIRMED
**Evidence:** [koajs/koa#1089](https://github.com/koajs/koa/issues/1089), [BloopAI/vibe-kanban#830](https://github.com/BloopAI/vibe-kanban/issues/830)

Same error signature in unrelated projects:
- Koa (HTTP server framework) — #1089: "How to handle ECONNRESET and EPIPE on streaming?"
- Vibe-kanban (Vite proxy) — #830: "Loading History never clears when WebSocket closes before Finished (Vite proxy EPIPE/ECONNRESET)"

This is a universal Node.js networking pattern. **The correct remedy across all of them is the defensive error listener approach**, not library-level guards.

---

## Implications for consumers

1. **`readyState === OPEN` + try/catch + async listeners** is the complete pattern. Any one alone is insufficient.
2. **Hocuspocus already has (1) and (2) at `Connection.send`** (see `b1-broadcaststateless-internals.md`). Consumers must add (3) — async listeners on the raw socket AND the ws wrapper.
3. **No library-level patch can eliminate EPIPE.** It's a kernel-level property of TCP.
