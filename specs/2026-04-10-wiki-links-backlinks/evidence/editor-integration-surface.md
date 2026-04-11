---
title: Editor Integration Surface for Wiki-Links
description: Codebase trace of TipTap extension architecture, onStoreDocument hook, Y.Doc structure, MCP tool patterns, and markdown round-trip pipeline. Direct integration points for the S10 wikilink node and backlink index.
created: 2026-04-10
last-updated: 2026-04-10
---

## Extension registration

**File:** `packages/core/src/extensions/shared.ts:12-31`

- `sharedExtensions` is the single source of truth shared across editor (TiptapEditor), server persistence (onLoadDocument/onStoreDocument), and markdown round-trip tests.
- **Extension ordering matters:** JsxComponent comes before StarterKit because the markdown registry uses insertion order. Any wikilink node must also come before StarterKit.
- Extensions are shared between core (no NodeView) and app (adds ReactNodeViewRenderer). Core defines schema + markdown hooks; app wraps with React renderer.

## JsxComponent — closest analogue to WikiLink node

**File:** `packages/core/src/extensions/jsx-component.ts` (77 lines) — CONFIRMED by code read

```typescript
Node.create({
  name: 'jsxComponent',
  group: 'block',    // WikiLink changes to 'inline'
  atom: true,        // WikiLink keeps: atomic inline node
  priority: 60,      // WikiLink needs priority > default (50)
  addAttributes() { return { content: { default: '' } }; },
  markdownTokenName: 'code',           // WikiLink uses custom token type
  parseMarkdown(token, helpers) { ... },  // Intercept custom token
  renderMarkdown(node) { ... },           // Output [[...]] syntax
})
```

Key differences for WikiLink:
- `group: 'inline'` instead of `'block'`
- `inline: true` property needed
- Attributes: `{ target, alias, anchor }` instead of `{ content }`
- `renderMarkdown` outputs `[[target]]` or `[[target|alias]]` or `[[target#anchor]]`

## @tiptap/markdown version and parser

**File:** `bun.lock` — CONFIRMED

`@tiptap/markdown@3.22.3` depends on **`marked@^17.0.1`** (NOT remark, NOT markdown-it).

This is critical for the wiki-link markdown round-trip:
- `markdownTokenName` corresponds to a `marked` token type
- JsxComponent intercepts the built-in `code` token type with custom `lang` check
- Wiki-links are **inline** tokens — `marked` v17 supports custom inline extensions via `marked.use({ extensions: [{ name, level: 'inline', tokenizer, renderer }] })`
- A custom marked inline extension must be added to the MarkdownManager's `marked` instance to produce `wikilink` tokens from `[[...]]` patterns
- Status: **CONFIRMED from source.** `MarkdownManager.registerExtension()` reads the extension's `markdownTokenizer` field and calls `registerTokenizer()`, which wraps it as a marked inline extension via `this.markedInstance.use({ extensions: [markedExtension] })`. Verified in `node_modules/.bun/@tiptap+markdown@3.22.3+25a64fe20fbde960/node_modules/@tiptap/markdown/src/MarkdownManager.ts` and `dist/index.js`.

## onStoreDocument hook

**File:** `packages/server/src/persistence.ts:165-195` — CONFIRMED by codebase exploration

Current execution order:
1. `xmlFragment = document.getXmlFragment('default')`
2. `json = yXmlFragmentToProsemirrorJSON(xmlFragment)` — converts Y.Doc to PM JSON
3. `body = mdManager.serialize(json)` — PM JSON → markdown string
4. `markdown = prependFrontmatter(frontmatter, body)` — prepend YAML frontmatter
5. `await writeFile(tmpPath, markdown)` — atomic write
6. `registerWrite(filePath, contentHash(markdown))` — prevent file-watcher loop
7. `scheduleGitCommit()` — debounced git commit (30s)

**Backlink extraction insertion point:** After step 3 (`body` is available as markdown string). Can also parse `json` directly to walk the ProseMirror JSON tree for wikilink nodes — no re-parsing needed if using JSON walk.

Debounce: 2s quiet / 10s max (configured in standalone.ts). Backlink extraction runs at most once per 2-10s burst — acceptable for a knowledge base use case.

## Y.Doc structure

**Files:** `packages/app/src/editor/TiptapEditor.tsx:56-96`, `packages/app/src/editor/observers.ts` — CONFIRMED

| Key | Type | Purpose |
|-----|------|---------|
| `getXmlFragment('default')` | Y.XmlFragment | ProseMirror document tree |
| `getText('source')` | Y.Text | Markdown source (CodeMirror binding) |
| `getMap('metadata')` | Y.Map | `{ frontmatter: string }` |
| `getMap('activity')` | Y.Map | Agent write attribution |

