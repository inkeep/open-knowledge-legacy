# Evidence: D5 — Integration with Our Markdown Pipeline

**Dimension:** D5 (using `MarkdownManager.serialize` on a PM Slice/Fragment; participation of our escapeMark, raw-mdx-fallback, jsxInline, and position-slice walker in partial-selection serialize)
**Date:** 2026-04-15
**Note:** D5 is the 1P integration check. The REPORT stays 3P-framed; the specific implementation plan belongs in a downstream spec per the "research reports stay portable" directive.

---

## Key files referenced

- `packages/core/src/markdown/index.ts` — `MarkdownManager` class (parse, parseWithFallback, serialize)
- `packages/core/src/extensions/shared.ts` — `sharedExtensions` array (schema source of truth)
- `packages/core/src/markdown/to-markdown-handlers.ts` — serialization overrides
- `packages/core/src/markdown/position-slice.ts` — source-form recovery walker
- `packages/app/src/editor/TiptapEditor.tsx:90,97-103` — existing `clipboardTextParser` + `mdManagerRef`

---

## Findings

### Finding D5-1: `MarkdownManager.serialize(json)` requires `json.type === 'doc'` (CONFIRMED)

Source: `packages/core/src/markdown/index.ts:138-159`:

```ts
serialize(json: JSONContent): string {
  let doc: PmNode;
  try {
    doc = this.schema.nodeFromJSON(json) as PmNode;
  } catch (err) {
    const msg = `MarkdownManager.serialize() failed: schema rejected JSONContent (type=${json.type}, childCount=${json.content?.length ?? 0})`;
    throw new Error(msg, { cause: err });
  }
  return serializeMd(doc, { ... });
}
```

`schema.nodeFromJSON(json)` requires the JSON to satisfy a valid `NodeSpec`. The schema's top node type is `doc` (TipTap StarterKit default, unchanged in our shared extensions).

**Integration requirement:** a clipboard serializer must pass a JSONContent whose root `type === 'doc'` with valid `block+` content. A raw `Slice.content.toJSON()` is an array of block nodes, NOT a doc — we must wrap.

### Finding D5-2: Schema's top node type is `doc` with content `block+` (CONFIRMED)

From `sharedExtensions` (`packages/core/src/extensions/shared.ts:24-74`): uses `StarterKit` which defines the default top node as `doc { content: 'block+' }`. No override.

**Implication:** `schema.topNodeType.createAndFill(null, slice.content)` is the correct wrap for any Slice that contains 1+ top-level blocks. For partial-block slices (`openStart > 0` or `openEnd > 0`), `createAndFill` will auto-fill required content — which means the serialized markdown may differ slightly from the "raw" user selection (e.g. a selection that opens mid-list-item may close to a complete list-item). This matches Milkdown's pattern (`milkdown/packages/plugins/plugin-clipboard/src/index.ts:144-147`).

### Finding D5-3: Existing `clipboardTextParser` pattern (CONFIRMED)

Source: `packages/app/src/editor/TiptapEditor.tsx:97-103`:

```ts
clipboardTextParser: (text, _context, _plain, view) => {
  const json = mdManagerRef.current.parse(text);
  const node = view.state.schema.nodeFromJSON(json);
  // biome-ignore lint/suspicious/noExplicitAny: ...
  return node.content as any;
},
```

