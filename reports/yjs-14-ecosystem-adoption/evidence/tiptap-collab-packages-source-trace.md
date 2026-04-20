# TipTap Collab Packages — Source Trace + Yjs 14 Migration Delta

Date: 2026-04-16
Scope: every TipTap collab package Open Knowledge uses, every transitive dep, what would change under Yjs 14 + the `@y/*` stack.

All file paths absolute; everything is from the worktree at `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/bridge-correctness/`.

---

## 0. Stack snapshot at HEAD

From `packages/app/package.json`:
- `@tiptap/core@^3.22.3`, `@tiptap/pm@^3.22.3`, `@tiptap/react@^3.22.3`, `@tiptap/starter-kit@^3.22.3`, `@tiptap/suggestion@^3.22.3`
- `@tiptap/y-tiptap@^3.0.3`
- `@tiptap/extension-collaboration@^3.22.3`
- `@tiptap/extension-collaboration-cursor@3.0.0` (pinned exact)
- `@tiptap/extension-drag-handle@3.22.3`
- `@tiptap/extension-{bold, code-block, hard-break, heading, highlight, horizontal-rule, image, italic, link, table, placeholder, file-handler}` — varying 3.22.3 lines
- `@hocuspocus/provider@4.0.0-rc.1`
- `y-codemirror.next@^0.3.5`
- `yjs@^13.6.30`
- `@codemirror/{state,view,…}@^6.x`
- `prosemirror-{model,state,view,transform}` come in via `@tiptap/pm`

From `packages/core/package.json`: same `@tiptap/*` 3.22.3 surface, plus `yjs@^13.6.30`. Server (`packages/server/package.json`) consumes the same versions through workspace.

Direct collab-API touchpoints in our code (from `grep` over `packages/{app,server,core}/src`):

```
packages/app/src/editor/TiptapEditor.tsx:12  import Collaboration from '@tiptap/extension-collaboration';
packages/app/src/editor/TiptapEditor.tsx:15  import { yCursorPlugin } from '@tiptap/y-tiptap';
packages/app/src/editor/observers.ts:26      import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
packages/server/src/server-observers.ts:34   import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
packages/server/src/agent-sessions.ts:41     import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
packages/app/src/editor/SourceEditor.tsx:31  import { yCollab } from 'y-codemirror.next';
packages/app/src/editor/provider-pool.ts:1   import { HocuspocusProvider } from '@hocuspocus/provider';
packages/app/src/editor/DocumentContext.tsx:5 import type { HocuspocusProvider } from '@hocuspocus/provider';
packages/app/src/components/SystemDocSubscriber.tsx:1 import { HocuspocusProvider } from '@hocuspocus/provider';
```

We use only THREE symbols from `@tiptap/y-tiptap`: `yCursorPlugin`, `updateYFragment`, `yXmlFragmentToProsemirrorJSON`. Plus `Collaboration` (default extension) and `HocuspocusProvider`. That is the entirety of our tiptap+yjs surface area.

---

## 1. `@tiptap/y-tiptap@3.0.3`

**Source:** `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (single bundled file, 2250 LOC). No `src/`, only `dist/`. Type definitions in `dist/src/{y-tiptap.d.ts, lib.d.ts, utils.d.ts, plugins/{sync-plugin,cursor-plugin,undo-plugin,keys}.d.ts}`.

**Status — fork of `y-prosemirror`, NOT a re-export.** `node_modules/y-prosemirror@1.3.7` is also installed (transitively from `@tiptap/extension-collaboration-cursor` — see §3). Side-by-side comparison:

| Metric                                                  | y-tiptap@3.0.3 | y-prosemirror@1.3.7 |
| ------------------------------------------------------- | -------------- | ------------------- |
| LOC (combined sync + cursor + undo + keys + lib + utils) | 2250 (bundled) | 2209 (split)        |
| `Y.XmlFragment` / `Y.XmlElement` / `Y.Item` / `Y.Snapshot` references in sync code | 50 | 51 |
| Public exports                                          | identical (see below) | identical |

The y-tiptap `CHANGELOG.md` shows `3.0.3` is `y-prosemirror` patched for one cursor-meta stale-transaction fix. From upstream:
- `https://github.com/ueberdosis/y-tiptap/commit/7a1b55a` — "Handle stale cursor awareness meta transactions more safely by retrying the queued cursor-only update once and dropping it if the transaction is still mismatched, preventing editor crashes during asynchronous awareness refreshes."

That is the entire delta v3.0.3 vs y-prosemirror@1.3.7. y-tiptap is a maintenance fork, not a clean wrapper.

**Full export list** (from `dist/src/y-tiptap.d.ts`):

```ts
// re-exports from plugins/cursor-plugin.js
defaultAwarenessStateFilter, defaultCursorBuilder, defaultSelectionBuilder,
createDecorations, yCursorPlugin

// re-exports from plugins/undo-plugin.js
undo, redo, defaultProtectedNodes, defaultDeleteFilter, yUndoPlugin

// re-exports from plugins/keys.js
ySyncPluginKey, yUndoPluginKey, yCursorPluginKey

// from plugins/sync-plugin.js (named, not *)
ySyncPlugin, isVisible, getRelativeSelection, ProsemirrorBinding, updateYFragment

// from lib.js (named, not *)
absolutePositionToRelativePosition, relativePositionToAbsolutePosition, setMeta,
prosemirrorJSONToYDoc, yDocToProsemirrorJSON, yDocToProsemirror, prosemirrorToYDoc,
prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON,
yXmlFragmentToProsemirror, prosemirrorToYXmlFragment,
yXmlFragmentToProseMirrorRootNode, yXmlFragmentToProseMirrorFragment,
initProseMirrorDoc
```

Three `yDoc*`/`yXmlFragmentToProsemirror{,JSON}` exports are marked `@deprecated Use yXmlFragmentToProseMirrorRootNode instead` (see `dist/src/lib.d.ts:57-95`).

**Origin classification per export:** every single export is forked code from y-prosemirror — no symbol is a "wrapper". This means a Yjs-14 fork must replace the implementations, not the import paths.

