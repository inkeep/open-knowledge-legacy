# Evidence: OQ-11 — HocuspocusProvider reconnect & client state preservation

**Dimension:** Renderer Y.Doc state survival across utilityProcess crash → respawn → provider reconnect
**Date:** 2026-04-11
**Sources:**
- `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts`
- `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProviderWebsocket.ts`
- `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/OutgoingMessages/SyncStepOneMessage.ts`
- `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/OutgoingMessages/SyncStepTwoMessage.ts`
- `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/MessageReceiver.ts`
- `node_modules/.bun/y-protocols@1.0.7+34f3bd3cf9e54176/node_modules/y-protocols/sync.js`
- `packages/app/src/editor/provider-pool.ts`

---

## Key files / pages referenced

- `HocuspocusProvider.ts:424-456` — `onOpen` → `sendToken` → `startSync` (called on every (re)connect)
- `HocuspocusProvider.ts:441-456` — `startSync` (sends `SyncStepOneMessage` with client's state vector)
- `HocuspocusProvider.ts:281-305` — `hasUnsyncedChanges` and `unsyncedChanges` event API
- `HocuspocusProvider.ts:307-314` — `forceSync()` (manually trigger SyncStep1)
- `HocuspocusProvider.ts:497-529` — `destroy()` (provider teardown)
- `HocuspocusProviderWebsocket.ts:268-320` — `connect()` with retry loop
- `HocuspocusProviderWebsocket.ts:322-360` — `attachWebSocketListeners` / `cleanupWebSocket`
- `HocuspocusProviderWebsocket.ts:362-390` — `createWebSocketConnection` (clears messageQueue)
- `HocuspocusProviderWebsocket.ts:561-581` — `onClose` (auto-reconnect path)
- `HocuspocusProviderWebsocket.ts:553-559` — `send` (queues if not Open)
- `HocuspocusProviderWebsocket.ts:532-551` — `addToQueue` (deduplicates Awareness messages)
- `MessageReceiver.ts:126-236` — `readSyncMessage` (server-side sync handler)
- `OutgoingMessages/SyncStepOneMessage.ts:1-25` — wraps `y-protocols/sync.writeSyncStep1`
- `y-protocols/sync.js:14-29` — protocol contract docstring
- `y-protocols/sync.js:48-90` — `writeSyncStep1` / `writeSyncStep2` / `readSyncStep1` / `readSyncStep2`
- `packages/app/src/editor/provider-pool.ts:72-126` — `open()` and provider lifecycle

---

## Findings

### Finding: HocuspocusProvider has NO custom replay logic on reconnect — it uses the standard y-protocols bidirectional sync handshake
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts:424-456`

```typescript
async onOpen(event: Event) {
    this.isAuthenticated = false;
    this.emit("open", { event });
    await this.sendToken();
    this.startSync();
}

// ...

startSync() {
    this.resetUnsyncedChanges();

    this.send(SyncStepOneMessage, {
        document: this.document,
        documentName: this.effectiveName,
    });

    if (this.awareness && this.awareness.getLocalState() !== null) {
        this.send(AwarenessMessage, {
            awareness: this.awareness,
            clients: [this.document.clientID],
            documentName: this.effectiveName,
        });
    }
}
```

`onOpen` is wired to fire on EVERY websocket open event, including reconnects (`HocuspocusProviderWebsocket.ts:585` — `this.configuration.websocketProvider.on("open", this.boundOnOpen)`).

**Implications:** On every reconnect (initial OR after server restart), the provider sends SyncStep1 containing the **state vector of the local Y.Doc**. The Y.Doc instance is preserved across the websocket lifecycle — only the websocket is recreated. This is the foundation of crash-recovery state preservation.

---

### Finding: SyncStep1 carries the encoded state vector of the local Y.Doc
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/OutgoingMessages/SyncStepOneMessage.ts:7-25`

```typescript
export class SyncStepOneMessage extends OutgoingMessage {
    type = MessageType.Sync;
    description = "First sync step";

    get(args: Partial<OutgoingMessageArguments>) {
        if (typeof args.document === "undefined") {
            throw new Error("The sync step one message requires document as an argument");
        }
        encoding.writeVarString(this.encoder, args.documentName!);
        encoding.writeVarUint(this.encoder, this.type);
        syncProtocol.writeSyncStep1(this.encoder, args.document);
        return this.encoder;
    }
}
```

And from `y-protocols/sync.js:48-52`:

```javascript
export const writeSyncStep1 = (encoder, doc) => {
    encoding.writeVarUint(encoder, messageYjsSyncStep1)
    const sv = Y.encodeStateVector(doc)   // ← state vector of CLIENT's Y.Doc
    encoding.writeVarUint8Array(encoder, sv)
}
```

**Implications:** The state vector tells the server "here's a summary of every update I have, by clientID and clock." The server uses this to compute the diff and send only what's missing.

---

### Finding: Server replies to SyncStep1 with SyncStep2 (server's diff) AND its own SyncStep1 (server's state vector) — this triggers the bidirectional exchange
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+server@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/server/src/MessageReceiver.ts:143-161`

```typescript
case messageYjsSyncStep1: {
    readSyncStep1(message.decoder, message.encoder, document);

    // When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1.
    if (reply && requestFirstSync) {
        const syncMessage = new OutgoingMessage(messageAddress)
            .createSyncReplyMessage()
            .writeFirstSyncStepFor(document);

        reply(syncMessage.toUint8Array());
    } else if (connection) {
        const syncMessage = new OutgoingMessage(messageAddress)
            .createSyncMessage()
            .writeFirstSyncStepFor(document);

        connection.send(syncMessage.toUint8Array());
    }
    break;
}
```

And `y-protocols/sync.js:65-72`:

```javascript
/**
 * Read SyncStep1 message and reply with SyncStep2.
 */
export const readSyncStep1 = (decoder, encoder, doc) =>
    writeSyncStep2(encoder, doc, decoding.readVarUint8Array(decoder))
```

The y-protocols docstring at `y-protocols/sync.js:14-29` is the canonical contract:

> Core Yjs defines two message types:
> • YjsSyncStep1: Includes the State Set of the sending client. When received, the client should reply with YjsSyncStep2.
> • YjsSyncStep2: Includes all missing structs and the complete delete set. When received, the client is assured that it received all information from the remote client.
>
> ... In a client-server model ... The client should initiate the connection with SyncStep1. When the server receives SyncStep1, it should reply with SyncStep2 immediately followed by SyncStep1. The client replies with SyncStep2 when it receives SyncStep1.

**Implications:** This is a **complete bidirectional CRDT diff exchange**. After the round trip:
1. Server has all client updates that server didn't have.
2. Client has all server updates that client didn't have.
3. Both sides converge to the union via Yjs's commutative merge.

This means: **a fresh server (e.g., after utilityProcess respawn) that has loaded markdown from disk will receive all the client's in-memory edits** that hadn't yet been persisted to disk. The merge is automatic — Yjs preserves all updates.

---

### Finding: Auto-reconnect on close is built in — `shouldConnect=true` triggers retry with exponential backoff
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProviderWebsocket.ts:561-581`

```typescript
onClose({ event }: onCloseParameters) {
    this.closeTries = 0;
    this.cleanupWebSocket();

    if (this.connectionAttempt) {
        this.rejectConnectionAttempt();
    }

    this.status = WebSocketStatus.Disconnected;
    this.emit("status", { status: WebSocketStatus.Disconnected });
    this.emit("disconnect", { event });

    // trigger connect if no retry is running and we want to have a connection
    if (!this.cancelWebsocketRetry && this.shouldConnect) {
        setTimeout(() => {
            this.connect();
        }, this.configuration.delay);
    }
}
```

And `connect()` (lines 282-319) uses `@lifeomic/attempt`'s retry with default `delay=1000`, `factor=2`, `maxDelay=30000`, `maxAttempts=0` (unlimited), `jitter=true`.

**Implications:** When the utilityProcess crashes and the websocket closes, the provider will retry connecting indefinitely with exponential backoff. As soon as the new utilityProcess's Hocuspocus is listening on the same port, the next retry succeeds — no renderer-side intervention needed.

---

### Finding: `messageQueue` is cleared during websocket recreation — but Y.Doc state is preserved, so the next sync re-sends everything
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProviderWebsocket.ts:362-390`

```typescript
createWebSocketConnection() {
    return new Promise((resolve, reject) => {
        if (this.webSocket) {
            this.messageQueue = [];   // <-- cleared
            this.cleanupWebSocket();
        }
        this.lastMessageReceived = 0;
        this.identifier += 1;

        // Init the WebSocket connection
        const ws = new this.configuration.WebSocketPolyfill(this.url);
        ws.binaryType = "arraybuffer";
        // ...
    });
}
```

Plus `messageQueue = []` on lines 482 (`checkConnection`) and 513 (`disconnect`).

**Implications:** Any updates that the provider tried to send while disconnected are dropped from the queue. **However**, the corresponding Y.Doc updates ARE still in the local Y.Doc state. The next SyncStep1 round-trip computes a fresh diff against the new server's state vector and re-sends everything missing. So the messageQueue clearing is irrelevant for correctness — the protocol is robust.

The `unsyncedChanges` counter (lines 281-305 of HocuspocusProvider.ts) is the renderer-visible signal that there are still changes not yet acked by the server.

---

### Finding: `hasUnsyncedChanges` and `unsyncedChanges` event are public APIs the renderer can use to detect "all my edits are persisted"
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts:281-305`

```typescript
get hasUnsyncedChanges(): boolean {
    return this.unsyncedChanges > 0;
}

private resetUnsyncedChanges() {
    this.unsyncedChanges = 1;
    this.emit("unsyncedChanges", { number: this.unsyncedChanges });
}

incrementUnsyncedChanges() {
    this.unsyncedChanges += 1;
    this.emit("unsyncedChanges", { number: this.unsyncedChanges });
}

decrementUnsyncedChanges() {
    if (this.unsyncedChanges > 0) {
        this.unsyncedChanges -= 1;
    }
    if (this.unsyncedChanges === 0) {
        this.synced = true;
    }
    this.emit("unsyncedChanges", { number: this.unsyncedChanges });
}
```

The counter increments on every local doc update (line 363) and decrements when the server acks via SyncStatus (need to confirm which incoming message decrements it).

`forceSync()` (lines 307-314) lets the renderer manually trigger a SyncStep1 round-trip:

```typescript
forceSync() {
    this.resetUnsyncedChanges();
    this.send(SyncStepOneMessage, {
        document: this.document,
        documentName: this.effectiveName,
    });
}
```

**Implications:** For a clean project-switch teardown the renderer can:
1. Call `provider.forceSync()` to trigger an explicit sync round-trip.
2. Wait until `provider.hasUnsyncedChanges === false` AND `provider.synced === true`.
3. THEN signal the main process that it's safe to start tearing down the utilityProcess.

This gives a CLIENT-driven barrier that complements the server-side L1/L2 flush.

---

### Finding: OK's ProviderPool uses default reconnect — no custom recovery logic
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/editor/provider-pool.ts:72-126`

```typescript
const provider = new HocuspocusProvider({
    url: this.wsUrl,
    name: docName,
});

const entry: PoolEntry = {
    provider,
    observerCleanup: null,
    syncState: 'connecting',
    docName,
    lastAccessedAt: Date.now(),
};

const onStatus = ({ status }: { status: string }) => {
    if (status === 'disconnected') {
        entry.syncState = 'disconnected';
        this.notify();
    }
};
const onSynced = () => {
    entry.syncState = 'synced';
    // ... set up observers once ...
};
const onDisconnect = () => {
    entry.syncState = 'disconnected';
    this.notify();
};

provider.on('status', onStatus);
provider.on('synced', onSynced);
provider.on('disconnect', onDisconnect);
```

**Implications:** The pool tracks `syncState` ('connecting' | 'synced' | 'disconnected') but does NOT take any action on reconnect. It trusts the protocol-level safety. This is correct — but the pool DOES NOT yet expose `hasUnsyncedChanges` or wire up `unsyncedChanges` events, which it would need for the OQ-08 client-side flush barrier.

---

### Finding: `provider.destroy()` cleanup is comprehensive — but on a project switch we want to NOT destroy the provider until in-flight syncs are done
**Confidence:** CONFIRMED
**Evidence:** `node_modules/.bun/@hocuspocus+provider@4.0.0-rc.1+e2f9819782f4683d/node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts:497-529`

```typescript
destroy() {
    this.emit("destroy");

    if (this.intervals.forceSync) {
        clearInterval(this.intervals.forceSync);
    }

    if (this.awareness) {
        removeAwarenessStates(
            this.awareness,
            [this.document.clientID],
            "provider destroy",
        );
        this.awareness.off("update", this.boundAwarenessUpdateHandler);
        this.awareness.destroy();
    }

    this.document.off("update", this.boundDocumentUpdateHandler);

    this.removeAllListeners();
    this.detach();

    if (this.manageSocket) {
        this.configuration.websocketProvider.destroy();
    }
    // ...
}
```

**Implications:** `destroy()` removes the document update listener, removes all event listeners, detaches from the websocket, and (if it owns the socket) destroys the socket. After `destroy()`, no further messages can flow — including any in-flight unsynced edits. So the renderer MUST wait for `hasUnsyncedChanges === false` BEFORE calling `provider.destroy()`, or those edits are lost.

---

## Negative searches

- **Custom replay-on-reconnect logic in HocuspocusProvider** — read all of `HocuspocusProvider.ts`. None exists. Reconnect goes through the standard `onOpen → sendToken → startSync` path. No client-side update buffer is replayed.
- **Server-side reconnect-side handling that discards client state** — read `MessageReceiver.ts` and `Hocuspocus.ts`. The server's `loadDocument` path ALWAYS lets the client's SyncStep1 drive the diff. The server never proactively sends a "reset" or "force-overwrite" to clients. (The `ResetConnection` close code in `Hocuspocus.closeConnections` triggers a reconnect, but the reconnect goes through the same SyncStep1 path.)
- **`provider.flush()` or equivalent client-side drain** — does not exist. `forceSync()` (line 307) is the closest equivalent but only triggers a SyncStep1; it doesn't await ack.

---

## Gaps / follow-ups

- **Where does `unsyncedChanges` decrement?** Need to find which MessageReceiver path calls `decrementUnsyncedChanges()`. Most likely on receipt of `SyncStatus` ack messages. Worth confirming so the renderer can rely on the counter.
- **Memory pressure during long disconnect** — if the user makes thousands of edits while disconnected, the Y.Doc grows in memory. There's no eviction. Worth noting as a long-tail risk.
- **Provider-pool integration** — the pool needs a `hasUnsyncedChanges()` method that aggregates across all open entries, plus a `waitForAllSynced()` method, to support the J4a flush barrier.
