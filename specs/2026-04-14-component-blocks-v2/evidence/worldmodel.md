---
topic: "Component Blocks v2 — typed MDX component nodes + block UX interaction layer"
date: 2026-04-14
baseline_commit: db8a6d6 (Timeline with rollbacks, merged 2026-04-14)
worktree: /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/component-blocks-v2
channels_run: [code (main + pr23-rebase), node_modules, web (2 probes), npm registry, git history]
channels_unavailable: [existing reports (not scanned — out of scope per prompt), catalog skills (edc0af6 removed catalogs)]
sources:
  - /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/pr23-rebase/packages/core/src/registry/built-ins.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/pr23-rebase/packages/core/src/registry/types.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/core/package.json
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/app/package.json
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/core/src/markdown/index.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/core/src/markdown/handlers.mdx.test.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/core/src/extensions/jsx-component.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/packages/app/src/editor/observers.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/node_modules/mdast-util-mdx-jsx/index.d.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/node_modules/fumadocs-ui/dist/components/ (version 16.1.0)
  - https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react
  - https://registry.npmjs.org/@tiptap/extension-drag-handle-react/latest (version 3.22.3, MIT)
  - https://github.com/handlewithcarecollective/remark-prosemirror
---

# Worldmodel — Component Blocks v2

Tight, observation-only harvest. Focus: the 9 specific questions in the prompt. No prescription.

## 1. 21 component built-ins verification

**File:** `../pr23-rebase/packages/core/src/registry/built-ins.ts` (237L). Self-describes as "15 built-in component families" in header comment but the `BUILT_INS` array contains **21 entries** (line 44–236). The header comment is stale; the code inventory is the ground truth.

**Sourcing layers:**
- Fumadocs (16 entries — header says 10): `Callout`, `Tabs`, `Tab`, `Card`, `Cards`, `Steps`, `Step`, `Accordion`, `Accordions`, `ImageZoom`, `Files`, `File`, `Folder`, `TypeTable`, `Banner`, `InlineTOC`.
- Docskit (3 entries): `Video`, `Frame`, `CodeGroup` — all resolved from `@inkeep/docskit/dist/mdx.d.ts`.
- Shadcn/app-local (2 entries): `Mermaid` (`packages/app/src/components/ui/mermaid.tsx`), `Audio` (`.../audio.tsx`).

**Resolution against main @ db8a6d6 (HIGH confidence, code-verified):**

| Entry | Path asserted | Resolves in main? |
|---|---|---|
| Fumadocs x16 | `fumadocs-ui/dist/components/{callout,tabs,card,steps,accordion,image-zoom,files,type-table,banner,inline-toc}.d.ts` | **YES** — all present. `fumadocs-ui@16.1.0` installed. Directory listing confirms every `.d.ts` file referenced. |
| Docskit x3 | `@inkeep/docskit/dist/mdx.d.ts` | **NO — STALE.** `@inkeep/docskit` is **NOT present in main's `node_modules/@inkeep/`** and not listed in either `packages/core/package.json` or `packages/app/package.json` dependencies. `require.resolve('@inkeep/docskit/package.json')` will throw. Blocker for any eager eval of BUILT_INS at startup. |
| Mermaid | `packages/app/src/components/ui/mermaid.tsx` | **NO — STALE.** `ls packages/app/src/components/ui/` yields only shadcn primitives (badge, button, context-menu, dropdown-menu, input, panel, popover, resizable, separator, sheet, sidebar, skeleton, sonner, svg-icon, toggle-group, toggle, tooltip). No `mermaid.tsx`. |
| Audio | `packages/app/src/components/ui/audio.tsx` | **NO — STALE.** Same directory listing; no `audio.tsx`. |

**Fumadocs components present in v16.1.0 but NOT in BUILT_INS** (observed in `node_modules/fumadocs-ui/dist/components/` directory listing, not cross-referenced to authoring intent): `codeblock.d.ts`, `dynamic-codeblock.d.ts`, `github-info.d.ts`, `heading.d.ts`, `tabs.unstyled.d.ts`, plus the `dialog/`, `layout/`, `ui/` subdirectories. HIGH confidence these exist; UNRESOLVED whether any are authoring-surface candidates vs. internal primitives.

