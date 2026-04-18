---
name: Loro CodeMirror tree-aware check
description: Does loro-codemirror@0.3.3 have the flat-string-cast dual-view limitation, or is it tree-aware? Cross-report evidence shared by reports/yjs-14-ecosystem-adoption and reports/peritext-on-yjs-feasibility.
sources:
  - npm registry (loro-codemirror, loro-prosemirror, loro-crdt, @y/codemirror tarballs)
  - GitHub (loro-dev/loro-prosemirror issue #77, SchoolAI/loro-extended)
  - Loro official type declarations (loro_wasm.d.ts)
date: 2026-04-16
---

# Loro CodeMirror Tree-Aware Check

## Short answer

**loro-codemirror@0.3.3 has the same dual-view limitation as `@y/codemirror@0.0.0-3`** — it binds to `LoroText` exclusively and consumes `Delta<string>`-shaped ops (never array-insert / tree-shape ops). Loro's `loro-prosemirror@0.4.3` binding, by contrast, requires a `LoroMap<{nodeName, attributes, children: LoroList}>` container shape that is *disjoint* from `LoroText`. So a single Loro container cannot drive both bindings — the exact same "bridge problem relocates" pattern documented for the Yjs-14 `@y/*` stack.

Loro is materially ahead of Yjs 14 on **Peritext mark semantics** (it ships `configTextStyle({expand: 'before'|'after'|'both'|'none'})` natively, solving the boundary anomaly Yjs doesn't address) but is **NOT ahead on dual-view editor binding architecture**. The CRDT-binding gap is ecosystem-universal as of 2026-04-16, not Yjs-specific.

## loro-codemirror source trace (the equivalent flat-string cast)

`loro-codemirror@0.3.3` tarball: `https://registry.npmjs.org/loro-codemirror/-/loro-codemirror-0.3.3.tgz`
Source: `/tmp/loro-cm/package/src/sync.ts`

### Binding shape — `LoroText` only

File: `/tmp/loro-cm/package/src/utils.ts` (verbatim):

```ts
import type { LoroDoc, LoroText } from "loro-crdt";

/**
 * Get the text from the document
 */
export const defaultGetTextFromDoc = (doc: LoroDoc): LoroText => {
    return doc.getText("codemirror");
};
```

`LoroSyncPluginValue` constructor signature (`src/sync.ts:15-19`):

```ts
constructor(
    private view: EditorView,
    private doc: LoroDoc,
    private getTextFromDoc: (doc: LoroDoc) => LoroText
) { ... }
```

**The binding parameter type is `LoroText`, not `LoroContainer` or the wider `LoroType` union.** There is no `LoroMap<LoroNodeContainerType>` branch, no tree-node path, no way to feed a ProseMirror-shaped Loro container to this plugin.

### The observer type filter + flat-string insert

`src/sync.ts:61-84` — the import-event handler, verbatim:

```ts
if (e.by === "import") {
    let changes: ChangeSpec[] = [];
    let pos = 0;
    for (let { diff, target } of e.events) {
        const text = this.getTextFromDoc(this.doc);
        // Skip if the event is not a text event
        if (diff.type !== "text") return;                              // ← line 64
        // Skip if the event is not for the current document
        if (target !== text.id) return;
        const textDiff = diff.diff;
        for (const delta of textDiff) {
            if (delta.insert) {
                changes.push({
                    from: pos,
                    to: pos,
                    insert: delta.insert,                              // ← line 73
                });
            } else if (delta.delete) {
                changes.push({
                    from: pos,
                    to: pos + delta.delete,
                });
                pos += delta.delete;
            } else if (delta.retain != null) {
                pos += delta.retain;
            }
        }
        ...
```

**Two load-bearing facts:**

1. **Line 64** — `if (diff.type !== "text") return;` — the binding filters the event stream to `TextDiff` only. `ListDiff | MapDiff | TreeDiff | CounterDiff` events are dropped at the door. There is no tree-op branch.

2. **Line 73** — `insert: delta.insert` — `delta.insert` is typed as `T` in `Delta<T>` and the `target === text.id` filter + `TextDiff` filter combine to guarantee `T = string` per the Loro type contract (`loro_wasm.d.ts:813-816`):
   ```ts
   export type TextDiff = {
       type: "text";
       diff: Delta<string>[];
   };
   ```

   No explicit `as string` cast like `@y/codemirror`'s `/** @type {string} */ (op.insert)` appears, but the cast is enforced by the Delta generic parameter `<string>` and the runtime filter at line 64 (`diff.type !== "text"`). Functionally identical behavior: non-text shapes are rejected upstream; the CodeMirror `ChangeSpec.insert` receives only string values.

### Update direction (CM → Loro)

`src/sync.ts:109-120`:

```ts
update.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
    const insertText = insert.sliceString(0, insert.length, "\n");
    if (fromA !== toA) {
        this.getTextFromDoc(this.doc).delete(fromA + adj, toA - fromA);
    }
    if (insertText.length > 0) {
        this.getTextFromDoc(this.doc).insert(fromA + adj, insertText);
    }
    adj += insertText.length - (toA - fromA);
});
```

Only `LoroText.insert(pos, string)` and `LoroText.delete(pos, len)` are called. No `LoroMap` / `LoroList` / `LoroTree` mutation paths. Entirely flat-string.

## loro-prosemirror tree shape

Source: `loro-prosemirror@0.4.3` tarball, `/tmp/loro-pm/package/src/lib.ts`.

### Container shape — LoroMap tree

`lib.ts:19-37`:

```ts
export type LoroChildrenListType = LoroList<
  LoroMap<LoroNodeContainerType> | LoroText
>;
export type LoroNodeContainerType = {
  [CHILDREN_KEY]: LoroChildrenListType;
  [ATTRIBUTES_KEY]: LoroMap;
  [NODE_NAME_KEY]: string;
};

export type LoroDocType = LoroDoc<{
  doc: LoroMap<LoroNodeContainerType>;
  data: LoroMap;
}>;
export type LoroNode = LoroMap<LoroNodeContainerType>;
export type LoroContainer =
  | LoroChildrenListType
  | LoroMap<LoroNodeContainerType>
  | LoroText
  | LoroTree;
export type LoroType = LoroContainer | Value;
```

**Keys:**
- `ROOT_DOC_KEY = "doc"` (`lib.ts:59`)
- `ATTRIBUTES_KEY = "attributes"` (`lib.ts:60`)
- `CHILDREN_KEY = "children"` (`lib.ts:61`)
- `NODE_NAME_KEY = "nodeName"` (`lib.ts:62`)

### Recursive materialization — tree dispatch

`lib.ts:107-162` — `createNodeFromLoroObj`:

```ts
export function createNodeFromLoroObj(
  schema: Schema,
  obj: LoroNode | LoroText,
  mapping: LoroNodeMapping,
): Node | Node[] | null {
  ...
  if (obj instanceof LoroMap) {
    const attributes = getLoroMapAttributes(obj);
    const children = getLoroMapChildren(obj);
    const nodeName = obj.get("nodeName");
    ...
    const mappedChildren = children
      .toArray()
      .flatMap((child) => createNodeFromLoroObj(schema, child as any, mapping))
    ...
    retval = schema.node(nodeName, attributes.toJSON(), mappedChildren);
    ...
  } else if (obj instanceof LoroText) {
    retval = [];
    for (const delta of obj.toDelta()) {
      ...
      retval.push(schema.text(delta.insert, marks));
      ...
    }
  }
  ...
}
```

Every non-text ProseMirror node is a `LoroMap` with a nested `LoroList` of children; text runs are `LoroText` leaves containing formatted delta ops. The top-level mount point is `doc.getMap("doc")` by default (or a caller-supplied `containerId`).

### What would a single Loro container driving both bindings look like?

**Incompatible at the container-type layer:**

- `loro-codemirror` needs a `LoroText` (`utils.ts:6-8`).
- `loro-prosemirror` needs a `LoroMap<LoroNodeContainerType>` (`lib.ts:139-143`, `sync-plugin.ts:127-143`).

A `LoroMap` is not a `LoroText`. Passing a `LoroMap` to `LoroSyncPluginValue` would:
1. Fail the type assertion in `getTextFromDoc` (forced to cast).
2. At runtime, `LoroMap` has no `insert(pos, string)` / `delete(pos, len)` — update-direction (line 113, 116 of sync.ts) calls throw.
3. Observe-direction: events emit `MapDiff` / `ListDiff` / `TreeDiff`, all filtered out by `sync.ts:64` (`if (diff.type !== "text") return`).

A caller who wants dual-view on a single container would need to:
- Write a new LoroMap-aware CodeMirror binding that walks the tree, projects to flat markdown, tracks a mapping from flat CM offsets back to LoroMap paths, and translates CM `ChangeSpec` back into LoroMap operations; OR
- Keep two Loro containers (one `LoroText` for source, one `LoroMap` tree for WYSIWYG) and bridge them — same architecture as Open Knowledge's current Y.XmlFragment ↔ Y.Text setup, just with different primitives underneath.

**Loro's container-type primitives do not include an all-in-one hybrid "LoroTree + LoroText"** that could serve both shapes. `LoroTree` exists but represents fractional-index ordered tree nodes (see `loro_wasm.d.ts:717-730`, `TreeOp`) — it's a movable-tree container, not a ProseMirror-schema container. `loro-prosemirror` does NOT use `LoroTree` (`lib.ts:37` includes it in the `LoroContainer` union but `createNodeFromLoroObj` has no `LoroTree` branch — only `LoroMap` and `LoroText`).

## Dual-view feasibility on Loro

**Same conclusion as `@y/*`-stack D3 analysis in `reports/yjs-14-ecosystem-adoption/REPORT.md:129-151`.** A single Loro container cannot simultaneously serve `loro-codemirror` and `loro-prosemirror`. The binding problem does not disappear by choosing Loro — it relocates to a different CRDT.

Three options for Loro dual-view:

| Option | Work | Result |
| --- | --- | --- |
| A. Stock bindings, two containers, custom bridge | ≈ current Open Knowledge XmlFragment↔Y.Text pattern, just on Loro primitives | No Peritext-semantics benefit from unification; two-writer problem survives |
| B. Fork `loro-codemirror` to be LoroMap-aware | Equivalent to writing a new binding from scratch: tree walker + markdown projection + flat-offset ↔ tree-path translation + inverse update algorithm. No reference implementation exists. | Single container; but all novel code |
| C. Build a flat-markdown LoroText + separate LoroMap for block structure, bridge between them | Same as A but inside a single LoroDoc | Identical architecture, no simplification |

Not one of A/B/C is structurally better than today's Y.XmlFragment ↔ Y.Text bridge on Yjs 13. The **binding-layer bridge is ecosystem-universal** — neither Yjs 14 nor Loro makes it go away.

## Comparison with @y/codemirror

Verbatim evidence from `@y/codemirror@0.0.0-3` tarball (`/tmp/y-cm/package/src/y-sync.js:208-215`):

```js
if (op.type === 'insert') {
    changes.push({ from: pos, to: pos, insert: /** @type {string} */ (op.insert) })
} else if (op.type === 'delete' && !skipDeletes) {
    changes.push({ from: pos, to: pos + op.delete, insert: '' })
    pos += op.delete
} else if (op.type === 'retain') {
    pos += op.retain
}
```

The `/** @type {string} */ (op.insert)` JSDoc cast is load-bearing — `op.insert` at runtime could be any primitive the observed YType emits; no array branch exists. As cited in `reports/yjs-14-ecosystem-adoption/REPORT.md:45,136-140`, feeding a tree-shape YType to this produces `"[object Object]"` writes at runtime.

### Side-by-side

| Dimension | `@y/codemirror@0.0.0-3` | `loro-codemirror@0.3.3` |
| --- | --- | --- |
| Bound container type | `Y.Type` typed as `YType<{text: true}>` — typing-only assertion | `LoroText` — concrete container class |
| Non-text event handling | No array-insert branch; runtime cast produces `"[object Object]"` | `if (diff.type !== "text") return` at `sync.ts:64` — silent drop |
| Flat-string cast location | `y-sync.js:209` — `/** @type {string} */ (op.insert)` | `sync.ts:73` — implicit via `Delta<string>` generic + TextDiff filter |
| Tree-aware branch exists | No | No |
| Forking cost to add tree-awareness | Equivalent to writing a new binding | Equivalent to writing a new binding |
| Sibling PM binding's container shape | `Y.XmlFragment` (Yjs 13) or typed `YType` (Yjs 14) | `LoroMap<{nodeName, attributes, children: LoroList}>` |
| Single-container dual-binding feasible today | No | No |

**Note the asymmetry in *form* but not in *consequence*:** @y/codemirror has an explicit JSDoc cast; loro-codemirror has an enforced generic type parameter plus an explicit early-return filter. Both achieve the same runtime result — neither can consume tree-shape ops without a fork.

## Loro's Fugue vs Yjs's YATA — any advantage for dual-view?

**No dual-view advantage from the algorithm.** Fugue (Loro) and YATA (Yjs) differ in interleaving behavior under concurrent character-level edits, not in how tree or sequence containers project to flat strings. The dual-view limitation lives at the **binding layer**, above the CRDT algorithm. Both Loro's `LoroText.toDelta()` and Yjs 13's `Y.Text.toDelta()` return per-segment `Delta<string>[]` arrays of the same shape; the observer-event shapes differ in naming (`TextDiff` vs `YTextEvent`) but not in kind.

Loro's documented advantage is in **Peritext mark semantics** — `configTextStyle({ expand: 'before' | 'after' | 'both' | 'none' })` per `loro-prosemirror/src/text-style.ts` maps ProseMirror marks to Peritext-correct boundary behavior. That is orthogonal to the dual-view bridge problem. See `reports/peritext-on-yjs-feasibility/REPORT.md:272`.

No Loro blog post or README surveyed (`loro.dev/blog/crdt-richtext`, `loro.dev/docs/*`, `loro-dev/loro` README) claims a dual-view editor-binding advantage. The Loro positioning is: strong Peritext implementation + strong ProseMirror binding + nascent CodeMirror binding. The CodeMirror binding is feature-equivalent to `@y/codemirror` modulo the Peritext-correct observer, which Yjs also lacks.

## SchoolAI loro-extended's CM binding (if exists)

`SchoolAI/loro-extended` (53 stars, last updated 2026-04-15 per `gh search repos`) was inspected for a tree-aware CM binding.

Package directory listing (`gh api repos/SchoolAI/loro-extended/contents/packages`):

```
change/  hono/  hooks-core/  lens/  react/  repo/  wire-format/
```

Adapters directory (`gh api repos/SchoolAI/loro-extended/contents/adapters`):

```
http-polling/  indexeddb/  leveldb/  postgres/  sse/  webrtc/  websocket-compat/  websocket/
```

No `codemirror` package or adapter. `gh api search/code q="codemirror repo:SchoolAI/loro-extended"` returns zero matches. **SchoolAI has NOT built a tree-aware CodeMirror binding** — their wrapper focuses on a Repo/Automerge-Repo-style abstraction, React hooks, a wire-format package, and transport adapters. The CodeMirror binding gap is unfilled in the Loro ecosystem.

## Loro-prosemirror issue #77 status (data-loss bug)

- **Created:** 2026-03-28 by a user migrating from TipTap+Hocuspocus
- **State:** `open` (as of 2026-04-16)
- **Closed_at:** `null`
- **Comments:** 0

Verbatim body excerpt (from `gh api repos/loro-dev/loro-prosemirror/issues/77`):

> I hit this when trying to make a site that went between pages: Page A -> Page B -> Page A using TipTap+Loro instead of TipTap+Hocuspocus. When I went back to Page A, all of the content was wiped.
>
> Basically, the problem looks like this:
>
> 1. LoroDoc is populated with server content
> 2. Editor state created with LoroSyncPlugin
> 3. any `docChanged` transaction before `setTimeout(init,0)` fires
> 4. `appendTransaction` creates `doc-changed`
> 5. `apply` calls `updateLoroToPmState` with the empty mapping from `state.init()`
> 6. All loro content replaced with the default empty prosemirror state

**Failure shape: initialization race, not dual-view / tree-flat projection.** The bug is that `LoroSyncPlugin` defers `init()` via `setTimeout(0)` (`sync-plugin.ts:104`), and between construction and init, the mapping is empty. If a TipTap-generated empty-doc transaction arrives in that window, `updateLoroToPmState` runs with an empty mapping and deletes all Loro content. This is a **lifecycle-ordering bug in the ProseMirror binding**, orthogonal to CodeMirror / tree-flat / dual-view concerns.

It does signal that `loro-prosemirror@0.4.3` is pre-1.0-stable — the mapping-reset edge case would not survive a mature binding — but the specific bug shape does not bear on the dual-view question.

## Implications

### For `reports/yjs-14-ecosystem-adoption/REPORT.md` D3 (Yjs 14 vs dual-view)

The D3 finding — "Single-YType dual-view binding is NOT achievable with stock @y/* today" — is **not weakened by checking the adjacent CRDT**. Loro has the identical limitation on the CodeMirror side. Choosing Loro over Yjs 14 does not unlock dual-view; it preserves it as an unsolved ecosystem-universal problem.

**New comparative note for D3:** Cross-CRDT verification. Both Yjs 14's `@y/codemirror` and Loro's `loro-codemirror@0.3.3` flat-string-gate their observer events. Neither ecosystem has shipped a tree-aware CodeMirror binding as of 2026-04-16. SchoolAI (the most active downstream Loro consumer) has not built one either.

### For `reports/peritext-on-yjs-feasibility/REPORT.md` Option B (Loro path)

The NEW dimension "Loro now concretely competitive" at `REPORT.md:284-294` notes: "No Loro CodeMirror binding for dual-view — same Architecture-C problem as `@y/codemirror`." This evidence file **confirms that statement with source trace**.

**New finding:** The "Architecture C on Loro" estimate would require ~equivalent new-binding work to "Architecture C on `@y/*`" — roughly a forked CodeMirror binding or a custom bridge layer. The delta is:

| Axis | `@y/*` 14 | Loro |
| --- | --- | --- |
| Peritext mark semantics | Incorrect boundaries (no expand flag) | Correct (`configTextStyle({expand})`) |
| ProseMirror binding maturity | `@y/prosemirror@2.0.0-2` published, preserves legacy v1 surface + adds delta API | `loro-prosemirror@0.4.3` with active pre-1.0 data-loss bug (issue #77) |
| CodeMirror binding tree-awareness | Absent (string cast) | Absent (LoroText-only, type-gated) |
| Canonical server | `@y/websocket-server` (alpha) + Hocuspocus (Yjs 13 only) | None — would need to build |
| Open source dual-view reference | None published | None published |

**The dual-view binding gap is ecosystem-universal, not a Yjs-specific deficit.** Open Knowledge's existing Y.XmlFragment ↔ Y.Text bridge is, structurally, the same architecture that would be required on any of these stacks. The question is not "which CRDT unlocks dual-view" (none do today) but "which CRDT is least costly to bridge on top of."

### For porting patterns

**No pattern to port back to `@y/*`.** Loro's CodeMirror binding is not using a novel dual-view technique — it's the same flat-string observer that @y/codemirror uses, just filtered at a different layer. Nothing Loro-specific could be borrowed to give `@y/codemirror` tree-awareness. A tree-aware binding on either CRDT would be a greenfield engineering project.

**The architectural conclusion cascades:** "is the dual-view binding solvable?" — Not in the Yjs 14 ecosystem today (per the existing D3 finding), not in the Loro ecosystem today (per this evidence file). It is solvable only by writing a novel binding. The existing Open Knowledge bridge solves it at the CRDT-pair level, which is a different architectural choice but one that now appears to be the *prevailing* approach in the CRDT editor ecosystem — not an artifact of Yjs 13's type-level split.