No existing backlink map. A `Y.Map('backlinks')` could be added, but:
- This would make backlinks collaborative/real-time (agent and human both see updates)
- Alternative: server-side in-memory Map or JSON file (simpler, no CRDT overhead)

## yXmlFragmentToProsemirrorJSON

**Import:** `from '@tiptap/y-tiptap'` (used in `packages/app/src/editor/observers.ts:37`) — CONFIRMED

Works server-side in Node.js without DOM. The key function for server-side backlink extraction without requiring a browser runtime.

## MCP tool structure

**Files:** `packages/cli/src/mcp/tools.ts` (~350 lines), `packages/cli/src/mcp/server.ts` — CONFIRMED by codebase exploration

8 current tools: `read_document`, `write_document`, `edit_document`, `list_documents`, `search_documents`, `undo_agent_edit`, `redo_agent_edit`, `update_frontmatter`

Tool handler pattern:
```typescript
tool(name, description, { schema: zodSchema }, async (args) => {
  const result = await httpGet/Post(httpUrl, path, body);
  return textResult(result.ok ? successStr : errorStr);
});
```

Backlink tools would call new HTTP endpoints (`/api/backlinks`, `/api/forward-links`, etc.) that query the server-side index.

## Rename and move surface

- No managed document rename or move flow exists today in app, server, or MCP surfaces. Code search found no user-facing rename path; the only `rename()` call in server code is the atomic temp-file swap in persistence (`packages/server/src/persistence.ts`).
- Consequence: auto-updating wikilinks on rename cannot rely on an existing first-class rename event. P0 choices are:
  - add an explicit app/server rename flow and update links there, or
  - infer external renames from file-watcher `delete` + `create` pairs as a best-effort heuristic.
- This makes rename resilience a product+technical decision, not just an implementation detail.

## Heading anchors / section-link baseline

- No heading-ID or heading-anchor system exists in `packages/app` or `packages/core` today. Headings are plain TipTap heading nodes with no persistent `id` attribute surfaced in this codebase.
- Confirmed from `@tiptap/extension-heading@3.22.3` source: the stock Heading extension only defines a `level` attribute and markdown round-trip for `#` syntax. It does not assign or preserve stable per-heading IDs. Any stable-ID strategy would require extending or replacing the heading node behavior.
- `github-slugger` exists in the lockfile through the docs stack (`fumadocs-core`), but it is not a direct dependency of `packages/app` or `packages/core`.
- Consequence: `[[Page#Heading]]` support needs an explicit anchor policy. The lowest-friction path is GitHub-style text slugging with a direct dependency; stable per-heading IDs would be a larger feature.

## Autocomplete matching dependency surface

- No dedicated fuzzy-matching library is declared directly in `packages/app`.
- `fuzzysort@3.1.0` is already present in `bun.lock`, but only transitively through the `shadcn` package, not as an explicit application dependency.
- Consequence: if autocomplete uses `fuzzysort`, it should be added as a direct dependency rather than relying on a transitive install.

## @tiptap/suggestion — verified for [[ trigger

**From research report (CONFIRMED from source in wiki-links-backlinks-architecture/fanout):**

```typescript
// Regex for char: '[[' with allowSpaces: true
/(?:^)?\[\[.*?(?=\s\]\]|$)/gm
```

Callbacks: `onBeforeStart`, `onStart` (show popup), `onBeforeUpdate`, `onUpdate`, `onExit` (hide popup), `onKeyDown`.

`command` callback: replaces trigger+query range with inserted wikilink node.

`allowSpaces: true` is needed for multi-word page titles like `[[Project Alpha]]`.

## File watcher

**File:** `packages/server/src/file-watcher.ts:67-120` — CONFIRMED

- Uses `@parcel/watcher`
- Triggers on `.md` file changes from external editors (VS Code, Cursor, vim)
- Content-hash tracking prevents re-entrancy with persistence
- External changes call `updateYFragment()` with `skipStoreHooks: true`
- This means external file changes do NOT trigger `onStoreDocument` — backlink extraction from external changes requires separate trigger (file-watcher can call the same extraction logic directly)
- Current implementation ignores `delete` events entirely (`console.warn(...ignoring)`), so it has no rename handling today.
- `@parcel/watcher@2.5.6` exposes only `create`, `update`, and `delete` events. Its README explicitly states: "Renames cause two events: a `delete` for the old name, and a `create` for the new name."
- Consequence: the watcher alone does not provide a first-class rename signal. Robust external rename propagation cannot be implemented as a trivial event hook.

## Backlink context snippets

- The `onStoreDocument` path already has ProseMirror JSON for the full document tree before markdown is written.
- Context snippets do not require re-parsing markdown or any extra library.
- Practical extraction approach:
  - when a `wikiLink` node is found, inspect its parent paragraph or list item
  - flatten sibling text around the link
  - capture a short window bounded by punctuation or paragraph edges
