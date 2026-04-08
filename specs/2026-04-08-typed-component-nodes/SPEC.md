# SPEC: Typed Component Nodes — Prop Panels + Inline Rich-Text Children

**Status:** Final
**Created:** 2026-04-08
**Baseline commit:** 02c2211
**Implementer:** AI coding agent (Claude Code)
**Location:** `init_spike/` (extends existing spike code)
**Nature:** Product-facing feature build on top of the bidirectional observer sync foundation. This turns opaque JSX string blobs into structured, visually-editable component blocks — the difference between "markdown editor with code fences" and "knowledge editor with a component system." Two layers ship together because Layer 3 (inline children) depends on Layer 2 (component registry + typed props) and the combined UX is what makes the editor feel like a real component system.

**Pace:** Moderate. The foundation (observer sync, persistence, disk bridge) is proven and stable. This builds on it with new editor extension architecture. Take care with ProseMirror node spec design — the schema decisions here are load-bearing for everything that follows.

---

## 1. Problem Statement (SCR)

**Situation:** The init-spike + bidirectional observer sync (PR #6) validated the full editing stack: TipTap + Hocuspocus + Yjs v13 with bidirectional CRDT observer sync, source toggle, disk bridge, agent writes. JSX components are supported via Layer 1: raw string void nodes serialized as `jsx-component` fenced code blocks. The round-trip is byte-identical from cycle 2 onward. 23 E2E tests + 22 server-side tests prove the foundation.

**Complication:** Layer 1 is a proof of concept, not a product:

| Gap | What's broken |
|-----|--------------|
| No prop editing UI | Users must hand-edit raw JSX strings inside a `contentEditable={false}` void node. There's no visual prop panel, no dropdowns, no toggles. |
| No component discovery | JsxComponentView.tsx uses a hardcoded regex (`/<(\w+)\s+type="([^"]*)">([\s\S]*?)<\/\1>/`) to parse exactly one component pattern. Adding a new component requires modifying the regex and adding a conditional render branch. |
| No type safety | The `content` attribute is an opaque string. No validation that props match the component's TypeScript interface. |
| Children not editable | Rich text children inside components (the markdown content inside `<Callout>...</Callout>`) are part of the opaque string. Users can't click into the children and type — they must edit raw JSX. |
| Concurrent editing is whole-string LWW | Two users editing different props of the same component conflict because the entire `content` string is a single Y.js attribute. User A changes `type="warning"` → `type="error"` while User B edits the children text → one write wins, the other is lost. |

These gaps mean that components in the editor feel like embedded code snippets, not visual building blocks. The editor is a markdown editor that happens to preview some components, not a knowledge editor with a component system.

**Resolution:** Build two layers together:

- **Layer 2 — Typed void nodes with prop panels:** A component registry maps component names → React implementations + TypeScript prop interfaces. react-docgen-typescript auto-extracts prop schemas at project load. The JsxComponent extension evolves from `{ content: string }` to `{ componentName: string, [propName]: value, ... }` with individual attributes per prop. A visual prop panel (click-to-open or inline) shows auto-generated controls. Props are stored as top-level TipTap node attributes → attribute-level LWW in y-prosemirror (two users can edit different props concurrently without conflict).

- **Layer 3 — Inline rich-text children:** ReactNode props (identified by the component registry) become inline-editable ProseMirror content holes within the component block. The node is no longer `atom: true` — it has one or more `content` specs that are real ProseMirror fragments. Users click into the children area and type with full WYSIWYG editing (bold, links, code, lists). Character-level CRDT merge applies to children content. Webstudio's key insight: "children are structural, not a prop value."

---

## 2. Success Criteria

### Primary: Component editing feels native

After this work, editing a component in WYSIWYG mode should feel like editing a Notion database property panel + a rich text block combined:

- **Insert:** Slash command `/callout`, `/tabs`, `/accordion` etc. inserts a typed component with default props
- **Props:** Click the component → prop panel opens with auto-generated controls (text inputs, toggles, dropdowns) matching the component's TypeScript interface
- **Children:** Click into the component's content area → cursor enters, full WYSIWYG editing (bold, italic, links, code, lists, images)
- **Preview:** The component renders with its real React implementation in real-time as props and children change

### Secondary: Concurrent editing is prop-granular

Two users editing the same component:
- User A changes `type` prop from "warning" to "error" → prop panel dropdown
- User B types inside the children rich-text area → inline editing
- Both edits merge cleanly — A's prop change and B's text edit are independent CRDT operations
- No conflict, no LWW loss

### Tertiary: Observer sync is transparent

The bidirectional observer sync from PR #6 + PR #7 + PR #8 (and the subsequent cross-tab fixes in `9f215ef`, `99ea308`, `b289cc6`) continues to work:
- The serialization format (raw JSX on disk) works transparently with observer sync.
- **Both observers are LOCAL-ONLY.** As of commits `9f215ef` + `99ea308`, both Observer A and Observer B skip remote transactions (`if (!transaction.local) return`). Remote changes (from peer tabs or server-side agent writes) arrive pre-synced via the Yjs CRDT protocol — the originating side already ran its observers locally, so the paired XmlFragment + Y.Text updates propagate together and neither side needs to re-run an observer.
- **Observer A (XmlFragment → Text)** processes only local XmlFragment changes. Computes an incremental delta between `lastSyncedXmlMd` and the current XmlFragment markdown, then applies only that delta to Y.Text via line-level diff (`applyIncrementalDiff` for clean path, `applyUserDelta` when Y.Text has concurrent unsynced content). For typed components, a prop change appears as a line-replacement (single-line JSX) or tag-line replacement (multi-line JSX). See `observers.ts:125-253` for the delta logic.
- **Observer B (Text → XmlFragment)** processes only local Y.Text changes. Parses raw JSX via the custom markdownTokenizer, then:
  1. Checks an **early-exit** that requires byte-identical serialization (`currentBody === body`) to skip destructive tree replacement — still load-bearing for local source-mode edits, though the exposure is narrower than before since remote agent writes no longer reach Observer B. See §11 R10.
  2. **Defers** tree replacement while the user is actively typing (TYPING_DEFER_MS = 300ms, signaled via `markUserTyping()` from `observers.ts`). Phase 2 prop panel must participate in this protocol — see §3.6 and §11 R9.
- **Agent writes use server-side `syncTextToFragment()`** (`hocuspocus-plugin.ts:148`) which writes to both Y.Text AND XmlFragment in the same server transaction. Clients receive paired changes via Yjs sync and both observers skip them. This means agent writes never trigger client-side Observer A or Observer B at all — the tree replacement happens server-side via `updateYFragment`, and Yjs's CRDT merge handles any concurrent local mutations from clients.
- Source mode editing of component JSX round-trips correctly through the observer cycle (via the local Observer B path).
- Disk bridge and agent writes continue to work. The disk bridge now uses a per-path hash queue to prevent feedback loops during rapid sequential writes (`b289cc6`).
- **WYSIWYG mode IS live preview** — components render with their real React implementation in real-time as props and children change. No separate preview pane is needed for the "does my edit render correctly?" question. Split-pane and publish-fidelity modes (Future Work) address distinct concerns.

### Quaternary: Component registry is extensible

Adding a new component to the editor requires:
1. Write a React component with TypeScript props interface
2. Register it in the component mapping (one line)
3. Editor auto-discovers props, generates controls, renders preview

No schema files, no JSON config, no extension code. The TypeScript interface IS the schema.

---

## 3. What to Build

### 3.1 Component Registry

A central registry that maps component names to their implementations and metadata.

```typescript
// src/editor/components/registry.ts

interface ComponentMeta {
  /** The React component to render in the editor */
  component: React.ComponentType<any>;
  /** Auto-extracted or manually provided prop definitions */
  props: PropDef[];
  /** Display name for slash commands and panels */
  displayName: string;
  /** Category for slash command grouping */
  category: 'content' | 'layout' | 'media' | 'data';
  /** Icon for slash command menu */
  icon?: string;
}

interface PropDef {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'number' | 'reactnode';
  required: boolean;
  defaultValue?: string | boolean | number;
  /** For enum type: the allowed values */
  enumValues?: string[];
  /** Human-readable description (from TSDoc or react-docgen) */
  description?: string;
}

// Registry singleton
const registry = new Map<string, ComponentMeta>();

export function registerComponent(name: string, meta: ComponentMeta): void;
export function getComponent(name: string): ComponentMeta | undefined;
export function getAllComponents(): Map<string, ComponentMeta>;
```

**OQ1: Should the registry be static (build-time) or dynamic (runtime)?**
- Static: react-docgen-typescript runs at build/dev-server start, outputs a JSON manifest. Editor imports the manifest. Simpler, faster at runtime. But requires restart to pick up new components.
- Dynamic: react-docgen-typescript runs in a file watcher. Registry updates on component file save. More complex, but hot-reload for component development.
- **Leaning:** Static for P0. The init-spike is a validation — hot-reload is a polish item.

### 3.2 react-docgen-typescript Integration

Auto-extract prop schemas from TypeScript interfaces at project load. Works against both `.tsx` source (shadcn-installed components) and `.d.ts` declaration files (fumadocs-ui, docskit — see `evidence/react-docgen-typescript-dts-extraction.md` for verification).

```typescript
// src/server/component-introspection.ts (runs server-side at startup)

import { withDefaultConfig } from 'react-docgen-typescript';

const parser = withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,   // "warning"|"error" → dropdown values
  shouldRemoveUndefinedFromOptional: true,    // Clean optional types
  skipChildrenPropWithoutDoc: false,          // CRITICAL: include children (A1)
  propFilter: (prop) => {
    // CRITICAL: filter ONLY @types/react inherited DOM props, NOT all node_modules.
    // A blanket `node_modules` filter would drop fumadocs-ui's own props because
    // they live in node_modules/fumadocs-ui/dist/*.d.ts.
    if (prop.parent?.fileName.includes('@types/react')) return false;
    if (prop.parent?.fileName.includes('node_modules/react/')) return false;
    // Hide callback props (onClick, onChange, etc.)
    if (prop.type.name.startsWith('(')) return false;
    return true;
  },
});

export function extractComponentProps(filePaths: string[]): Map<string, PropDef[]> {
  const docs = parser.parse(filePaths);
  // Transform react-docgen output to our PropDef format
  // Map TypeScript types to our simplified type system:
  //   string → 'string'
  //   boolean → 'boolean'
  //   "warning" | "error" | "info" → 'enum' with enumValues
  //   number → 'number'
  //   React.ReactNode | ReactNode → 'reactnode'
  //   everything else → hidden from panel
}
```

**Component location:** Built-in components are hardcoded in `src/editor/components/built-ins.ts` (editor source code). The manifest entries name exact `.d.ts` / `.tsx` file paths for extraction — no file system scanning, no user configuration. Custom component discovery is Future Work (see §6 Future Work, Explored tier).

**Startup performance:** With only 15 built-ins, cold extraction is <1s on modern hardware. Caching to `.openknowledge/components.json` is a polish item, not a requirement. The cache file doubles as the agent-discoverable component manifest (Phase 4 step 4).

### 3.3 TipTap Node Spec Evolution

The JsxComponent extension evolves from a single `content` attribute to structured attributes.

**Current (Layer 1):**
```typescript
addAttributes() {
  return {
    content: { default: '' },
  };
}
```

**Target (Layer 2 + 3):**
```typescript
addAttributes() {
  return {
    componentName: { default: '' },
    // Dynamic: one attribute per primitive prop, keyed by prop name
    // Example for Callout: { componentName: 'Callout', type: 'warning' }
    // ReactNode props are NOT stored as attributes — they're content holes
  };
}
```

**Key design decision:** Props are flattened to top-level node attributes. This gives attribute-level LWW in y-prosemirror — two users editing different props don't conflict.

**OQ4: How to handle dynamic attributes in TipTap?**
TipTap node specs define attributes statically. But each component has different props. Options:
- Option A: Single extension with `addAttributes()` returning a catch-all pattern (e.g., store all props in a `props` JSON attribute). Simpler but loses attribute-level LWW.
- Option B: Dynamically create a TipTap extension per registered component (e.g., `CalloutNode`, `TabsNode`). Each has its own attribute set. Complex but gives per-prop LWW.
- Option C: One extension with `addAttributes()` that reads the registry and returns all known prop names as attributes. Requires extension re-creation when registry changes.
- Option D: Use `parseHTML`/`renderHTML` to handle arbitrary `data-*` attributes, and store the prop-attribute mapping in the registry rather than the TipTap node spec.
- **Leaning:** Option D. The TipTap node spec stays generic. The registry maps prop names to attribute names. `parseHTML` reads `data-prop-*` attributes, `renderHTML` writes them. The markdown serialization handles the JSX↔attributes translation. This avoids dynamic extension creation while preserving attribute-level LWW.

### 3.4 Inline Rich-Text Children (Layer 3)

ReactNode props become ProseMirror content holes.

**ProseMirror content spec approach:**
```typescript
// The node is no longer atom: true
// It has a content spec that allows block content inside it
content: 'block+',

// Or more precisely, for a component with one children slot:
// The node has a single editable region (like a blockquote or table cell)
```

**How this works in the ProseMirror/TipTap model:**
1. The node type declares `content: 'block+'` (or a more restrictive spec)
2. TipTap renders the node view with a `contentDOM` element — the editable region
3. y-prosemirror maps this content region to a Y.XmlFragment child of the node's Y.XmlElement
4. Users click into the content region and get full ProseMirror editing (bold, italic, lists, etc.)
5. The content is part of the ProseMirror document tree, not a string attribute
6. Concurrent editing of children uses character-level CRDT (not LWW)

**OQ5: How to handle components with multiple ReactNode props?**
Example: A `<Card>` with both `title: ReactNode` and `children: ReactNode`.
- Option A: Multiple content holes (like a table with multiple cells). ProseMirror supports this via `tableRole`-like patterns. Complex.
- Option B: Only `children` gets inline editing. Other ReactNode props (like `title`) are treated as string props in the panel. Simpler, covers 90%+ of cases.
- Option C: Named content holes via TipTap's `NodePos` API. Each ReactNode prop maps to a named content region.
- **Leaning:** Option B for P0. `children` is the primary ReactNode prop. Other ReactNode props like `title` and `description` are typically short enough that a text input in the prop panel is sufficient.

**OQ6: What happens to the `content` attribute from Layer 1?**

Migration path:
1. If the document has Layer 1 nodes (single `content` string attribute), the extension parses the JSX string into structured props + children on load
2. On save, the extension serializes back to JSX string in the fenced code block
3. The markdown format is unchanged — the migration is editor-internal only
4. Old documents open seamlessly in the new editor
5. The parser that extracts structured props from JSX strings needs to handle:
   - Named props: `type="warning"` → `{ type: 'warning' }`
   - Boolean props: `fullWidth` → `{ fullWidth: true }`
   - Children content: everything between opening and closing tags
   - Self-closing components: `<Video src="..." />` → no children
   - Expression props: `count={42}` → `{ count: 42 }`

**Resolved (D7):** acorn + acorn-jsx for JSX parsing. 23KB gzipped (6x smaller than @babel/parser), handles all JSX patterns (nested tags, boolean props, expression props, self-closing). See `evidence/jsx-parser-comparison.md`.

### 3.5 Markdown Serialization — Raw JSX on Disk (D1 revised)

**The on-disk format is raw JSX — valid MDX, fumadocs-compatible.** No fenced code block wrapper. This is a revision of D1 based on the finding that `jsx-component` fenced blocks render as code snippets in fumadocs (not as components). See `evidence/fumadocs-serialization-compatibility.md`.

**Serialize (ProseMirror → Markdown):**
```
ComponentNode { componentName: 'Callout', type: 'warning', children: [Paragraph("Always run tests...")] }
  ↓ renderMarkdown()
<Callout type="warning">
  Always run integration tests before deploying.
</Callout>
```

The `renderMarkdown()` hook:
1. Reads `componentName` and all primitive prop attributes from node.attrs
2. Reads the ProseMirror content (children) and serializes via `h.renderChildren(node.content)`
3. Children are serialized **flush-left** (zero indentation) — this eliminates indentation stacking in nested components (A inside B would stack to 4 spaces, triggering CommonMark code blocks)
4. Constructs raw JSX: `<ComponentName prop1="val1">\nchildren\n</ComponentName>`
5. Returns the raw JSX string — no fencing

**Parse (Markdown → ProseMirror):**
```
<Callout type="warning">
  Always run integration tests before deploying.
</Callout>
  ↓ custom markdownTokenizer intercepts (before marked's HTML tokenizer)
  ↓ creates jsxBlock token
  ↓ parseMarkdown()
ComponentNode { componentName: 'Callout', type: 'warning', children: [Paragraph("Always run tests...")] }
```

The `markdownTokenizer` (D11):
1. `start()`: finds `<` followed by uppercase letter → returns position
2. `tokenize()`: Version B tag-counting regex matches from opening to closing tag, handling nested same-name components
3. Returns `{ type: 'jsxBlock', raw: fullMatch, content: fullMatch }`

The `parseMarkdown()` hook:
1. Receives the jsxBlock token with the full JSX string
2. Parses JSX via acorn+acorn-jsx → extracts componentName, props, childrenString
3. Children are flush-left on disk (zero indentation) — no dedentation needed during parse
4. Tokenizes children via `marked.lexer(dedentedChildren)` → child tokens (including nested jsxBlock tokens for nested components)
5. Parses child tokens via `helpers.parseBlockChildren(childTokens)` → ProseMirror fragment
6. Checks registry: registered → `helpers.createNode('jsxComponentEditable', attrs, childContent)`, unregistered → `helpers.createNode('jsxComponentVoid', { content: token.content })`

**No backward compatibility needed (D13 revised):** Greenfield spike — no legacy fenced-format content exists. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer handles all parsing and serialization.

### 3.6 Prop Panel UI

A visual interface for editing component props.

**OQ9: Inline panel or sidebar panel?**
- Inline (below/above the component): Notion-style. Closer to the content. Can feel cluttered for components with many props.
- Sidebar (right panel): Figma/Webstudio-style. Clean separation. But takes space and requires context-switching.
- Popover (click component → floating panel): Good compromise. Shows on demand, doesn't take permanent space.
- **Leaning:** Popover for P0. Click the component's header/toolbar → floating panel with prop controls. Keyboard shortcut to open/close.

**Prop control mapping:**

| TypeScript Type | PropDef Type | Control |
|----------------|-------------|---------|
| `string` | `string` | Text input |
| `boolean` | `boolean` | Toggle switch |
| `"a" \| "b" \| "c"` | `enum` | Dropdown select |
| `number` | `number` | Number input |
| `React.ReactNode` | `reactnode` | (Not in panel — inline editing zone) |
| `(e: Event) => void` | (hidden) | Not shown |
| `CSSProperties` | (hidden) | Not shown |
| Complex objects | (hidden) | Not shown |

**Typing-defer protocol (required by PR #7 observers):** The prop panel is rendered in a Radix Popover that portals to `document.body`. Keydown/click events inside the portal do NOT bubble to `editor.view.dom`, so they do NOT trigger `markUserTyping()` automatically. **Every prop panel change handler must call `markUserTyping()` (imported from `src/editor/observers.ts`) before/during the `editor.commands.updateAttributes()` call.** See §11 R9 and test scenario CE05.

**Scope of the race (post commits `9f215ef` + `99ea308`):** The original PM-H1 concern was "concurrent agent write to Y.Text triggers Observer B → overwrites prop edit." That specific race no longer exists — agent writes now go through server-side `syncTextToFragment()` which updates both trees in one transaction, and clients' Observer B skips remote Y.Text changes entirely. The remaining (narrower) race the typing-defer protects against is **single-user two-pane editing**: user edits a prop in WYSIWYG while simultaneously typing in source mode. The source-mode edit is a local Y.Text change → Observer B fires → destructive tree replacement via `updateYFragment` → may overwrite the prop edit if the debounce windows overlap. `markUserTyping()` keeps Observer B deferred while the user is actively editing, giving Observer A time to serialize the prop change first. The protocol is still required; the exposure is just smaller than documented in the original PM-H1 finding.

```tsx
import { markUserTyping } from '@/editor/observers';

// In PropPanel.tsx change handler:
const handleChange = (propName: string, value: unknown) => {
  markUserTyping();  // ← REQUIRED: signal local activity to Observer B
  editor.commands.updateAttributes(node.type.name, { [propName]: value });
};
```

This applies to all control types: text inputs (onChange + onKeyDown), toggles (onCheckedChange), dropdowns (onValueChange), number inputs (onChange). Missing `markUserTyping()` on any handler creates a concurrent-write race.

### 3.7 Slash Commands for Component Insertion

Extend TipTap's slash command menu with registered components.

```typescript
// When user types /callout:
// 1. Look up 'Callout' in registry
// 2. Create a new ComponentNode with default props from the registry
// 3. Insert into the document
// 4. Focus the children editing zone (if Layer 3 is active)
```

Each registered component appears in the slash command menu with its `displayName`, `category`, and `icon`. Components are grouped by category in the menu.

### 3.8 Unregistered Component Fallback + Collision Policy

**Unregistered fallback:** Components that appear in markdown but aren't in the registry fall back to Layer 1 behavior:
- Rendered as `contentEditable={false}` void node (`jsxComponentVoid`)
- Raw JSX displayed with syntax highlighting (mini CodeMirror or `<pre>` with highlighting)
- No prop panel, no inline editing
- Full raw string preserved verbatim

This ensures that:
1. Any MDX file opens without errors, even if it uses components we don't know about
2. Unregistered components round-trip perfectly (raw string in, raw string out)
3. Users can register components incrementally — no "all or nothing"

**Collision policy (resolves Challenger v2 H3):** A user's content may contain JSX whose tag name matches one of the 15 built-in names but whose props don't match the built-in's PropDef. Example: `agents-docs` has its own `<Card>` with `icon: string` (for brand icon resolution) + `color` + `external` — incompatible with fumadocs-ui `<Card>` which expects `icon: ReactNode` and has no `color` or `external`.

The spec adopts a **preserve-and-render** policy:

1. **Name match → use the built-in.** When the parser encounters a JSX tag whose name matches a registered built-in, it creates a `jsxComponentEditable` node using that built-in.
2. **Preserve unknown attributes.** Any attribute on the source JSX that isn't in the built-in's PropDef is stored on the node anyway (as an additional attribute). This ensures round-trip is byte-identical — no data loss on save, even when the user's component is semantically different from the built-in.
3. **Render with the known subset.** The React node view passes only PropDef-declared props to the built-in component. Unknown attributes are stored but not rendered.
4. **Log a dev warning** when unknown attributes are encountered, surfacing the collision to developers.

**Built-in names are reserved.** 21 names across the 15 built-in families from D15 are "owned" by the editor. Users running against the built-ins-only scope should avoid naming their custom components `Callout`, `Tabs`, `Tab`, `Card`, `Cards`, `Steps`, `Step`, `Accordion`, `Accordions`, `ImageZoom`, `Files`, `File`, `Folder`, `TypeTable`, `Banner`, `InlineTOC`, `Video`, `Frame`, `CodeGroup`, `Mermaid`, `Audio`. Documented clearly in the Phase 4 `components.json` header and `AGENTS.md`. Custom component discovery (Future Work) will introduce proper override semantics where a user's `Card` takes precedence over the built-in `Card`.

### 3.9 JsxComponentView Evolution

The React node view component evolves from a hardcoded regex renderer to a registry-driven renderer.

**Current (Layer 1):**
```tsx
function JsxComponentView({ node }: NodeViewProps) {
  const raw = node.attrs.content;
  const { component, type, children } = parseJsxContent(raw); // regex
  if (component === 'Callout') return <Callout type={type}>{children}</Callout>;
  return <FallbackMonospace>{raw}</FallbackMonospace>;
}
```

**Target (Layer 2 + 3):**
```tsx
function JsxComponentView({ node, editor }: NodeViewProps) {
  const { componentName, ...props } = node.attrs;
  const meta = getComponent(componentName);

  if (!meta) {
    // Unregistered: fallback to raw display
    return <UnregisteredFallback node={node} />;
  }

  const Component = meta.component;
  const primitiveProps = extractPrimitiveProps(props, meta);

  return (
    <NodeViewWrapper>
      <ComponentToolbar
        componentName={componentName}
        onOpenProps={() => setShowPropPanel(true)}
      />
      <Component {...primitiveProps}>
        {/* Layer 3: inline editable children */}
        <NodeViewContent className="component-children" />
      </Component>
      {showPropPanel && (
        <PropPanel
          meta={meta}
          props={primitiveProps}
          onChange={(propName, value) => {
            editor.commands.updateAttributes(node.type.name, { [propName]: value });
          }}
        />
      )}
    </NodeViewWrapper>
  );
}
```

**Key:** `<NodeViewContent />` is TipTap's mechanism for creating an editable content hole inside a node view. It renders the node's ProseMirror content as a `contentEditable` region.

---

## 4. Implementation Order

### Phase 0: Raw JSX Serialization (Foundation — fumadocs compatibility)

Switch the on-disk format from `jsx-component` fenced code blocks to raw JSX. This is the foundation everything else builds on.

1. **Build the markdownTokenizer (D11, D12):** Version B tokenizer (~80 lines) with tag-counting for nested same-name components. Register as `markdownTokenName: 'jsxBlock'` with `level: 'block'`. The tokenizer intercepts `<UppercaseTag>` blocks before marked's HTML tokenizer.
2. **Update renderMarkdown:** Output raw JSX (no fence). `renderMarkdown(node)` returns `node.attrs.content` directly.
3. **Raw JSX only (D13 revised):** Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer. No fenced-format backward compatibility (greenfield).
4. **Update test-fixture.md:** Convert the existing `jsx-component` fenced block to raw JSX.
5. Write tokenizer tests: all 24 test cases from prototype (edge cases, round-trip, mixed documents).
5a. **Verify cycle-1 byte-identity (REQUIRED by PM-H2):** For every production-shape JSX input, assert `serialize(parse(jsx)) === jsx` byte-for-byte — NO `.trim()` normalization. This is load-bearing for Observer B's early-exit (`observers.ts:288-301`). If the current renderMarkdown adds a trailing newline that the raw input didn't have, fix the serializer to match the parse result OR normalize both sides (and document the normalization as an observer-layer change). See §11 R10.
5b. **Verify Observer B no-op early-exit fires for raw JSX:** Write raw JSX to Y.Text, wait for Observer B to process, then write the EXACT same raw JSX again. Assert no second `updateYFragment` call (count XmlFragment mutations or observe tree events). This confirms the byte-identity property holds end-to-end.
6. Verify observer sync: Observer A/B work with raw JSX in Y.Text (no shimmer).
7. Verify persistence: .md files on disk contain raw JSX after save.
8. Verify disk bridge: external edit of raw JSX in .md file → editor updates correctly.
9. Verify source mode: CodeMirror shows raw JSX (not fenced blocks).
10. **Verify:** All existing tests pass. `bun run check` green.

### Phase 1: Component Registry + react-docgen-typescript (built-ins only)

**Scope:** P0 ships with built-in components only — the 15-component set from D15 (fumadocs canonical 10 + docskit gap fill 3 + shadcn gap fill 2). No custom component discovery, no user-facing `mdx-components.tsx` scanning, no `.openknowledge/components.ts` loader. Custom components + drop-in fumadocs support are Future Work (Explored tier).

**Key mechanism (resolves v2 Audit H1 + Challenger H2):** `react-docgen-typescript` extracts props from `.d.ts` declaration files, not just `.tsx` source. This is **verified from the library's own test suite** (`react-docgen-typescript/src/__tests__/parser.ts:48-58` — "should parse simple typescript definition file with default export") and **from reading the parser source** (`parser.ts:377-409` explicitly handles `!rootExp.valueDeclaration` case for `ForwardRefExoticComponent`, `FunctionComponent`, `MemoExoticComponent` — the exact patterns compiled libraries expose). Both fumadocs-ui and `@inkeep/docskit` ship usable `.d.ts` files in their `dist/` directories. See `evidence/react-docgen-typescript-dts-extraction.md`.

0. **Refactor schema construction order (REQUIRED by PM-M3):** `editorSchema = getSchema(sharedExtensions)` currently runs at `TiptapEditor.tsx:53` module top-level — BEFORE the registry exists. Server-side `MarkdownManager` (`persistence.ts:28`) has the same constraint. Both must be deferred until after the component registry loads, because `JsxComponent`'s attributes are derived from the registry (D6). Move schema construction into a registry-aware initializer that runs after `loadComponentRegistry()` resolves on both browser and server. See §11 R12.
1. Add `react-docgen-typescript`, `acorn`, `acorn-jsx` dependencies. Add `fumadocs-ui`, `@inkeep/docskit` as peer deps for built-in imports. Install shadcn components (Mermaid from MermaidCN, Audio from AI Elements) into `init_spike/src/components/` via `npx shadcn@latest add`.
2. Create `src/editor/components/built-ins.ts` — the canonical list of built-in components. Imports the 15 component families from their sources (fumadocs-ui, docskit, shadcn-installed files) and exports a manifest. Each entry names the exact `.d.ts` or `.tsx` file to extract props from. **Path resolution gotcha:** fumadocs-ui (and most published packages) use `package.json` `exports` fields that restrict direct access to `dist/` paths — you can `import { Callout } from 'fumadocs-ui/components/callout'` but `require.resolve('fumadocs-ui/dist/components/callout.d.ts')` will fail because that path isn't in the exports map. Use one of these patterns instead:
   ```ts
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';

   // Pattern 1: Resolve via package.json, then construct dist/ path
   const fumadocsUiDir = path.dirname(require.resolve('fumadocs-ui/package.json'));
   const calloutDts = path.join(fumadocsUiDir, 'dist/components/callout.d.ts');

   // Pattern 2: Resolve the JS entry point, then swap .js → .d.ts
   const calloutJs = require.resolve('fumadocs-ui/components/callout');
   const calloutDts = calloutJs.replace(/\.js$/, '.d.ts');
   ```
   For docskit (whose `exports` field only exposes `./mdx` — not per-component subpaths), point extraction at the aggregate `dist/mdx.d.ts` file via the same `dirname(require.resolve(...))` pattern. This file re-exports every component with its full type signature. For shadcn-installed components (Mermaid, Audio), the files live in local `src/components/*.tsx` — standard path resolution, no workaround needed.
   
   Manifest shape:
   ```ts
   export const BUILT_INS: ComponentManifestEntry[] = [
     {
       name: 'Callout',
       component: Callout,
       sourceFile: resolveDts('fumadocs-ui', 'dist/components/callout.d.ts'),
       category: 'content',
     },
     // ... 14 more
   ];
   ```
   This is editor source code, not user-facing config.
3. Create `src/editor/components/registry.ts` — `ComponentMeta`, `PropDef`, `registerComponent()`, `getComponent()`, `getAllComponents()` API. Registry is initialized at editor startup by calling `registerBuiltIns()` which iterates `built-ins.ts` manifest entries and runs extraction for each.
4. Create `src/server/component-introspection.ts` — runs `react-docgen-typescript` against each built-in's declared source file. Handles three file shapes uniformly:
   - **fumadocs-ui** (10 components): extract from `node_modules/fumadocs-ui/dist/components/*.d.ts`. These `.d.ts` files contain the prop interfaces, TSDoc comments (`@defaultValue`, descriptions), enum unions, and component signatures. Verified extractable.
   - **docskit** (3 components): extract from `node_modules/@inkeep/docskit/dist/components/*.d.ts`. Same shape as fumadocs-ui. Fewer TSDoc comments upstream → descriptions may be empty for some props (acceptable; prop names + types + required/optional still extract correctly).
   - **shadcn-installed** (2 components): extract from local `src/components/*.tsx` files. Standard shadcn layout, standard react-docgen-typescript path.
   
   Parser configuration:
   ```typescript
   withDefaultConfig({
     shouldExtractLiteralValuesFromEnum: true,   // "warning"|"error" → dropdown values
     shouldRemoveUndefinedFromOptional: true,    // Clean optional types
     skipChildrenPropWithoutDoc: false,          // CRITICAL: include children (per evidence/react-docgen-typescript-behavior.md A1)
     propFilter: (prop) => {
       // CRITICAL: filter only @types/react inherited DOM props, NOT all node_modules.
       // The old `fileName.includes('node_modules')` filter would drop fumadocs-ui's own
       // props because they live in node_modules/fumadocs-ui/dist/*.d.ts.
       if (prop.parent?.fileName.includes('@types/react')) return false;
       if (prop.parent?.fileName.includes('node_modules/react/')) return false;
       // Hide callback props (onClick, onChange, etc.)
       if (prop.type.name.startsWith('(')) return false;
       return true;
     },
   });
   ```
5. Generate `.openknowledge/components.json` on every `loadComponentRegistry()` call (dev server startup). With only 15 components, cold extraction is <1s — the file doubles as (a) a cache to skip re-extraction on hot reload, (b) the agent-discoverable component manifest (see Phase 4 step 4). Invalidate on source file mtime change. **This file is committed** (see Phase 4 step 4) — the header should read `// GENERATED FROM src/editor/components/built-ins.ts + react-docgen-typescript. Do not edit by hand.` See §11 R3.
6. Add acorn+acorn-jsx JSX parser (D7): parse JSX strings into `{ componentName, props, childrenString }`
7. Write tests:
   - Registry lookup smoke tests
   - **Per-built-in extraction tests:** one test per component in D15, asserting the expected PropDef shape (component name, required props, enum values, optional props, description presence). These tests validate both (a) the extraction pipeline works on each component's specific file shape and (b) drift from upstream is caught on every CI run (auto-detects when fumadocs-ui adds a new prop, changes a type, etc.).
   - JSX parsing via acorn
8. **Verify:** `bun run check:fast` passes. Manual test: each of the 15 built-ins appears in the registry with correct PropDef. Inspect `.openknowledge/components.json` to verify fumadocs-ui + docskit + shadcn components all extracted successfully.

### Phase 2: Typed Node Spec + Prop Panel (Layer 2)

1. Evolve node attributes from `{ content }` to `{ componentName, ...propAttributes }` (D6). Single extension, formal attributes from registry.
2. Two node types (D8): `jsxComponentEditable` (registered, non-atom for Phase 3) + `jsxComponentVoid` (unregistered, atom: true). Single parseMarkdown handler checks registry to decide type.
3. Update `parseMarkdown()`: acorn parses JSX → extract componentName + props → set as individual attributes on correct node type.
4. Update `renderMarkdown()`: read individual attributes → reconstruct raw JSX string.
5. Update `parseHTML()` / `renderHTML()`: handle `data-component-name` + `data-prop-*` attributes.
6. Create `PropPanel.tsx`: auto-generated controls from PropDef[] (popover, D14).
7. Create `ComponentToolbar.tsx`: component name badge + gear icon to open panel.
8. Update `JsxComponentView.tsx`: registry-driven rendering + prop panel integration.
9. Wire prop changes to `editor.commands.updateAttributes()`.
10. Add slash commands for component insertion from registry.
11. Write round-trip tests: typed node → raw JSX → typed node (byte-identical from cycle 2).
12. Write E2E tests: insert component via slash command, change prop via panel, verify markdown output, verify observer sync with structured props.
13. **Verify:** `bun run check` green. Manual verification: open editor, insert Callout, change type via dropdown, see preview update, check source mode shows raw JSX with new prop value.

### Phase 3: Inline Rich-Text Children (Layer 3)

1. Change `jsxComponentEditable` node spec: add `content: 'block+'` (already non-atom from Phase 2).
2. Update node view: add `<NodeViewContent />` for the editable children region.
3. Update `parseMarkdown()` for editable type: children are flush-left → `marked.lexer(childrenString)` → `helpers.parseBlockChildren()` → pass as third argument to `helpers.createNode()` (D10).
4. Update `renderMarkdown()` for editable type: `h.renderChildren(node.content)` → flush-left (no indentation) → wrap in JSX tags.
5. `jsxComponentVoid` (unregistered) remains atom: true with raw content attribute — unchanged.
6. Write tests: type inside children, verify bold/links/code work, verify CRDT sync, verify markdown round-trip with children.
7. Write E2E tests: two tabs editing same component — one changes props (panel), other edits children (inline) — both merge correctly.
8. **Verify:** `bun run check` green. Full sync matrix still works.

### Phase 4: Polish + Full Test Suite

1. Unregistered component fallback path (gray box with syntax highlighting).
2. Error boundaries: graceful handling of parse failures, missing components, invalid props.
3. Keyboard navigation: Tab/Shift+Tab between prop controls, Enter to close panel, Escape to dismiss.
4. **Wire up the committed `init_spike/.openknowledge/components.json` as the agent-discoverable manifest.** Phase 1 step 5 already generates and commits this file. Phase 4 step 4 is about **discoverability**: add the file's header comment (`"// GENERATED FROM src/editor/components/built-ins.ts + react-docgen-typescript. Do not edit by hand."`), link from `init_spike/CLAUDE.md`, and create `init_spike/AGENTS.md` with a brief description pointing at `.openknowledge/components.json` as the component registry reference. Agents (Claude Code, Cursor, Copilot) that read the repo via file tools will parse the JSON directly — unambiguous schema, queryable, forward-compatible with the MCP endpoint (Future Work). See Future Work "MCP endpoint: component registry query" for the query-time version.
5. Full E2E test suite covering a representative selection from D15's built-in set: Callout (enum + children), Tabs/Tab (container + string title + children), Card (optional ReactNode title + href + external), Steps/Step (numbered container), Accordion (foldable title + children), Video (simple src prop). Cover all edit paths (WYSIWYG props, WYSIWYG children, source mode, agent write, disk bridge).
6. **Real-corpus secondary validation (RT07):** Open a representative agents-docs MDX page (e.g., `~/agents/agents-docs/content/agents-quickstart.mdx` or similar) in the editor. Verify: (a) the 15 built-ins render correctly as typed component nodes with prop panels, (b) custom components (OptionCard, BigVideo, SkillRule, ComparisonTable, etc.) fall back cleanly to `jsxComponentVoid` raw-string display without errors, (c) no data loss on round-trip save (collision policy from §3.8 preserves unknown attributes — see RT07 test scenario). This validates that built-ins-only scope is viable for real-world content even if full coverage requires the Future Work custom discovery path.
7. Update test-fixture.md with all 15 built-in component types for manual verification.
8. **Verify:** `bun run check` green. Open test-fixture.md — all 15 built-ins render correctly with prop panels + editable children. Real-corpus test (step 6) passes without errors.

---

## 5. Tech Stack

### New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-docgen-typescript` | ^2.2 | Extract prop schemas from TypeScript interfaces at project load |
| `acorn` | ^8.x | Lightweight JavaScript parser (~58KB min) |
| `acorn-jsx` | ^5.x | JSX plugin for acorn (~15KB min). Combined: ~23KB gzipped — 6x smaller than @babel/parser |

### Existing Dependencies (No Changes)

| Package | Role |
|---------|------|
| `@tiptap/core` + `@tiptap/react` | Editor framework + React node views |
| `@tiptap/markdown` (MarkdownManager) | Markdown parse/serialize |
| `yjs` + `@hocuspocus/*` | CRDT + collaborative server |
| `y-codemirror.next` | Source mode CRDT binding |
| `@parcel/watcher` | Disk bridge |

### No New Dependencies for Tokenizer

The `markdownTokenizer` API is built into `@tiptap/markdown` (v3.22+). The custom JSX block tokenizer is ~80 lines of pure regex + tag-counting logic — no additional packages needed. `marked` v17 (already a transitive dependency) provides the extension API.

### Peer Dependency Check

- `react-docgen-typescript` requires `typescript` as peer dep — already in devDependencies
- `acorn` + `acorn-jsx` are standalone — no peer deps

---

## 6. Scope Boundaries

### In Scope

- Component registry with auto-extraction from TypeScript interfaces (built-ins only)
- Prop panel UI with auto-generated controls (text, toggle, dropdown, number)
- Inline rich-text editing for `children` ReactNode prop
- Slash commands for component insertion (from built-in registry)
- Unregistered component fallback (raw string display) for any JSX in content that isn't in the built-in set
- **Built-in components only** — 15 components hardcoded in editor source, no user-facing custom component discovery. 3-layer sourcing (see `evidence/component-inventory-and-gaps.md`):
  - **Fumadocs (canonical):** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC
  - **Docskit (gap fill):** Video, Frame, CodeGroup
  - **Shadcn (gap fill):** Mermaid (MermaidCN registry), Audio (AI Elements registry)
- `.openknowledge/` directory used for `components.json` only (committed, generated from `built-ins.ts` + react-docgen-typescript extraction — serves as both prop panel data source and agent-discoverable registry manifest; see Phase 4 step 4). No user-facing config files in scope for P0.
- Observer sync compatibility (no changes to observer layer, modulo `markUserTyping()` protocol in prop panel)
- E2E tests for prop editing, children editing, concurrent editing, round-trip

### Out of Scope

- **Custom component discovery** (user-defined components beyond the 15 built-ins) — P0 ships built-ins only. Any `<CustomComponent>` in content falls back to the unregistered raw-string renderer. See Future Work for the planned approach.
- **Drop-in support for existing fumadocs projects** — existing fumadocs docs sites use their own `mdx-components.tsx` with custom components (OptionCard, BigVideo, ComparisonTable, etc.). P0 cannot render those as typed nodes; they'd fall back to unregistered raw-string display. Drop-in support depends on custom component discovery — both move to Future Work together.
- **Component library palette / drag-and-drop insertion** — P0 uses slash commands only. A visual palette with drag-and-drop from a sidebar is Future Work.
- **Multiple ReactNode content holes** (OQ5) — P0 supports only `children`. Other ReactNode props use text input in panel.
- **Per-block code toggle** (Layer 4) — separate spec. The architecture supports it but we don't build it here.
- **Hot-reload of component registry** — restart required to pick up new components at P0.
- **Expression props** (`count={42 + 1}`, `data={someVariable}`) — these make the component "unregistered" and fall back to raw string display. We don't try to evaluate expressions.
- **Nested JSX in props** (`icon={<IconComponent />}`) — same: falls back to raw string.
- **Component composition validation** (e.g., Tab must be inside Tabs) — no enforcement at P0.
- **Drag-and-drop reordering** of component blocks — standard ProseMirror block drag, no special handling.
- **Dark mode / theming** for prop panel — basic styling only.
- **Fenced-format backward compatibility** — greenfield spike, no legacy content. Raw JSX only.

### Future Work (with maturity tiers)

Full inventory tracked in `evidence/component-inventory-and-gaps.md`.

#### Explored (investigated, clear path, not in scope now)

| Item | What We Learned | Estimated Effort | Trigger to Revisit |
|------|----------------|-----------------|-------------------|
| **7 missing Obsidian callout types** | Obsidian has 13 types + 25 aliases; fumadocs Callout has 6. Gap: abstract, todo, tip, question, failure, bug, example, quote. Resolution: extend Callout `type` union + alias map + per-type icons/colors. | ~2-4 hours | When Obsidian content import is prioritized |
| **Callout foldability** | Obsidian callouts support `+`/`-` suffix for collapsible behavior. Fumadocs Callout is not foldable. Resolution: Radix Collapsible wrapper. Accordion already covers foldable content as a separate component. | ~2-4 hours | When Obsidian parity is prioritized |
| **PDF embed** | No good shadcn registry option. `react-pdf` or `@react-pdf-viewer/core` viable. Needs thin wrapper component. | ~2-4 hours | When document embedding is prioritized |
| **Multiple ReactNode content holes** | Card `title`/`description` as separate editable zones. ProseMirror supports via tableRole pattern. Architecture doesn't foreclose. | 2-3 days | When Card editing UX is refined |
| **Per-block code toggle (Layer 4)** | Mini CodeMirror inside void node. Escape hatch for when prop panel isn't enough. | 1-2 days | After Layers 2+3 are stable |
| **Split-pane live preview (file-level)** | Show WYSIWYG and Source simultaneously in a side-by-side layout. Both panes are live editors bound to the same Y.Doc. Builds developer trust in serialization (WYSIWYG→Source direction) and reduces friction for power users editing MDX directly (Source→WYSIWYG direction). Architecture already supports it — bidirectional observer sync keeps both modes in sync. Current `App.tsx:73-84` mounts `TiptapEditor` unconditionally and `SourceEditor` conditionally; split-pane requires unconditional mount + layout change + scroll sync + focus management. | ~1 day | When source mode usage grows, or when developer adoption is prioritized |
| **Custom component discovery — dual track** (enables drop-in fumadocs support) | **Track 1 (primary): Static editor config.** Users list custom components in `.openknowledge/components.ts` as a flat static map — plain ESM re-exports of their component modules. Editor parses this file's import statements (via acorn), resolves each to a source file (`.tsx` for user components, `.d.ts` for node_modules library components), runs `react-docgen-typescript` on each (same pipeline as built-ins, now proven to work on `.d.ts`). Simple, explicit, works for any React codebase regardless of whether they use fumadocs. **Track 2 (secondary, optional): Fumadocs `mdx-components.tsx` static-import scanner.** If the project has `mdx-components.tsx` but no `.openknowledge/components.ts`, read only the top-level `import` statements and the named entries in the returned object literal — NOT the function body. Covers plain-import cases like `Accordion, Accordions` from the agents-docs reference file (~60-70% coverage). Runtime spreads (`...defaultMdxComponents`), wrapped arrow functions (`AutoTypeTable: (props) => <AutoTypeTable {...props} generator={generator} />`), and configuration values (`APIPage = createAPIPage(openapi)`) fall through to Track 1 — user must explicitly register them. **Track 3 (future stretch): Full AST walker.** A ts-morph-based walker that handles runtime spreads, wrapper resolution via symbol following, and configuration detection. Probably unnecessary if Track 1 + 2 cover the common cases. **Collision policy:** when a custom component shares a name with a built-in, Track 1/Track 2 registration wins (user's component replaces the built-in). This delivers proper drop-in semantics and fixes the collision handling from §3.8 (which uses preserve-unknown-attributes as a P0 workaround). | 3-5 days (Track 1) + 2-3 days (Track 2) + uncertain (Track 3) | When "drop the editor into an existing fumadocs docs site" becomes a value prop, or when users ask for custom components |
| **Drop-in fumadocs project support** | Natural consequence of Track 2 above. The promise: run the editor against an existing fumadocs docs site without migration — editor reads `mdx-components.tsx`'s static imports, discovers the plain-import custom components, generates prop panels automatically. Validates with the `~/agents/agents-docs` corpus as the reference project (~910 component occurrences total; ~45% covered by built-ins + plain imports, rest require explicit Track 1 registration or fall back to raw-string void nodes). Honest framing: "partial drop-in" not "total drop-in". Wrapped/configured components (AutoTypeTable, configured APIPage, img/h1-h6 HTML overrides) require manual Track 1 entries. **Gated on:** Track 1 + Track 2 from Custom component discovery. | ~1 week total (included in the custom discovery estimate above) | Same as custom component discovery |
| **MCP endpoint: component registry query** | MCP tool that returns the current component registry at query time (component names + PropDef + category + description) so agents can introspect during a conversation rather than relying on a file read at the start. Thin HTTP wrapper around the committed `.openknowledge/components.json` file (Phase 4 step 4). Endpoint shape: `GET /mcp/components` returns the file contents as-is; `GET /mcp/components/:name` returns a single component's metadata. Forward-compatible by construction: the file format IS the API shape. **Note:** Phase 4 of this spec already ships `.openknowledge/components.json` committed to the repo, so agents reading via file tools (Claude Code, Cursor, Copilot) already have access to the registry. The MCP endpoint is for query-time access (LLM asking "what are valid values for Callout.type?" mid-conversation without re-reading the file). | ~1-2 days | When query-time agent access is needed beyond file-read access |
| **Component library palette with drag-and-drop** | Visual sidebar listing all registered components; drag a component from the palette into the document to insert. Alternative (additive) to slash commands. Better for non-technical users who don't know the component names. Requires: sidebar UI layout, drag-source bindings, drop-target handling in ProseMirror, component preview thumbnails. | ~2-3 days | When non-developer user testing reveals slash commands as a friction point, or when "Notion-style" insertion UX is requested |
| **Wiki-links + backlinks** | Architecture in `reports/wiki-links-backlinks-architecture/`. Needs page index, link resolver, editor integration. | 2-4 days | When navigation/sidebar work begins |
| **Graph view** | Force-directed graph over link data. Depends on wiki-links + page index. | 3-5 days | After wiki-links ship |
| **Dataview/query engine** | DQL subset viable. Query over frontmatter metadata. 4 output renderers (table, list, task, calendar). | 5-10 days | When structured metadata/search work begins |

#### Identified (known to matter, needs its own spec)

| Item | Why It Matters | Trigger to Revisit |
|------|---------------|-------------------|
| **Transclusion** (`![[note]]`) | Embed note content inline. Depends on wiki-links + block ID system. | After wiki-links |
| **Block references** (`^id`) | Reference specific blocks across notes. Needs block ID system. | After transclusion |
| **Properties visual editor** | Frontmatter form UI. Zod schema validation exists in fumadocs. | When frontmatter editing is prioritized |
| **Hot-reload component registry** | File watcher + TipTap schema re-init for DX. | Developer experience polish |

#### Noted (surfaced, not examined)

| Item | Why It Might Matter |
|------|-------------------|
| Highlight syntax (`==text==`) | Obsidian inline formatting. Remark plugin + TipTap mark, not a component. |
| Comment syntax (`%%text%%`) | Obsidian-specific. Strip during parse. |
| Subscript/superscript | Remark plugin + TipTap marks. |
| Canvas (infinite) | Fundamentally different paradigm — tldraw/excalidraw, 10+ days. Separate product decision. |
| Expression/nested JSX props | Would need JS evaluation context. Falls back to raw string display. |
| Publish-fidelity preview mode | A view showing the document as it will appear when published via fumadocs — without editor chrome (prop panel handles, flash animations, selection UI), using exact production CSS. Distinct from WYSIWYG (which IS the editor's live render). May not be needed if editor/publish rendering fidelity is high; a simpler CSS toggle to hide editor chrome may suffice. |
| Obsidian-style inline rendering | CodeMirror decorations that hide MDX syntax when cursor leaves a region, reveal source when cursor enters. Evaluated in `reports/mdx-text-editor-preview-approach/` — rejected because building Obsidian Live Preview for MDX components (not just markdown) is "novel engineering" and dropping TipTap would lose 70+ extensions. Kept as a reference pattern, not a planned path. |

---

## 7. Test Scenarios

### Component Registry (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| CR01 | Register Callout with type: enum, children: reactnode | Registry returns correct PropDefs |
| CR02 | Extract props from Callout.tsx via react-docgen-typescript | Props match: type (enum: warning\|error\|info), children (reactnode) |
| CR03 | Extract props from component with boolean + string + enum props | All three types correctly identified |
| CR04 | Component with callback props (onClick) | Callbacks filtered out, not in PropDefs |
| CR05 | Component with React.ReactNode prop | Identified as 'reactnode' type |
| CR06 | Unregistered component name | getComponent() returns undefined |

### Prop Panel (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| PP01 | Click Callout component → open prop panel | Panel shows "type" dropdown with warning/error/info options |
| PP02 | Change type dropdown from warning to error | Component re-renders with error styling. Markdown updates. |
| PP03 | Prop panel shows only primitive props | ReactNode props (children) not shown in panel |
| PP04 | Component with boolean prop → toggle | Toggle renders, clicking changes value |
| PP05 | Component with string prop → text input | Text input renders, typing updates component |
| PP06 | Close prop panel → props persist | Re-opening shows same values |

### Inline Children Editing (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| IC01 | Click inside Callout children area | Cursor enters, full WYSIWYG editing available |
| IC02 | Type bold text (**bold**) inside children | Bold renders in children area |
| IC03 | Add a link inside children | Link renders, clickable in preview |
| IC04 | Add a code block inside children | Code block renders inside component |
| IC05 | Delete all children content | Component renders with empty children (not deleted) |
| IC06 | Undo inside children | Only children edits undo, not prop changes |

### Round-Trip Fidelity (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| RT01 | Typed Callout → markdown → parse back | All props preserved, children structure preserved |
| RT02 | Component with multiple props → markdown | Props serialized as JSX attributes in correct order |
| RT03 | Children with bold + links → markdown | Children markdown is standard markdown inside JSX tags |
| RT04 | Raw JSX component in test-fixture.md opens in Layer 2+3 | Props extracted to individual attributes, children parsed to ProseMirror fragments |
| RT05 | Two round-trips produce byte-identical markdown | Convergence on cycle 2 (same as Layer 1 guarantee) |
| RT06 | Unregistered component → markdown → parse | Falls back to raw string display, round-trips perfectly |
| RT07 | **Real corpus**: Open a representative agents-docs MDX page in the editor. Verify: (a) 15 built-ins render as typed nodes with prop panels, (b) custom components (OptionCard, BigVideo, SkillRule, ComparisonTable, etc.) fall back cleanly to `jsxComponentVoid`, (c) round-trip save produces byte-identical output | Real content opens without error, built-ins are typed, customs are void, no data loss |
| RT08 | **Collision**: Content has `<Card title="GitHub" icon="brand/GitHub" href="/github" color="#F05032" external>` (agents-docs shape — has `color` and `external` that fumadocs Card doesn't) | Node created as typed `Card` built-in; `color` and `external` preserved as unknown attributes on the node; rendered Card passes only known props (title, icon, href) to fumadocs Card; round-trip save produces byte-identical JSX (color + external still present in output); dev warning logged |

### Observer Sync Compatibility (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| OS01 | Edit Callout type in WYSIWYG → check source mode | Source mode shows updated JSX with new type value |
| OS02 | Edit children text in WYSIWYG → check source mode | Source mode shows updated children markdown |
| OS03 | Edit component JSX in source mode → check WYSIWYG | WYSIWYG renders updated component with new props |
| OS04 | Edit children markdown in source mode → check WYSIWYG | Children render correctly in WYSIWYG |
| OS05 | Toggle source → WYSIWYG → source | No content loss, no prop loss, no children loss |
| OS06 | Raw JSX cycle-1 byte-identity: `serialize(parse(jsx)) === jsx` byte-for-byte for all production-shape JSX inputs (no `.trim()` normalization) | Byte-identical. Load-bearing for Observer B early-exit. |
| OS07 | Observer B no-op early-exit fires for raw JSX: **locally** write raw JSX to Y.Text (e.g., via source-mode CodeMirror typing, NOT via a remote transaction), wait for Observer B, locally write the same raw JSX again — assert no second `updateYFragment` call. (Note: after commits `9f215ef`/`99ea308`, Observer B skips all remote transactions, so this test must exercise the LOCAL path explicitly.) | Early-exit fires; no tree mutation on second local write |
| OS08 | Observer A `applyUserDelta` with typed components: seed XmlFragment with two `<Callout>` blocks with identical `type="warning"` attribute, change one prop, verify only the changed block is mutated in Y.Text | Only the intended block changes; line-content matching does not mis-target the other identical block |

### Concurrent Editing (P1)

| ID | Scenario | Expected |
|----|----------|----------|
| CE01 | User A changes type prop, User B edits children | Both merge: new type + new children text |
| CE02 | User A changes type prop, User B changes type prop | LWW: one wins (attribute-level, not whole-component) |
| CE03 | Two users typing in children simultaneously | Character-level CRDT merge, both edits preserved |
| CE04 | User A in WYSIWYG edits children, User B in source edits component JSX | Observer sync merges both — children from A, props from B |
| CE05 | Prop panel update during concurrent agent write: User clicks dropdown in prop panel popover, agent POSTs `/api/agent-write-md` within 50ms — verify both edits land. **Note (post `99ea308`):** agent writes now use server-side `syncTextToFragment()` which updates both trees in one transaction. Clients' Observer B skips this remote change, so the previously-documented PM-H1 race is handled at the server layer. CE05 still validates the path end-to-end — verifies the CRDT merge preserves both the prop change (local mutation) and the agent's text insertion (server mutation) via R14's Yjs merge behavior. | Both edits preserved. Exercises both `markUserTyping()` protocol (§3.6) and the server-side `syncTextToFragment` merge. |
| CE07 | **Prop panel update during concurrent local source-mode edit** (the narrower R9 race): User clicks dropdown in WYSIWYG prop panel, simultaneously types in source mode — verify prop edit survives | Prop edit preserved. Requires `markUserTyping()` in prop panel change handler (§3.6) to defer Observer B's tree replacement during source-mode Y.Text mutations. |
| CE06 | Prop panel edit while user is simultaneously editing children in WYSIWYG (same component, different sub-region): change `type` via panel while typing bold text inside children | Both apply — prop change and children edit are independent CRDT operations |

### Agent Write Path (P1)

| ID | Scenario | Expected |
|----|----------|----------|
| AW01 | Agent writes markdown with raw JSX component (e.g., `<Callout type="warning">...</Callout>`) | Editor renders typed component (if registered) |
| AW02 | Agent writes markdown with unknown component | Falls back to raw string display |
| AW03 | Agent modifies component props via markdown write | Prop panel reflects new values after observer sync |

### Disk Bridge (P1)

| ID | Scenario | Expected |
|----|----------|----------|
| DB01 | External editor changes component props in .md file | Editor updates component preview with new props |
| DB02 | External editor changes children in .md file | Editor updates children inline content |

---

## 8. Delivery

Layer 2 (typed props + prop panels) and Layer 3 (inline rich-text children) ship together. There is no fallback to Layer 2 only — both layers are required for the component system to feel like a product, not a prop editor. The implementation order (Phase 0→1→2→3→4) is sequential and each phase builds on the previous, but all phases ship as one unit.

---

## 9. Decision Log

| # | Decision | Resolution | Confidence | Evidence |
|---|----------|-----------|------------|----------|
| D1 | Serialization format | **REVISED: Raw JSX on disk** (valid MDX, fumadocs-compatible). Custom `markdownTokenizer` on the extension intercepts uppercase JSX tags before marked's HTML tokenizer. Greenfield — no fenced-format backward compatibility (see D13). Prototype: 24/24 tests pass. | High | See `evidence/raw-jsx-tokenizer-proof.md`, `evidence/fumadocs-serialization-compatibility.md` |
| D2 | Props storage | Flattened to top-level TipTap node attributes | High | y-prosemirror attribute-level LWW; research in /reports/react-types-as-editor-schema/ |
| D3 | Children storage | ProseMirror content spec (not string attribute) | High | Character-level CRDT for concurrent editing; Webstudio insight "children are structural" |
| D4 | Unregistered fallback | Layer 1 behavior (raw string void node) | High | MDX files may use any component; must open without errors |
| D5 | ~~Built-in components for P0~~ **Superseded by D15** | Superseded by D15 (3-layer sourcing with 15-component set) in session 2. | — | — |
| D6 | Dynamic attribute architecture (OQ4) | Single extension with formal attributes derived from registry at init. Props are top-level schema attributes with custom `parseHTML`/`renderHTML` for `data-prop-*` HTML representation. | High | y-prosemirror confirmed per-attribute LWW. See `evidence/tiptap-dynamic-attributes.md` |
| D7 | JSX parser selection (OQ7) | acorn + acorn-jsx (~23KB gzipped). 6x smaller than @babel/parser with identical JSX parsing correctness. | High | See `evidence/jsx-parser-comparison.md` |
| D8 | Two node types for registered vs unregistered (NEW) | `jsxComponentEditable` (content: 'block+', no atom) for registered components + `jsxComponentVoid` (atom: true) for unregistered. Both serialize to same markdown. parseMarkdown checks registry to decide type. | High | Universal CMS pattern. See `evidence/node-type-split-architecture.md` |
| D9 | Children never appear in prop panels (NEW) | ReactNode props are structural (inline editing zones), not prop controls. Universal consensus from 12 CMS systems. Storybook's attempt to show children in panels has 4+ open bugs since 2020. | High | See `evidence/cms-prior-art-synthesis.md` |
| D10 | Children parsing strategy (OQ13) | `marked.lexer()` + `helpers.parseBlockChildren()` + `helpers.createNode()`. Tokenize children markdown separately, pass tokens to existing TipTap parse pipeline. No circular deps, no MarkdownManager access needed. Children are flush-left on disk (zero indentation) — no dedentation step needed. Nested JSX in children works because marked.lexer() uses the globally-configured instance with custom tokenizers. | High | See `evidence/children-parsing-strategy.md` |
| D11 | markdownTokenizer API for raw JSX (D1 implementation) | TipTap v3's `markdownTokenizer` extension field registers a custom block tokenizer with marked. Intercepts `<UppercaseTag>` before marked's HTML tokenizer. Token type: `jsxBlock`. Proven by prototype (24/24 tests). | High | See `evidence/raw-jsx-tokenizer-proof.md` |
| D12 | Tokenizer version: Version B (tag-counting, ~80 lines) | Handles nested same-name components via depth counting. Zero new dependencies. Version A (simple regex, ~20 lines) covers 100% of agents-docs content but has a latent bug with nested same-name tags. Version C (acorn) adds no practical benefit over B. | High | See `evidence/raw-jsx-tokenizer-proof.md` |
| D13 | ~~Dual-format migration~~ **Raw JSX only** | Greenfield spike — no legacy content to migrate. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer. No fenced-format backward compatibility handler. Simplifies Phase 0 implementation. | High | User decision: greenfield, ignore migration paths |
| D14 | Prop panel UX: popover | Click component toolbar → floating panel. Every CMS uses a separate surface for props; popover is lightest-touch for a writing tool. | Medium | See `evidence/cms-prior-art-synthesis.md` |
| D15 | Built-in component set (3-layer sourcing) | **Fumadocs (canonical, 10 families):** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC. **Docskit (gap fill, 3):** Video, Frame, CodeGroup — only where fumadocs has no equivalent. **Shadcn (gap fill, 2):** Mermaid (MermaidCN), Audio (AI Elements). Total: 15 component families hardcoded in editor source. No divergent implementations — fumadocs is canonical for any component it ships. Custom component discovery is Future Work (§6 Future Work, Explored tier). | High | See `evidence/component-inventory-and-gaps.md` |
| D16 | Layer 2+3 ship together, no fallback | All technical risks mitigated. Both layers are required — the component system is not a product without inline children editing. No fallback to Layer 2 only. | High | All evidence files; user decision |

---

## 10. Assumptions

| # | Assumption | Confidence | Verification | Expiry |
|---|-----------|------------|-------------|--------|
| A1 | react-docgen-typescript correctly extracts React.ReactNode as a distinct type | **CONFIRMED** — `type.name` is `"ReactNode"` or `"React.ReactNode"` depending on import style. Must check both. **WARNING:** `children` is filtered out by default — must set `skipChildrenPropWithoutDoc: false`. See `evidence/react-docgen-typescript-behavior.md` | Phase 0 test CR05 | Validated |
| A2 | TipTap's NodeViewContent works for creating editable content holes in custom node views | **CONFIRMED** — working demo exists in TipTap repo (demos/src/Markdown/Full/React/) + table cells use same pattern. See `evidence/nodeviewcontent-feasibility.md` | Phase 3 implementation | Validated |
| A3 | ~~@babel/parser~~ acorn+acorn-jsx can parse the JSX subset we need | **CONFIRMED** — acorn+acorn-jsx handles all JSX patterns (nested tags, boolean props, expressions). 23KB gzipped. See `evidence/jsx-parser-comparison.md` | Phase 1 test | Validated |
| A4 | Attribute-level LWW in y-prosemirror applies to dynamically-added attributes (not just schema-declared) | **CONFIRMED** — y-prosemirror's `deltaToPSteps()` calls `tr.setNodeAttribute(pos, key, value)` per attribute independently. Each attribute is a separate CRDT entry. See `evidence/tiptap-dynamic-attributes.md` | Phase 1 concurrent editing test | Validated |
| A5 | mdManager.serialize() can scope to a ProseMirror fragment (children) rather than a full document | **CONFIRMED** via D10. `h.renderChildren()` works for serialization. Parsing uses `marked.lexer()` + `helpers.parseBlockChildren()` (not MarkdownManager.parse()). See `evidence/children-parsing-strategy.md`, `evidence/markdown-manager-fragment-serialization.md` | Phase 3 serialization test | Validated |
| A6 | The presence/awareness/per-origin-undo system from PR #7 (commit `8e3845d`) coexists with typed component nodes without modification to the awareness or undo layers | **UNVERIFIED** — needs Phase 2 manual test. The new server-side UndoManager tracks only `'agent-write'` origin on Y.Text; prop panel `updateAttributes` produces XmlFragment transactions that don't carry that origin, so the server-side UndoManager correctly ignores them. Browser-side y-prosemirror UndoManager handles per-user WYSIWYG undo. **Verification:** Phase 2 manual test — multi-tab WYSIWYG edit a typed component with cursors visible in both tabs; verify per-user undo works for prop edits and children edits. | Phase 2 manual test | Pending |
| A7 | `applyUserDelta` (observers.ts:125-174) correctly handles typed-component diffs when the same JSX line appears multiple times in the document | **UNVERIFIED** — the line-content matching uses `indexOf` which could mis-target duplicate lines (PM-H3). Scope narrowed post commits `9f215ef` + `99ea308`: the delta path mostly runs on the clean `applyIncrementalDiff` branch now because agent writes sync both trees in one server transaction, so the "Y.Text has unsynced content" branch is rarely exercised. **Verification:** OS08 test still valid — two `<Callout type="warning">` blocks exist, user changes one prop, assert only that block is mutated (exercises the local Observer A path under concurrent source-mode edits). | Phase 0 test OS08 | Pending |
| A8 | Raw JSX serialization is cycle-1 byte-identical (`serialize(parse(jsx)) === jsx` without `.trim()`) | **UNVERIFIED** — the prototype tests use `.trim()` to pass (PM-H2). Load-bearing for Observer B early-exit. **Verification:** Phase 0 test OS06 — explicit cycle-1 byte-identity assertion without trim. If violated, either fix renderMarkdown to produce byte-identical output OR normalize both sides of the comparison in Observer B (observer-layer change). | Phase 0 test OS06 | Pending |

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | ~~NodeViewContent doesn't support full WYSIWYG inside custom node views~~ | ~~Low~~ | ~~High~~ | **MITIGATED** — confirmed working via TipTap demo code + table cell pattern. See `evidence/nodeviewcontent-feasibility.md` |
| R2 | Observer sync produces shimmer with structured props | Low | Medium | Same dampening mechanisms as PR #6. Props change less frequently than text. |
| R3 | react-docgen-typescript fails on complex TypeScript types (generics, conditional types) or on a specific `.d.ts` shape | Low | Low | propFilter hides what can't be parsed. Manual override available. `.d.ts` extraction verified on fumadocs-ui callout and docskit types (see `evidence/react-docgen-typescript-dts-extraction.md`). Phase 1 per-built-in extraction tests (step 7) catch any component that extraction misses. |
| R13 | **Silent namespace collision:** user content with a JSX tag name matching a built-in (e.g., custom `<Card>` with different props) would render with the wrong component and could lose unknown attributes on round-trip | Medium | High | **Preserve-and-render policy (§3.8):** unknown attributes are stored on the node even when they aren't in the built-in's PropDef. Round-trip is byte-identical. Rendered node passes only PropDef-declared props to the built-in. Dev warning logged. Built-in names documented as reserved in `AGENTS.md` / `CLAUDE.md`. Test scenario RT08 verifies. Future Work: custom component discovery replaces this with proper override semantics. |
| R14 | **Agent writes + concurrent local prop edits — Yjs merge edge case.** Server-side `syncTextToFragment()` (`hocuspocus-plugin.ts:148`) uses `updateYFragment(doc, xmlFragment, pmNode, meta)` which is a destructive tree replacement. When a client has a concurrent in-flight local prop edit (e.g., user just clicked a dropdown and Observer A is still debouncing), the CRDT merge between the server's tree replacement and the client's local mutation may drop the prop edit depending on how `updateYFragment` emits edit operations. | Low | Medium | This is a Yjs-level concern at the `@tiptap/y-tiptap` layer, not a spec-introduced issue. P0 accepts the edge case because: (a) the window is narrow (tens of ms between click and Observer A flush), (b) `updateYFragment` attempts to preserve structural identity when possible, (c) Yjs's Y.XmlFragment CRDT merges attribute updates independently when node identity matches. Mitigation if observed: make the prop panel call `editor.commands.updateAttributes` synchronously and flush Observer A before the next server write (possible via a short `await new Promise(r => setTimeout(r, DEBOUNCE_MS))`). Future Work: custom component discovery may need a more surgical server write path that doesn't use full `updateYFragment`. |
| R4 | Children markdown serialization loses formatting within JSX context | Low | Medium | Use `h.renderChildren()` (proven via blockquote pattern). Children serialized flush-left (zero indent) — eliminates indentation concerns entirely. No dedentation needed during parse. |
| R5 | ~~Bundle size increase from @babel/parser~~ | ~~Low~~ | ~~Low~~ | **MITIGATED** — switched to acorn+acorn-jsx (23KB vs 148KB). |
| R7 | markdownTokenizer regex edge cases (nested same-name, expression attrs with >) | Low | Medium | Version B tokenizer handles both via tag-counting + brace-depth tracking (~80 lines). Agents-docs has zero occurrences of either pattern, but they're latent bugs. Mitigation: comprehensive test suite (24 tests proven). |
| R8 | ~~Indentation normalization breaks markdown semantics in children~~ | ~~Medium~~ | ~~Medium~~ | **MITIGATED** — children serialized flush-left (zero indent). No indentation stacking, no code block triggering, no dedentation function needed. |
| R6 | Concurrent editing of structured props reveals edge cases in y-prosemirror attribute LWW | Medium | Medium | Thorough E2E concurrent editing tests. Fallback: coarsen to per-node LWW (Layer 1 behavior). |
| R9 | Prop panel mutations bypass typing-defer protection — local source-mode edits can overwrite user prop changes during the 50ms Observer A debounce window (single-user two-pane scenario) | Low | Medium | Prop panel calls `markUserTyping()` on every change handler (§3.6). Test scenario CE05 verifies. Root cause: Radix popovers portal to `document.body`, events don't bubble to `editor.view.dom` where `markUserTyping` is bound. **Scope narrowed post commits `9f215ef` + `99ea308`:** remote agent writes no longer trigger Observer B on clients (server-side `syncTextToFragment` writes both trees in one transaction), so the original "concurrent agent write" race is fixed at the server layer. The remaining race is single-user two-pane editing (WYSIWYG + source simultaneously). |
| R10 | Raw JSX serialization not byte-stable on cycle 1 → Observer B early-exit (`observers.ts:288-301`) misses → tree replacement on every observation → cursor disruption inside NodeViewContent | High | High | Cycle-1 byte-identity test in Phase 0 (OS06). If violated, fix renderMarkdown to produce byte-identical output OR normalize trailing whitespace in renderMarkdown. Load-bearing: the prototype tests use `.trim()` to pass, which suggests cycle 1 currently does NOT produce byte-identical output. Phase 0 MUST resolve this before proceeding. **Scope (post commits `9f215ef` + `99ea308`):** Observer B only runs for LOCAL Y.Text changes now, so the cursor-disruption exposure is narrower — primarily source-mode editing and initial document load. Still load-bearing for those paths. |
| R11 | `applyUserDelta` line-content matching can mis-target when the same JSX line appears multiple times in the document (e.g., two `<Callout type="warning">` opening tags with identical attributes, or a stray `</Callout>` close tag) | Low | Medium | Serialize each component on its own line block with deterministic context lines that disambiguate. Add regression test OS08 for repeated identical JSX nodes. If mis-targeting occurs in practice, add a context-line comparison to `applyUserDelta` (observer-layer change). **Scope narrowed post commits `9f215ef` + `99ea308`:** the "Y.Text has unsynced agent content while XmlFragment has user changes" scenario is now very rare because agent writes sync both trees in one server transaction. The delta path mostly runs on the "clean" branch (`applyIncrementalDiff`) now. |
| R12 | Schema construction order: `editorSchema` (TiptapEditor.tsx:53) and server-side `MarkdownManager` (persistence.ts:28) are currently created at module load, BEFORE the component registry exists. Phase 1 must refactor to defer both. | Medium | Medium | Move schema construction into a registry-aware initializer that runs after `loadComponentRegistry()` resolves. Both browser and server need this. Registry loads synchronously at server startup; browser loads via JSON manifest bundled at build time. |

---

## 12. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Static vs dynamic component registry? | Architecture | Medium | **Resolved** → Static: registry loaded at startup from `src/editor/components/built-ins.ts` manifest. TipTap schema built after registry loads (see Phase 1 step 0, R12). Restart required to pick up new built-ins. Custom component hot-reload is Future Work. |
| OQ2 | Where do component files live? | Convention | Medium | **Resolved** → Built-ins live in `src/editor/components/built-ins.ts` (editor source code, not user-facing). Each manifest entry names a specific `.d.ts` (fumadocs/docskit) or `.tsx` (shadcn-installed) file to extract props from. Custom component discovery is Future Work (§6 Future Work, Explored tier) — see dual-track proposal. |
| OQ3 | How to handle react-docgen-typescript startup time? | Performance | Medium | **Resolved** → Non-issue for 15 built-ins (~<1s cold extraction). Cache to `.openknowledge/components.json` is polish, not required. Cache file doubles as the agent-discoverable manifest (Phase 4 step 4). |
| OQ4 | How to handle dynamic attributes in TipTap? | Architecture | High | **Resolved** → D6: Single extension, formal attributes from registry at init. See `evidence/tiptap-dynamic-attributes.md` |
| OQ5 | Multiple ReactNode content holes? | Architecture | Medium | **Resolved** → children-only for P0. Other ReactNode props (Card title, description) → text input in panel. Architecture doesn't foreclose multi-slot later. |
| OQ6 | Layer 1 → Layer 2+3 migration path? | Migration | High | **Resolved** → D13 (revised): Greenfield spike — no legacy content to migrate. Raw JSX only. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer. |
| OQ7 | JSX parser: regex vs @babel/parser vs lightweight? | Implementation | High | **Resolved** → D7: acorn + acorn-jsx (6x smaller than babel, same correctness). See `evidence/jsx-parser-comparison.md` |
| OQ8 | Children markdown serialization within JSX? | Implementation | High | **Resolved** → D10 (updated). Serialize: `h.renderChildren(node.content)`. Parse: dedent children string → `marked.lexer()` → `helpers.parseBlockChildren()`. Nested JSX works (globally-configured marked instance). |
| OQ9 | Prop panel: inline vs sidebar vs popover? | UX | Medium | **Resolved** → D14: Popover. Every CMS uses separate surface for props; popover is lightest-touch. |
| OQ10 | How does Tab/Tabs work? Tab has children (content) but must be inside a Tabs container. Do we enforce this? | Architecture | Medium | **Resolved** → No enforcement for spike. Slash command `/tabs` inserts a Tabs wrapper with one default Tab. Adding Tabs is done via "+" button. |
| OQ11 | How do we handle the `{" "}` whitespace fragments common in agents-docs MDX? | Parser | Low | acorn+acorn-jsx handles these natively — `{" "}` parses as a JSXExpressionContainer with a StringLiteral value |
| OQ12 | Should prop panel changes be undoable individually or batched? | UX | Low | **Resolved** → Default TipTap behavior (each `updateAttributes()` call = one undo step). Correct for most cases. |
| OQ13 | How to parse children markdown from code fence tokens into ProseMirror fragments? | Architecture | **High** | **Resolved** → D10: `marked.lexer(childrenMd)` then `helpers.parseBlockChildren(tokens)` then `helpers.createNode(type, attrs, content)`. No circular deps, no MarkdownManager access needed. See `evidence/children-parsing-strategy.md` |
| OQ14 | Should parseMarkdown share markdown parsing logic between the two node types? | Architecture | Medium | Both `jsxComponentEditable` and `jsxComponentVoid` handle the same `jsxBlock` token from the custom markdownTokenizer. Shared `parseMarkdown` function with registry lookup for type routing. |

---

## 13. Agent Constraints

**SCOPE:** This spec covers the editor-side component system only: registry, prop panel, inline children editing, serialization, slash commands. No server-side changes beyond component introspection at startup.

**EXCLUDE:** MCP tool changes, persistence changes, git workflow changes, navigation/sidebar. The server-side persistence layer should require ZERO changes. The observer layer requires no *internal* modifications, **but Phase 2's prop panel implementation MUST participate in the typing-defer protocol introduced by PR #7** — every prop mutation handler must call `markUserTyping()` (exported from `observers.ts`) so Observer B defers its tree replacement during prop edits, the same way it does for keystroke edits. See §3.6 and R9.

**STOP_IF:**
- Observer sync tests from PR #6 start failing *after Phase 0 test fixture migration* → serialization format has changed unexpectedly → debug before proceeding (Phase 0 itself updates test fixtures from fenced to raw JSX — those updates are expected, not regressions)
- `bun run check` fails after any phase → fix before moving to next phase
- TipTap NodeViewContent doesn't support editable regions inside custom node views → investigate alternative approaches before proceeding with Phase 3

**ASK_FIRST:**
- If react-docgen-typescript fails to extract props from a component pattern not covered in `evidence/react-docgen-typescript-behavior.md`
- If any existing test breaks — discuss whether the change is intentional or a regression
- If a fumadocs component's runtime behavior differs from what `evidence/component-runtime-compatibility.md` describes

---

## 14. Key Research References

| Report | Relevance |
|--------|-----------|
| `/reports/react-types-as-editor-schema/` | Core reference for react-docgen-typescript integration, performance benchmarks, TypeScript → editor schema patterns |
| `/reports/cms-custom-components-landscape/` | Industry patterns for CMS custom components in rich text editors |
| `/reports/fumadocs-full-pipeline/` | Fumadocs component registration, MDX components mapping |
| `/reports/mdx-text-editor-preview-approach/` | Stage progression from code+preview to WYSIWYG for MDX components |
| `/reports/mdx-crdt-roundtrip-fidelity/` | Why full MDX WYSIWYG is a rabbit hole — validates our void node approach |
| `/reports/obsidian-vs-fumadocs-component-inventory/` | Component inventory comparison, informs which built-in components to support |
| `specs/2026-04-07-bidirectional-observer-sync/SPEC.md` | Foundation this builds on — observer sync architecture, serialization format |
