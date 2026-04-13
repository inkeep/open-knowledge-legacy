# E4: mdast-util-to-markdown Handler API — Full Reference

**Source:** `mdast-util-to-markdown@2.1.2` (`node_modules/.bun/mdast-util-to-markdown@2.1.2/`)

## Handle Function Signature

```typescript
type Handle = (
  node: any,           // The mdast node being serialized
  parent: Parents | undefined,  // Parent node (undefined for root)
  state: State,        // Complete serialization state
  info: Info           // Surrounding context (before/after chars, position)
) => string            // Returns serialized markdown
```

## State Object

```typescript
interface State {
  // Core serialization methods
  associationId: (node: Association) => string;
  compilePattern: (unsafe: Unsafe) => RegExp;
  containerPhrasing: (parent: Parent, info: Info) => string;
  containerFlow: (parent: Parent, info: TrackFields) => string;
  createTracker: (info: TrackFields) => Tracker;
  enter: (name: ConstructName) => Exit;  // Returns exit function
  handle: Handle;  // Recursive dispatch
  indentLines: (value: string, map: Map) => string;
  safe: (input: string, config: SafeConfig) => string;  // Escape unsafe chars

  // Configuration
  handlers: Handlers;        // Record<NodeType, Handle>
  join: Array<Join>;         // Block spacing functions
  options: Options;          // User config
  unsafe: Array<Unsafe>;     // Escape patterns

  // Mutable state
  stack: Array<ConstructName>;   // Current construct nesting
  indexStack: Array<number>;     // Child index positions
  bulletCurrent: string | undefined;
  bulletLastUsed: string | undefined;
  attentionEncodeSurroundingInfo: EncodeSurrounding | undefined;
}
```

## Info Object

```typescript
interface Info extends SafeFields, TrackFields {}

interface SafeFields {
  before: string;  // Characters before this node's output
  after: string;   // Characters after this node's output
}

interface TrackFields {
  now: Point;       // Current { line, column }
  lineShift: number;  // Column shift from wrapping
}
```

## Tracker Object

```typescript
interface Tracker {
  current: () => TrackFields;      // Get current position
  move: (value?: string) => string; // Advance position by string length
  shift: (value: number) => void;   // Add column offset
}
```

## Options / Extension Shape

```typescript
interface Options {
  // Formatting
  bullet?: '*' | '+' | '-';
  bulletOther?: '*' | '+' | '-';
  bulletOrdered?: '.' | ')';
  emphasis?: '*' | '_';
  strong?: '*' | '_';
  fence?: '`' | '~';
  fences?: boolean;
  quote?: '"' | "'";
  rule?: '*' | '-' | '_';
  closeAtx?: boolean;
  setext?: boolean;
  listItemIndent?: 'mixed' | 'one' | 'tab';
  incrementListMarker?: boolean;
  ruleRepetition?: number;
  resourceLink?: boolean;
  tightDefinitions?: boolean;

  // Extension points
  extensions?: Array<Options>;  // Recursive composition
  handlers?: Partial<Handlers>; // Override node handlers
  join?: Array<Join>;           // Block spacing rules
  unsafe?: Array<Unsafe>;       // Escape patterns
}
```

## Extension Configuration Merge Logic

From `lib/configure.js`:

```javascript
// 1. Extensions array processed FIRST (recursive)
// 2. Handlers merged via Object.assign() — LAST WINS
// 3. Join arrays concatenated via push() — ACCUMULATIVE
// 4. Unsafe arrays concatenated via push() — ACCUMULATIVE
// 5. Simple options overwrite previous values
```

**Critical:** Handler merge uses `Object.assign()`, meaning later extensions override earlier ones for the same node type. This is the correct way to override default handlers.

## Join Function

```typescript
type Join = (
  left: FlowChildren,    // Previous block node
  right: FlowChildren,   // Next block node
  parent: FlowParents,   // Container
  state: State
) => boolean | number | null | undefined | void;
```

**Return values:**
- `undefined`/`null` → Default (1 blank line)
- `true` → 1 blank line
- `0` → No blank lines (flush)
- `false` → Cannot join (injects `<!---->` HTML comment)
- `number > 1` → N blank lines

## Unsafe Pattern

```typescript
interface Unsafe {
  character: string;
  inConstruct?: ConstructName | ConstructName[];
  notInConstruct?: ConstructName | ConstructName[];
  before?: string;  // Regex
  after?: string;   // Regex
  atBreak?: boolean;
}
```

**How it works:** When `state.safe()` encounters a character matching an unsafe pattern (considering before/after context and construct stack), it backslash-escapes or character-reference-encodes the character.

## Default Handlers (19 CommonMark types)

```javascript
const handle = {
  blockquote,
  break: hardBreak,
  code,
  definition,
  emphasis,
  hardBreak,
  heading,
  html,
  image,
  imageReference,
  inlineCode,
  link,
  linkReference,
  list,
  listItem,
  paragraph,
  root,
  strong,
  text,
  thematicBreak
}
```

GFM, MDX, frontmatter, and directive handlers are added via their respective `toMarkdownExtensions`.

## Example: Writing a Custom Handler

```typescript
// Handler for a custom 'callout' node type
const calloutHandler: Handle = (node, parent, state, info) => {
  const exit = state.enter('callout');
  const tracker = state.createTracker(info);

  tracker.move('> ');
  tracker.shift(2);

  const prefix = `> [!${node.kind}]\n> `;
  const value = state.indentLines(
    state.containerFlow(node, tracker.current()),
    (line, index, blank) => {
      if (index === 0) return prefix + line;
      return '> ' + (blank ? '' : '') + line;
    }
  );

  exit();
  return value;
};

// Register via extension
const calloutExtension = {
  handlers: { callout: calloutHandler },
  unsafe: [],
  join: []
};
```
