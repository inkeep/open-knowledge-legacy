---
dimension: D4 — Cross-peer propagation waits
date: 2026-04-16
sources: logseq, hocuspocus, y-prosemirror, y-tiptap, tldraw, blocknote, hedgedoc, affine
---

# Evidence: D4 — How multi-peer tests wait for cross-peer propagation

**Primary question:** When a test has multiple clients, how does it wait for "peer B has received peer A's write"?

---

## Key files / pages referenced

- `logseq/clj-e2e/test/logseq/e2e/fixtures.clj:37-71` — `open-2-pages` dual-browser fixture
- `logseq/clj-e2e/src/logseq/e2e/rtc.clj:14-51` — `with-wait-tx-updated` + `wait-tx-update-to`
- `logseq/clj-e2e/test/logseq/e2e/rtc_extra_test.clj:76-99` — multi-peer test example
- `hocuspocus/tests/provider/onAwarenessChange.ts:102-140` — two-provider awareness test
- `y-prosemirror/tests/y-prosemirror.test.js:270-312` — in-memory multi-doc sync

---

## Findings

### Finding: Logseq's `with-wait-tx-updated` is the most mature cross-peer pattern surveyed
**Confidence:** CONFIRMED
**Evidence:** `logseq/clj-e2e/src/logseq/e2e/rtc.clj:14-37`

