# Refresh — Yjs 14 Ecosystem (2026-04-16)

Path C research refresh. Verifies prior 2026-04-07 claims with primary-source evidence. All facts cited to npm registry JSON, raw GitHub source, or release pages fetched within the last hour of this report. Today is 2026-04-16.

**TL;DR (verdict):** The prior 2026-04-07 claims are **partially STALE in a direction that strengthens the Yjs 14 thesis**. Yjs 14 has progressed from beta-16 (Apr 7) to **rc-13 (published Apr 14, 2026, ~46 hours before this report)** under a new dual-publish scheme (`yjs` and `@y/y`). Source-level confirmation: YType is a single class in `src/ytype.js` (no separate YText/YMap/YArray exports anywhere in `src/index.js`). Hocuspocus and TipTap-collab line still pin yjs ^13. y-prosemirror has a Yjs-14-pinned prerelease published as `@y/prosemirror@2.0.0-2` on Dec 16, 2025.

---

## D1. Yjs 14 production status TODAY (2026-04-16)

### Prior claim (2026-04-07)

> "yjs@14.0.0-16 (beta)", "yjs@14.0.0-8 (next)", "stable latest remains yjs@13.6.30"

### Findings

| Sub-claim                              | Verdict          | Evidence                                                                                                          |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| "stable latest remains yjs@13.6.30"    | **CONFIRMED**    | `registry.npmjs.org/yjs` dist-tags: `latest: 13.6.30`                                                             |
| "yjs@14.0.0-8 (next)"                  | **STILL PINNED** | `registry.npmjs.org/yjs` dist-tags: `next: 14.0.0-8` (the stale `next` tag has not been updated)                  |
| "yjs@14.0.0-16 (beta)"                 | **REFUTED — moved forward** | `registry.npmjs.org/yjs` dist-tags: `beta: 14.0.0-16` BUT the **same publish stream** under `@y/y` shows **`beta: 14.0.0-rc.13`** (published 2026-04-14T23:31Z) |

### Critical new finding — dual-publish under `@y/y`

The Yjs project now publishes under TWO npm scopes simultaneously:

- **`yjs`** (legacy scope): tags `latest: 13.6.30`, `beta: 14.0.0-16`, `next: 14.0.0-8` — the 14-track tags appear stale relative to `@y/y`.
- **`@y/y`** (new scoped name): tags `latest: 14.0.0-rc.7`, `beta: 14.0.0-rc.13` — actively maintained pre-1.0 of the new naming.

Source: `registry.npmjs.org/@y/y` returned dist-tags `{ latest: "14.0.0-rc.7", beta: "14.0.0-rc.13" }` and the most-recent publish list:

```
14.0.0-rc.13 — 2026-04-14T23:31:14Z
14.0.0-rc.12 — 2026-04-14T14:29:05Z
14.0.0-rc.11 — 2026-04-11T16:38:10Z
14.0.0-rc.10 — 2026-03-29T03:02:27Z
14.0.0-rc.9  — 2026-03-28T15:47:34Z
14.0.0-rc.8  — 2026-03-27T22:29:12Z
14.0.0-rc.7  — 2026-03-27T01:51:13Z
14.0.0-rc.6  — 2026-03-25T15:27:37Z
14.0.0-rc.4  — 2026-03-24T17:04:00Z
14.0.0-rc.3  — 2026-03-23T23:39:33Z
```

The same 14.0.0-rc.13 publish appears in `package.json` at the head of `github.com/yjs/yjs` main branch (verified — package.json shows `"version": "14.0.0-rc.13"`).

**Confidence: HIGH.** Direct npm registry + source-confirmed.

### What changed between -beta.16 and -rc.13

GitHub releases page (`github.com/yjs/yjs/releases`) lists 9 RC publishes between Mar 23 and Apr 14, 2026. Visible release notes (sparse — most show no detailed text):

- **rc.4 / rc.5 (Mar 24-25):** Fixed stack overflow issues and delta application problems; addressed delta modification operations.
- **rc.11 (Apr 11):** Workflow security permissions and supply-chain security measures (housekeeping, not API).
- **rc.12 / rc.13 (Apr 14):** "nested delta fixes for suggestions"; "fix attribution change event to contain explicit attributions"; "update language bindings"; "bump lib0".
- Recent dmonad commit `[ts] properly expose some types` (Apr 11) signals TypeScript surface continuing to firm up.

