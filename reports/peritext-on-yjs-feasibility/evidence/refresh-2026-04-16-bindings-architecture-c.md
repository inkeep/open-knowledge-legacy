# Path C research refresh — Yjs 14 binding ecosystem (2026-04-16)

Source-traced verification of three dimensions of the prior 2026-04-07 claim that Architecture C ("delta-protocol dual view") could ship in 2-4 weeks on Yjs 14.

**Headline finding:** the prior claim's feasibility baseline materially shifted between 2026-04-07 and today. The packages have been re-namespaced (`yjs` → `@y/y`, `y-prosemirror` → `@y/prosemirror`, `y-codemirror.next` → `@y/codemirror`), all three are in Release-Candidate / `0.0.0-N` pre-release, and y-prosemirror v2's `syncPlugin` and y-codemirror's `YSyncConfig` already accept generic YType bindings via the unified `lib0/delta` protocol — but **no public example exists** of a single YType bound to both editors simultaneously, no design doc covers it, and the schema mismatch between PM's `$prosemirrorDelta` (tree+text+recursiveChildren) and CM's `Y.Type<{text: true}>` (flat text) means the dual-view binding requires either a transformer (`lib0/delta/transformer.js`) or a separate-YType-with-Binding pattern (`lib0/delta/binding.js`'s `Binding<DeltaA, DeltaB>` primitive). Neither has been demonstrated end-to-end. Today's status sharpens — it does not invalidate — the prior claim, but the "2-4 weeks" estimate looks optimistic for a *robust* dual-view binding given:

- All three packages are pre-release and breaking weekly (rc.13 today, rc.7 was "latest" days ago, rc.12 yesterday).
- The unifying `lib0/delta` schema infrastructure is published but the cross-binding patterns (`bind(a, b, template)`) are scaffolded with `// @todo` and `@ts-nocheck` markers in the binding module.
- y-codemirror's binding ties presentation choices (e.g. `op.insert` is treated as a `string` only) to the text-flavor schema, so a tree-flavor YType cannot drop in without an adapter layer.

A fast-and-careful spike is plausible in 2-4 weeks. A *production-grade* dual-view binding with attribution, undo, and the existing observer-A/B invariants the OK codebase relies on is a larger surface area than the original claim suggests. Detail and evidence below.

---

## D3. y-prosemirror v2.x current state

### D3.1 — Package re-namespace and version status

**Claim:** `y-prosemirror` was renamed to `@y/prosemirror` for v2; the npm-published v2 pre-release is `2.0.0-2` (December 2025); the legacy `y-prosemirror` registry has no published v2.

**Evidence:**
- npm registry `https://registry.npmjs.org/y-prosemirror`: latest = `1.3.7`, no `next` or `beta` dist-tag, no v2 pre-release published.
- npm registry `https://registry.npmjs.org/@y/prosemirror`: latest = `2.0.0-0` (May 2025), beta = `2.0.0-2` (Dec 16 2025).
- GitHub `yjs/y-prosemirror` repo `master` branch package.json: `"name": "@y/prosemirror"`, `"version": "2.0.0-2"`. Legacy npm name is dropped in master.
- Recent commits on master include suggestion mode work (Apr 14 2026), undo plugin (Apr 8 2026), cursor plugin (Apr 8 2026) — repo is actively developed but pre-release.

**Confidence:** **HIGH.** Verified directly from npm registry JSON and GitHub raw package.json.

### D3.2 — Peer dependencies pin to `@y/y` (Yjs 14 namespace)

**Claim:** y-prosemirror v2 pins to `@y/y` (the new Yjs 14 npm name), not the legacy `yjs` package.

**Evidence (verbatim from `@y/prosemirror@2.0.0-2/package.json`):**
```json
"peerDependencies": {
  "@y/protocols": "^1.0.6-rc.1",
  "@y/y": "^14.0.0-rc.13",
  "prosemirror-model": "^1.7.1",
  "prosemirror-state": "^1.2.3",
  "prosemirror-view": "^1.9.10"
}
```

`@y/y@14.0.0-rc.13` was published 2026-04-14 — yesterday. The latest dist-tag was rc.7, beta is rc.13. Active churn.

**Confidence:** **HIGH.**