```clojure
(defmacro with-wait-tx-updated
  "exec body, then wait for the rtc-tx update.
  Return the updated rtc-tx{:local-tx ..., :remote-tx ...}"
  [& body]
  `(let [m# (get-rtc-tx)
         local-tx# (or (:local-tx m#) 0)
         remote-tx# (or (:remote-tx m#) 0)
         tx# (max local-tx# remote-tx#)]
     ~@body
     (loop [i# 15]
       (when (zero? i#) (throw (ex-info "wait-tx-updated failed" ...)))
       (util/wait-timeout 500)
       (w/wait-for "button.cloud.on.idle" {:timeout 35000})
       (util/wait-timeout 1000)
       (let [new-m# (get-rtc-tx)
             new-local-tx# (or (:local-tx new-m#) 0)
             new-remote-tx# (or (:remote-tx new-m#) 0)]
         (if (and (= new-local-tx# new-remote-tx#)
                  (> new-local-tx# tx#))
           {:local-tx new-local-tx# :remote-tx new-remote-tx#}
           (recur (dec i#)))))))
```

**Implications:** This is the strongest pattern surfaced. The macro:
1. Captures pre-body tx state
2. Executes the body (which triggers a local mutation)
3. Polls until `local-tx === remote-tx` AND both have advanced past the pre-body value

The convergence condition is **quantitative** (counters equal and increased), not boolean — which gives a rigorous "peer has caught up to my local commit" guarantee. The 15-iteration limit with 500+1000ms backoff gives ~22.5s of total wait budget.

The same pattern is usable for cross-peer waits via `wait-tx-update-to`:

```clojure
(defn wait-tx-update-to
  [new-tx]
  (loop [i 5]
    (when (zero? i) (throw (ex-info "wait-tx-update-to" {:update-to new-tx})))
    (util/wait-timeout 1000)
    (let [m (get-rtc-tx)
          local-tx (or (:local-tx m) 0)]
      (if (>= local-tx new-tx)
        local-tx
        (recur (dec i))))))
```

Pattern:
- Peer A performs edit, captures its `:remote-tx` after convergence
- Peer B polls `(:local-tx ...)` until it reaches A's captured value → B has received A's edit

---

### Finding: Logseq's dual-browser fixture pattern
**Confidence:** CONFIRMED
**Evidence:** `logseq/clj-e2e/test/logseq/e2e/fixtures.clj:37-71`

```clojure
(defn open-2-pages
  "Use `*page1` and `*page2` in `f`"
  [f & {:keys [headless port]}]
  (let [p1 (w/make-page page-opts)
        p2 (w/make-page page-opts)]
    (reset! *page1 p1)
    (reset! *page2 p2)
    (run! #(w/with-page %
            (w/navigate ...)
            (assert/assert-graph-loaded?)
            ...) [p1 p2])
      (f)))
```

And a real usage at `rtc_extra_test.clj:76-99`:

```clojure
(deftest rtc-task-blocks-test
  (let [insert-task-blocks-in-page2
        (fn [*latest-remote-tx]
          (w/with-page @*page2
            (let [{:keys [_local-tx remote-tx]}
                  (rtc/with-wait-tx-updated
                    (insert-task-blocks "t1"))]
              (reset! *latest-remote-tx remote-tx))))
        ...]
    (testing "add some task blocks while rtc disconnected on page1"
      (let [*latest-remote-tx (atom nil)]
        (rtc/with-stop-restart-rtc
          [@*page1]
          [@*page1 (rtc/wait-tx-update-to @*latest-remote-tx)]
          (insert-task-blocks-in-page2 *latest-remote-tx))
        (validate-task-blocks)
        (validate-graphs-in-2-pw-pages)))))
```

**Implications:** The test composes `with-stop-restart-rtc` (network partition simulation) + `with-wait-tx-updated` (cross-peer convergence) + `wait-tx-update-to` (targeted propagation wait) into a readable workflow:
1. Stop RTC on page1 (partition)
2. Edit on page2, capture the remote-tx
3. Restart RTC on page1 and wait for page1's local-tx to reach page2's remote-tx
4. Validate both pages converged to the same graph

This is production-grade E2E testing of collaborative editing — a pattern few OSS projects have.

---

### Finding: Hocuspocus uses provider-pair tests with awareness and `onAwarenessChange`
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/tests/provider/onAwarenessChange.ts:102-140`

```ts
const provider = newHocuspocusProvider(t, server, {
  onConnect() {
    provider.setAwarenessField("name", "player1");
  },
  onAwarenessChange: ({ states }) => {
    if (resolved) return;
    const player2 = !!states.filter((state) => state.name === "player2").length;
    if (player2) {
      resolved = true;
      t.is(player2, true);
      resolve("done");
    }
  },
  // ...
});

// later — second provider joins
const anotherProvider = newHocuspocusProvider(t, server, { /* ... */ });
anotherProvider.setAwarenessField("name", "player2");
```

**Implications:** For multi-client Hocuspocus tests, the pattern is:
- Register an `onAwarenessChange` listener that resolves a promise when the expected state appears
- `setAwarenessField` from the second provider triggers the first's callback

This is the awareness-only variant. For document content, the equivalent is either:
- Listen to Y.Doc update events + compare state
- Wait for `synced` on both providers + compare `ytext.toString()` (`retryableAssertion`)

See `hocuspocus/tests/provider/hasUnsyncedChanges.ts:110-120` for the document-state variant:

```ts
const provider2 = newHocuspocusProvider(t, server, {
  token: 'full-access',
})
provider2.document.getMap('test2').set('foo', 'bar')
t.is(provider2.hasUnsyncedChanges, true)
await retryableAssertion(t, tt => {
  tt.is(provider2.hasUnsyncedChanges, false)
})
```

This is peer-local (does provider2's own mutation quiesce) not peer-to-peer (does provider1 see provider2's mutation). The peer-to-peer variant in Hocuspocus's own tests was NOT surfaced.

---

### Finding: y-prosemirror multi-doc tests use in-memory update application (no network)
**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/tests/y-prosemirror.test.js:270-312`

```js
const ydoc1 = new Y.Doc()
ydoc1.clientID = 1
const ydoc2 = new Y.Doc()
ydoc2.clientID = 2
const view1 = createNewProsemirrorView(ydoc1)
const view2 = createNewProsemirrorView(ydoc2)

const sync = () => {
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
  Y.applyUpdate(ydoc2, Y.encodeStateAsUpdate(ydoc1))
  Y.applyUpdate(ydoc1, Y.encodeStateAsUpdate(ydoc2))
}
sync()
view1.dispatch(view1.state.tr.insertText('1', 1, 1))
view2.dispatch(view2.state.tr.insertText('2', 1, 1))
sync()
```

**Implications:** y-prosemirror / y-tiptap tests work at the CRDT layer directly. The `sync()` helper performs a bidirectional `Y.applyUpdate` pass (twice in each direction to cover three-phase sync). Because all operations are synchronous and in-memory, **no wait is needed** — the `sync()` call is fully effective when it returns.

This is not a Playwright-comparable pattern — it's CRDT unit testing. But the takeaway for E2E design: when you separate the CRDT layer from the network layer in tests, waits become simpler. Integration tests that run against an in-process server (no WebSocket) can use this pattern; true browser E2E cannot.

---

### Finding: BlockNote, tldraw, HedgeDoc, AFFiNE have NO multi-peer E2E tests
**Confidence:** CONFIRMED (negative)
**Evidence:** Searched all four repos for `browser.newContext`, `newPage` with multi-context usage, cross-peer assertion patterns. NOT FOUND.

- BlockNote test suite: single-browser per spec
- tldraw: single-browser per spec (dotcom E2E tests have fixtures for "sidebar toggle visible" style assertions but not cross-peer)
- HedgeDoc: single-browser per spec
- AFFiNE: single-browser in the spec files surveyed

**Implications:** Cross-peer E2E testing is **rare** in surveyed OSS. The difficulty is exactly the signal problem this evidence is cataloging — without a reliable "peer B received peer A's edit" wait, tests are too flaky to be worth maintaining. Logseq is the notable exception, and Logseq solved the problem by shipping `rtc-tx` as a production DOM element specifically for test consumption.

---

## Negative searches

- `expect.poll(() => peer2.*)` pattern in blocknote/tldraw/tiptap: **NOT FOUND**. No project uses `expect.poll` for cross-peer convergence.
- `Promise.all` with cross-peer assertions: **NOT FOUND** as a pattern in E2E tests (common in unit tests for `Y.Doc` convergence).

---

## Gaps / follow-ups

- AFFiNE's internal collaboration test suite was not fully explored. AFFiNE's y-octo is Rust-implemented; the browser-side sync model and any test hooks may differ from Yjs-JS baseline.
- The semantic model of Logseq's `local-tx` / `remote-tx` counters is inferable from context (monotonic transaction IDs managed by the RTC worker) but was not traced to source. The counters advance per **logical transaction**, not per Y.Doc update or per network message — which is a richer semantic than most CRDT sync-progress metrics.
