# Evidence: D7 — Alternative adoption shapes (synthesis, 3P + design analysis)

**Dimension:** Compare concrete adoption shapes. Evaluate LOC, risk profile, UX outcome, durability. Recommend a shape.
**Date:** 2026-04-24
**Sources:** Synthesis of D1–D6 + Jupyter RTC architecture (from `reports/crdt-server-restart-recovery/` prior research). This file contains the **decision-relevant** architectural recommendation.

---

## The four adoption shapes

Using PR #311 baseline (server-side instance-ID + server-side sidecar + full 11-test suite) as reference point.

### Shape 0: Status quo (baseline) — PR #311 shipped as-is

- Server emits instance ID; client claims; mismatch → recycle.
- Server writes + reads binary sidecar alongside markdown; Strategy A divergence.
- No client-side IDB.
- User visible: ~2s restart is invisible; >2s shows subtle sync indicator.

### Shape 1: Adopt y-indexeddb IN ADDITION TO server-side sidecar (dual-layer)

- Keep everything in PR #311.
- Add y-indexeddb on each provider-pool entry.
- Both server AND client preserve Y.Doc binary across their respective restarts.
- User visible: Cmd-R on the tab reuses IDB (instant render); server restart is still invisible (instance-ID defense + server-side sidecar).

### Shape 2: Adopt y-indexeddb INSTEAD OF server-side sidecar (client-only persistence)

- Keep instance-ID defense from PR #311.
- Delete server-side `sidecar.ts` + integration (~1100 LOC).
- Add y-indexeddb on each provider-pool entry (~130-230 LOC).
- Add branch-switch handling via CC1 signal + `provider.clearData()`.
- User visible: Cmd-R reuses IDB; server restart is invisible on clients with populated IDB (after recycle, fresh provider rehydrates from IDB). Cold-start (fresh tab, empty IDB) falls through to Hocuspocus from markdown — no regression from today's behavior.

### Shape 3: Adopt y-indexeddb AND REMOVE instance-ID defense too (IDB-only)

- Delete server-side sidecar AND server-instance-ID enforcement AND client-side recycle-on-rejection.
- Rely purely on y-indexeddb client-side preservation to prevent the bug.
- User visible: same as Shape 2 for Cmd-R. Server restart... ambiguous — see below.

---

## Why Shape 3 is NOT viable

**The argument**: "If client's Y.Doc state is preserved in IDB, and IDB's clientID matches the CLIENT's clientID (not the server's), then post-restart the server rebuilds from markdown and sync-merges with the client's IDB state. Client's clientID is stable (preserved across reload). The bug was about SERVER's clientID mismatching the pre-restart server's items — if those pre-restart server items are re-broadcast from the client's IDB back to the fresh server, the server's ITEMS now appear under the PRE-restart server's clientID, not the fresh server's... and no duplication."

**The counter (from D2)**:
```
Client IDB state contains: items under {(S1, 0..N), (C1, 0..M)}
                            where S1 = pre-restart server clientID
                                  C1 = client's clientID

Server restarts. `updateYFragment` on markdown produces:
                            items under {(S2, 0..K)}
                            where S2 = fresh server clientID

Client reconnects with IDB-restored state + sends state vector.
Server's state vector: "I have {(S2, 0..K)}"
Client's state vector: "I have {(S1, 0..N), (C1, 0..M)}"
Server needs from client: (S1, 0..N), (C1, 0..M)  ← NEW items from server's POV
Client needs from server: (S2, 0..K)  ← NEW items from client's POV

Both apply; document now has items under {S1, C1, S2}.

S1 items encode pre-restart content.
S2 items encode post-restart-regenerated-from-markdown content.
These overlap structurally — they're DIFFERENT Yjs items representing the SAME markdown content.

CRDT merge: both exist. Content DOUBLES at the markdown serialization layer.
```

So Shape 3 does NOT work. The fundamental issue is: `updateYFragment` creates NEW items under a FRESH clientID every restart, and Yjs's additive merge cannot distinguish "these items encode the same markdown content" from "these items encode different content at the same positions."

**The instance-ID defense is what breaks the above sequence.** It rejects the client BEFORE it sends its pre-restart items to the fresh server. Client is forced to recycle (discard its Y.Doc in memory) and restart clean. The client's IDB IS also cleared OR the client's IDB brings items under CLIENT's clientID only (since S1 items originated from the old server, they're no longer "the client's items" after recycle — but they ARE in IDB, and on rehydration they'd come back as items under S1 clientID... same bug).

**So in Shape 2 (with instance-ID but without server sidecar), the recycle path MUST ALSO `provider.clearData()` the IDB, because the client's IDB is "polluted" with pre-restart server-originated items.** This is critical:

