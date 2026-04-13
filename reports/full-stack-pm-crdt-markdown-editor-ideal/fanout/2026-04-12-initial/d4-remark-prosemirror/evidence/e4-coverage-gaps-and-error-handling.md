# E4: Coverage Gaps & Error Handling

**Source:** Source code analysis of `mdast-util-to-prosemirror.ts` built-in handler set

## Built-in Handlers (What the Library Does For You)

### toProseMirror direction — Built-in handlers

| mdast type | Built-in behavior | Overridable? |
|---|---|---|
| `root` | Creates `schema.topNodeType.create(null, children)` | No (always first in dispatch) |
| `text` | `schema.text(replaceNewlines(trimLines(value)))` | No (hardcoded before user handlers) |
| `html` | Parse via `hast-util-from-html`, dispatch to `htmlHandlers` | No (but extensible via htmlHandlers) |
| `toml` | `ignore()` → returns undefined | No |
| `yaml` | `ignore()` → returns undefined | No |
| `definition` | `ignore()` → collected into `state.definitionById` | No |
| `footnoteDefinition` | `ignore()` → collected into `state.footnoteById` | No |
| `linkReference` | Resolves via definitions, delegates to `handlers.link` | Yes (check `handlers.linkReference` first) |

**Critical observation:** User handlers are spread AFTER the builtins in the `zwitch` handlers object:
```typescript
handlers: {
  toml: ignore,
  yaml: ignore,
  definition: ignore,
  footnoteDefinition: ignore,
  root(...) { ... },
  html(...) { ... },
  text(...) { ... },
  ...handlers,        // ← user handlers here
  linkReference(...)  // ← AFTER user handlers (special handling)
}
```

This means user handlers CAN override `toml`, `yaml`, `definition`, `footnoteDefinition`, `root`, `html`, and `text` because object spread overwrites earlier keys. But `linkReference` is AFTER the spread, so the library checks `handlers.linkReference` explicitly before using its default.

### fromProseMirror direction — Built-in handlers

| PM node type | Built-in behavior |
|---|---|
| `schema.topNodeType` | Returns `{ type: "root", children }` |
| `schema.nodes["text"]` | Returns `{ type: "text", value: pmNode.text }` |
| Everything else | Returns `null` (silent drop) |

## Coverage Gaps — mdast Types Requiring Custom Handlers

### Standard mdast (CommonMark)

| mdast type | Requires custom handler | Notes |
|---|---|---|
| `paragraph` | **YES** | No default mapping |
| `heading` | **YES** | Need to map depth → attrs |
| `blockquote` | **YES** | No default |
| `list` | **YES** | Need to check `ordered` property |
| `listItem` | **YES** | Need to handle `checked` for task lists |
| `code` | **YES** | Need to map `lang`, `meta` |
| `inlineCode` | **YES** | No default |
| `emphasis` | **YES** | Map to mark |
| `strong` | **YES** | Map to mark |
| `link` | **YES** | Map `url`, `title` to mark attrs |
| `image` | **YES** | Map `url`, `alt`, `title` to node attrs |
| `thematicBreak` | **YES** | No default |
| `break` | **YES** | Break is handled in `all()` for leading whitespace trim, but no PM node is created |
| `imageReference` | **YES** | No default (reverted to text if no definition) |

### GFM extensions

| mdast type | Requires custom handler | Notes |
|---|---|---|
| `table` | **YES** | No default |
| `tableRow` | **YES** | No default |
| `tableCell` | **YES** | No default |
| `delete` (strikethrough) | **YES** | No default |

### MDX extensions (from remark-mdx / mdast-util-mdx-jsx)

| mdast type | Requires custom handler | Notes |
|---|---|---|
| `mdxJsxFlowElement` | **YES** | Custom mdast type, needs module augmentation |
| `mdxJsxTextElement` | **YES** | Custom mdast type, needs module augmentation |
| `mdxFlowExpression` | **YES** | Custom mdast type |
| `mdxTextExpression` | **YES** | Custom mdast type |
| `mdxjsEsm` | **YES** | Custom mdast type |

### Our custom extensions

| mdast type | Requires custom handler | Notes |
|---|---|---|
| `wikiLink` | **YES** | Custom mdast type from our remark plugin |

## Error Handling — Asymmetric by Direction

### toProseMirror (Markdown → PM): THROWS on unknown

```typescript
function unknown(node: unknown): PmNode {
  throw new Error(`unknown markdown node: ${(node as MdastNodes).type}`);
}
```

**Impact:** If remark-parse or remark-mdx produces ANY mdast node type that doesn't have a registered handler, the conversion throws. This means:

1. You MUST register handlers for EVERY mdast type that can appear in your documents
2. Missing a single type → runtime crash
3. GFM types (table, delete) require handlers if you use remark-gfm
4. MDX types require handlers if you use remark-mdx
5. Any remark plugin that introduces custom types requires handlers

### fromProseMirror (PM → Markdown): SILENT DROP on unknown

```typescript
function one(pmNode: PmNode, parent?: PmNode): MdastNodes | MdastNodes[] | null {
  const handler = state.nodeHandlers[nodeName];
  if (handler) return handler(pmNode, parent, state);
  if (pmNode.type === schema.topNodeType) return { type: "root", children };
  if (pmNode.type === schema.nodes["text"]) return { type: "text", value: pmNode.text };
  return null;  // ← silent drop
}
```

**Impact:** PM nodes without handlers are silently lost during serialization. This is dangerous for round-trip fidelity — you won't know content was dropped.

### toPmNode returns null on invalid content

```typescript
const result = nodeType.createAndFill(getAttrs?.(node) ?? null, children);
return result;  // can be null if content doesn't match schema
```

`createAndFill` returns `null` if children don't match the node's content expression. This null propagates through `state.one()` and gets filtered out. The node is silently dropped.

### doc.check() validation

After building the entire document:
```typescript
const doc = handle(...) as PmNode;
doc.check();  // Throws if the document violates schema constraints
return doc;
```

This catches structural violations but only after the full document is built.

## Known Bugs / Issues

### Issue #2: Empty line preservation

Empty lines between blocks are lost. This is an mdast-level issue — the mdast tree doesn't represent blank line count between block nodes.

### Issue #3 / PR #3: Empty text node crash

When whitespace-only text nodes appear, ProseMirror's `schema.text()` throws "Empty text nodes are not allowed." The proposed fix replaces spaces with `\u00A0` (non-breaking space) — a workaround, not a proper fix.

### `break` handling

The `break` mdast node has no explicit handler. Instead, it's handled implicitly in `all()`:
```typescript
if (index && nodes[index - 1]?.type === "break") {
  // Trim leading whitespace from the next node
}
```

If you register a handler for `break`, it would be called by zwitch. But without one, it hits the `unknown` function and **throws**. The implicit handling in `all()` only applies AFTER the previous sibling was a break — but the break node itself still goes through the dispatch.

**Wait — this contradicts.** Let me re-check...

Actually, `all()` calls `state.one(nodes[index], parent)` for EACH child. For a `break` node, `state.one()` dispatches through `handle()` → `zwitch`. If `break` is not in the handlers, `unknown` throws.

**Conclusion:** Users MUST register a `break` handler or their documents with hard breaks will crash.
