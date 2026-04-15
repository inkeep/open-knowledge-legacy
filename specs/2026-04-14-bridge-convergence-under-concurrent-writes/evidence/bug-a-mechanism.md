---
name: Bug-A mechanism — server stomping via syncTextToFragment
sources:
  - packages/server/src/agent-sessions.ts:53-82
  - packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts
confidence: HIGH
---

# Bug-A: `syncTextToFragment` destroys concurrent client XmlFragment content

## The code

`packages/server/src/agent-sessions.ts:53-82`:

```ts
export function syncTextToFragment(document: Document): void {
  const ytext = document.getText('source');
  const fullText = ytext.toString();
  try {
    const { frontmatter, body } = stripFrontmatter(fullText);
    const parsedJson = mdManager.parseSafe(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const xmlFragment = document.getXmlFragment('default');
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);  // ← DESTRUCTIVE

    // Enforce bridge invariant: ytext must be byte-equal to canonical serialization.
    const canonicalBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
    const canonicalFull = prependFrontmatter(frontmatter, canonicalBody);
    if (canonicalFull !== fullText) {
      ytext.delete(0, fullText.length);
      ytext.insert(0, canonicalFull);
    }
    // ...
  }
}
```

## Callers

| Caller | File:line | Origin |
|---|---|---|
| `POST /api/agent-write` | `api-extension.ts:573-587` | `AGENT_WRITE_ORIGIN` |
| `POST /api/agent-write-md` | `api-extension.ts:652-680` | `AGENT_WRITE_ORIGIN` |
| `POST /api/agent-patch` | `api-extension.ts:965-983` | `AGENT_WRITE_ORIGIN` |

Also called from `um.undo()` / `um.redo()` code paths (per CLAUDE.md STOP rule).

## The flow

1. Client types locally → XmlFragment local tx on client's Y.Doc → Hocuspocus queues the WebSocket message.
2. User's HTTP request to `/api/agent-write*` arrives at server (or, for agent-driven clients, agent MCP call fires).
3. Server handler calls `sessionManager.getSession(docName)` to get a `DirectConnection` to the server's Y.Doc.
4. Server executes `doc.transact(() => { ytext.insert(...); syncTextToFragment(document); }, AGENT_WRITE_ORIGIN)`.
5. **At step 4, the server's Y.Doc may not yet have received client's XmlFragment mutation from step 1** (WebSocket round-trip in flight).
6. `syncTextToFragment` reads server's Y.Text (has the agent's just-inserted content + whatever was previously synced, but NOT the client's in-flight XmlFragment changes).
7. `updateYFragment(document, xmlFragment, parseYText)` rewrites XmlFragment to match parsed Y.Text — destroying any XmlFragment content that wasn't already in Y.Text.
8. Server broadcasts this transaction (XmlFragment + Y.Text delta) to the client.
9. Client's XmlFragment has the server's destructive rewrite applied via CRDT merge — user's local typing overwritten.

## Evidence (integration reproducer)

Test: `packages/app/tests/integration/observer-a-baseline-absorption-repro.test.ts`

### P0 test output
```
[P0-probe] ytext: "agent line X\n"
expect(finalYtext).toContain('edited by user');  ← FAILS
```
User typing "edited by user" is missing from Y.Text. Only agent content remains.

### P0-stress (10 rounds)
```
[P0-stress] missing user markers: 10/10
```
All 10 user markers lost across 10 rounds of user typing + agent write.

## Why PR #128 didn't catch this

PR #128 operates in the client's Observer A (XmlFragment → Y.Text direction). Bug-A is server-side, **upstream** of the client's Observer A. By the time the client receives the server-broadcast tx, user content is already gone.

## Why this is V0-14-critical

V0-14 attaches per-agent `Y.UndoManager(ytext, { trackedOrigins: Set(['agent-write']) })`. The UM tracks Y.Text Items. Under Bug-A, Y.Text has the agent's content and the "lost" user content is a client-side XmlFragment divergence — but then the server's stomping BROADCAST overwrites the client's XmlFragment, permanently destroying user typing that existed only in XmlFragment. An `um.undo()` reverts agent Items, but the user's typing is already gone. Zombie content meets data loss.