**Yjs surface used inside the bundle** (`dist/y-tiptap.js:1-21` imports + scattered `Y.*` references):

```js
import { Item, ContentType, Text, XmlElement, UndoManager } from 'yjs';
import * as Y from 'yjs';
import 'y-protocols/awareness';
```

50 references to `Y.XmlFragment | Y.XmlElement | Y.XmlText | Y.Item | Y.UndoManager | Y.Snapshot | Y.Doc | Y.AbstractType | Y.PermanentUserData | Y.Transaction | Y.YEvent | Y.ID | Y.isDeleted` etc. All five separate Y types (`XmlFragment`, `XmlElement`, `XmlText`, plus generic `Item`, `Snapshot`, `Doc`) are touched on the hot path.

Hot-path examples:
- `dist/y-tiptap.js:88` — `!Y.isDeleted(snapshot.ds, item.id))`
- `dist/y-tiptap.js:266` — `(pluginState.doc).transact((tr) => { tr.meta.set('addToHistory', pluginState.addToHistory); binding._prosemirrorChanged(view.state.doc); }, ySyncPluginKey);`
- `dist/y-tiptap.js:454-525` — `renderSnapshot()` walks the type tree using `Y.XmlElement`, `Y.XmlText`, `Y.Snapshot.ds/sv`
- `dist/y-tiptap.js:912-951` — `prosemirrorToYType` constructs `new Y.XmlText()` / `new Y.XmlElement(name)`
- `dist/y-tiptap.js:1145-1298` (approx) — `updateYFragment` is the deep-attr-equality + delete+reinsert logic that y-prosemirror's `equalYTypePNode` lives in (and that our patch at `patches/y-prosemirror@1.3.7.patch` modifies for `rawMdxFallback` substitution, per CLAUDE.md precedent #9)

**Peer deps** (`node_modules/@tiptap/y-tiptap/package.json:54-60`, also `npm view @tiptap/y-tiptap@3.0.3 peerDependencies`):

```json
"prosemirror-model": "^1.7.1",
"prosemirror-state": "^1.2.3",
"prosemirror-view": "^1.9.10",
"y-protocols": "^1.0.1",
"yjs": "^13.5.38"
```

Direct dep: only `lib0: ^0.2.100`. Peers are pinned to `yjs ^13.5.38` and `y-protocols ^1.0.1`. **Both ranges exclude every published `yjs@14.x` and every `@y/y` / `@y/protocols` package.**

---

## 2. `@tiptap/extension-collaboration@3.22.3`

**Source:** `node_modules/@tiptap/extension-collaboration/src/{collaboration.ts, index.ts, helpers/{CollaborationMappablePosition,isChangeOrigin,yRelativePosition}.ts}`. Bundled `dist/index.js` is 220 LOC, source 256 LOC + 3 small helpers.

**What it does beyond wiring `ySyncPlugin`:**

The whole file is `src/collaboration.ts` (256 LOC). Lifting concrete behavior:

1. **Defines a TipTap Extension `Collaboration`** with `priority: 1000` (`collaboration.ts:91`).
2. **Reads either `options.fragment` or `options.document.getXmlFragment(options.field)`** (`collaboration.ts:170-172`). Default field name `'default'`.
3. **Wires `ySyncPlugin(fragment, ySyncOptions)`** (`collaboration.ts:219`).
4. **Wires `yUndoPlugin(yUndoOptions)`** (`collaboration.ts:176`) — for in-doc undo/redo.
5. **Adds undo-restore patch (`collaboration.ts:179-212`)**. From the comment at `collaboration.ts:174-175`: "Quick fix until there is an official implementation (thanks to @hamflx). See `https://github.com/yjs/y-prosemirror/issues/114` and `/issues/102`." Wraps the undo plugin's `view`-spec to (a) restore `undoManager.trackedOrigins` / `_observers` / `afterTransaction` handler on remount, and (b) install a `restore()` closure on destroy so the next mount can rehydrate.
6. **Adds `filterInvalidContent` plugin (`collaboration.ts:226-253`)** when `editor.options.enableContentCheck` is set — runs `transaction.doc.check()` on every Yjs-origin transaction, emits `contentError` event, sets `storage.isDisabled`, and offers `disableCollaboration: () => fragment.doc?.destroy()`.
7. **Defines `undo` / `redo` commands (`collaboration.ts:122-158`)** that route through the y-tiptap `undo` / `redo` helpers. Each command sets `tr.setMeta('preventDispatch', true)` then delegates to the y-tiptap helper.
8. **Keyboard bindings (`collaboration.ts:161-167`):** `Mod-z`, `Mod-y`, `Shift-Mod-z`.
9. **Conflict guard (`collaboration.ts:108-114`):** if `extensionManager` already contains `undoRedo` extension, warns about double-history.
10. **`onBeforeCreate` (`collaboration.ts:116-120`):** monkey-patches `editor.utils.getUpdatedPosition` and `editor.utils.createMappablePosition` so TipTap's `MappablePosition` API uses Yjs relative positions across collaborative transactions.
11. **Helpers** in `src/helpers/`:
    - `isChangeOrigin.ts:12` — `transaction.getMeta(ySyncPluginKey)` truthiness check.
    - `yRelativePosition.ts:19-32` — `getYAbsolutePosition` / `getYRelativePosition` thin wrappers over the y-tiptap exports of the same name, reading state via `ySyncPluginKey.getState(state)`.
    - `CollaborationMappablePosition.ts:15-42` — subclass of TipTap's `MappablePosition` carrying a `yRelativePosition` for cross-transaction mapping.

**Schema integration:** none — the extension does not declare nodes/marks. It does not modify the editor schema.

**History exclusion:** entirely yes — adding the extension installs `yUndoPlugin` and the `Mod-z/Mod-y` bindings; consumers must remove the standard history extension. Extension-collaboration warns if both are active (`collaboration.ts:109-113`).

**Imports — what does it actually depend on?** From `collaboration.ts:1-9`:

```ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { redo, undo, ySyncPlugin, yUndoPlugin, yUndoPluginKey } from '@tiptap/y-tiptap'
import type { Doc, UndoManager, XmlFragment } from 'yjs'
```

Helper imports add `absolutePositionToRelativePosition`, `relativePositionToAbsolutePosition`, `ySyncPluginKey` from `@tiptap/y-tiptap`, plus `MappablePosition` and `getUpdatedPosition` from `@tiptap/core`. **No direct y-prosemirror import** — extension-collaboration is fully routed through `@tiptap/y-tiptap`.

It uses 5 y-tiptap symbols total: `ySyncPlugin`, `yUndoPlugin`, `yUndoPluginKey`, `ySyncPluginKey`, `undo`, `redo`, `absolutePositionToRelativePosition`, `relativePositionToAbsolutePosition`. (Eight when counting helpers.)

**Peer-deps** (`node_modules/@tiptap/extension-collaboration/package.json:38-43`):

```json
"@tiptap/y-tiptap": "^3.0.2",
"yjs": "^13",
"@tiptap/core": "^3.22.3",
"@tiptap/pm": "^3.22.3"
```

The `yjs ^13` peer is the choke point — extension-collaboration cannot accept a Yjs 14 install without a peer-dep bump.

---

## 3. `@tiptap/extension-collaboration-cursor@3.0.0`

**Source:** `node_modules/@tiptap/extension-collaboration-cursor/src/{collaboration-cursor.ts, index.ts}`. 177 LOC main file. `dist/index.js` is 84 LOC.

**Critical anomaly: bypasses `@tiptap/y-tiptap` entirely.**

```ts
// collaboration-cursor.ts:3
import { defaultSelectionBuilder, yCursorPlugin } from 'y-prosemirror'
```

The dist confirms this (`dist/index.js:2`):
```js
import { defaultSelectionBuilder, yCursorPlugin } from 'y-prosemirror';
```

So while every other tiptap collab package routes through `@tiptap/y-tiptap`, the cursor extension still depends directly on **upstream `y-prosemirror@^1.2.6`** (peer at `package.json:33-37`). This is why `node_modules/y-prosemirror/` is installed in our worktree even though we never import from it directly.

The npm registry shows `@tiptap/extension-collaboration-cursor` HEAD is `2.26.2` (latest tag, 2025-09-23) which still pins `y-prosemirror ^1.2.11`. The `3.0.0` we use was published 2024-07-14 and has not been updated. The `3.0.0-next.{0..6}` betas later in 2024-2025 changed peer to `@tiptap/y-tiptap ^1.0.0` — but that's a beta, not the `3.0.0` stable we're on. `npm view @tiptap/extension-collaboration-cursor` confirms there is no published `3.x` after `3.0.0` stable.

**Custom renderer signature (`collaboration-cursor.ts:24-41`):**

```ts
render(user: Record<string, any>): HTMLElement
selectionRender(user: Record<string, any>): DecorationAttrs
```

`user` is a plain `Record<string, any>` — not Yjs-typed. The shape comes from whatever the consumer passes via `options.user` in `addOptions()` (default at `collaboration-cursor.ts:101-105` is `{ name: null, color: null }`). The wire path is:

1. `addProseMirrorPlugins()` (`collaboration-cursor.ts:155-176`) calls `provider.awareness.setLocalStateField('user', this.options.user)`.
2. Awareness `update` event populates `storage.users` via `awarenessStatesToArray()` (`collaboration-cursor.ts:81-88`).
3. `yCursorPlugin(awareness, { cursorBuilder, selectionBuilder })` is the upstream y-prosemirror plugin — it calls `cursorBuilder(user, clientId)` for each remote awareness state, where `user = awarenessStates.get(clientId).user`.

So `render` is **not** Yjs-typed. The extension does not surface `clientId` to the consumer's `render` callback (only `user`). The wired `cursorBuilder` is `this.options.render` directly — y-prosemirror passes `(user, clientId)` but our type only declares `(user)`. (Two-arg callbacks would still work since JS ignores extras.)

**Implementation footprint:** awareness wiring + `awarenessStatesToArray` storage population + `updateUser` command + the renderer defaults. ~150 LOC of pure TipTap glue plus the single `yCursorPlugin(awareness, opts)` call. The extension does not call any other Yjs API.

**Peer-deps** (`node_modules/@tiptap/extension-collaboration-cursor/package.json:35-38`):

```json
"@tiptap/core": "^3.0.0",
"y-prosemirror": "^1.2.6"
```

NO peer on `yjs`. NO peer on `y-protocols`. NO peer on `@tiptap/y-tiptap`. The Yjs version constraint is implicit through `y-prosemirror`'s peer (`yjs ^13.5.38`). The `3.0.0-next.5+` beta line replaced the `y-prosemirror` peer with `@tiptap/y-tiptap ^1.0.0` — that decoupling never made it to a stable release.

---

## 4. Transitive ProseMirror deps

**`prosemirror-model@1.25.4`** (`node_modules/prosemirror-model/package.json`):
- Dep: `orderedmap ^2.0.0`. **Zero Yjs imports.** `grep "yjs\|y-prosemirror\|y-protocols\|@y/" node_modules/prosemirror-model/dist` returns empty.

**`prosemirror-state` / `prosemirror-view` / `prosemirror-transform`** (same scan): zero matches. None of these packages know that Yjs exists.

These four packages are pure ProseMirror primitives. They survive a Yjs-14 migration unchanged. The peer-dep version pins `^1.7.1` / `^1.2.3` / `^1.9.10` in y-tiptap and `@y/prosemirror@2.0.0-2` are identical, so a pinned PM stack works for both bindings.

---

## 5. Transitive `@codemirror/*` deps

**`@codemirror/state@6.6.0`** (`node_modules/@codemirror/state/package.json`): zero Yjs imports.

**`@codemirror/view@6.x`**: zero Yjs imports (verified by `grep -lr "yjs\|@y/" node_modules/@codemirror`).