Flow: raw `text/plain` → `MarkdownManager.parse()` → JSONContent → `schema.nodeFromJSON()` → return `.content` (Fragment of the parsed doc's children).

The `biome-ignore` highlights a real typing subtlety: TipTap's `clipboardTextParser` in `@types/prosemirror-view` expects a Slice return, but returning a Fragment works at runtime because PM's `parseFromClipboard` accepts Slice-compatible values.

**Symmetric copy pattern** would mirror this shape:

```ts
clipboardTextSerializer: (slice, view) => {
  const tempDoc = view.state.schema.topNodeType.createAndFill(null, slice.content);
  if (!tempDoc) return null;   // null = fall through per tiptap-markdown convention
  const json = tempDoc.toJSON() as JSONContent;
  return mdManagerRef.current.serialize(json);
},
```

### Finding D5-4: Fidelity extension attr defaults preserve serialization for WYSIWYG-authored content (CONFIRMED)

Content authored directly in WYSIWYG (never parsed from markdown source) does not have `sourceDelimiter`, `sourceFenceChar`, `sourceStyle`, `sourceRaw` values populated by the position-slice walker — those fields are attached during the markdown-parse path.

However, every fidelity extension declares default values for its attrs per `CLAUDE.md §9` (schema is add-only with `default`). Examples from the handlers in `packages/core/src/markdown/index.ts`:

- `strong`: `sourceDelimiter: node.data?.sourceDelimiter ?? '**'` (line 298)
- `emphasis`: `sourceDelimiter: node.data?.sourceDelimiter ?? '*'` (line 291)
- `heading`: `headingStyle: node.data?.sourceStyle ?? 'atx'` (line 306)
- `code`: `fenceDelimiter: node.data?.sourceFenceChar ?? '\``, `fenceLength: node.data?.sourceFenceLength ?? 3` (lines 318-319)
- `thematicBreak`: `sourceRaw: node.data?.sourceRaw ?? '---'` (line 330)

**Implication:** serialization of WYSIWYG-only content falls back to canonical markdown forms (`**bold**`, `*italic*`, ATX headings, backtick fences, `---` rule). This is correct behavior — there's no "source form" to preserve.

### Finding D5-5: Custom nodes serialize via their PM→mdast handlers (CONFIRMED)

Source: `packages/core/src/markdown/index.ts:687-723`.

- `jsxComponent` → emits `html` mdast node with `value: pmNode.attrs.content` (line 688-692). Preserves raw MDX source.
- `rawMdxFallback` → emits `html` with `value: pmNode.textContent` (line 695-700). Preserves raw bytes.
- `jsxInline` → emits `html` with `value: pmNode.attrs.sourceRaw || pmNode.textContent` (line 704-709).
- `wikiLink` → emits `html` with `value: '[[target#anchor|alias]]'` reconstruction (line 712-723).
- `linkRefDef` / `linkDefinition` → emits `definition` mdast node (line 674-684).

**Implication for partial-selection copy:** selecting inside or around any of these nodes preserves their canonical markdown form. The serialization path is identical to the full-doc save path used by persistence.

### Finding D5-6: Serialization can throw on schema mismatch (CONFIRMED)

Source: `packages/core/src/markdown/index.ts:148-151` — explicit `throw new Error(...)` if `schema.nodeFromJSON` rejects. A clipboard serializer must wrap in try/catch (Keystatic pattern — see D3 finding D3-7) and fall back to `slice.content.textBetween(0, slice.content.size, '\n\n')` on failure. Otherwise Cmd+C silently fails.

### Finding D5-7: Frontmatter lives in Y.Map('metadata'), not in PM doc (CONFIRMED)

Source: `packages/app/src/editor/TiptapEditor.tsx:79,366-380` — frontmatter is read from the Y.Doc's `metadata` map, stored in `frontmatterRef`. It is NOT part of the ProseMirror doc — it's stripped during persistence (see `packages/core/src/extensions/frontmatter.ts` per CLAUDE.md).

**Implication for copy:** Cmd+A + Cmd+C produces the markdown body only, NOT the frontmatter. This is the correct default — a user copying content to paste into another document does not typically want to carry frontmatter with them. If "Copy full markdown including frontmatter" is ever a product requirement, it would be a separate command (not Cmd+C).

### Finding D5-8: `parseWithFallback` is NOT needed on the copy path (INFERRED)

`parseWithFallback` exists for disk → CRDT paths where user-visible data loss would result from a parse failure. On the copy path, we're serializing a known-valid PM doc (the editor wouldn't have accepted invalid content). Use the non-fallback `serialize()` — failures there are genuine schema mismatches that should surface.

### Finding D5-9: Existing `mdManagerRef` is the right shared instance (CONFIRMED)

Source: `packages/app/src/editor/TiptapEditor.tsx:90`:

```ts
const mdManagerRef = useRef(new MarkdownManager({ extensions: coreExtensions }));
```

Already created per-editor-instance. The copy-side serializer can reuse the same ref — no second MarkdownManager instantiation needed. Symmetry with paste.

---

## Implications for Open Knowledge

1. **Use `clipboardTextSerializer` (not `transformCopied`)** to avoid mutating the slice used by `clipboardSerializer` and the saved internal-drag slice (see D7 evidence).
2. **Wrap `slice.content` in `schema.topNodeType.createAndFill(null, slice.content)`** before passing to `MarkdownManager.serialize()`. Partial-block selections auto-close gracefully.
3. **try/catch with plain-text fallback** — Keystatic pattern. On serialize failure, emit `slice.content.textBetween(0, slice.content.size, '\n\n')`.
4. **Reuse the existing `mdManagerRef`.** The paste path already owns a MarkdownManager with our shared extensions; use the same instance for copy.
5. **Frontmatter is correctly not included** in Cmd+C output. No code change needed.
6. **Content authored in WYSIWYG serializes to canonical markdown** via fidelity extension defaults — no information lost.
7. **Custom nodes (jsxComponent, rawMdxFallback, jsxInline, wikiLink) serialize to their canonical MDX/markdown form** via the existing PM→mdast handlers.

---

## Gaps / follow-ups

- **Partial-block selection serialization** deserves empirical testing — `createAndFill` may auto-fill a list-item or code-block in ways that produce surprising markdown. This surfaces in D4 (partial-block slices) and is not fully answered until tested.
- **Performance of `MarkdownManager.serialize` on large selections** — untested. For a 10MB-paragraph doc with Cmd+A, is a sync serialize fast enough to complete within the clipboard event's gesture window? This matters more in mobile Safari than desktop.
- **Whether to emit a "pure-text shortcut"** (Milkdown line 138-141) — for a selection that's a single run of text with no marks, is markdown (empty formatting) cleaner than `textBetween`? Probably yes, but worth empirical check.

---

## Sources

- `packages/core/src/markdown/index.ts` (full file)
- `packages/core/src/extensions/shared.ts` (lines 24-74)
- `packages/app/src/editor/TiptapEditor.tsx` (lines 78-103, 366-380)
- `packages/core/src/markdown/to-markdown-handlers.ts` (referenced via grep)
- CLAUDE.md §9 — "Schema is add-only forever" precedent
- Milkdown `packages/plugins/plugin-clipboard/src/index.ts:133-147` (cross-reference to D3)
- Keystatic `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:22-38` (cross-reference to D3)