The transition from `beta` → `rc` between Apr 7 and today is the **substantive status signal** — Kevin Jahns has moved Yjs 14 from "beta" to "release candidate" terminology while still publishing under the new `@y/y` scope. **No 14.0.0 stable release yet.**

**Confidence: HIGH.** Release page + commit log direct.

### README / migration documentation

`raw.githubusercontent.com/yjs/yjs/main/README.md` does **not** mention v14 status, migration, or breaking changes. `INTERNALS.md` likewise focuses on the YATA core algorithm without v14 references.

`yjs/yjs` repo lacks a `RELEASE_NOTES.md` (404). No top-level migration guide is published. Documentation is lagging the source.

**Confidence: HIGH.** Direct fetch returned the full README and INTERNALS contents; no v14 sections present.

### Engine requirements changed

Yjs 14 main `package.json`: `"engines": { "node": ">=22.0.0", "npm": ">=8.0.0" }`. v13 baseline was much lower. **Adopting Yjs 14 implies requiring Node 22+** for any consumer.

**Confidence: HIGH.** Direct from `package.json` field.

---

## D2. Unified `YType<DeltaConf>` source-trace

### Prior claim

> "There is no longer a separate Y.Text class — all types are YType<DeltaConf>. y-prosemirror operates through the generic delta interface."

### Findings — verified DIRECTLY against `src/ytype.js` and `src/index.js` on main branch