### D3.3 — `ySyncPlugin` v1 vs `syncPlugin` v2 signatures

**Claim:** v1 binds to a specific `Y.XmlFragment`. v2 binds to a generic `Y.Type` (any YType).

**Evidence — v1 (legacy, what OK uses today, `y-prosemirror@1.3.7/src/plugins/sync-plugin.js`):**
```javascript
export const ySyncPlugin = (yXmlFragment, hooks = {}) => {
  // ...
  return new Plugin({
    key: ySyncPluginKey,
    view: view => new ProsemirrorBinding(yXmlFragment, view),
    // ...
  })
}
```
The first parameter is named `yXmlFragment` and is passed to `ProsemirrorBinding` which keeps it as `this.type` and assumes the XmlFragment API.

**Evidence — v2 (`@y/prosemirror@2.0.0-2/src/sync-plugin.js`, lines 78-101):**
```javascript
/**
 * This Prosemirror {@link Plugin} is responsible for synchronizing the prosemirror {@link EditorState} with a {@link Y.XmlFragment}
 * @param {object} opts
 * @param {Y.Doc} [opts.suggestionDoc] A {@link Y.Doc} to use for suggestion tracking
 * @param {AttributionMapper} [opts.mapAttributionToMark] ...
 * @returns {Plugin}
 */
export function syncPlugin (opts = {}) {
  return new Plugin({
    key: ySyncPluginKey,
    state: {
      init: () => {
        return $syncPluginState.expect({
          ytype: null,
          attributionManager: null,
          attributionMapper: opts.mapAttributionToMark || defaultMapAttributionToMark
        })
      },
      // ...
    }
  })
}
```

The function takes ONLY an opts object — no YType parameter. The YType is set later via plugin-state metadata:

```javascript
export const $syncPluginState = s.$object({
  ytype: Y.$ytypeAny.nullable,
  attributionManager: Y.$attributionManager.nullable,
  attributionMapper: /** @type {s.Schema<AttributionMapper>} */ (s.$function)
})
```

`Y.$ytypeAny` is the schema for "any YType" (lines 1491-1492 of `@y/y/src/ytype.js`):
```javascript
export const $ytype = _dconf => s.$instanceOf(YType)
export const $ytypeAny = s.$instanceOf(YType)
```

The plugin observes the YType via `ytype.observeDeep(...)` and applies remote changes via `ytype.toDeltaDeep(am)` and `ytype.applyDelta(diff, am)` — both are generic methods on the unified `Y.Type` class.

**Confidence:** **HIGH.** Direct source comparison.

### D3.4 — Schema flavor still text+tree+recursive (PM-shaped)

**Claim:** Although v2 accepts a generic YType, the delta schema it produces and consumes is PM-shaped: `name + attrs + text + recursiveChildren`.

**Evidence (`@y/prosemirror@2.0.0-2/src/sync-utils.js:19`):**
```javascript
export const $prosemirrorDelta = delta.$delta({
  name: s.$string,
  attrs: s.$record(s.$string, s.$any),
  text: true,
  recursiveChildren: true
})
```

This is the PM-bound schema — produced by `nodeToDelta()` and consumed by `deltaToPSteps()`. Even though `ytype` is generic, the delta operations the plugin computes assume this schema.

**Implication:** v2 can be bound to *any* YType whose `name` is set appropriately and whose contents fit a PM-tree shape. A YType with `Y.Type<{text: true}>` flavor (flat text, what y-codemirror expects) does not naturally produce/consume `$prosemirrorDelta` shape — schemas differ structurally.

**Confidence:** **HIGH.**

---

## D4. y-codemirror.next compat with Yjs 14

### D4.1 — Two npm packages exist; the latest is `@y/codemirror`

**Claim:** Like y-prosemirror, y-codemirror.next was re-namespaced to `@y/codemirror` for the Yjs 14 era.

