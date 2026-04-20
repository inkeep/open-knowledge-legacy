# Evidence: B4 — Hocuspocus upstream status on EPIPE/broadcast-during-close

**Dimension:** B4 — Is this a known upstream topic? Has a readyState filter been proposed?
**Date:** 2026-04-18
**Sources:** GitHub search + issue reads + local `RELEASE_NOTES_V4.md`

---

## Findings

### Finding B4-1: The EPIPE class IS known upstream, surfaced via adjacent symptoms

**Confidence:** CONFIRMED
**Evidence:** Multiple GitHub issues

**Primary issue:** [ueberdosis/hocuspocus#1017](https://github.com/ueberdosis/hocuspocus/issues/1017) — *"AwarenessUpdate updates triggers close on a closed/closing socket - buggy send message"* (closed Feb 2026, v3.4.0)

Quoted from reporter:
> *"The attempt to send a message to a closed socket generates an uncaught exception. In dev (localhost) a crash is not observed."*

Describes exactly the recursion pattern at `Connection.send` → `close()` → `onClose` callbacks → awareness update → `send()` on closing socket.

**Adjacent:**
- [#264](https://github.com/ueberdosis/hocuspocus/issues/264) — *"Check disconnecting state"* — maintainer @hanspagel explicitly acknowledges: *"`WebSocket.readyState` still shows 1 = Connected, even when the client is offline"* — confirming the kernel-level race is known upstream.
- [#618](https://github.com/ueberdosis/hocuspocus/issues/618) — *"broadcastStateless exclude Connection param"* — the only discovered discussion that uses the `filter` parameter. Used for **sender-identity exclusion** (`filter(conn => conn !== originator)`), NOT readyState.
- [#558](https://github.com/ueberdosis/hocuspocus/issues/558) — multi-node broadcast crash (Redis). Fixed in v2.0.1 via unrelated bug fix.
- [#871](https://github.com/ueberdosis/hocuspocus/issues/871) — AWS Fargate disconnection (environmental).
- [#881](https://github.com/ueberdosis/hocuspocus/issues/881) — ioredis ECONNRESET unhandled (Redis extension).

---

### Finding B4-2: NOT FOUND — no proposal for `filter: (c) => c.readyState === OPEN`

**Confidence:** CONFIRMED (zero-result search)
**Evidence:** GitHub issues + PRs + code search

**Searched:**
- `"broadcastStateless" filter` in ueberdosis/hocuspocus → 0 matches for readyState usage
- `"readyState"` in hocuspocus code search → matches only internal checks at `Connection.send` and `ClientConnection` post-upgrade
- `patchedDependencies @hocuspocus` across npm/GitHub → 0 results

**Implication:** No community or maintainer has proposed readyState filtering at the `broadcastStateless` level. The filter parameter exists for sender-identity exclusion. Nobody treats the readyState-during-broadcast race as a broadcast-layer concern — it's treated as a Connection-layer concern (which Hocuspocus already handles in `Connection.send`).

---

### Finding B4-3: Maintainer stance = "fix at lifecycle boundaries, not patch"

**Confidence:** INFERRED (no explicit manifesto, three indirect signals)
**Evidence:** Quotes from @janthurau across issues, `RELEASE_NOTES_V4.md`

Signals:
1. **Issue #1017 closure with inapplicable diff pointer.** Jan claimed *"fixed by [PR #1032](...)"* but `git log` shows PR #1032 only touches `packages/extension-redis/src/Redis.ts`, not `Connection.send`. The send-side recursion is **still present on main** as of this research date.
2. **Issue #803 (destroy reopens connection):** Jan: *"this should also be finally fixed in v3 :)"* — pattern of fixing lifecycle bugs at major-version boundaries rather than patch releases.
3. **v4 release notes (`RELEASE_NOTES_V4.md`):** *"Unknown message types no longer crash the provider — `console.error` instead of `throw`."* — philosophical shift toward non-throwing, but scoped to message parsing, not send path.

---

### Finding B4-4: v4 introduces `WebSocketLike` explicitly, opens adapter-layer fixes

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/hocuspocus/RELEASE_NOTES_V4.md`

Major v4 changes relevant to Track B:
- **Cross-runtime WebSocket via `crossws`** — no longer tied to `ws` library; `WebSocketLike` interface (send, close, readyState). Opens door to Bun / Deno / CF Workers native sockets with different error semantics.
- **Session awareness enabled by default** — multiple providers multiplex one socket with session-isolated auth. Multiplies the `broadcastStateless` blast radius per socket.
- **Ordered message processing** — `Connection.processMessages` now serializes async hook execution per connection (`messageQueue` + `processingPromise`). Addresses interleaving but NOT send-side failure.
- **DirectConnection context propagation** — server-side broadcasters now carry context through.

**Key implication:** v4's explicit `WebSocketLike` interface **blesses** the consumer-side adapter-wrapper pattern (Docmost-style). Consumers can now legitimately inject a wrapped `WebSocketLike` into Hocuspocus that adds their own error handling + readyState guards without forking the library.

---

## Net conclusion

The EPIPE class is:
- **Known** upstream (multiple issues, maintainer acknowledgments).
- **Not patched** at the source level on main (send-recursion in `Connection.ts:154-161` still present).
- **Not approached** as a `broadcastStateless` filter concern.
- **Now addressable** at the adapter layer via v4's `WebSocketLike` interface.

Consumers must supply their own defensive layer. The library will not.