- Consequence: snippet extraction is low-risk and fits naturally into the same JSON walk used for backlink indexing.

## Heading rename propagation with text-derived anchors

- Text-derived section anchors do not require stable IDs if the system is willing to rewrite inbound links when headings change.
- Practical model:
  - extract heading texts/slugs per document during indexing
  - diff old heading slug set vs new heading slug set on each save/external change
  - when a heading slug changes, rewrite inbound `[[Page#Old Heading]]` links to `[[Page#New Heading]]`
- This is technically compatible with text-derived anchors, but it turns heading edits into the same class of global refactor problem as page renames.
- Main edge case: duplicate headings in one page. Without stable IDs, identical heading text creates ambiguity for which target anchor a link intended.

## Rename propagation implications

- Current persistence names documents by path-derived `documentName`; there is no separate stable page identity in storage.
- Current external-change handling updates an already-open document by `docName` only. It does not reconcile path moves, reopen docs under new names, or pair deleted and created paths into a rename transaction.
- Strong implication: "robust external rename propagation" needs a higher-level reconciliation layer, likely including:
  - a file inventory / snapshot of known documents,
  - delete+create pairing heuristics,
  - full backlink rewrite transaction once a rename is inferred,
  - and probably a first-class managed rename path for cases where intent must be unambiguous.
- Additional product implication: `STORIES.md` U7.5 says "when a user renames or moves a page" existing links still resolve, but the current product has no rename/move surface at all. A first-class rename flow is not just an optimization; it is the only path to a strong guarantee when user intent is known.
- Practical recommendation for P0:
  1. add a managed rename/move API in the server
  2. wire app rename UI to that API
  3. treat watcher-side delete+create reconciliation as fallback support for external filesystem renames
- This hybrid model is materially stronger than watcher heuristics alone and aligns with the user's chosen `1:B` stance (strong practical external support, not absolute guarantee).
- Hocuspocus v4 exposes the document-scoped primitives needed for a managed rename flow:
  - `closeConnections(documentName?: string)`
  - `unloadDocument(document)`
  - `openDirectConnection(documentName)`
- Consequence: a server-managed rename is technically feasible on the current stack. The remaining complexity is application coordination and backlink rewrite orchestration, not missing CRDT/server primitives.

## Watcher-side rename reconciliation strategy

- `@parcel/watcher` also supports `writeSnapshot()` / `getEventsSince()`, but these still return only `create` / `update` / `delete` events. Snapshots help recover missed history; they do not solve rename intent.
- A credible fallback strategy for external filesystem renames is:
  1. stop ignoring `delete` events and store short-lived tombstones keyed by old path/docName
  2. retain last-known metadata per document in the backlink index layer: content hash, title, heading slugs, outgoing links
  3. on `create`, attempt to pair with a recent tombstone by confidence tiers:
     - Tier 1: exact content hash match
     - Tier 2: same title + high content similarity
     - Tier 3: same outgoing link signature / heading signature with path move timing
  4. only auto-rewrite backlinks when confidence is high
  5. when confidence is low, do not rewrite automatically; surface an ambiguous rename event for follow-up
- This preserves correctness better than always guessing, and matches the "strong practical support, not absolute guarantee" stance.

## Reference definitions behavior under the current markdown stack

- Verified locally against the installed `marked@17.0.6` parser:
  - `[[my-note]]` plus `[my-note]: ./path/to/my-note.md "My Note"` renders as `[<a href="./path/to/my-note.md">my-note</a>]`
  - `[[my-note#Section One]]` plus `[my-note#Section One]: ./path/to/my-note.md#section-one "My Note"` renders as `[<a href="./path/to/my-note.md#section-one">my-note#Section One</a>]`
  - `[[my-note|Custom Label]]` plus `[my-note|Custom Label]: ...` renders as `[<a ...>my-note|Custom Label</a>]`
- Consequence: Foam-style footer definitions do make wikilinks clickable in standard markdown parsers, but they do not preserve alias display semantics cleanly. The visible rendered text remains the raw wikilink payload inside outer brackets.
- Strong recommendation: treat footer definitions as a portability/clickability layer, not as a full-fidelity rendering layer. If clean alias rendering on GitHub/SSGs matters later, that likely requires build-time preprocessing rather than definitions alone.

## Reference definitions integration point

- The clean integration point in this repo is post-serialization in persistence, not `renderMarkdown` on individual nodes.
- Reason: generating definitions requires document-global knowledge:
  - dedupe repeated targets,
  - compute relative paths from the current document to each target,
  - include section anchors,
  - and reserve/manage a footer block deterministically.
- Practical implementation shape:
  - serialize body via `mdManager.serialize(json)`
  - strip any previously generated definitions footer
  - collect wikilink targets from the same ProseMirror JSON walk used for backlink indexing
  - append a regenerated definitions block before `prependFrontmatter(...)`