**`y-codemirror.next@0.3.5`** (`node_modules/y-codemirror.next/src/`):
- Files: `index.js` (47 LOC), `y-range.js` (34), `y-remote-selections.js` (257), `y-sync.js` (161), `y-undomanager.js` (157). Total 656 LOC.
- Imports `* as Y from 'yjs'` plus `@codemirror/{state,view}` only (`src/index.js:1-9`).
- Peer-deps (`package.json:52-56`): `@codemirror/state ^6.0.0`, `@codemirror/view ^6.0.0`, `yjs ^13.5.6`.
- Public exports: `YRange, yRemoteSelections, yRemoteSelectionsTheme, ySync, ySyncFacet, YSyncConfig, yUndoManagerKeymap, yCollab` (default helper).
- We use exactly one symbol: `yCollab` from `SourceEditor.tsx:31`.

The CodeMirror primitives are CRDT-orthogonal. `y-codemirror.next` itself has a Yjs-13 peer and would also need bumping; see §10.

---

## 6. `@tiptap/core` and `@tiptap/pm`

**`@tiptap/core@3.22.3`** (`node_modules/@tiptap/core/package.json`): zero Yjs imports across `src/` and `dist/`. `MappablePosition` and the position-tracking helpers used by `extension-collaboration` are CRDT-agnostic.

**`@tiptap/pm@3.22.3`**: 0 Yjs imports. This is the pinned-PM-bundle re-export layer (the source of `@tiptap/pm/state`, `@tiptap/pm/view`, etc.).

Both packages are CRDT-orthogonal as expected. They survive Yjs 14 unchanged. Our entire schema, command, plugin code, and React glue (`@tiptap/react`) does not need to know that Yjs exists.

---

## 7. Other `@tiptap/extension-*` packages — Yjs orthogonality scan

Per-package `grep "from ['\"]yjs|from ['\"]y-prosemirror|from ['\"]@tiptap/y-tiptap|from ['\"]y-protocols|from ['\"]y-codemirror" node_modules/@tiptap/<pkg>/{src,dist}`:

| Package | Version | Yjs/y-prosemirror import count | CRDT-orthogonal? |
| --- | --- | --- | --- |
| `@tiptap/core` | 3.22.3 | 0 | yes |
| `@tiptap/pm` | 3.22.3 | 0 | yes |
| `@tiptap/react` | 3.22.3 | 0 | yes |
| `@tiptap/starter-kit` | 3.22.3 | 0 | yes |
| `@tiptap/extension-bold` | 3.22.3 | 0 | yes |
| `@tiptap/extension-code-block` | 3.22.3 | 0 | yes |
| `@tiptap/extension-hard-break` | 3.22.3 | 0 | yes |
| `@tiptap/extension-heading` | 3.22.3 | 0 | yes |
| `@tiptap/extension-highlight` | 3.22.3 | 0 | yes |
| `@tiptap/extension-horizontal-rule` | 3.22.3 | 0 | yes |
| `@tiptap/extension-image` | 3.22.3 | 0 | yes |
| `@tiptap/extension-italic` | 3.22.3 | 0 | yes |
| `@tiptap/extension-link` | 3.22.3 | 0 | yes |
| `@tiptap/extension-table` | 3.22.3 | 0 | yes |
| `@tiptap/extension-placeholder` | 3.22.3 | 0 | yes |
| `@tiptap/extension-file-handler` | 3.22.3 | 0 | yes |
| `@tiptap/extension-collaboration` | 3.22.3 | 5 (`@tiptap/y-tiptap`) | NO — coupled |
| `@tiptap/extension-collaboration-cursor` | 3.0.0 | 2 (`y-prosemirror`) | NO — coupled |
| `@tiptap/extension-drag-handle` | 3.22.3 | 4 (`@tiptap/y-tiptap`) | NO — coupled |

`@tiptap/extension-drag-handle` is a third coupled extension — overlooked in most migration discussions. From `node_modules/@tiptap/extension-drag-handle/src/drag-handle-plugin.ts:1-11`:

```ts
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
```

It uses Yjs relative positions to keep drag-handle position stable across remote transactions (`drag-handle-plugin.ts:23-42`: `getRelativePos`, `getAbsolutePos`). Peer-dep at `package.json` requires `@tiptap/y-tiptap ^3.0.2` AND `@tiptap/extension-collaboration ^3.22.3`. So drag-handle is hard-coupled to BOTH the binding and the collaboration extension — three consecutive forks land here under Yjs 14.

The peer-dep on `@tiptap/extension-collaboration` (rather than just `@tiptap/y-tiptap`) is interesting: drag-handle imports `isChangeOrigin` from it, then `ySyncPluginKey` from y-tiptap directly. So the dep chain is `drag-handle → extension-collaboration → y-tiptap → yjs`, plus `drag-handle → y-tiptap → yjs`.

Every other extension is CRDT-orthogonal — they survive Yjs 14 unchanged.

---

## 8. Open issues / PRs across TipTap repos for Yjs 14