**Name collisions with agents-docs conventions:** UNRESOLVED — prompt references "agents-docs conventions" but no `agents-docs` path surfaced in this repo. Searched `packages/`, `docs/`, and top-level — no match. Would need the external `agents-docs` repo to triangulate.

## 2. @tiptap/extension-drag-handle-react landscape

**HIGH confidence (npm registry + tiptap.dev docs):**

- **Exact package name:** `@tiptap/extension-drag-handle-react`
- **Latest version:** `3.22.3` (per registry.npmjs.org/latest). Web search result surfaced a higher `3.4.4` mention on npm UI — **divergence flagged**; registry JSON is ground truth for this harvest (`3.22.3`). `3.22.3` matches main's existing TipTap version pin line-for-line (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` all `^3.22.3`).
- **License:** MIT (confirmed in registry response; tiptap monorepo is MIT).
- **Peer deps (from registry):**
  - `react: ^16.8 || ^17 || ^18 || ^19` ✓ main uses `react@^19.2.5`
  - `react-dom: ^16.8 || ^17 || ^18 || ^19` ✓
  - `@tiptap/extension-drag-handle: ^3.22.3` — requires ALSO adding the base (non-React) package. Not currently in main.
  - `@tiptap/pm: ^3.22.3` ✓
  - `@tiptap/react: ^3.22.3` ✓
- **Runtime deps:** None listed (per registry).
- **Not currently installed:** `grep extension-drag-handle|DragHandle packages/*/package.json` — zero matches.
- **Conflicts with current collab stack:** UNRESOLVED from web alone. Main's collab extensions: `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor@3.0.0` (pinned exact, diverges from `^3.22.3` family — already a known pin), `@tiptap/y-tiptap@^3.0.3`. No documented incompatibility surfaced in web probes; ADJACENT — known TipTap v3 collab+NodeView issues exist (e.g., `y-prosemirror` widget decorations from drag-handle interacting with CollaborationCursor decorations) but no specific case found for this extension.

## 3. mdast `MdxJsxFlowElement` attribute shape

**HIGH confidence — `node_modules/mdast-util-mdx-jsx/index.d.ts`:**

```ts
interface MdxJsxFlowElement extends MdastParent {
  type: 'mdxJsxFlowElement'
  name: string | null        // null = fragment <>
  attributes: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>
  children: Array<BlockContent | DefinitionContent>
  data?: MdxJsxFlowElementData | undefined
}

interface MdxJsxAttribute extends Node {
  type: 'mdxJsxAttribute'
  name: string
  value?: MdxJsxAttributeValueExpression | string | null | undefined
  // ^^^ This is the full representation shape
}

interface MdxJsxAttributeValueExpression extends Node {
  type: 'mdxJsxAttributeValueExpression'
  value: string              // raw JS source, e.g. "[1,2,3]" or "someVar"
  data?: { estree?: Program }  // ESTree AST (when `addResult` is enabled)
}

interface MdxJsxExpressionAttribute extends Node {
  type: 'mdxJsxExpressionAttribute'   // spread, e.g. {...props}
  value: string
}
```