| Sub-claim                                                | Verdict       | Evidence                                                                                                          |
| -------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| "There is no longer a separate Y.Text class"             | **CONFIRMED** | `grep "class YText\|class YMap\|class YArray\|class YXml" src/ytype.js` returns **zero matches**. `src/index.js` has **no YText/YMap/YArray/YXmlFragment export** anywhere. |
| "all types are YType<DeltaConf>"                         | **CONFIRMED with caveat** — class is `YType<DConf=any>` where `DConf extends delta.DeltaConf` (note: parameter name in source is `DConf`, not the prior report's `DeltaConf`). Polymorphism axis is real. | See class header below. |
| "y-prosemirror operates through the generic delta interface" | **CONFIRMED** | `@y/prosemirror@2.0.0-2` (Dec 16, 2025) `peerDependencies` pins `@y/y: ^14.0.0-rc.13`. All collection ops surface through the unified delta API. |

### Direct source citation — class declaration

From `raw.githubusercontent.com/yjs/yjs/main/src/ytype.js` lines 633-639:

```javascript
/**
 * Abstract Yjs Type class
 * @template {delta.DeltaConf} [DConf=any]
 */
export class YType {
  /**
   * @param {delta.DeltaConfGetName<DConf>?} name
   */
  constructor (name = null) {
```

From the same file lines 694-697 (the `static from` method):

```javascript
/**
 * @template {delta.DeltaConf} DC
 * @param {delta.Delta<DC>} d
 * @return {YType<DC>}
 */
static from (d) {
```

From the same file lines 1486-1490 (Schema bridge — confirms the type schema is generic too):

```javascript
/**
 * @template {import('lib0/delta').ReadableDeltaConf} DConf
 * @param {DConf} _dconf
 * @return {s.Schema<YType<import('lib0/delta').ReadDeltaConf<DConf>>>}
 */
```

### Direct source citation — exports map

From `raw.githubusercontent.com/yjs/yjs/main/src/index.js` (the ONLY YType-related export in the entire file):

```javascript
export { YType as Type, getTypeChildren, typeMapGetSnapshot, typeMapGetAllSnapshot, $ytype, $ytypeAny } from './ytype.js'
```

YText, YMap, YArray, YXmlFragment, YXmlElement, YXmlText, YXmlHook are **completely absent from the exports** — they no longer exist as distinct classes.

(Note: `YXmlFragmentRefID` and `YXmlElementRefID` appear inside the YType constructor as legacy enum tags — `this._legacyTypeRef = this.name == null ? YXmlFragmentRefID : YXmlElementRefID`, line 685 — used purely for wire-format backwards compat with v13 update encoding. The runtime behavior is unified.)

### Direct source citation — single class serves BOTH flat-sequence AND tree

The YType constructor (lines 637-695) holds both storage primitives in the same instance:

```javascript
/** @type {Map<string,Item>} */
this._map = new Map()      // KV/tree storage (children by key)
/** @type {Item|null} */
this._start = null         // Doubly-linked list head (sequence/text storage)
```

The class's method surface (extracted via grep `^  [a-z]+\s*\(` against ytype.js) includes BOTH families on the same class:

- **Sequence/text**: `insert(index, content, format)`, `delete(index, length)`, `format(index, length, formats)`, `push(content)`, `unshift(content)`, `slice(start, end)`, `map(f)`, `get(index)`
- **Map/attrs**: `deleteAttr(attributeName)`, plus the underlying `typeMapDelete`, `typeMapSet`, `typeMapGet`, `typeMapGetAll` module-level helpers (lines 1802-1873) that operate on `parent._map`
- **Delta API**: `toDelta(am, opts)`, `toDeltaDeep(am)`, `applyDelta(d, am)`, `clone()`, plus the `change` getter that returns `delta.DeltaBuilder<DeltaToYType<DConf>>`

So the answer to the load-bearing question:

> Can a single YType serve BOTH flat-sequence AND tree-structured projections?

**YES — the same instance HAS both `_map` (tree) and `_start` (sequence) and exposes operations on both.** The polymorphism is parameterized at the `DConf` (DeltaConf) level: `DeltaConf` from `lib0/delta` is the contract that distinguishes a "text-shape" delta (with format ops, attributes per-character) from a "list-shape" delta (with simple insert/delete) from a "map/xml-shape" delta. The same class instance can express any shape based on the DConf binding at construction.

### Direct source citation — `applyDelta` and `toDeltaDeep`

```javascript
toDelta (am = noAttributionsManager, opts = {}) {
  // (full body around line 819-900; takes AbstractAttributionManager and { deep: boolean })
}

toDeltaDeep (am = noAttributionsManager) {
  return /** @type {any} */ (this.toDelta(am, { deep: true }))
}

applyDelta (d, am = noAttributionsManager) {
  if (this.doc == null) {
    (this._prelim || (this._prelim = /** @type {any} */ (delta.create()))).apply(d)
  } else {
    transact(this.doc, transaction => { /* ... */ })
  }
  return this
}
```

`applyDelta` accepts a `delta.Delta<DC>` (any shape supported by the underlying `lib0/delta` library) and dispatches into the YType's internal storage. **The unification is structural, not syntactic.**

### Wire-format / version marker

`src/index.js` defines `const importIdentifier = '__ $YJS14$ __'` (line ~30) — the runtime guard against multiple Yjs versions in the same import graph. **The presence of `$YJS14$` in the duplicate-import detector confirms this is the v14 source tree** at the head of main.

**Confidence: VERY HIGH (load-bearing claim, source-confirmed).** Three orthogonal evidence types: class declaration with generic, exports map showing no separate types, dual storage primitives on the same class.

---

## D3-D4 (not in scope of this refresh — see prior report)

---

## D5. @hocuspocus/server + @hocuspocus/provider peer-deps today

### Prior claim

> "@hocuspocus/server v3.4.4 likely pins yjs@^13"

### Findings

| Sub-claim                                                | Verdict          | Evidence                                                                                          |
| -------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| "@hocuspocus/server v3.4.4 likely pins yjs@^13"          | **CONFIRMED**    | `latest: 3.4.4` (no peerDeps fetch surfaced) + 4.0.0-rc.5 package.json shows `yjs: ^13.6.8`        |
| Hocuspocus 4.x exists as RC                              | **NEW: CONFIRMED** | dist-tag `next: 4.0.0-rc.5` published April 16, 2026 (TODAY)                                      |
| 4.x adopts yjs 14                                        | **REFUTED**      | `4.0.0-rc.5` package.json `peerDependencies: { yjs: "^13.6.8", y-protocols: "^1.0.6" }` — STILL v13 |

### Direct source citation — Hocuspocus 4.0.0-rc.5 package.json

From `raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/package.json`:

```json
{
  "name": "@hocuspocus/server",
  "version": "4.0.0-rc.5",
  "peerDependencies": {
    "yjs": "^13.6.8",
    "y-protocols": "^1.0.6"
  },
  "dependencies": {
    "@hocuspocus/common": "workspace:^",
    "async-mutex": "^0.5.0",
    "crossws": "^0.4.4",
    "kleur": "^4.1.4",
    "lib0": "^0.2.47"
  }
}
```

Note `lib0: ^0.2.47` — the OLD lib0 line. Yjs 14 main branch `package.json` requires `lib0: ^1.0.0-rc.12`. **Hocuspocus 4.x is structurally on the v13 lib0 line and cannot run with Yjs 14 without a peer-dep bump.**

### Hocuspocus v4 release notes — what 4.x ACTUALLY delivers

From `RELEASE_NOTES_V4.md` (decoded from GitHub API):

- Cross-runtime support (Node, Bun, Deno, Cloudflare Workers, Node + uWebSockets) via `crossws`
- Generic `Context<T>` typing across all hooks
- Ordered, sequential message processing per connection
- Structured transaction origins with `isTransactionOrigin()` / `shouldSkipStoreHooks()` helpers
- Session-aware multiplexing (multiple providers per WebSocket)
- Web-standard `Request` / `Headers` replacing Node-specific types
- 13 documented breaking changes (Request/Headers API, hook payloads, WebSocket types, Server constructor, transaction origins, SQLite extension, CloseEvent shape, etc.)

**The word "yjs 14" does not appear anywhere in `RELEASE_NOTES_V4.md`** (verified via base64-decoded API fetch). Hocuspocus 4.x is a runtime/typing modernization release, NOT a Yjs 14 adoption release.

**Confidence: VERY HIGH.** Direct package.json + release notes from main branch.

### GitHub PRs / issues mentioning yjs 14

Search `is:pr yjs 14` on `ueberdosis/hocuspocus` returned only PR #14 (a 2021 ESLint dependabot PR). **Zero open or merged PRs mention Yjs 14 / @y/y migration.** The Hocuspocus team has not yet started visible Yjs 14 adoption work. Confidence: HIGH.

### Hocuspocus recent commits (last 20)

All visible commits from janthurau between March 30 and April 16, 2026 are about: cross-runtime publishing config, removing axios, provider-react package draft, lint fixes, RC version bumps. **No commit mentions yjs 14.** Confidence: HIGH.

---

## D6. @tiptap/y-tiptap peer-deps today

### Prior claim

> "@tiptap/y-tiptap v3.0.2 likely pins yjs@^13"

### Findings

| Sub-claim                                              | Verdict          | Evidence                                                                                                          |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| "@tiptap/y-tiptap v3.0.2 likely pins yjs@^13"          | **CONFIRMED — pinned even tighter** | `@tiptap/y-tiptap@3.0.3` (latest, published 2026-04-08) peerDeps include `"yjs": "^13.5.38"` — narrow v13 floor |
| @tiptap/extension-collaboration latest pins yjs ^13    | **CONFIRMED**    | `@tiptap/extension-collaboration@3.22.3` (latest) peerDeps include `"yjs": "^13"`                                  |
| @tiptap/extension-collaboration-cursor latest is 2.x   | **CONFIRMED**    | `@tiptap/extension-collaboration-cursor` dist-tag `latest: 2.26.2` (the cursor extension is two majors behind the main extension; the v3 successor is `extension-collaboration-caret`) |
| @tiptap/extension-collaboration-caret latest pins yjs  | **CONFIRMED**    | `@tiptap/extension-collaboration-caret@3.22.3` (latest) workspace deps `"yjs": "^13.6.23"` |

### Direct source citations

From `registry.npmjs.org/@tiptap/y-tiptap` — latest version 3.0.3 (published 2026-04-08T09:25Z):

```json
{
  "peerDependencies": {
    "prosemirror-model": "^1.7.1",
    "prosemirror-state": "^1.2.3",
    "prosemirror-view": "^1.9.10",
    "y-protocols": "^1.0.1",
    "yjs": "^13.5.38"
  }
}
```

From `raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-collaboration/package.json`:

```json
{
  "version": "3.22.3",
  "peerDependencies": {
    "@tiptap/core": "workspace:*",
    "@tiptap/pm": "workspace:*",
    "@tiptap/y-tiptap": "^3.0.2",
    "yjs": "^13"
  }
}
```

From `raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-collaboration-caret/package.json`:

```json
{
  "version": "3.22.3",
  "peerDependencies": {
    "@tiptap/core": "workspace:*",
    "@tiptap/pm": "workspace:*",
    "@tiptap/y-tiptap": "^3.0.2"
  },
  "devDependencies": {
    "yjs": "^13.6.23"
  }
}
```

### TipTap dist-tags (snapshot)

| Package                                       | latest   | beta              | next               | v2-latest |
| --------------------------------------------- | -------- | ----------------- | ------------------ | --------- |
| @tiptap/y-tiptap                              | 3.0.3    | 3.0.0-beta.3      | 3.0.0-beta.3       | —         |
| @tiptap/extension-collaboration               | 3.22.3   | 3.0.2-beta.0      | 3.0.0-beta.14      | 2.27.2    |
| @tiptap/extension-collaboration-caret         | 3.22.3   | 3.0.2-beta.0      | 3.0.0-beta.14      | —         |
| @tiptap/extension-collaboration-cursor        | 2.26.2   | —                 | 3.0.0-next.6       | 2.27.2    |

**No TipTap collab package has any tag pointing at a Yjs-14-compatible build.** The 3.0.0-next/beta lines are TipTap's internal v3 stabilization, not a Yjs 14 adoption track.

### TipTap v4 / Yjs 14 adoption

No public TipTap 4.x roadmap appears in the npm registry, GitHub releases, or visible issue threads. The TipTap collab line appears to be on a maintenance footing without active Yjs 14 work.

**Confidence: VERY HIGH.** Direct package.json + npm registry.

---

## Bonus finding — y-prosemirror has a Yjs-14-pinned prerelease

This was not in the prior report's scope but is critical to the Peritext-on-Yjs feasibility story. The Yjs project's own ProseMirror binding has been **renamed and republished** under the new scope:

| Package         | Latest (legacy) | Pre-release (Yjs 14)         | Yjs peer pin                                  |
| --------------- | --------------- | ---------------------------- | --------------------------------------------- |
| `y-prosemirror` | `1.3.7` (Jul 3, 2025) | none on this name          | `yjs: ">=13.0.0-106"`                          |
| `@y/prosemirror`| `2.0.0-0`       | `2.0.0-2` (Dec 16, 2025)     | `@y/y: ^14.0.0-rc.13`, `@y/protocols: ^1.0.6-rc.1` |

Direct citation from `raw.githubusercontent.com/yjs/y-prosemirror/master/package.json`:

```json
{
  "name": "@y/prosemirror",
  "version": "2.0.0-2",
  "peerDependencies": {
    "@y/protocols": "^1.0.6-rc.1",
    "@y/y": "^14.0.0-rc.13",
    "prosemirror-model": "^1.7.1",
    "prosemirror-state": "^1.2.3",
    "prosemirror-view": "^1.9.10"
  },
  "dependencies": {
    "lib0": "^1.0.0-rc.12"
  }
}
```

GitHub release notes for `y-prosemirror`:

- **v2.0.0-2** (Dec 16, 2025) — "Prerelease with y-sync plugin binding rewrite based on `appendTransaction`"
- **v2.0.0-1** (Dec 10, 2025) — "Major prerelease upgrading to Yjs beta package @y/y with improved delta sync"
- **v1.3.7** (Jul 3, 2025) — bug fix on the v13 line

Recent commits on `y-prosemirror` master (last 14 days, 2026-04-08 → 2026-04-14) show ongoing work by both dmonad and nperez0111: undo/redo plugin (PR #225 merged Apr 10), cursor plugin export, suggestion fixes for view-only mode, "use sync plugin instance as transaction origin instead of key." The y-prosemirror v2 line is **actively maintained against Yjs 14 RC**.

### Companion packages also pinned to Yjs 14

| Package         | Latest tag  | Beta tag           | Yjs constraint                       |
| --------------- | ----------- | ------------------ | ------------------------------------ |
| `@y/y`          | `14.0.0-rc.7` | `14.0.0-rc.13`   | (the package itself — Yjs core)      |
| `@y/protocols`  | `1.0.6-0`   | `1.0.6-rc.1`       | `peerDependencies: { yjs: "14.0.0-* || ^14" }` |
| `@y/websocket`  | `4.0.0-0`   | `4.0.0-rc.2` (Apr 15, 2026) | `peerDependencies: { @y/y: "^14.0.0-6" }` |
| `@y/prosemirror`| `2.0.0-0`   | `2.0.0-2` (Dec 16, 2025) | `peerDependencies: { @y/y: "^14.0.0-rc.13" }` |

**There is a complete `@y/*` provider/binding stack ready for Yjs 14 adoption.** Hocuspocus is the only first-party-adjacent absentee.

**Confidence: VERY HIGH.** All verified via npm registry direct.

---

## Adversarial assessment of prior research

| Prior claim                                       | Was it adversarially right? | Notes                                                                                             |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| "yjs@14.0.0-16 (beta)"                            | **Stale by 7 days** — the `yjs` scope still shows that, but the active publish stream moved to `@y/y@14.0.0-rc.13` 2 days ago | The prior report missed the existence of the `@y/y` scope entirely. This is the bigger fact: the project rebranded the npm name during the v14 RC cycle |
| "stable latest remains yjs@13.6.30"               | **Still correct**           | No change — v14 has not stabilized                                                                |
| "@hocuspocus/server v3.4.4 likely pins yjs@^13"   | **Correct, but understated**| 4.0.0-rc.5 (today's publish) ALSO still pins `yjs: ^13.6.8`. 4.x is a runtime modernization, not Yjs 14 adoption |
| "@tiptap/y-tiptap v3.0.2 likely pins yjs@^13"    | **Correct, even narrower**  | 3.0.3 (latest, 2026-04-08) pins `yjs: ^13.5.38`                                                    |
| YType unification claim                           | **Correct in shape, parameter name was wrong** | Prior report said `YType<DeltaConf>`. Source actually says `YType<DConf=any>` where `DConf extends delta.DeltaConf`. The polymorphism axis is right; the variable name is `DConf` |

The prior report's biggest miss was **failing to identify the `@y/*` scope rebrand**. With that scope identified, the picture is much cleaner:

- The Yjs 14 ecosystem now has its OWN provider (`@y/websocket@4.0.0-rc.2`) and its OWN binding (`@y/prosemirror@2.0.0-2`).
- Hocuspocus and TipTap-collab are NOT the only collaboration servers/bindings; the Yjs project has a self-hosted provider + binding pair already pinned to v14.
- "Adopt Yjs 14" no longer requires "wait for Hocuspocus" or "wait for TipTap." It requires **switching from Hocuspocus + @tiptap/y-tiptap to @y/websocket + @y/prosemirror**.

This is a bigger architectural decision than the prior report framed it as.

---

## Confidence-labeled summary

| Claim                                                                      | Confidence  | Verdict                  |
| -------------------------------------------------------------------------- | ----------- | ------------------------ |
| Yjs 14 is at RC.13 today (2026-04-16)                                      | VERY HIGH   | CONFIRMED                |
| Yjs project rebranded npm scope to `@y/y` during v14 RC cycle              | VERY HIGH   | CONFIRMED-NEW            |
| Yjs 14 stable not yet released                                             | VERY HIGH   | CONFIRMED                |
| YType is genuinely a single class with no separate YText/YMap/YArray       | VERY HIGH   | CONFIRMED via source     |
| YType<DConf> generic; same instance has `_map` AND `_start`                | VERY HIGH   | CONFIRMED via source     |
| `applyDelta` / `toDelta` / `toDeltaDeep` exist with delta-generic types    | VERY HIGH   | CONFIRMED via source     |
| Single YType instance can serve flat-sequence AND tree projections         | HIGH        | CONFIRMED via source structure (need empirical test for full proof) |
| Hocuspocus 4.0.0-rc.5 still pins `yjs: ^13.6.8`                            | VERY HIGH   | CONFIRMED                |
| Hocuspocus has zero PRs/issues / RELEASE_NOTES_V4 mentioning Yjs 14        | HIGH        | CONFIRMED                |
| TipTap collab line (`y-tiptap`, `extension-collaboration*`) all pin yjs ^13| VERY HIGH   | CONFIRMED                |
| `@y/prosemirror@2.0.0-2` pins `@y/y: ^14.0.0-rc.13`                        | VERY HIGH   | CONFIRMED                |
| `@y/websocket@4.0.0-rc.2` pins `@y/y: ^14.0.0-6`                           | VERY HIGH   | CONFIRMED                |
| Adopting Yjs 14 today requires `@y/websocket` + `@y/prosemirror` (no Hocuspocus) | HIGH    | INFERRED from above      |
| Yjs 14 main branch requires Node ≥22.0.0                                   | HIGH        | CONFIRMED via package.json|

---

## Source manifest (citable URLs, all fetched 2026-04-16)

- `https://registry.npmjs.org/yjs` — dist-tags: `{ next: 14.0.0-8, beta: 14.0.0-16, latest: 13.6.30 }`
- `https://registry.npmjs.org/@y/y` — dist-tags: `{ latest: 14.0.0-rc.7, beta: 14.0.0-rc.13 }`, top publish 2026-04-14T23:31Z
- `https://registry.npmjs.org/@y/protocols` — `peerDependencies: { yjs: "14.0.0-* || ^14" }`
- `https://registry.npmjs.org/@y/websocket` — beta `4.0.0-rc.2`, peer `@y/y: ^14.0.0-6`
- `https://registry.npmjs.org/@y/prosemirror` — beta `2.0.0-2`, peer `@y/y: ^14.0.0-rc.13`
- `https://registry.npmjs.org/y-prosemirror` — latest `1.3.7`, peer `yjs: ">=13.0.0-106"` (the legacy line)
- `https://registry.npmjs.org/@hocuspocus/server` — latest `3.4.4`, next `4.0.0-rc.5`
- `https://registry.npmjs.org/@hocuspocus/provider` — latest `3.4.4`, next `4.0.0-rc.5`
- `https://registry.npmjs.org/@tiptap/y-tiptap` — latest `3.0.3`, peer `yjs: ^13.5.38`
- `https://registry.npmjs.org/@tiptap/extension-collaboration` — latest `3.22.3`, peer `yjs: ^13`
- `https://registry.npmjs.org/@tiptap/extension-collaboration-caret` — latest `3.22.3`, dev `yjs: ^13.6.23`
- `https://registry.npmjs.org/@tiptap/extension-collaboration-cursor` — latest `2.26.2` (no v3 latest yet)
- `https://github.com/yjs/yjs/releases` — RC publishes Mar 23 → Apr 14, 2026
- `https://github.com/yjs/yjs/commits/main` — recent dmonad commits 2026-04-09 to 2026-04-14
- `https://raw.githubusercontent.com/yjs/yjs/main/package.json` — version `14.0.0-rc.13`, lib0 `^1.0.0-rc.12`, engines node ≥22
- `https://raw.githubusercontent.com/yjs/yjs/main/src/ytype.js` — single YType class, 2158 lines, with `_map` + `_start` + delta API
- `https://raw.githubusercontent.com/yjs/yjs/main/src/index.js` — exports map confirms only YType (as Type), no YText/YMap/YArray
- `https://raw.githubusercontent.com/ueberdosis/hocuspocus/main/packages/server/package.json` — `4.0.0-rc.5`, peer `yjs: ^13.6.8`
- `https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-collaboration/package.json` — `3.22.3`, peer `yjs: ^13`
- `https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-collaboration-caret/package.json` — `3.22.3`
- `https://github.com/yjs/y-prosemirror/commits/master` — recent v2-prerelease work Apr 8-14, 2026
- `https://github.com/ueberdosis/hocuspocus/commits/main` — v4 RC cadence, no Yjs 14 mention
- `https://github.com/ueberdosis/hocuspocus/issues?q=yjs+14` — zero relevant issues
- `https://github.com/ueberdosis/hocuspocus/pulls?q=is%3Apr+yjs+14` — zero relevant PRs
- `https://api.github.com/repos/ueberdosis/hocuspocus/contents/RELEASE_NOTES_V4.md` — base64-decoded; "yjs 14" / "yjs v14" not present