**`ueberdosis/tiptap` issues mentioning "yjs 14":** GitHub search `q=yjs+14+repo:ueberdosis/tiptap` returns 10 matches, all unrelated (TipTap 1.x ports, generic `yjs` errors with the digit 14 elsewhere in the title — e.g. issue #14 "UnderlineMark added" is from TipTap 1.x). Search for `"yjs v14"` returns 0 matches. **No upstream tracking issue, no announced migration plan for the TipTap monorepo.**

**`ueberdosis/y-tiptap` issues:** 2 total open/closed combined (PR #3 mark-name compare fix, PR #7 ystate undefined guard). Zero mention Yjs 14. Recent commits are publish-pipeline plumbing and a cursor-meta stale-tx fix (the lone v3.0.3 changeset). The repo has been alive for ~2 weeks — first commits 2026-04-02. **Maintenance fork only; no v14 work in flight.**

**`yjs/y-prosemirror`:** PR #208 "feat: rewrite prosemirror binding" is closed (not merged), with an active `upgrade-y` branch. The PR body explicitly lays out the Yjs 14 migration approach for the upstream binding under a new package name `@y/prosemirror`. Body excerpt:

> With Y.js 14, we have the power to:
> - Use Y.js 14's new delta API, which is an OT-like data structure similar to a Prosemirror transaction…
> - Use Y.js 14's content renderer API…
> The new binding will be a rewrite of the current binding, built on top of the new Y.js 14 APIs and released under a new package name: `@y/prosemirror`.

`@y/prosemirror` is published on npm (`2.0.0-2`, dist-tag `beta`, 2025-12-16) with peer `@y/y ^14.0.0-16`. It is upstream y-prosemirror's official Yjs 14 successor package, NOT a fork by another author.

**TipTap roadmap (`https://tiptap.dev/blog/release-notes/our-roadmap-for-2026`):** the published 2026 roadmap (per WebSearch result returning the page) says the 2026 TipTap bets are: document structure / database integration, document conversion (round-trip fidelity, comments, tracked changes), and AI productization. **Yjs 14 is not mentioned in the 2026 roadmap.** No public statement from `janthurau` or other TipTap maintainers about a Yjs-14 timeline as of 2026-04-16.

**TipTap `release-notes` blog:** zero mentions of `yjs 14`, `y-tiptap 4`, or `@y/y` (per WebSearch grep over the page).

**Maintainer-attributable signals.** The `y-tiptap` repo was created and first published 2026-04-02 (per the GitHub commit history). The `y-tiptap@3.0.3` release on 2026-04-08 is exactly **one week before today (2026-04-16)** and pinned `yjs ^13.5.38`. That is strong evidence that v14 adoption is not imminent inside TipTap — they bumped y-tiptap to a 3.x line for stable release alongside TipTap 3.x and chose to keep the Yjs-13 contract.

---

## 9. TipTap upstream stance

`@tiptap/y-tiptap@3.0.3` was published 2026-04-08 (per `npm view`). Its peer-deps STILL pin `yjs ^13.5.38`. Eight days ago, the team did a clean release including a bug-fix patch + a republished publish workflow — and the Yjs-13 peer was kept intact. Combined with §8's signals (zero issues, zero PRs, zero roadmap references), the inference is:

- **Confidence high:** TipTap has no in-flight Yjs 14 migration as of 2026-04-16.
- **Confidence high:** Once `@y/prosemirror` reaches a stable `2.x` and Yjs 14 ships stable, TipTap will eventually need to either re-fork to `@y/prosemirror` semantics or maintain the Yjs-13 binding indefinitely. Neither path is announced.
- **Confidence medium:** the `@tiptap/extension-collaboration-cursor 3.0.0-next.5+` betas decoupled from `y-prosemirror` to `@tiptap/y-tiptap ^1.0.0` peer, but never landed stable. This suggests the `y-prosemirror` direct dep is "leftover" — TipTap intended to centralize on `@tiptap/y-tiptap` but the work paused.

---

## 10. Forking `@tiptap/y-tiptap` for Yjs 14 — concrete delta

A fork that swaps `yjs ^13` → `yjs ^14` (or `@y/y ^14.0.0-rc.13`) cannot be a simple peer-dep bump because `@y/prosemirror@2.x` is a rewrite, not a Yjs-14-compatible y-prosemirror.

### 10.1. What the new `@y/prosemirror@2.0.0-2` API looks like

From `@y/prosemirror`'s `upgrade-y` branch (active development, `https://github.com/yjs/y-prosemirror/tree/upgrade-y/src`):

**File layout (5 files, ~30K total source):**
- `src/index.js` (5 LOC) — re-exports
- `src/keys.js` (737B) — only `ySyncPluginKey` exported
- `src/sync-plugin.js` (5.2K) — the new plugin
- `src/sync-utils.js` (16.9K) — delta machinery
- `src/positions.js` (6.2K)
- `src/commands.js` (2.0K)

**Public exports** (from `index.js`):

```js
export * from './sync-plugin.js'           // syncPlugin, $syncPluginState, $syncPluginStateUpdate
export * from './keys.js'                  // ySyncPluginKey
export { docToDelta, $prosemirrorDelta } from './sync-utils.js'
export * from './commands.js'              // pauseSync, configure
```

**Sync plugin signature** (NEW vs y-tiptap):

```js
// y-tiptap@3.0.3:
ySyncPlugin(yXmlFragment, opts)            // YType bound at construction

// @y/prosemirror@2.0.0-2:
syncPlugin(opts)                           // YType bound via tr.setMeta + commands.configure(state, dispatch, { ytype })
```

The `ytype` is set via `commands.configure(state, dispatch, { ytype })` (`commands.js:22-65`):

```js
// Switch to a different ytype, or set ytype=null to pause sync
configure(state, dispatch, { ytype, attributionManager })
```

**Plugin state shape:**

```js
$syncPluginState = s.$object({
  ytype: Y.$ytypeAny.nullable,                       // ← nullable! Sync paused when null
  attributionManager: Y.$attributionManager.nullable,
  attributionMapper: s.$function
})
```

**Subscription model:** `subscribeToYType()` uses the new Y.js 14 `ytype.observeDeep(change => change.getDelta(attributionManager, { deep: true }))` API and converts deltas to PM steps via `deltaToPSteps()`. This is the new "delta API" the PR #208 body refers to.

**No more `ProsemirrorBinding` class.** It's collapsed into the plugin state.
**No more `updateYFragment(y, yDomFragment, pNode, meta)`.** Replaced by `pmToFragment(node, fragment, opts)`, `fragmentToTr(fragment, tr, opts)`, `fragmentToPm(fragment, tr)`, and `deltaToPSteps(tr, delta, ...)`. Different shape: the new functions take `tr` + delta, not `(y.Doc, fragment, pmNode, meta)`.
**No more `yXmlFragmentToProsemirrorJSON(xmlFragment)`.** Replaced by `nodeToDelta(n)` + delta traversal via `lib0/delta`. The output type is `lib0/delta` not "PM JSON".
**No more separate `Y.XmlFragment` / `Y.XmlElement` / `Y.XmlText` types.** Yjs 14 (`v14.0.0-rc.13/src/index.js:23`) exports: `YType as Type, getTypeChildren, typeMapGetSnapshot, typeMapGetAllSnapshot, $ytype, $ytypeAny`. ONE unified type. The y-prosemirror rewrite uses `Y.$ytypeAny.nullable` as its plugin-state schema rather than `Y.XmlFragment`.
**Cursor + undo plugins:** the new `keys.js` has `ySyncPluginKey` only — `yUndoPluginKey` and `yCursorPluginKey` are commented-out. As of `@y/prosemirror@2.0.0-2`, **the yUndo and yCursor plugins are not yet ported** (see `keys.js:11-23` commented stub):

```js
// /**
//  * The unique prosemirror plugin key for {@link import('./undo').undoPlugin}
//  * @type {PluginKey<import('./undo').UndoPluginState>}
//  */
// export const yUndoPluginKey = new PluginKey('y-undo')
//
// /**
//  * The unique prosemirror plugin key for {@link import('./cursor').cursorPlugin}
//  * @type {PluginKey<import('./cursor').CursorPluginState>}
//  */
// export const yCursorPluginKey = new PluginKey('yjs-cursor')
```

Implication: **a fork of `@tiptap/y-tiptap` to Yjs 14 must port BOTH `yUndoPlugin` and `yCursorPlugin`** in addition to the sync plugin. `@y/prosemirror@2.0.0-2` does not provide them.

### 10.2. Concrete file/function delta in our fork

A `@inkeep/y-tiptap@4.0.0-fork` (working name) consuming `@y/y ^14.0.0-rc.13` and `@y/protocols ^1.0.6-3` would need:

| Source area | LOC in y-tiptap@3.0.3 | Action | Estimated LOC after rewrite |
| --- | --- | --- | --- |
| `dist/y-tiptap.js:1-21` (imports) | 21 | Rewrite. `import * as Y from 'yjs'` → `import * as Y from '@y/y'`. Drop `Y.XmlFragment / Y.XmlElement / Y.XmlText` named imports — Yjs 14 has unified `YType`. | ~15 |
| `ySyncPlugin` (`y-tiptap.js:142-281`) | 140 | Replace with `@y/prosemirror`-style `syncPlugin(opts)` — `ytype` via plugin meta, not constructor arg. Adopt new `Y.$ytypeAny.nullable` schema. Replace inline `binding.mux(() => doc.transact(...))` with the new delta-subscribe pattern (`ytype.observeDeep(change => change.getDelta(...))`). | ~80 (the delta API removes a lot of state machinery) |
| `ProsemirrorBinding` class (`y-tiptap.js:360-735` approx) | ~370 | DELETE. State collapses into `$syncPluginState`. The `_typeChanged`, `_prosemirrorChanged`, `renderSnapshot`, `_renderSnapshot`, `_forceRerender`, `_isLocalCursorInView` methods either disappear (delta-driven) or become small free functions. | ~60 (selection restore + initView shim) |
| `updateYFragment` (`y-tiptap.js:1145-1298` approx) | ~150 | DELETE. Replace with `nodeToDelta(pmNode)` → diff against `nodeToDelta(prevYDeltaSnapshot)` → `ytype.applyDelta(diff)`. Our existing `applyAgentMarkdownWrite` (`packages/server/src/agent-sessions.ts:68-113`) which invokes `updateYFragment(yDoc, fragment, pmNode, meta)` MUST be rewritten to compose a delta and apply via the new API. | ~40 + downstream call-site rewrites |
| `yXmlFragmentToProsemirrorJSON` (`y-tiptap.js`, `lib.js` family) | ~130 (combined with deprecated `yDocToProsemirrorJSON`, `yXmlFragmentToProseMirrorRootNode`, `yXmlFragmentToProseMirrorFragment`, `initProseMirrorDoc`) | Most consumers want `nodeToDelta` + `deltaToPSteps` paired. We use `yXmlFragmentToProsemirrorJSON` in `packages/server/src/server-observers.ts:34`, `packages/app/src/editor/observers.ts:26`, `packages/server/src/agent-sessions.ts:41`. All three call sites rewrite. | ~50 (compatibility wrapper that returns PM JSON via `Node.fromJSON(node)` reconstructed from delta) |
| `yCursorPlugin` (`y-tiptap.js:cursor-plugin region`, ~257 LOC equivalent in y-prosemirror's split) | ~257 | Port in fork. Awareness API in Yjs 14 vs `y-protocols ^1.0.1` is API-stable enough (`@y/protocols ^1.0.6-3` peer ranges suggest minor adjustment). | ~250 (largely portable) |
| `yUndoPlugin` (`y-tiptap.js:undo-plugin region`, ~125 LOC equivalent) | ~125 | Port in fork. `Y.UndoManager` exists in Yjs 14 (verified in `v14.0.0-rc.13/src/index.js:13`). | ~125 (mostly portable) |
| `absolutePositionToRelativePosition` / `relativePositionToAbsolutePosition` | ~80 (lib.js subset) | Port. Yjs 14 still exports `RelativePosition`, `AbsolutePosition`, `createRelativePositionFromTypeIndex`, `createAbsolutePositionFromRelativePosition` (verified at `v14.0.0-rc.13/src/index.js:11`). The signatures are compatible. | ~80 |
| `prosemirrorJSONToY{Doc,XmlFragment}` / `yDocToProsemirror{,JSON}` | ~120 (deprecated chunk) | DELETE — already deprecated upstream. Replace with `pmToFragment` / `nodeToDelta` if any consumer needs them. We do not call these. | 0 (excised) |
| `lib0/mutex` usage | 1 import | Keep — `lib0` survives the migration. | unchanged |
| `y-protocols/awareness` import | 1 import | Bump to `@y/protocols/awareness` (peer `^1.0.6-3` per `@y/prosemirror@2.0.0-2`'s peer-deps). | trivial |

**Aggregate:** y-tiptap@3.0.3 is ~1,400 LOC of meaningful code (rest is whitespace/comments in the 2,250-line bundle). The fork would shed roughly 600 LOC (the `ProsemirrorBinding` class + `updateYFragment` deep-attr-equality) and add ~200 LOC of delta orchestration. **Net: ~700-900 LOC of original code in the fork**, with zero novel algorithmic content (it's a port of `@y/prosemirror@2.x` plus port of cursor + undo plugins from y-prosemirror@1.3.7 atop the new YType API).

That's the optimistic estimate. The pessimistic estimate adds:
- **Tests:** y-prosemirror has ~3K LOC of tests (`yjs/y-prosemirror/tests/`); a port likely needs equivalent coverage. Add 2-3K LOC of test rewrites.
- **Our patches:** `patches/y-prosemirror@1.3.7.patch` (the `rawMdxFallback` substitution that prevents schema-throw delete cascades — CLAUDE.md precedent #9 invariant) is at the `equalYTypePNode` deep-attr-equality boundary. The new delta-based binding doesn't have an `equalYTypePNode` — the schema-throw failure mode has to be re-triggered and re-mitigated against the new architecture. This is the most uncertain piece. Could be a 100-LOC fix or a 500-LOC re-architecture.
- **Our `applyAgentMarkdownWrite`** (`packages/server/src/agent-sessions.ts:68-113`) currently hands `(doc, fragment, pmNode, meta)` to `updateYFragment` per CLAUDE.md precedent #10/#12. Switching to delta-composition is a paradigm shift, not a substitution — `pmNode → nodeToDelta(pmNode) → diff against ytype.toDeltaDeep() → ytype.applyDelta(diff)`. The structural diff that today preserves user-content Items will be replaced by the new delta API's lib0/delta machinery; whether it preserves Y.Items at the same granularity is an open empirical question.

### 10.3. Does the rest of TipTap's collab ecosystem work transparently with a y-tiptap-Yjs14 fork?

**No.** Three independent forks are required.

(1) **`@tiptap/extension-collaboration`** — coupled by `import { redo, undo, ySyncPlugin, yUndoPlugin, yUndoPluginKey } from '@tiptap/y-tiptap'` (`collaboration.ts:4`) plus four helper imports. It would import the same names from our fork. **But:** the new `syncPlugin(opts)` signature drops the `(yXmlFragment, opts)` form (§10.1). `extension-collaboration`'s `addProseMirrorPlugins()` (`collaboration.ts:170-172, 219`) passes `fragment` as the first positional arg:

```ts
const fragment = this.options.fragment ?? this.options.document.getXmlFragment(this.options.field)
const ySyncPluginInstance = ySyncPlugin(fragment, ySyncPluginOptions)
```

In a Yjs 14 fork, this becomes:

```ts
const ytype = this.options.ytype ?? this.options.document.getType(this.options.field)
const ySyncPluginInstance = syncPlugin(ySyncPluginOptions)
// then in view init: editor.state.tr.setMeta(ySyncPluginKey, { ytype })
```

The `field` semantics (`'default'`, named field) carry through — Yjs 14 still has `doc.getMap`/`doc.getArray`/`doc.getText` (or whatever the unified type accessor is). But the `fragment` option name on TipTap's side becomes wrong — should be `ytype`.

The undo-restore monkey-patch (`collaboration.ts:179-212`) operates on `Y.UndoManager` internals (`undoManager.trackedOrigins`, `undoManager._observers`, `undoManager.afterTransactionHandler`). Yjs 14 (`v14.0.0-rc.13/src/index.js:13`) still exports `UndoManager`; whether the internal field names survive is something the fork must verify. `_observers` is a `lib0/observable` thing; likely intact.

The `filterInvalidContent` plugin (`collaboration.ts:226-253`) does `transaction.doc.check()` — pure ProseMirror, unchanged.

**Estimated extension-collaboration fork: ~50 LOC of changes** (signature swaps, option rename, new ytype-via-meta wiring, possibly a config-call shim).

(2) **`@tiptap/extension-collaboration-cursor`** — coupled by `import { defaultSelectionBuilder, yCursorPlugin } from 'y-prosemirror'` (`collaboration-cursor.ts:3`). Three options to fix:

- (a) Re-point to the y-tiptap fork (preserve TipTap's "centralize on @tiptap/y-tiptap" intent that the `3.0.0-next.5+` betas tried). Net: 1 import line change + cursor plugin must exist in the fork (per §10.2, ~250 LOC port).
- (b) Re-point to `@y/prosemirror`. As of `2.0.0-2`, the cursor plugin is not exported (§10.1). Blocker.
- (c) Bypass the Y plugin entirely and write our own awareness→PM-decoration adapter using TipTap primitives. Highest cost, ~300-500 LOC.

(a) is the clean path; depends on the fork in §10.2 including a yCursor port.

(3) **`@tiptap/extension-drag-handle`** — coupled by `import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap'` (`drag-handle-plugin.ts:7-11`). Re-point to fork; both relative-position helpers + plugin key are in the fork's API per §10.2. **Estimated: import-line change only, zero algorithmic change.**

### 10.4. Bottom line on "what does a y-tiptap fork look like at source level?"

- **Files in the fork:** ~7 source files mirroring upstream's structure: `index.js`, `lib.js`, `utils.js`, `plugins/{sync-plugin, undo-plugin, cursor-plugin, keys}.js`. Plus `package.json`, `CHANGELOG.md`, `tsconfig.json`, rollup config.
- **Net new code:** ~700-900 LOC of original implementation, most of it ports.
- **Plus:** test port (~3K LOC), our `rawMdxFallback` substitution patch port (uncertain, 100-500 LOC), `applyAgentMarkdownWrite` rewrite to use deltas (~80 LOC), all three call sites for `yXmlFragmentToProsemirrorJSON` rewritten (or wrapped via a compat shim; ~50 LOC).
- **Three coupled extension forks downstream:** `extension-collaboration` (50 LOC), `extension-collaboration-cursor` (1 import line + dep on cursor port in fork), `extension-drag-handle` (1 import line).
- **Plus `y-codemirror.next` equivalent or fork:** y-codemirror.next imports `* as Y from 'yjs'` and uses `Y.UndoManager`, `Y.Text`, `Y.RelativePosition`. Yjs 14 has `UndoManager` (yes), `Text` (gone — unified into `YType`), `RelativePosition` (yes). This package needs its own Yjs 14 port. `@y/codemirror` exists at `0.0.0-3` (peer `@y/y ^14.0.0-22`) — published 2026-01-19 — but its API surface is not yet investigated here. (Its versioning at `0.0.0-N` rather than `2.0.0-N` suggests less mature than `@y/prosemirror`.)

The fork is **achievable with 1-2 months of focused work** by an engineer comfortable with both Yjs internals and ProseMirror plugin design — the architectural patterns are clear from `@y/prosemirror@2.0.0-2`'s implementation. The risks are: (a) the schema-narrowing safety patch (CLAUDE.md precedent #9 / `patches/y-prosemirror@1.3.7.patch`) needs an equivalent under the new delta-based binding; (b) the `applyAgentMarkdownWrite` template (CLAUDE.md precedent #10/#12) — the cornerstone of our XmlFragment-authoritative pattern — has no direct analog under deltas and must be re-engineered, not ported.

---

## 11. Direct answers to the "Critical for our stack" sub-questions

> **Q: Does `@tiptap/extension-collaboration` import anything other than `@tiptap/y-tiptap`'s `ySyncPlugin`?**

Yes — from `collaboration.ts:4` and helper files: `redo, undo, ySyncPlugin, yUndoPlugin, yUndoPluginKey, ySyncPluginKey, absolutePositionToRelativePosition, relativePositionToAbsolutePosition` (8 named imports from `@tiptap/y-tiptap`). It does NOT import directly from `yjs`/`y-prosemirror`/`y-protocols` (only `import type { Doc, UndoManager, XmlFragment } from 'yjs'` for typing). So the fork strategy is "swap one peer-dep, re-test the 8 imports."

> **Q: The cursor extension's `render` callback — does it take a Y.js-typed user object, or a generic `{ name, color, clientId }`?**

Generic. Type signature at `collaboration-cursor.ts:41`: `render(user: Record<string, any>): HTMLElement`. The `clientId` is NOT passed to the consumer's `render` — it's only available in `storage.users[i].clientId`. The default render at `collaboration-cursor.ts:106-120` only reads `user.color` and `user.name`. Yjs is invisible to the renderer.

> **Q: If we forked `@tiptap/y-tiptap` to support Yjs 14, would the rest of TipTap's collab ecosystem work transparently, or do `extension-collaboration` and `extension-collaboration-cursor` also need forks?**

Both need forks, plus `extension-drag-handle`:

- `@tiptap/extension-collaboration`: small fork (~50 LOC) to consume the new `syncPlugin(opts)` signature and switch ytype-binding to plugin meta. Peer-dep needs `@inkeep/y-tiptap-fork` instead of `@tiptap/y-tiptap`.
- `@tiptap/extension-collaboration-cursor`: 1-line fork to re-point `import { yCursorPlugin } from 'y-prosemirror'` → `from '@inkeep/y-tiptap-fork'`. Depends on the fork including a cursor port.
- `@tiptap/extension-drag-handle`: 1-line fork (peer-dep + import path).

**Plus** `y-codemirror.next` needs its own Yjs-14 fork or migration to `@y/codemirror@0.0.0-3` (which is not yet stable).

So the fork chain is **5 packages**, not 1.

---

## Appendix A — File-line-cited summary of every Yjs-coupled symbol Open Knowledge consumes

| Our import | Resolved file | Yjs API depth |
| --- | --- | --- |
| `import { yCursorPlugin } from '@tiptap/y-tiptap'` (`packages/app/src/editor/TiptapEditor.tsx:15`) | `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (cursor-plugin region, ~line 1500-1700) | Awareness + `Y.AbstractType<any>`, `Y.RelativePosition` |
| `import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'` (`packages/app/src/editor/observers.ts:26`) | `dist/y-tiptap.js` (updateYFragment ~1145-1298, yXmlFragmentToProsemirrorJSON ~lib region) | Deep `Y.Item` / `Y.XmlElement` / `Y.XmlText` / `Y.ContentType` traversal |
| same pair (`packages/server/src/server-observers.ts:34`) | same | same |
| `import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'` (`packages/server/src/agent-sessions.ts:41`) | same | same |
| `import Collaboration from '@tiptap/extension-collaboration'` (`packages/app/src/editor/TiptapEditor.tsx:12`) | `node_modules/@tiptap/extension-collaboration/dist/index.js:80-209` | Indirect via `ySyncPlugin(fragment, opts)` (`dist/index.js:173`) |
| `import { yCollab } from 'y-codemirror.next'` (`packages/app/src/editor/SourceEditor.tsx:31`) | `node_modules/y-codemirror.next/src/index.js:20-47` | `new Y.UndoManager(ytext)` constructor + `Y.Text` API |
| `import { HocuspocusProvider } from '@hocuspocus/provider'` (multiple) | `node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts` | `awarenessProtocol.Awareness`, `* as Y from 'yjs'` |

Indirect (transitive but not in our import lines):
- `@tiptap/extension-drag-handle` → `@tiptap/y-tiptap` (3 named imports, `drag-handle-plugin.ts:7-11`)
- `@tiptap/extension-collaboration-cursor` → `y-prosemirror` (2 named imports, `collaboration-cursor.ts:3`)
- `@hocuspocus/provider` → `y-protocols/{awareness, sync}` + `* as Y from 'yjs'` (`HocuspocusProvider.ts:3-4`, `MessageReceiver.ts:2-3`)

Every transitive dep above is a Yjs-13-pinned chain. The ENTIRE chain — y-tiptap, y-prosemirror, extension-collaboration, extension-collaboration-cursor, extension-drag-handle, y-codemirror.next, @hocuspocus/provider, y-protocols — has to either accept a Yjs-14 peer or be replaced by `@y/*` equivalents. The five-package fork sketch in §10 covers the four TipTap-owned pieces; `y-codemirror.next` and `@hocuspocus/provider` are upstream choices (replace with `@y/codemirror` + Hocuspocus team's Yjs-14 update — the latter is unannounced).