**Evidence:**
- npm `https://registry.npmjs.org/y-codemirror.next`: latest = `0.3.5` (June 2024), peer = `yjs ^13.5.6`. No `next`/`beta` tag.
- npm `https://registry.npmjs.org/@y/codemirror`: latest = `0.0.0-0` (Dec 8 2025), beta = `0.0.0-3` (Jan 19 2026). Pre-release.
- GitHub repo (https://github.com/yjs/y-codemirror.next) has a single branch `main` whose head SHA `bcc356ea` is the `0.0.0-3` publish.
- Recent commits on `main`: `bump yjs` (Jan 19 2026), `bump to latest yjs and fix tests` (Jan 19), `use yjs beta package @y/y` (Dec 10 2025), `move to @y/codemirror` (Dec 8 2025).

The legacy `y-codemirror.next` package on npm is now stale (last published June 2024); the active maintenance has moved to `@y/codemirror` under the same GitHub repo.

**Confidence:** **HIGH.**

### D4.2 — Peer dependencies pin to `@y/y@^14.0.0-22`

**Evidence (verbatim from `@y/codemirror@0.0.0-3/package.json` on `main`):**
```json
"peerDependencies": {
  "@codemirror/state": "^6.5.2",
  "@codemirror/view": "^6.38.6",
  "@y/protocols": "^1.0.6-3",
  "@y/y": "^14.0.0-22"
}
```

Note: `@y/y@^14.0.0-22` is the older numeric pre-release scheme (`14.0.0-N`); y-prosemirror v2 has migrated to `^14.0.0-rc.13`. There is a small SemVer mismatch — both packages pin to *some* Yjs 14 pre-release but to different generations of the pre-release window.

**Confidence:** **HIGH.**

### D4.3 — Binding accepts `Y.Type<{text: true}>` (generic, but text-flavored)

**Claim:** y-codemirror does NOT require the legacy `Y.Text` class; it accepts any YType whose delta schema is text-flavored.

**Evidence (`@y/codemirror@0.0.0-3/src/y-sync.js`, lines 79-93):**
```javascript
export class YSyncConfig {
  /**
   * @param {Y.Type<{ text: true }>} ytext
   * @param {import('@y/protocols/awareness').Awareness} awareness
   * @param {Y.AbstractAttributionManager} am
   */
  constructor (ytext, awareness, am) {
    /**
     * @type {Y.Type<{ text: true }>}
     */
    this.ytext = ytext
    this.awareness = awareness
    this.undoManager = new Y.UndoManager(ytext)
    this.am = am
  }
  // ...
}
```

The constructor parameter is named `ytext` and typed as `Y.Type<{ text: true }>`. This is the unified Yjs 14 `Type` class, parameterized by a delta-schema marker `{ text: true }`. It is NOT specifically `Y.Text` — the `Y.Text` class no longer exists as a distinct symbol in `@y/y` (see D8.2 below).

The observer reads the YType's text-shaped delta:
```javascript
delta = this._ytext.toDelta(this.conf.am, { itemsToRender: changes, retainInserts: true })
// ...
const { changes, decorations } = ydeltaToCmChanges(delta, tr.origin === this.conf)
```

And writes back via `ytext.applyDelta(d, this.conf.am)` (line 290) — same generic API as y-prosemirror.

**Confidence:** **HIGH.**

### D4.4 — `ydeltaToCmChanges` assumes string `op.insert`

**Claim:** y-codemirror's delta-to-CM converter assumes inserts are strings, not nested deltas — it cannot consume a tree-flavored delta directly.

**Evidence (`@y/codemirror@0.0.0-3/src/y-sync.js`, lines 187-216):**
```javascript
for (const op of delta.children) {
  if (op.type === 'insert' || op.type === 'retain') {
    // attribution decoration logic ...
  }
  if (op.type === 'insert') {
    changes.push({ from: pos, to: pos, insert: /** @type {string} */ (op.insert) })
  } else if (op.type === 'delete' && !skipDeletes) {
    changes.push({ from: pos, to: pos + op.delete, insert: '' })
    pos += op.delete
  } else if (op.type === 'retain') {
    pos += op.retain
  }
}
```

The cast `/** @type {string} */ (op.insert)` is the giveaway: this consumer expects insert ops to carry strings, not nested `delta.Node` instances. A tree-flavored YType (PM shape) would emit nested-children inserts that this function would cast incorrectly and drop.

**Confidence:** **HIGH.** The cast is verbatim in source.

### D4.5 — No Yjs 14-specific PRs in y-codemirror.next legacy repo branch

**Claim:** There is NO branch on `yjs/y-codemirror.next` other than `main` working on Yjs 14 — the migration was done in-place on `main` and renamed the package. No parallel "v2" branch exists.

**Evidence:** GitHub branches API for `yjs/y-codemirror.next` returns only `main`. No `v2`, `v14`, `next`, or `upgrade` branch.

**Confidence:** **HIGH.**

---

## D8. Architecture C deep mechanics — source trace

### D8.1 — The `lib0/delta` protocol exists and is documented

**Claim:** Yjs 14's "unified delta protocol" lives in `lib0/src/delta/` and is the integration substrate.

**Evidence:** GitHub `dmonad/lib0/src/delta/` contains:
- `delta.js` (81,144 bytes) — schema-based delta primitives
- `binding.js` (10,828 bytes) — generic two-RDT bidirectional binding
- `transformer.js` (16,167 bytes) — delta transformation between schemas
- `readme.md` — explicit documentation of map / text / array / node delta flavors

From `lib0/src/delta/readme.md`:
```javascript
// Delta for Text-like structures (Quill-style)
const $d = delta.$delta(s.$any, null, s.$string)

// Delta for Node-like structures (XML/PM-shaped tree)
const $d = delta.$delta(s.$literal('div', 'p', 'h1'), { style: s.$string }, s.$string, true)
```

The same `delta.$delta(...)` factory produces schemas of all flavors. `$prosemirrorDelta` (above) and `Y.Type<{text: true}>`'s schema are both products of this factory. **All YTypes use the same delta framework — they just have different schemas.**

**Confidence:** **HIGH.**

### D8.2 — Yjs 14 has ONE `Y.Type` class — `getText` / `getXmlFragment` are gone

**Claim:** In Yjs 14, the unified type is `YType` with a single `Doc.get(key, name)` accessor. The legacy `Y.Text`, `Y.XmlFragment`, `Y.Array`, `Y.Map` classes do not exist as separate exports.

**Evidence (`@y/y/src/index.js:23`):**
```javascript
export { YType as Type, getTypeChildren, typeMapGetSnapshot, typeMapGetAllSnapshot, $ytype, $ytypeAny } from './ytype.js'
```

That is the *only* shared-type export. There is no `export { YText, YXmlFragment, YArray, YMap }`.

**Evidence (`@y/y/src/utils/Doc.js:179-203`):**
```javascript
get (key = '', name = null) {
  return map.setIfUndefined(this.share, key, () => {
    const t = new YType(name)
    t._integrate(this, null)
    return t
  })
}
```

That is the only accessor method on Doc. There is no `getText`, `getXmlFragment`, `getArray`, `getMap`. The `name` parameter (e.g. `'text'`, `'xml-fragment'`) is what gives the YType its delta-schema flavor.

**Implication for OK codebase:** the existing `doc.getXmlFragment('default')` and `doc.getText('source')` calls do not exist on Yjs 14. Any migration must replace them with `doc.get('default', 'xml-fragment')` and `doc.get('source', 'text')` (or whatever name strings Yjs 14 expects).

**Confidence:** **HIGH.**

### D8.3 — `YType.applyDelta(d, am)` and `YType.toDelta(am, opts)` are generic

**Claim:** Both y-prosemirror v2 and y-codemirror call the *same* generic methods on YType.

**Evidence (`@y/y/src/ytype.js:1078-1100`):**
```javascript
/**
 * Apply a {@link Delta} on this shared type.
 * @param {delta.DeltaAny} d The changes to apply on this element.
 * @param {AbstractAttributionManager} am
 * @public
 */
applyDelta (d, am = noAttributionsManager) {
  if (this.doc == null) {
    (this._prelim || (this._prelim = /** @type {any} */ (delta.create()))).apply(d)
  } else {
    transact(this.doc, transaction => {
      const currPos = new ItemTextListPosition(null, this._start, 0, new Map(), am)
      for (const op of d.children) {
        if (delta.$textOp.check(op)) {
          insertContent(transaction, /** @type {any} */ (this), currPos, new ContentString(op.insert), op.format || {})
        } else if (delta.$insertOp.check(op)) {
          insertContentHelper(transaction, this, currPos, op.insert, op.format || {})
        } // ... retain, delete, modify ...
      }
    })
  }
}
```

`applyDelta` dispatches on op kind (`$textOp` / `$insertOp` / `$retainOp` / `$deleteOp` / `$modifyOp`) — it can absorb both flat-text deltas and tree deltas because both flavors are subsets of `delta.DeltaAny`.

**Evidence (`@y/y/src/ytype.js:835`):**
```javascript
toDelta (am = noAttributionsManager, opts = {}) {
  const { itemsToRender = null, retainInserts = false, retainDeletes = false, deletedItems = null, deep = false } = opts
  // ... computes either flat or nested delta depending on `deep` flag ...
}
```

`toDelta` returns deltas of the YType's native schema; `toDeltaDeep` (called by y-prosemirror) walks into child YTypes recursively.

**Confidence:** **HIGH.**

### D8.4 — `lib0/delta/binding.js` is the dual-RDT primitive

**Claim:** lib0 ships an explicit `Binding<DeltaA, DeltaB>` class that connects two RDTs by routing each side's `change` event through a `Transformer` template into the other side's `update`. This is the canonical primitive for dual-view scenarios.

**Evidence (`lib0/src/delta/binding.js:25-65`):**
```javascript
/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 */
export class Binding {
  /**
   * @param {RDT<DeltaA>} a
   * @param {RDT<DeltaB>} b
   * @param {dt.Template<any,DeltaA,DeltaB>} template
   */
  constructor (a, b, template) {
    this.t = template.init()
    this.a = a
    this.b = b
    this._mux = mux.createMutex()
    this._achanged = this.a.on('change', d => this._mux(() => {
      const tres = this.t.applyA(d)
      if (tres.a) { a.update(tres.a) }
      if (tres.b) { b.update(tres.b) }
    }))
    this._bchanged = this.b.on('change', d => this._mux(() => {
      const tres = this.t.applyB(d)
      if (tres.b) { this.b.update(tres.b) }
      if (tres.a) { a.update(tres.a) }
    }))
  }
  // ...
}

export const bind = (a, b, template) => new Binding(a, b, template)
```

This is *exactly* the abstraction that an Architecture C dual-view solution would need: bind a "PM tree" RDT and a "CM text" RDT through a transformer that converts between them, with a built-in mutex to prevent feedback loops.

**However:** the file ships with `// @ts-nocheck` and `/* eslint-disable */` at the top. The DOM RDT implementation (`DomRDT`) has multiple `// @todo` markers including:
```javascript
// @todo the retrieved changes must be transformed agains the updated changes. need a proper transaction system
```
indicating the binding primitives are EARLY scaffolding. There is no shipped `YRDT` or `Y.Type → RDT` adapter in lib0 — the `Y.Type` itself implements the `RDT` contract (`on('change', ...)`, `update(...)`, `destroy()`) but this is not documented or stress-tested.

**Confidence:** **HIGH** that the primitive exists. **MEDIUM** that it is production-ready for a Y.Type ↔ Y.Type binding today.

### D8.5 — `lib0/delta/transformer.js` exists for schema-to-schema transforms

**Claim:** A transformer module exists for converting deltas between schemas (e.g., PM tree → CM flat text).

**Evidence:**
- File `lib0/src/delta/transformer.js` (16,167 bytes) — present in repo.
- The readme.md describes the transformer pattern:
  > "We often have two different data structures that we want to sync. There might be slight differences between those data structures. ... We can achieve automatic back-and-forth transformations with delta transformers."
  ```javascript
  const Λdata = Λ.transform($data, $d =>
      Λ.delta('div', {}, [
          Λ.delta('h1', { style: 'bold:true' }, [Λ.query('headline')($d)], []),
          Λ.delta('p', null, [Λ.query('content')($d)])
      ])
  )
  ```

**Confidence:** **HIGH** that the transformer module exists. **LOW** that it can express the PM-tree ↔ markdown-flat-text transformation that OK needs out of the box — that requires structural collapse (lists, headings, code blocks, tables) which is fundamentally a markdown-serialization problem, not a schema-to-schema mechanical transform.

### D8.6 — No public dual-binding example exists

**Claim:** No public repository, demo, or test is known to bind both `@y/prosemirror` and `@y/codemirror` to the same YType (or to two YTypes via `bind()`).

**Evidence (negative):**
- GitHub code search for `"@y/prosemirror"` AND `"@y/codemirror"` returns no results (search requires sign-in via WebFetch — noted as "GitHub code search not accessible in this context"). The prior 2026-04-07 report's same negative finding stands.
- Open issues on `yjs/y-prosemirror` filtered for `v2`, `delta protocol`, `yjs 14` show only one stale 2020 issue. No issues mention dual binding.
- Open issues on `yjs/y-codemirror.next`: not surfaced via API in this run; the recent commit history shows no demo work for cross-binding.
- Open issues on `yjs/yjs` filtered for `v14`, `dual binding`, `codemirror+prosemirror`: none specifically about cross-editor binding. Issue #748 asks for `getXmlElement` to accept type arguments — confirms users still think in terms of distinct types, not unified YType.
- The y-prosemirror v2 demos in the repo (`demo/` folder, evidenced by recent commits "added cursor plugin to demos", "simplify demo by removing snapshot management UI") are PM-only.
- The y-codemirror demo (`demo/index.html`) appears to be CM-only.

**Confidence:** **HIGH** that no public example currently exists. **CANNOT RULE OUT** private prototypes — but if Kevin Jahns himself had a working dual-binding demo, it would almost certainly be in the demo folder of one of these repos.

### D8.7 — Two architectural shapes are both feasible; both untested

The source-trace shows two possible Architecture C shapes:

**Shape 1: Same YType, two bindings.** Bind a single `YType` with name `'rich-text'` (PM tree shape) to both editors. y-prosemirror v2's `syncPlugin` accepts any YType. y-codemirror's `YSyncConfig` accepts `Y.Type<{text: true}>`. **Schema mismatch: a tree-flavored YType cannot satisfy `Y.Type<{text: true}>`** because `ydeltaToCmChanges` (line 209 of `y-sync.js`) hard-casts `op.insert` to string — nested-children inserts (PM tree) would crash or be silently dropped.

A workaround would be a custom CM binding (fork of `@y/codemirror`) that flattens the tree-delta into a string for CM display by serializing on the fly (markdown or otherwise). This is a non-trivial new binding — call it "y-codemirror-from-tree" — and requires owning serialization end to end, which is exactly what OK already does via `applyAgentMarkdownWrite` and observer A. The key win is that the CRDT *Items* would be authoritative for the PM tree, not the markdown string — eliminating the bridge layer entirely.

**Shape 2: Two YTypes, one bound by `lib0/delta/binding.js`.** Keep two YTypes (PM-tree YType + flat-text YType), bind them via lib0's `Binding<DeltaA, DeltaB>` with a transformer. This preserves both editors' off-the-shelf bindings but moves the bridge logic from server-observer-extension into a lib0 transformer. **The transformer for tree ↔ markdown is not a mechanical schema transform** — it's the same parse/serialize pipeline OK already operates. Architecturally this is "OK's current bridge but written against `Binding` instead of hand-rolled observers". Marginal win unless `Binding`'s mutex + ordered apply solves the convergence races OK currently fights.

**Both shapes are conceptually sound.** Both require new code OK does not have today. Neither has a reference implementation to copy from.

**Confidence:** **HIGH** on the two-shape characterization. **LOW** on which shape is faster to land.

### D8.8 — Pre-release churn risk

**Claim:** All three upstream packages are in `0.0.0-N` / `2.0.0-N` / `14.0.0-rc.N` pre-release with weekly breaking changes. Version-pinning a downstream OK fork to a specific snapshot is essentially mandatory; tracking upstream costs ongoing rebasing.

**Evidence (publish dates within the last 7 days):**
- `@y/y@14.0.0-rc.13` — Apr 14 2026 (yesterday)
- `@y/y@14.0.0-rc.12` — Apr 14 2026
- `@y/y@14.0.0-rc.11` — Apr 11 2026
- `@y/prosemirror@2.0.0-2` — Dec 16 2025 (4 months stale relative to Y core)
- `@y/codemirror@0.0.0-3` — Jan 19 2026 (3 months stale relative to Y core)

The mismatch between `@y/prosemirror`'s `^14.0.0-rc.13` peer and `@y/codemirror`'s `^14.0.0-22` peer (older numeric scheme) means a single project today cannot install both with a satisfying peer-dep solver result without overrides — `@y/codemirror` would either need a rebump to the rc-N scheme or the user pins both packages and uses `npm overrides` / `pnpm.overrides` / `bun.overrides` to coerce a single Yjs version.

**Confidence:** **HIGH.**

### D8.9 — y-prosemirror v2 `syncPlugin` re-runs full diff on every PM update

**Claim (efficiency note):** The v2 plugin's `view.update` hook recomputes the entire delta diff between PM doc and YType state on every PM transaction. For large documents, this is O(N) per keystroke.

**Evidence (`@y/prosemirror@2.0.0-2/src/sync-plugin.js:330-348`):**
```javascript
if (ytype != null) {
  const ycontent = deltaAttributionToFormat(
    ytype.toDeltaDeep(attributionManager || Y.noAttributionsManager),
    pluginState.attributionMapper
  )
  const pcontent = nodeToDelta(view.state.doc)
  const diff = d.diff(ycontent.done(), pcontent.done())
  stripAttributionFormattingFromDelta(diff)
  if (!diff.isEmpty()) {
    mutex(() => {
      ytype.doc.transact(() => {
        ytype.applyDelta(diff, attributionManager || Y.noAttributionsManager)
      }, ySyncPluginKey.get(view.state))
    })
  }
}
```

`ytype.toDeltaDeep(...)` walks the entire YType. `nodeToDelta(view.state.doc)` walks the entire PM doc. `d.diff(...)` is a structural diff. This runs *every time PM dispatches a transaction*, modulated by the mutex. The legacy v1 binding used incremental tracking; v2 takes a more brute-force approach pending optimization.

**Implication for OK:** even before considering Architecture C, a v1 → v2 migration alone has a perf hill to climb on large documents.

**Confidence:** **HIGH** for the source observation. **MEDIUM** on the production perf impact — depends on PM tree size and edit frequency; the comment-out `appendTransaction` block (lines 103-216) suggests this is actively being optimized.

---

## Summary of confidence-labeled findings vs the prior claim

| Prior claim | Today's status | Confidence |
| --- | --- | --- |
| "y-prosemirror@2.0.0-2 (pre-release) available" | TRUE — `@y/prosemirror@2.0.0-2`, published Dec 16 2025 | HIGH |
| "binds to YType<DeltaConf> generically" | TRUE — `syncPlugin` accepts any YType via plugin-state metadata | HIGH |
| "y-codemirror.next operates on Y.Text" | OUTDATED — re-namespaced to `@y/codemirror@0.0.0-3`, accepts `Y.Type<{text:true}>` | HIGH |
| "delta-protocol dual view in 2-4 weeks" | UNVERIFIED — primitives exist (`lib0/delta/binding.js`, generic `applyDelta`/`toDelta`), no reference implementation, schema-mismatch + pre-release churn add real risk | LOW (timing); HIGH (feasibility in principle) |
| "Architecture C gives you dual-view behavior immediately" | OVERSTATED — neither editor's binding can drop in onto the other's YType today; one of {custom CM-from-tree fork, lib0 Binding + tree-text transformer, full schema rewrite} is required | HIGH |

---

## Sharp findings (load-bearing for the spec decision)

1. **Yjs 14's unified YType is real and the protocol substrate is real.** `lib0/delta` (delta.js + binding.js + transformer.js) is the substrate. A YType *is* an RDT in lib0's contract. Both editor bindings (`@y/prosemirror@2.0.0-2`, `@y/codemirror@0.0.0-3`) consume the unified `YType.toDelta` / `YType.applyDelta` API. **The architecture is plausible.**

2. **No dual-view binding has been built or demoed.** Not in the demos. Not in the issues. Not in lib0's binding.js examples. The `Binding<DeltaA, DeltaB>` primitive is scaffolded with `@ts-nocheck` and `@todo` markers. The first user of this pattern in production will be doing original work, not assembling pre-built parts.

3. **The PM-tree ↔ flat-text schema gap is the load-bearing problem.** The two editors' delta schemas are structurally incompatible — `$prosemirrorDelta` has nested-children inserts, `Y.Type<{text:true}>` has string-only inserts. y-codemirror's converter assumes `op.insert: string` via a hard cast. Bridging requires either (a) a custom CM binding that flattens trees on read, or (b) two YTypes connected by a markdown serialize/parse transformer (which is *exactly* what OK's current bridge does, just relocated). Neither is "plug both packages in and go."

4. **Pre-release ABI churn raises the real-world cost above the source-mechanics cost.** `@y/y` published two RCs yesterday. `@y/codemirror` pins to an older Yjs pre-release scheme than `@y/prosemirror`. Anything OK ships against this stack will ride a moving target until Yjs 14 GA.

5. **The "2-4 weeks" estimate is plausible for a SPIKE, not for a production-grade replacement of the OK bridge.** A spike that demonstrates two editors over one Yjs 14 doc — even using a hacky tree-flatten approach — is achievable in 2-4 weeks by an engineer fluent in Yjs, lib0, and PM. Achieving production readiness with the existing OK invariants (bridge, baseline, item-preservation, agent attribution, undo, MDX tolerant parsing, frontmatter sync) is a substantially larger surface area, especially against a churning upstream.

6. **Schema-as-add-only-forever (precedent #9 in CLAUDE.md) becomes more load-bearing under Architecture C.** If a YType's name + delta schema is the persistence shape, narrowing it would be *the* CRDT-permanent data-loss bug. The bar for "what shape is canonical" goes up, not down, in the unified-YType world.

---

## What I did not verify

- The behavior of `Binding<DeltaA, DeltaB>` under genuinely concurrent multi-peer edits — the mutex prevents same-process feedback loops but the cross-peer convergence story is not exercised in any test I could find.
- Whether `@y/prosemirror@2.0.0-2`'s PM-side delta diff scales to OK's typical 10-100 KB docs at production edit frequency.
- Whether `@y/codemirror@0.0.0-3`'s text-flavor binding correctly handles attribution + undo when bound to a YType whose `name` ≠ `'text'` (e.g. `'markdown-source'`).
- Whether a custom transformer that converts `$prosemirrorDelta` ↔ `delta.$delta(s.$any, null, s.$string)` (markdown bytes) is expressible in `lib0/delta/transformer.js`'s composition language at all, or whether it requires writing a fully imperative `Template`.

These would be the next probes if a spike is approved.

---

## Source-trace reference (for re-verification)

| File | Pinned reference | Key lines |
| --- | --- | --- |
| `@y/prosemirror@2.0.0-2/package.json` | github://yjs/y-prosemirror/master | full file |
| `@y/prosemirror@2.0.0-2/src/sync-plugin.js` | github://yjs/y-prosemirror@22303bec/src/sync-plugin.js | 1-356 |
| `@y/prosemirror@2.0.0-2/src/sync-utils.js` | github://yjs/y-prosemirror@22303bec/src/sync-utils.js | 1-205 (esp. line 19) |
| `@y/codemirror@0.0.0-3/package.json` | github://yjs/y-codemirror.next/main | full file |
| `@y/codemirror@0.0.0-3/src/y-sync.js` | github://yjs/y-codemirror.next/main/src/y-sync.js | 1-306 (esp. 79-93, 187-216) |
| `@y/y@14.0.0-rc.13/src/ytype.js` | github://yjs/yjs/main/src/ytype.js | 637 (`class YType`), 835 (`toDelta`), 1078 (`applyDelta`), 1491-92 (`$ytypeAny`) |
| `@y/y@14.0.0-rc.13/src/index.js` | github://yjs/yjs/main/src/index.js | line 23 (`YType as Type`) |
| `@y/y@14.0.0-rc.13/src/utils/Doc.js` | github://yjs/yjs/main/src/utils/Doc.js | 197-203 (`Doc.get`) |
| `lib0/src/delta/readme.md` | github://dmonad/lib0/main/src/delta/readme.md | full file |
| `lib0/src/delta/binding.js` | github://dmonad/lib0/main/src/delta/binding.js | 25-65 (`Binding`), 81 (`bind`) |
| `lib0/src/delta/transformer.js` | github://dmonad/lib0/main/src/delta/transformer.js | (not inspected line-by-line) |

All verified from raw.githubusercontent.com on 2026-04-16. Pre-release versions are subject to change; re-check before any implementation work.
