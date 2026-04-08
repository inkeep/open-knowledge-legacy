# SPEC: Typed Component Nodes — Prop Panels + Inline Rich-Text Children

**Status:** Final
**Created:** 2026-04-08
**Baseline commit:** 5597eb7
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

The bidirectional observer sync from PR #6 continues to work without modification to the observer layer:
- The serialization format (raw JSX on disk) works transparently with observer sync
- Observer A (XmlFragment → Text) serializes typed components to raw JSX in Y.Text
- Observer B (Text → XmlFragment) parses raw JSX via the custom markdownTokenizer and creates typed component nodes
- Source mode editing of component JSX round-trips correctly through the observer cycle
- Disk bridge and agent writes continue to work

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

Auto-extract prop schemas from TypeScript interfaces at project load.

```typescript
// src/server/component-introspection.ts (runs server-side at startup)

import { withDefaultConfig } from 'react-docgen-typescript';

const parser = withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  propFilter: (prop) => {
    // Hide internal React props
    if (prop.parent?.fileName.includes('node_modules')) return false;
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

**OQ2: Where do component .tsx files live?**
- Option A: `init_spike/src/editor/components/` (co-located with editor code)
- Option B: `init_spike/content/.openknowledge/components/` (user-land, in the content project)
- Option C: Both — built-in components ship with the editor, user components are in the project
- **Leaning:** Option C matches PROJECT.md: "Built-in just means ships pre-installed. Users add custom components the same way."

**OQ3: How to handle react-docgen-typescript's ~10-15s startup time?**
- Cache the extracted prop schemas to disk (JSON file)
- Invalidate on component file mtime change
- Fall back to cached version if extraction fails
- **Leaning:** Cache to `.openknowledge/component-cache.json`. Rebuild on dev server start if any component file is newer than cache.

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

### 3.8 Unregistered Component Fallback

Components that appear in markdown but aren't in the registry fall back to Layer 1 behavior:
- Rendered as `contentEditable={false}` void node
- Raw JSX displayed with syntax highlighting (mini CodeMirror or `<pre>` with highlighting)
- No prop panel, no inline editing
- Full raw string preserved verbatim

This ensures that:
1. Any MDX file opens without errors, even if it uses components we don't know about
2. Unregistered components round-trip perfectly (raw string in, raw string out)
3. Users can register components incrementally — no "all or nothing"

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
6. Verify observer sync: Observer A/B work with raw JSX in Y.Text (no shimmer).
7. Verify persistence: .md files on disk contain raw JSX after save.
8. Verify disk bridge: external edit of raw JSX in .md file → editor updates correctly.
9. Verify source mode: CodeMirror shows raw JSX (not fenced blocks).
10. **Verify:** All existing tests pass. `bun run check` green.

### Phase 1: Component Registry + react-docgen-typescript

1. Add `react-docgen-typescript`, `acorn`, `acorn-jsx` dependencies
2. Create `src/components/` directory (fumadocs convention). Move Callout there. Add Tabs/Tab, Note/Warning/Tip.
3. Create `src/editor/components/registry.ts` — ComponentMeta, PropDef, register/get API
4. Create `src/server/component-introspection.ts` — extract props from .tsx files via react-docgen-typescript (with `skipChildrenPropWithoutDoc: false`, `shouldExtractLiteralValuesFromEnum: true`)
5. Add acorn+acorn-jsx JSX parser (D7): parse JSX strings into `{ componentName, props, childrenString }`
6. Write tests: registry lookups, prop extraction, JSX parsing
7. **Verify:** `bun run check:fast` passes

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
4. Full E2E test suite covering all component types (Callout, Tabs/Tab, Note/Warning/Tip) × all edit paths (WYSIWYG props, WYSIWYG children, source mode, agent write, disk bridge).
5. Update test-fixture.md with all component types for manual verification.
6. **Verify:** `bun run check` green. Open test-fixture.md — all components render correctly with prop panels + editable children.

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

- Component registry with auto-extraction from TypeScript interfaces
- Prop panel UI with auto-generated controls (text, toggle, dropdown, number)
- Inline rich-text editing for `children` ReactNode prop
- Slash commands for component insertion
- Unregistered component fallback (raw string display)
- Built-in components (3-layer sourcing — see `evidence/component-inventory-and-gaps.md`):
  - **Fumadocs (canonical):** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC
  - **Docskit (gap fill):** Video, Frame, CodeGroup
  - **Shadcn (gap fill):** Mermaid (MermaidCN registry), Audio (AI Elements registry)
  - **User components:** auto-discovered from project `src/components/` via react-docgen-typescript
- Observer sync compatibility (no changes to observer layer)
- E2E tests for prop editing, children editing, concurrent editing, round-trip

### Out of Scope

- **Multiple ReactNode content holes** (OQ5) — P0 supports only `children`. Other ReactNode props use text input in panel.
- **Per-block code toggle** (Layer 4) — separate spec. The architecture supports it but we don't build it here.
- **Hot-reload of component registry** — restart required to pick up new components at P0.
- **Override file** (`.openknowledge/component-meta.ts`) — deferred. Auto-extraction is sufficient for P0.
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

### Observer Sync Compatibility (P0)

| ID | Scenario | Expected |
|----|----------|----------|
| OS01 | Edit Callout type in WYSIWYG → check source mode | Source mode shows updated JSX with new type value |
| OS02 | Edit children text in WYSIWYG → check source mode | Source mode shows updated children markdown |
| OS03 | Edit component JSX in source mode → check WYSIWYG | WYSIWYG renders updated component with new props |
| OS04 | Edit children markdown in source mode → check WYSIWYG | Children render correctly in WYSIWYG |
| OS05 | Toggle source → WYSIWYG → source | No content loss, no prop loss, no children loss |

### Concurrent Editing (P1)

| ID | Scenario | Expected |
|----|----------|----------|
| CE01 | User A changes type prop, User B edits children | Both merge: new type + new children text |
| CE02 | User A changes type prop, User B changes type prop | LWW: one wins (attribute-level, not whole-component) |
| CE03 | Two users typing in children simultaneously | Character-level CRDT merge, both edits preserved |
| CE04 | User A in WYSIWYG edits children, User B in source edits component JSX | Observer sync merges both — children from A, props from B |

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
| D5 | Built-in components for P0 | Callout + Tabs/Tab + 1-2 more | Medium | Validates multi-prop, enum, boolean, children patterns |
| D6 | Dynamic attribute architecture (OQ4) | Single extension with formal attributes derived from registry at init. Props are top-level schema attributes with custom `parseHTML`/`renderHTML` for `data-prop-*` HTML representation. | High | y-prosemirror confirmed per-attribute LWW. See `evidence/tiptap-dynamic-attributes.md` |
| D7 | JSX parser selection (OQ7) | acorn + acorn-jsx (~23KB gzipped). 6x smaller than @babel/parser with identical JSX parsing correctness. | High | See `evidence/jsx-parser-comparison.md` |
| D8 | Two node types for registered vs unregistered (NEW) | `jsxComponentEditable` (content: 'block+', no atom) for registered components + `jsxComponentVoid` (atom: true) for unregistered. Both serialize to same markdown. parseMarkdown checks registry to decide type. | High | Universal CMS pattern. See `evidence/node-type-split-architecture.md` |
| D9 | Children never appear in prop panels (NEW) | ReactNode props are structural (inline editing zones), not prop controls. Universal consensus from 12 CMS systems. Storybook's attempt to show children in panels has 4+ open bugs since 2020. | High | See `evidence/cms-prior-art-synthesis.md` |
| D10 | Children parsing strategy (OQ13) | `marked.lexer()` + `helpers.parseBlockChildren()` + `helpers.createNode()`. Tokenize children markdown separately, pass tokens to existing TipTap parse pipeline. No circular deps, no MarkdownManager access needed. Children are flush-left on disk (zero indentation) — no dedentation step needed. Nested JSX in children works because marked.lexer() uses the globally-configured instance with custom tokenizers. | High | See `evidence/children-parsing-strategy.md` |
| D11 | markdownTokenizer API for raw JSX (D1 implementation) | TipTap v3's `markdownTokenizer` extension field registers a custom block tokenizer with marked. Intercepts `<UppercaseTag>` before marked's HTML tokenizer. Token type: `jsxBlock`. Proven by prototype (24/24 tests). | High | See `evidence/raw-jsx-tokenizer-proof.md` |
| D12 | Tokenizer version: Version B (tag-counting, ~80 lines) | Handles nested same-name components via depth counting. Zero new dependencies. Version A (simple regex, ~20 lines) covers 100% of agents-docs content but has a latent bug with nested same-name tags. Version C (acorn) adds no practical benefit over B. | High | See `evidence/raw-jsx-tokenizer-proof.md` |
| D13 | ~~Dual-format migration~~ **Raw JSX only** | Greenfield spike — no legacy content to migrate. Single extension with `markdownTokenName: 'jsxBlock'` + custom tokenizer. No fenced-format backward compatibility handler. Simplifies Phase 0 implementation. | High | User decision: greenfield, ignore migration paths |
| D14 | Prop panel UX: popover | Click component toolbar → floating panel. Every CMS uses a separate surface for props; popover is lightest-touch for a writing tool. | Medium | See `evidence/cms-prior-art-synthesis.md` |
| D15 | Built-in component set (3-layer sourcing) | **Fumadocs (canonical, 15):** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC. **Docskit (gap fill, 3):** Video, Frame, CodeGroup — only where fumadocs has no equivalent. **Shadcn (gap fill, 2):** Mermaid (MermaidCN), Audio (AI Elements). No divergent implementations — fumadocs is canonical for any component it ships. User components auto-discovered from project dir. | High | See `evidence/component-inventory-and-gaps.md` |
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

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | ~~NodeViewContent doesn't support full WYSIWYG inside custom node views~~ | ~~Low~~ | ~~High~~ | **MITIGATED** — confirmed working via TipTap demo code + table cell pattern. See `evidence/nodeviewcontent-feasibility.md` |
| R2 | Observer sync produces shimmer with structured props | Low | Medium | Same dampening mechanisms as PR #6. Props change less frequently than text. |
| R3 | react-docgen-typescript fails on complex TypeScript types (generics, conditional types) | Medium | Low | propFilter hides what can't be parsed. Manual override available. |
| R4 | Children markdown serialization loses formatting within JSX context | Low | Medium | Use `h.renderChildren()` (proven via blockquote pattern). Children serialized flush-left (zero indent) — eliminates indentation concerns entirely. No dedentation needed during parse. |
| R5 | ~~Bundle size increase from @babel/parser~~ | ~~Low~~ | ~~Low~~ | **MITIGATED** — switched to acorn+acorn-jsx (23KB vs 148KB). |
| R7 | markdownTokenizer regex edge cases (nested same-name, expression attrs with >) | Low | Medium | Version B tokenizer handles both via tag-counting + brace-depth tracking (~80 lines). Agents-docs has zero occurrences of either pattern, but they're latent bugs. Mitigation: comprehensive test suite (24 tests proven). |
| R8 | ~~Indentation normalization breaks markdown semantics in children~~ | ~~Medium~~ | ~~Medium~~ | **MITIGATED** — children serialized flush-left (zero indent). No indentation stacking, no code block triggering, no dedentation function needed. |
| R6 | Concurrent editing of structured props reveals edge cases in y-prosemirror attribute LWW | Medium | Medium | Thorough E2E concurrent editing tests. Fallback: coarsen to per-node LWW (Layer 1 behavior). |

---

## 12. Open Questions

| # | Question | Type | Priority | Status |
|---|----------|------|----------|--------|
| OQ1 | Static vs dynamic component registry? | Architecture | Medium | **Resolved** → Init-time scan of `src/components/`. Static during session (TipTap schema immutable after init). Restart to pick up changes. |
| OQ2 | Where do component .tsx files live? | Convention | Medium | **Resolved** → `src/components/` for spike. Fumadocs convention (`mdx-components.tsx` + `src/components/`). Layered discovery (TQ29) for P0. |
| OQ3 | How to handle react-docgen 10-15s startup? | Performance | Medium | **Resolved** → Non-issue for spike (4-5 components, <1s). Disk cache for P0 (TQ31). |
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

**EXCLUDE:** MCP tool changes, persistence changes, git workflow changes, navigation/sidebar. The server-side persistence and observer layers should require ZERO changes (if they do, something is wrong with the serialization compatibility).

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