**A1 assumption mapping (the prompt's claim that typed attrs can be extracted without a secondary parser):**

| Source form | `MdxJsxAttribute.value` type | Extractable without ESTree? |
|---|---|---|
| `type="info"` (string literal) | `string` (`"info"`) | YES — direct read |
| `disabled` (boolean shorthand) | `null` or `undefined` | YES — detect via `value == null` |
| `count={3}` (numeric expression) | `MdxJsxAttributeValueExpression` with `value: "3"` | PARTIAL — raw string needs JS eval/parse |
| `data={[1,2,3]}` | `MdxJsxAttributeValueExpression` with `value: "[1,2,3]"` | PARTIAL — same |
| `children={<>...</>}` | `MdxJsxAttributeValueExpression` with ESTree on `data.estree` | requires ESTree walk |
| `{...spread}` | `MdxJsxExpressionAttribute` (no `name`) | NO — spread opaque without ESTree |

**Observation:** For the 4 scenarios exercised by `handlers.mdx.test.ts` (string literal, expression, boolean shorthand, member-expr tag) the shape is directly readable. Expression-typed scalars (`{3}`, `{true}`, `{'info'}`) require parsing the `value` string or walking `data.estree` if available.

## 4. Children structure for paired JSX

**HIGH confidence — same type file, line 144:** `MdxJsxFlowElement.children: Array<BlockContent | DefinitionContent>`. These are **standard mdast block content nodes** (paragraph, heading, list, blockquote, table, code, html, thematicBreak, mdxJsxFlowElement (nested), etc.) — no wrapping envelope.

For the example `<Callout>**bold** text</Callout>`: remark-mdx produces a `paragraph` child containing `[strong{text("bold")}, text(" text")]`. For the inline form `MdxJsxTextElement.children: PhrasingContent[]` — also standard inline mdast nodes.

**Running through existing handlers:** The current `buildMdastToPmHandlers()` in `packages/core/src/markdown/index.ts` maps all standard block/inline mdast types to PM nodes. The library's `state.all(node)` walker (visible in the paragraph handler at lines 184–203 for `flatChildren = state.all(node).flat()`) recursively applies handlers to children — same mechanism that works for blockquote, list, table. No blocker observed to reusing the same handler map on `mdxJsxFlowElement.children` to produce a PM `Fragment`. LOW-MEDIUM confidence on edge cases: nested `mdxJsxFlowElement` inside a paired element would recurse into the same handler (line 429-432 currently short-circuits to `sourceRaw`). PUA sentinel bytes from R23 guard (`autolink-void-html-guard.ts`) touch only raw markdown; children traversal is post-parse so PUA decoding already applied.

## 5. Current main's handler integration points

**HIGH confidence — code-verified:**

- **Handler registration site:** `packages/core/src/markdown/index.ts`, function `buildMdastToPmHandlers(schema)` — returns a plain object keyed by mdast node type. Registered via `RemarkProseMirrorOptions['handlers']` in the `parseMd` / `serializeMd` calls (lines 101–106 for parse).
- **The exact JSX branch:** `index.ts:419–465` — `if (n.jsxComponent) { handlers.mdxJsxFlowElement = ...; handlers.mdxJsxTextElement = ...; handlers.mdxFlowExpression = ...; handlers.mdxTextExpression = ...; handlers.mdxjsEsm = ...; handlers.containerDirective = ...; handlers.leafDirective = ...; handlers.textDirective = ...; }`. Every handler is the same shape: `(node) => n.jsxComponent.createAndFill({ content: rawFromData(node.data) ?? <fallback> })`. `rawFromData` reads `node.data.sourceRaw` attached by the position-slice walker.
- **Branching point for "registered? destructure : sourceRaw":** Line 429–432 for flow, 433–436 for text. The entire 419–465 block is the full JSX surface; any typed-component routing inserts at these two handler functions. `handlers.mdxFlowExpression`, `handlers.mdxTextExpression`, and `handlers.mdxjsEsm` are MDX constructs unrelated to named components; directives (`containerDirective`, `leafDirective`, `textDirective`) are separate (remark-directive, not JSX). A registry-driven branch naturally lives only at `mdxJsxFlowElement` and `mdxJsxTextElement`.
- **Serialize direction:** Lines 485+ (`buildPmToMdastHandlers`) — no `jsxComponent` → `mdxJsxFlowElement` handler seen; current path likely relies on `to-markdown-handlers.ts` for emitting the raw content verbatim. UNRESOLVED without deeper read of `to-markdown-handlers.ts` (not sampled).
- **Test coverage:** `handlers.mdx.test.ts` (75L, inspected in full). Explicit comments at lines 53–54 and 57–58: *"Paired components with children require handling mdxJsxFlowElement children which are parsed as nested mdast nodes. Deferred until schema supports children."* and *"Inline MDX requires a jsxInline PM node type (not jsxComponent which is block atom). Deferred until schema is expanded for MDX inline support."* — the deferred tests ARE the Layer 3 scope line.
- **Related recent spec commit:** `4c3ce97 spec: MDX tolerant parsing — finalized (agnostic mode + jsxInline + block fallback + R13 patch)` landed on main 2026-04-14 (after baseline). Scope overlap with Component Blocks v2 should be checked before finalizing.

## 6. JSX handler precedents

- **`@handlewithcare/remark-prosemirror`:** No built-in MDX JSX handler. Library docs (GitHub README) list only canonical mdast types (paragraph, listItem, ordered_list, bullet_list, emphasis, strong, link, etc.). MDX JSX handlers are entirely caller-owned. HIGH confidence.
- **Fumadocs MDX pipeline:** Uses the standard MDX.js rehype path — `remark-mdx` produces `mdxJsxFlowElement` → rehype transpiles mdast → hast → JSX import/usage for runtime React rendering. Fumadocs does NOT maintain a separate mdast→PM layer; its pipeline ends at React components. No direct precedent for "mdast JSX → typed PM node" reusable transform. ADJACENT.
- **Other prior art surfaced:** `@nytimes/react-prosemirror` (now `@handlewithcare/react-prosemirror`) — sibling library, no MDX. Milkdown discussion thread on `remark-mdx` integration (tracked as discussion #772) — content unknown, INACCESSIBLE without WebFetch to the specific page. Bret Cameron "minimal MDX writing experience" blog — MDX authoring UX but not mdast→PM specifically.

**Observation:** The repo is state-of-art for this transform direction — no shelf-pullable prior art. Custom handler implementation is expected.

## 7. Observer sync compatibility with block-level content holes

**Current observer assumptions (code-verified, `packages/app/src/editor/observers.ts`):**

- Observer A (XmlFragment→Y.Text): serializes the PM doc via `mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment))` → computes line-level diff via `diffLines` → applies via `applyUserDelta` (lines 189–248).
- `applyUserDelta` operates on **line strings**, content-matching by `resultLines.indexOf(line, resultCursor)`. It makes no assumption about whether the XmlFragment contains atoms vs. nested content — only about the **serialized markdown line layout**.
- Observer B (Y.Text→XmlFragment): parses markdown → `schema.nodeFromJSON` → `updateYFragment()`. The `updateYFragment` is ProseMirror's standard fragment differ; it handles nested content natively (already exercised by blockquote, list, table).
- Existing schema error handling (lines 456–464) explicitly catches `RangeError "Invalid content for node"` from text-directive inside strikethrough case → demonstrates the pipeline is already seeing (and recovering from) inline-JSX/block-JSX schema mismatches. This is the PUA/R23 defense surface.
- JsxComponent is `group: 'block', atom: true` (`packages/core/src/extensions/jsx-component.ts:13–14`). Changing `atom: true` → removing it + adding a content hole is the schema mutation at issue.

**Risks flagged (not solved):**
- **R-OA1:** Observer A's `applyUserDelta` depends on line-level atomicity. A paired JSX block that renders as multi-line markdown (`<Callout>\n\n**bold**\n\n</Callout>`) still round-trips as discrete lines; the line diff should continue to work. UNRESOLVED whether mid-block edit (user typing inside the content hole) produces line-level churn that `indexOf` resolves correctly vs. mismatches.
- **R-OA2:** `lastSyncedXmlMd` baseline (observers.ts:273) must stay accurate. If Observer B now writes PM trees with nested content (not just atoms), the post-sync re-serialization at lines 485–505 is the sole baseline refresh — already exists, should continue to work, but widens blast radius.
- **R-OB1:** Observer B's transient-parse-error allowlist (lines 456–464) includes `RangeError "Invalid content for node"`. With paired JSX the inline-vs-block mismatch surface grows. May need to expand allowlist or the schema must reject cleanly.
- **R-OB2:** Schema divergence between core `sharedExtensions` (no children) and a v2 schema WITH children is a known silent-corruption vector per CLAUDE.md ("drift causes silent data corruption"). Worktree's `node_modules` issue (nested prosemirror-model copies) compounds.
- **R-OC1:** Multi-client sync (per CLAUDE.md "Observer bridge coverage" rule): a remote peer typing inside a paired component's content hole arrives as a Y.Text-only WebSocket update. The `applyUserDelta` path is skipped for non-local transactions (observers refresh baseline only). This is existing behavior, but the consequence shifts — previously a peer could not type inside JSX, now they can.

## 8. PR #112 (image upload) interaction

**LOW conflict risk — code-verified.** PR #112 (`20dfb13`) file diff:

- Touches `packages/app/src/editor/extensions/shared.ts` (adds FileHandler + ALLOWED_IMAGE_MIME_TYPES import, `uploadAndInsert` wiring).
- Adds `packages/app/src/editor/image-upload/index.ts` + `shortestImageRef.test.ts` (app-layer only).
- Server-side: adds ContentFilter refcount Map, filter-aware sirv middleware, sibling-asset inclusion rule.
- **Does NOT touch** `packages/core/src/markdown/index.ts`, `packages/core/src/markdown/handlers.*`, `packages/core/src/extensions/jsx-component.ts`, `packages/app/src/editor/observers.ts`.
- Also landed: `a40ee65 fix(editor): make Image inline so block separators survive serialization` — Image node became inline. Separate from JSX but relevant context that the schema surface evolved.

Image nodes are a mdast `image` (standard) → PM `image` node — parallel track to `mdxJsxFlowElement`. No schema overlap on the typed-component path.

## 9. PR #39 (Timeline with rollbacks) interaction

**LOW-MEDIUM conflict risk — code-verified.** PR #39 (`db8a6d6`, baseline) file diff:

- **Server-side additions:** `timeline-query.ts` (new, 270L), `api-extension.ts` (+582/-XXX, adds /api/history, /api/history/:sha, /api/diff, /api/rollback), shadow-repo.ts refactor (multi-parent checkpoints).
- **Agent-sessions diff:** adds a new `LocalTransactionOrigin` — `'rollback-apply'`. Rollback path: `POST /api/rollback` → `updateYFragment()` on server Y.Doc with origin `'rollback-apply'` → L1 persistence fires, reconciledBase updates.
- **Core schema/extensions:** NO changes to `sharedExtensions`, `jsx-component.ts`, `markdown/*`. Timeline types added to `packages/core/src/types/timeline.ts` (21L, data only).
- **App-layer additions:** `TimelinePanel.tsx` (391L, right-side Sheet), `DiffView.tsx`, `PreviewEditor`, Clock button in EditorHeader, Restore flow.
- **Deleted:** `AgentUndoButton.tsx` (149L removed) — per-agent undo UI replaced by timeline-based rollback.

**Interaction points with Component Blocks v2:**
- **Origin truth table (CLAUDE.md):** now includes `'rollback-apply'` as a new LocalTransactionOrigin. Observer guards must handle it. UNRESOLVED whether observers.ts already treats it (line 453 catch-block mentions `'Invalid content for node'` but origin handling is elsewhere in the file) — not inspected at this depth.
- **PreviewEditor mounts alongside TiptapEditor (display:none) during preview** — requires provider/extensions to tolerate hidden editor. NodeView components (v2's JsxComponentView) must tolerate this lifecycle.
- **CRDT reconciled-base tracking:** rollback mutates `reconciledBase` scope. No direct conflict with Component Blocks v2, but rollback semantics assume the current schema can reconstruct historical markdown — if v2 changes schema (block atoms → content holes) and an old `<Callout>...</Callout>` rolls back to the new schema, the parsing path must handle both forms. LOW confidence this is actually a problem — the markdown is the canonical form, parse-then-apply flows through the (new) pipeline.

## Terminology (compact)

| Term | Source | Meaning (observed) |
|---|---|---|
| Layer 2 typed props | prompt + pr23-rebase PropDef | mdast attr → PM node attr map with JSON Schema |
| Layer 3 inline rich-text children | prompt + handlers.mdx.test.ts "deferred" comment | Paired JSX parsed to PM fragment (not sourceRaw atom) |
| `jsxComponent` | core/src/extensions/jsx-component.ts | Current block atom, `content: string` (raw MDX) |
| `mdxJsxFlowElement` / `mdxJsxTextElement` | mdast-util-mdx-jsx | Block / inline MDX mdast nodes |
| `sourceRaw` | position-slice walker | Original source bytes attached to mdast node's `data` |
| `BUILT_INS` | pr23-rebase registry/built-ins.ts | 21-entry authoring manifest (header comment says 15) |
| Component Blocks v2 | prompt | Combined SPEC: typed MDX nodes + block UX |

## Patterns observed

- **Pattern A — "Library ships nothing for JSX":** `@handlewithcare/remark-prosemirror` explicitly has no MDX JSX handlers; fumadocs doesn't do mdast→PM at all. The entire JSX→PM translation layer in this repo is first-party. HIGH confidence.
- **Pattern B — "sourceRaw escape hatch":** Current JSX handling converges all 5 MDX-family nodes (flow, text, flowExpression, textExpression, mdxjsEsm) plus all 3 directive nodes onto one `jsxComponent` atom via `sourceRaw`. Typed routing is additive at the handler-function level. HIGH confidence.
- **Pattern C — "Deferred tests are the scope line":** `handlers.mdx.test.ts` literally documents what Layer 3 unblocks (paired JSX, inline MDX). Scope edges are codified. HIGH confidence.
- **Pattern D — "Schema drift is a known silent-corruption vector":** CLAUDE.md warns about `sharedExtensions` drift; worktree node_modules resolution already fought this (prosemirror-model dedup report). HIGH confidence that schema changes need staged validation.
- **Pattern E — "Stale header comments in built-ins.ts":** File header says 15 families but code has 21 entries; 5 of those 21 won't resolve against main's installed packages (@inkeep/docskit absent, mermaid.tsx and audio.tsx don't exist). HIGH confidence finding.

## Divergences flagged

- **D1 — drag-handle-react version:** Web UI showed `3.4.4`; npm registry JSON showed `3.22.3`. The `3.22.3` reading is consistent with the rest of the tiptap v3 lineup in main's `package.json`. LOW confidence for `3.4.4`; HIGH for `3.22.3`.
- **D2 — "15 families" (header) vs 21 entries (code)** in `built-ins.ts` (pr23-rebase). Code wins; header is stale documentation.

## UNRESOLVED

- **U1 — agents-docs conventions** — no path found for `agents-docs` repo; name-collision question in sub-task 1 requires the external repo.
- **U2 — Fumadocs v16.1.0 new surface components** — `codeblock`, `dynamic-codeblock`, `github-info`, `heading`, `tabs.unstyled` observed in `node_modules` but not in BUILT_INS. Unknown if intended.
- **U3 — drag-handle-react runtime conflicts with CollaborationCursor** — no documented case; web channel exhausted without a decisive answer. Would require integration probe.
- **U4 — `4c3ce97 spec: MDX tolerant parsing`** — just-landed spec on main, scope overlap with Component Blocks v2 not audited (out of scope for this worldmodel but flagged).
- **U5 — `to-markdown-handlers.ts` serialize path for paired JSX** — not inspected; the PM→mdast side of the bridge for Layer 3 children is where schema drift would show up.
- **U6 — `rollback-apply` origin in observer guards** — observers.ts wasn't audited for this specific origin string.

## ADJACENT

- **A1 — `edc0af6 remove catalogs`** — catalog skills removed from repo on main. Standard worldmodel channel "catalog skills" therefore unavailable.
- **A2 — `a40ee65 fix(editor): make Image inline`** — Image schema change landed alongside PR #112; establishes a recent precedent for changing a node's inline/block group mid-stream.
- **A3 — Hocuspocus RC version (`4.0.0-rc.1`)** — both `@hocuspocus/provider` and `@hocuspocus/server` pinned exact. No bearing on Component Blocks v2 directly but worth noting for stability calibration.

## Sources

- [@tiptap/extension-drag-handle-react — tiptap.dev docs](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react)
- [@tiptap/extension-drag-handle-react — npm](https://www.npmjs.com/package/@tiptap/extension-drag-handle-react)
- [handlewithcarecollective/remark-prosemirror — GitHub](https://github.com/handlewithcarecollective/remark-prosemirror)
- [syntax-tree/mdast-util-mdx-jsx — GitHub](https://github.com/syntax-tree/mdast-util-mdx-jsx)
- [remark-mdx — mdxjs.com](https://mdxjs.com/packages/remark-mdx/)
- [Fumadocs — fumadocs.dev](https://www.fumadocs.dev/)
- [Fumadocs MDX Plugins docs](https://www.fumadocs.dev/docs/headless/mdx)
