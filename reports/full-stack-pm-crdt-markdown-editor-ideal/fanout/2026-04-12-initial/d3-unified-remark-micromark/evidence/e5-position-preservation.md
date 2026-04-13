# E5: Position Information Preservation in mdast

**Sources:**
- `@types/unist@3.0.3`
- `mdast-util-from-markdown@2.0.3`
- `micromark@4.0.2`

## Position Type

```typescript
interface Point {
  line: number;     // 1-indexed line number
  column: number;   // 1-indexed column number
  offset?: number;  // 0-indexed character offset (optional in type, always present from parser)
}

interface Position {
  start: Point;     // First character of parsed region
  end: Point;       // First character AFTER parsed region (exclusive)
}
```

## Micromark Tokenizer Position Tracking

The tokenizer maintains a mutable point that updates on every character consumed:

```javascript
// micromark/lib/create-tokenizer.js
let point = {
  _bufferIndex: -1,
  _index: 0,
  line: from && from.line || 1,
  column: from && from.column || 1,
  offset: from && from.offset || 0
};

function consume(code) {
  if (markdownLineEnding(code)) {
    point.line++;
    point.column = 1;
    point.offset += code === -3 ? 2 : 1;  // CRLF = 2 bytes
  } else if (code !== -1) {
    point.column++;
    point.offset++;
  }
  // ... buffer tracking
}
```

Tokens are created with position snapshots:

```javascript
function enter(type, fields) {
  const token = fields || {};
  token.type = type;
  token.start = now();  // Snapshot of current point
  return token;
}

function exit(type) {
  const token = stack.pop();
  token.end = now();  // Snapshot of current point
  return token;
}
```

## mdast-util-from-markdown Position Assignment

Every node gets position in the `enter()` / `exit()` lifecycle:

```javascript
// mdast-util-from-markdown/lib/index.js
function enter(node, token, errorHandler) {
  node.position = {
    start: point(token.start),  // { line, column, offset }
    end: undefined              // Patched on exit()
  };
}

function exit(token) {
  const node = this.stack.pop();
  node.position.end = point(token.end);
}
```

## Reliability Guarantees

| Node Category | Position Present | Offset Present | Notes |
|---------------|-----------------|----------------|-------|
| Root | Always | Always | Spans entire document |
| Block nodes | Always | Always | From source tokens |
| Inline nodes | Always | Always | From source tokens |
| Text nodes | Always | Always | Aggregated from data tokens |
| Generated nodes (added by transforms) | No | No | Per unist spec: "generated nodes must not have position" |

**Key finding:** For any node produced by `mdast-util-from-markdown` parsing source text, `position.start.offset` and `position.end.offset` are **always populated**. The `offset` field is typed as optional in `@types/unist` for generality, but the micromark → mdast pipeline always sets it.

## Source Slicing via Offset

```typescript
function getSourceText(node: Node, source: string): string {
  const start = node.position!.start.offset!;
  const end = node.position!.end.offset!;
  return source.slice(start, end);
}
```

**Use cases for delimiter recovery:**
- Heading: `source.slice(pos.start.offset, pos.end.offset)` → `"## Hello"` or `"Hello\n-----"` (ATX vs setext)
- Emphasis: slice reveals `*text*` vs `_text_`
- Code fence: slice reveals `` ```lang `` vs `~~~lang`
- Thematic break: slice reveals `---` vs `***` vs `___`
- List marker: slice the listItem position to find `-`, `*`, `+`, `1.`, `1)`

## Position Span Semantics

The position spans the **complete syntactic extent** of the node:
- Heading includes the `#` prefix (ATX) or the underline (setext)
- Emphasis includes the `*` or `_` delimiters
- Code block includes the fence lines
- List item includes the marker and indent

This means slicing by position gives you the full source syntax, not just the content — which is exactly what's needed for source-text fidelity recovery.

## Limitations

1. **CRLF handling:** Offsets count `\r\n` as 2 bytes. Slicing with `String.slice()` works correctly because JavaScript strings use the same counting.
2. **No intra-text positions:** A `text` node covering "hello world" has one position span for the entire text. Individual characters don't have positions.
3. **Merged text nodes:** Adjacent text tokens may be merged into a single text node. The position spans the entire merged range.
