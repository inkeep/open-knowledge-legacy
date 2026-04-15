---
name: Bug-B mechanism — Observer A remote-tx baseline refresh absorption
sources:
  - packages/app/src/editor/observers.ts:319-395
  - packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts (CONTROL)
  - packages/app/tests/stress/observer-a-multi-client.e2e.ts (Playwright evidence)
confidence: HIGH
---

# Bug-B: Observer A remote-tx baseline refresh absorbs local changes

## The code

`packages/app/src/editor/observers.ts:364-395` — the remote-tx branch of `observerA`:

```ts
const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
  if (transaction.origin === ORIGIN_TEXT_TO_TREE) return;
  if (!transaction.local) {
    // Remote XmlFragment change.
    try {
      const state = getTypingState(doc);
      const changedParentTypes = (
        transaction as Y.Transaction & { changedParentTypes?: Map<unknown, unknown> }
      ).changedParentTypes;
      state.lastRemoteTreeOnlyAt = changedParentTypes?.has(ytext) ? 0 : Date.now();

      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      lastSyncedXmlMd = prependFrontmatter(frontmatter, body);  // ← REFRESH
    } catch (err) { /* ... */ }
    return;
  }
  if (debounceA) clearTimeout(debounceA);
  debounceA = setTimeout(runObserverASync, DEBOUNCE_MS);
};
```

And the early-exit at `observers.ts:319-324`:

```ts
const runObserverASync = (): void => {
  debounceA = null;
  try {
    const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const body = mdManager.serialize(json);
    const frontmatter = getFrontmatter(doc);
    const md = prependFrontmatter(frontmatter, body);

    if (lastSyncedXmlMd === md) {  // ← ABSORPTION: fires when baseline refresh captured same state
      return;
    }
    // ...
  }
};
```

## The flow

Peer A and peer B both type concurrently on the same line in WYSIWYG:

1. t=0: Peer A types → local XmlFragment tx on A → A's `observerA` schedules debounce (50ms).
2. t=5ms: Peer A's tx propagates via WebSocket → arrives at peer B as remote tx.
3. t=5ms (B): `observerA` remote-tx branch fires on B. B's XmlFragment now has A's content (via CRDT). B's `lastSyncedXmlMd` refreshes to `serialize(xmlFragment)` = "baseline + A's edit".
4. t=10ms: Peer B types → local XmlFragment tx on B → B's debounce schedules.
5. t=15ms: B's tx propagates → arrives at A as remote tx. A's `lastSyncedXmlMd` refreshes to "baseline + A's edit + B's edit".
6. t=50ms: A's debounce fires. `md = serialize(xmlFragment)` = "baseline + A + B". `md === lastSyncedXmlMd` → **EARLY-EXIT**. A's Y.Text never updates.
7. t=60ms: B's debounce fires. Same outcome. B's Y.Text never updates.

**Result:** Both peers' XmlFragments converge via CRDT tree-level sync ("baseline + A + B"), but both peers' Y.Text remain at the pre-edit baseline.

## Evidence (integration reproducer)

Test `CONTROL` in `observer-a-baseline-absorption-repro.test.ts`:

```
[CTRL] clientA.ytext: "shared baseline\n"     ← no AAA, no BBB
[CTRL] clientB.ytext: "shared baseline\n"     ← no AAA, no BBB
[CTRL] clientA.frag (len): 60
[CTRL] clientB.frag (len): 60
expect(aYtext).toContain('AAA from A');  ← FAILS
```

XmlFragments converged correctly (len=60 on both, includes all 3 contributions); Y.Texts stayed stale.

Earlier Playwright evidence: `observer-a-multi-client.e2e.ts` initial design (before reframing to user+agent scenario) showed the same stuck state with two browser contexts.

## Self-healing condition

If at any future time either client fires a **local** XmlFragment or Y.Text tx (typing, pasting, etc.), the debounce is rescheduled with `transaction.local === true`. On that fire, `md !== lastSyncedXmlMd` becomes true (because the new local change adds delta beyond the last refresh) → Path A or B runs → Y.Text updates → propagates to peer via Y.Text CRDT.

So in real async human typing (natural pauses, 200-500ms inter-key), the stuck state ends within one keystroke of any user resuming editing. In synthetic synchronous scenarios (`Promise.all`, scripted agents, automation), the stuck state persists.

## Severity assessment

MEDIUM. Self-healing on next edit limits data-loss surface — but any code that reads Y.Text before the next edit sees stale content. Affected readers per /debug:
- CodeMirror source mode (`SourceEditor.tsx`)
- Server-side `/api/document` endpoint
- Rollback base (`api-extension.ts:1314`)
- Close-and-capture for rename (`api-extension.ts:486`) — writes stale content to disk

## Interaction with Bug-A

Independent root cause but often co-occurring. When an agent writes via `/api/agent-write*` (Bug-A), the broadcast also triggers remote-tx on clients → Observer A's baseline refresh. Bug-B's absorption can then prevent the client's concurrent local XmlFragment edits from ever landing in Y.Text. Bug-A's server-side stomping and Bug-B's client-side absorption combined produce the observed "user typing disappears" symptom.