```
Recycle flow in Shape 2:
  authenticationFailed (reason='server-instance-mismatch')
    → for each entry:
      → idbPersistence.clearData()    ← NEW: wipe polluted IDB
      → provider.destroy()
      → open() fresh                   ← constructs fresh IDB + provider
```

**Without the `clearData()` call, Shape 2 reintroduces the bug.** The client's pre-restart IDB (containing S1-originated items) would hydrate the fresh provider's Y.Doc, which would then sync to the fresh server → duplicate content.

**After the `clearData()`, the client loses its pre-restart unsynced edits** (everything since the last Hocuspocus-synced state, because that's what's in IDB but not on server). This is equivalent to PR #311's Shape 0 + "UX degraded-path accepts losing unsynced edits" (which PR #311 explicitly accepts in §"Out of scope — deferred: buffer-and-replay").

**Conclusion:** y-indexeddb adoption in Shape 2 still requires the instance-ID defense AND a `clearData()` on mismatch-recycle. It does NOT materially improve the "unsynced edits during restart" UX over PR #311.

---

## Evaluation matrix

| Dimension | Shape 0 (baseline) | Shape 1 (dual-layer) | Shape 2 (IDB-only persistence) |
|-----------|:------------------:|:--------------------:|:------------------------------:|
| **LOC delta vs baseline** | 0 | +~230 | −~900 (net) |
| **Server restart invisible (happy path, <2s)** | ✅ (sidecar) | ✅ (sidecar + IDB, both redundant) | ✅ (IDB + clearData + fresh sync) |
| **Server restart preserves user's unsynced edits** | ✅ (sidecar captures state) | ✅ (both preserve) | ❌ (clearData loses unsynced) |
| **Cmd-R instant render (no server round-trip)** | ❌ | ✅ | ✅ |
| **Offline editing (Hocuspocus down)** | ❌ (Y.Doc gone if tab closes) | ✅ | ✅ |
| **Truly new browser tab, empty IDB** | ✅ (uses sidecar) | ✅ (uses sidecar) | ✅ (falls through to markdown) |
| **Safari / iOS degraded IDB** | ✅ (sidecar is Node-side) | ✅ (sidecar is backup) | ⚠️ (degrades to markdown-rebuild; same as today) |
| **Corrupt IDB hydration freezes tab (#479)** | ✅ (not applicable; server-side) | ⚠️ (possible on client IDB) | ⚠️ (possible on client IDB) |
| **Testing complexity** | Bun + fake harness | Bun + fake-indexeddb + existing | Bun + fake-indexeddb + existing + new branch-switch tests |
| **Architectural coherence** | ✅ (one clear layer: server-side) | ⚠️ (two layers covering overlapping cases) | ✅ (client-side cache + server = source of truth) |
| **Alignment with Jupyter RTC precedent** | ✅ (Jupyter server-side `.jupyter_ystore.db`) | ⚠️ (Jupyter does not use client-side IDB) | ❌ (Jupyter has no client-side Y.Doc cache) |
| **Alignment with Tiptap/Yjs convention** | ⚠️ (no client-side IDB; atypical) | ✅ (canonical dual-layer) | ✅ (client-side IDB is canonical) |
| **Blast radius of adoption** | 0 (baseline) | +1 npm dep + client code | -1 server module + client code |

---

## Recommendation

**Ship Shape 0 (PR #311 as-is).**

Then, **in a follow-on PR, consider Shape 1** (dual-layer) if the Cmd-R instant-render UX is product-valuable.

**Do NOT do Shape 2** unless there's explicit pressure to reduce LOC — it's a lateral move in correctness (loses unsynced edits on degraded path vs. preserves them in Shape 0/1) with net-zero user benefit over Shape 1.

### Reasoning

**Architecture coherence argument for Shape 0/Shape 1 over Shape 2:**

PR #311's server-side sidecar is the **defense-in-depth layer for the SERVER'S responsibility** — it preserves the server's Y.Doc binary across restart. This preserves unsynced edits that the server had received from the client but hadn't yet written to markdown (the window between last L1 debounce and server crash).

y-indexeddb would be the **defense-in-depth layer for the CLIENT'S responsibility** — it preserves the client's Y.Doc binary across reload. This preserves unsynced edits that the client had in memory but hadn't yet sent to the server (typing faster than the Yjs send batch).

These are DIFFERENT windows of unsynced edits. Shape 2 substitutes one for the other; Shape 1 covers both.

**For the stated bug class (server restart content duplication), both PR #311's instance-ID defense AND any additional layer is enough.** Instance-ID catches the mismatch; post-recycle rebuild reconverges. Whether the binary is recovered from server-side sidecar, client-side IDB, or markdown-only-rebuild is determined by which layers are wired.

**The question "does adoption of y-indexeddb replace PR #311 work?" is best answered:**
- Replaces ~18% of PR #311's LOC (the sidecar module).
- Does NOT replace 82% of PR #311's LOC (instance-ID + auth-token + tests + 11-test suite).
- Adds a complementary client-side layer with its own UX benefit (Cmd-R instant render, offline editing).

**Shape 2's LOC savings aren't free.** They trade ~1100 LOC of server-side sidecar for:
- ~230 LOC of client-side wiring + branch-switch handling.
- Loss of durability across devices/browsers (user who moves to a different machine doesn't benefit from the cached state — would in PR #311's sidecar since the server holds the state).
- Loss of preserved unsynced edits across server restart (Shape 0/1 has `sidecar` preserving in-memory state that hasn't debounced to markdown yet; Shape 2's `clearData` during recycle discards that).
- Dependency on browser IDB behavior (quota, eviction, private mode).

**The ~900 LOC net savings of Shape 2 is not worth those tradeoffs.** The architectural cleanup is attractive on paper but introduces behavioral regressions that PR #311 was specifically designed to avoid.

### Alternative sharpening: Shape 1 as a follow-on PR

Shape 1 is additive — don't touch anything in PR #311, just add y-indexeddb as a second-layer client cache. LOC cost: ~230. No behavioral regressions. Adds Cmd-R instant render + offline editing.

**If Shape 1 is scoped as a follow-on, the current PR #311 benefits from not carrying additional changes.** PR #311 can ship with tight scope; Shape 1's ~230 LOC is a clean separate change with its own tests and its own value proposition.

---

## Secondary recommendations

### If Shape 1 is adopted as follow-on:

- Apply `patchedDependencies` for issue #31 (doc-grows-on-refresh) at adoption time.
- Wrap y-indexeddb construction in try/catch. On failure, log + fall through to Hocuspocus-only (current behavior).
- Request `navigator.storage.persist()` in Electron (auto-granted) and in web (shows consent prompt once).
- Add ~3 Playwright tests specifically for IDB-populated reload UX (cold-start + populated reload + cross-tab).
- Document the `clearData` path as part of the user-facing "Reset local cache" feature. Surface it in the UI as a debug option.

### If Shape 2 is adopted despite the recommendation:

- Preserve instance-ID defense from PR #311. DO NOT go to Shape 3.
- Wire `provider.clearData()` into the `recycleAllEntries` path. Critical.
- Explicitly document: "degraded-path loses unsynced edits" in specs, and tag the buffer-and-replay task (PR #311 "Out of scope").
- Revise T5 (branch-switch-live-client) to assert client-side IDB rotation instead of server-side sidecar deletion.
- Add branch-switch CC1 channel + client-side clearData handler (~100-200 LOC; see D4 Option A1).

---

## What this decision does NOT foreclose

- Future adoption of Shape 1 at any time. Purely additive.
- Future re-evaluation as Yjs ecosystem evolves (e.g., if y-indexeddb gets maintenance push or yjs 14 lands).
- Future adoption of `y-broadcastchannel` for live cross-tab sync. Orthogonal to y-indexeddb.
- Any future product decision about "offline-first" or "sync queue" that builds on y-indexeddb.

---

## Gaps / follow-ups

- Formal UX user-research on "Cmd-R feels faster" as a product value prop. Anecdotal evidence only; would need quantitative measurement.
- Load test: if many docs are opened + evicted in a session, does IDB retained per-doc storage become a problem? Instrument in a stress test before Shape 1 PR lands.
- Cross-check: is there value in a THIRD defense layer (server + client + disk markdown)? Shape 1 argues yes; marginal additional code is small, marginal benefit is "Cmd-R UX" which is user-visible.

---

## Summary table

| | Server restart | Cmd-R | Offline | Preserves unsynced edits | LOC vs baseline |
|---|:-:|:-:|:-:|:-:|:-:|
| **Shape 0 (ship PR #311 as-is) — RECOMMENDED** | Invisible | Slow | — | ✅ | 0 |
| **Shape 1 (Shape 0 + y-indexeddb) — recommended follow-on** | Invisible | Instant | ✅ | ✅ | +230 |
| Shape 2 (y-indexeddb replaces sidecar) | Invisible w/ clearData | Instant | ✅ | ❌ degraded | −900 |
| Shape 3 (IDB-only, no instance-ID) — NOT VIABLE | Content duplication | — | — | — | — |
