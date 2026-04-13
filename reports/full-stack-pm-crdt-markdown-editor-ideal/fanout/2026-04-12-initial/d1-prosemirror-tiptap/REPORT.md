# D1: ProseMirror Core + TipTap Framework Constraints

**Fanout dimension:** ProseMirror/TipTap library-level constraints on the proposed schema
**Parent report:** Full-stack PM-CRDT-markdown editor ideal configuration
**Date:** 2026-04-12

---

## Executive summary

The proposed schema is **architecturally sound** with ProseMirror and TipTap, subject to six concrete constraints and two design corrections. ProseMirror's model layer imposes almost no naming constraints — names are arbitrary strings resolved at runtime. The real constraints come from (1) TipTap's hardcoded name cross-references in list/input-rule wrappers, (2) Y.js attribute type contracts, and (3) the parent-level mark permission model that cannot selectively exclude marks from specific inline atoms.

### Verdict by proposed schema element

| Proposed element | Verdict | Constraint |
|---|---|---|
| Unified `list` + `listItem` | **Viable, with corrections** | `checked` must be on listItem, not list (mdast parity). Requires custom TipTap extension. |
| wiki-link as inline atom | **Validated** | Marks from parent apply to it — cannot be prevented per-node. Accept or strip via appendTransaction. |
| 5 MDX node types | **Validated** | Inline MDX = inline atom; block MDX = block atom. Standard pattern (BlockNote, Milkdown). |
| `source*` attribute naming | **Validated** | Must be flat primitives, not nested objects (Y.js constraint). |
| mdast-canonical renames | **Viable, low friction** | Command names decoupled from schema names. Input rules use NodeType objects. |
| `horizontalRule` → `thematicBreak` | **Free** | No library hardcodes this name. |

---

## D1: Atom node contract

**Finding:** `atom: true` is a **view-layer hint**, not a model constraint. It tells the selection/cursor system to treat the node as an opaque unit. The model layer does not enforce atom-ness — `ReplaceStep` can still modify content inside an atom.

**Key properties:**
- `NodeType.isAtom = this.isLeaf || !!this.spec.atom`
- Arrow keys create `NodeSelection` instead of entering the node
- Click selects the whole node (`selectClickedLeaf`)
- Backspace/Delete removes the entire atom as a unit
- For true non-editability, `NodeView` must omit `contentDOM`

**Marks on atoms:** Marks CAN apply to inline atom nodes. Mark permissions are determined by the **parent node type**, not the individual inline node. Setting `marks: ''` on an inline atom's NodeSpec does nothing — that property controls marks on the atom's *children*, not on the atom itself.

> Marijn: "Marks can't be configured per node, only per parent node."
> — [discuss.prosemirror.net/t/2414](https://discuss.prosemirror.net/t/nodespec-marks-not-work-at-inline-node/2414)

**Impact on proposed schema:** Wiki-links and inline MDX atoms will inherit bold/italic/code marks from their parent paragraph. The only mitigation is an `appendTransaction` plugin that strips unwanted marks from specific node types.

**Evidence:** [evidence/d1-atom-node-contract.md](evidence/d1-atom-node-contract.md)

---

## D2: Mark vs atom node for inline references

**Finding:** For `[[Page|alias]]` wiki-links and `<Comp />` inline MDX, **inline atom node is the correct pattern**. This is the industry consensus across TipTap Mention, Remirror MentionAtom, BlockNote inline content, and Obsidian's own implementation.

**Decision rule from Marijn:**
> If the construct is an indivisible semantic unit, use an inline atom node. If it is a property overlay on editable text, use a mark.
> — [discuss.prosemirror.net/t/862](https://discuss.prosemirror.net/t/discussion-what-are-marks/862)

**TipTap patterns:**

| Construct | Type | Pattern |
|---|---|---|
| @mention | Inline atom | `atom: true, inline: true, selectable: false` |
| [text](url) | Mark | `keepOnSplit: false, exitable: true` |
| ![alt](src) | Leaf node | No content, configurable inline/block |
| [[Page]] | Inline atom | Same as mention (current codebase) |
| `<Comp />` inline | Inline atom | `atom: true, inline: true` with NodeView |

**Evidence:** [evidence/d2-mark-vs-atom-inline-refs.md](evidence/d2-mark-vs-atom-inline-refs.md)

---

## D3: Unified list type

**Finding:** A single `list` node type is **proven viable** by [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list), which uses exactly one node type with a `kind` attribute. TipTap has no official unified list — it ships three separate extensions (BulletList, OrderedList, TaskList).

### prosemirror-flat-list NodeSpec

```typescript
createListSpec(): NodeSpec {
  return {
    content: 'block+',
    group: 'flatList block',
    attrs: {
      kind: { default: 'bullet' },     // 'bullet' | 'ordered' | 'task' | 'toggle'
      order: { default: null },
      checked: { default: false },
      collapsed: { default: false },
    },
  }
}
```

### prosemirror-schema-list: Commands are name-agnostic

All four commands take `NodeType` parameters, not strings:
```typescript
wrapInList(listType: NodeType, attrs?: Attrs): Command
splitListItem(itemType: NodeType): Command
liftListItem(itemType: NodeType): Command
sinkListItem(itemType: NodeType): Command
```

The convenience `addListNodes()` hardcodes `"ordered_list"`, `"bullet_list"`, `"list_item"` — but you don't have to use it.

### Design correction: `checked` belongs on listItem

The proposed schema puts `checked` on the list node. mdast puts it on `listItem`:

```
mdast List:     ordered: boolean, start: number|null, spread: boolean
mdast ListItem: checked: boolean|null, spread: boolean
```

This is correct because a single list can contain mixed task and non-task items. A `checked` attr on the list container loses this expressiveness.

**Recommended unified schema:**
- `list` node: `{ ordered: boolean, start: number, spread: boolean }`
- `listItem` node: `{ checked: boolean|null, spread: boolean }`
- Content: `list > listItem+`, listItem content: `paragraph block*`

### TipTap integration cost

Replacing three TipTap extensions (BulletList + OrderedList + TaskList) with a single custom extension. TipTap's `wrappingInputRule` wrapper has hardcoded `"bulletList"` / `"orderedList"` / `"taskList"` strings in its `keepAttributes` logic — must be updated.

**Evidence:** [evidence/d3-unified-list-type.md](evidence/d3-unified-list-type.md)

---

## D4: TaskList/TaskItem unification

**Finding:** Folding TaskItem into a unified `listItem` with `checked: boolean | null` is architecturally sound and matches mdast semantics exactly.

- `checked: null` — normal list item (not a task)
- `checked: false` — unchecked task item `- [ ]`
- `checked: true` — checked task item `- [x]`

The current codebase uses separate TaskList/TaskItem from `@tiptap/extension-list`. Unification eliminates the need for two separate list item types and their associated content expression wiring.

**Interaction with unified list:** If the list node carries `ordered: boolean`, and listItem carries `checked: boolean|null`, then:
- `- text` → `list(ordered:false) > listItem(checked:null)`
- `1. text` → `list(ordered:true) > listItem(checked:null)`
- `- [ ] text` → `list(ordered:false) > listItem(checked:false)`
- `- [x] text` → `list(ordered:false) > listItem(checked:true)`

This is a clean 1:1 mapping to/from mdast.

---

## D5: Command coupling to schema names

**Finding:** TipTap command names and schema type names are **fully decoupled**. Commands are arbitrary string keys in the `addCommands()` return object. Inside the handler, `this.name` resolves to the schema type name.

```typescript
Mark.create({
  name: 'strong',  // ProseMirror schema name
  addCommands() {
    return {
      toggleBold: () => ({ commands }) => commands.toggleMark(this.name),
      // 'toggleBold' is the command key; 'strong' is the schema name
    }
  },
})
```

**What's coupled, what's not:**

| Mechanism | Coupled to schema name? |
|---|---|
| `addCommands()` keys | No (arbitrary strings) |
| Handler body `this.name` | Yes |
| `toggleMark('bold')` string arg | Yes (breaks on rename) |
| Keyboard shortcuts | No (closures) |
| Input rules via `this.type` | Yes (auto-resolves) |
| PM `wrappingInputRule` | No (takes NodeType) |

**Impact:** Renaming `bold` → `strong` or `horizontalRule` → `thematicBreak` works with minimal friction. The extension name = schema type name (must match). Command names remain whatever you choose.

**Evidence:** [evidence/d5-command-coupling.md](evidence/d5-command-coupling.md)

---

## D6: Input rule patterns

**Finding:** ProseMirror input rules operate on `NodeType` / `MarkType` objects, not strings. Both `wrappingInputRule` and `textblockTypeInputRule` accept pre-resolved `NodeType` parameters:

```typescript
function wrappingInputRule(regexp: RegExp, nodeType: NodeType, ...): InputRule
function textblockTypeInputRule(regexp: RegExp, nodeType: NodeType, ...): InputRule
```

In TipTap, `this.type` is resolved from `schema.nodes[extension.name]`. The regex pattern is completely independent of the node name.

**Single hardcoded location:** TipTap's `wrappingInputRule` wrapper has a `keepAttributes` feature that hardcodes `"bulletList"`, `"orderedList"`, `"taskList"` strings. If renaming list nodes to a unified `list`, this code needs updating. This is TipTap wrapper code only, not ProseMirror core.

---

## D7: Attribute shape — flat required, nested forbidden

**Finding:** ProseMirror attrs technically accept any JSON-serializable value (including nested objects). However, **Y.js imposes a hard constraint that makes flat attrs the only safe choice** in a CRDT editor.

`Y.XmlElement.setAttribute()` is typed as `(name: string, value: string | Y.AbstractType)`. y-prosemirror calls this for each attr. Nested object attrs violate the documented type contract — they work in practice via undocumented Yjs internal encoding, but this is fragile.

**Additional concerns with nested attrs:**
- `compareDeep` (used in `eq()`) does recursive traversal — O(n) vs O(1) for primitives
- No built-in `validate` type string for objects
- Marijn discourages them: attrs are atomic (replaced wholesale, not patched)

**Conclusion:** All `source*` fidelity attributes must be flat primitives. The existing codebase already follows this pattern (`fenceDelimiter` + `fenceLength`, not `fenceSpec: {char, length}`).

**Evidence:** [evidence/d7-attribute-shape.md](evidence/d7-attribute-shape.md)

---

## D8: CodeBlock vs CodeBlockLowlight

**Finding:** Both share the same NodeSpec. CodeBlockLowlight adds only a ProseMirror decoration plugin for syntax highlighting. The `language` attr is a simple `string|null`.

Syntax highlighting is a **decoration-layer concern** — no schema impact, no CRDT impact, no markdown round-trip impact. The server needs only the schema definition; the highlighting plugin is app-only.

**For the proposed schema:** `codeBlock` (or mdast-renamed `code`) needs `language: string|null` plus fidelity attrs (`sourceFenceChar`, `sourceFenceLength`). Highlighting is orthogonal.

**Evidence:** [evidence/d8-d9-codeblock-html-roundtrip.md](evidence/d8-d9-codeblock-html-roundtrip.md)

---

## D9: HTML round-trip

**Finding:** In a Y.XmlFragment-based CRDT editor, HTML round-trip is **only relevant for clipboard operations** (copy/paste). Storage uses markdown, collaboration uses Y.js binary protocol.

Three independent serialization paths exist:
1. Markdown: `parseMarkdown` / `renderMarkdown` (persistence)
2. HTML: `parseHTML` / `renderHTML` (clipboard)
3. CRDT: Y.XmlFragment (collaboration)

For atom nodes, clipboard fidelity requires `data-*` attributes in `renderHTML` and matching `parseHTML` extractors. The current WikiLink and JsxComponent extensions handle this correctly.

**Impact on proposed schema:** Schema renames don't affect HTML round-trip. Custom `parseHTML`/`renderHTML` are per-extension and independent of markdown serialization. New atom node types need `data-*` attribute design for clipboard.

---

## D10: Schema content expressions

**Finding:** ProseMirror content expressions use regex-like syntax compiled to a DFA. Key idioms:

| Node | Idiomatic content | Notes |
|---|---|---|
| `doc` | `block+` | Always require at least one block (avoids empty uneditable state) |
| `paragraph` | `inline*` | Zero or more inline nodes |
| `listItem` | `paragraph block*` | Conventional; forces paragraph first child |
| `listItem` (flexible) | `block+` | Acceptable if building custom list commands |
| `blockquote` | `block+` | One or more blocks |
| `codeBlock` | `text*` | Text only, marks disabled via `marks: ''` |

**Synthesizability constraint:** All nodes in required positions must have defaults for all attrs. If a node has required attrs without defaults, `fillBefore` fails and the editor cannot auto-create it.

**Ordering matters:** The first type in a group (by order in the `nodes` map) becomes the default synthesized node. Put `paragraph` before `blockquote` in the block group.

**Evidence:** [evidence/d10-content-expressions.md](evidence/d10-content-expressions.md)

---

## Constraint summary for the proposed schema

### Hard constraints (must satisfy)

| # | Constraint | Source | Impact |
|---|---|---|---|
| C1 | Attrs must be flat primitives in a CRDT editor | Y.XmlElement.setAttribute type contract | All `source*` attrs must be `string`, `number`, `boolean`, or `null` |
| C2 | `checked` belongs on listItem, not list | mdast semantics; mixed task/non-task items in one list | Move `checked: boolean\|null` to listItem |
| C3 | All required-position node attrs must have defaults | ProseMirror `fillBefore` / synthesizability | Every fidelity attr needs a default value |
| C4 | Marks cannot be disabled per inline node type | ProseMirror parent-level mark model | Bold/italic will apply to wiki-link and MDX atoms |

### Soft constraints (strong recommendations)

| # | Constraint | Source | Impact |
|---|---|---|---|
| C5 | Unified list requires custom TipTap extension | TipTap hardcodes BulletList/OrderedList/TaskList names | Replace three extensions with one; update wrappingInputRule keepAttributes |
| C6 | Put paragraph first in node ordering | ProseMirror group default synthesis | Prevents infinite recursion and ensures paragraph is auto-created |

### Non-constraints (things that seem problematic but aren't)

| Concern | Why it's not a constraint |
|---|---|
| Schema naming (bold→strong, horizontalRule→thematicBreak) | Commands decouple from names; input rules use NodeType objects |
| HTML round-trip for markdown editor | Only clipboard matters; three paths are independent |
| CodeBlock highlighting | Decoration-layer only; no schema/CRDT impact |
| Unified list type | Proven by prosemirror-flat-list; PM commands accept NodeType params |

---

## Sources

### ProseMirror core
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/)
- [prosemirror-model source](https://github.com/ProseMirror/prosemirror-model)
- [prosemirror-schema-list source](https://github.com/ProseMirror/prosemirror-schema-list)
- [prosemirror-inputrules source](https://github.com/ProseMirror/prosemirror-inputrules)
- [prosemirror-commands source](https://github.com/ProseMirror/prosemirror-commands)
- [ProseMirror footnote example](https://prosemirror.net/examples/footnote/)

### TipTap
- [TipTap GitHub](https://github.com/ueberdosis/tiptap)
- [extension-mention source](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-mention/src/mention.ts)
- [extension-bold source](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-bold/src/bold.tsx)
- [extension-link source](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-link/src/link.ts)
- [extension-list (ListKit)](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-list)
- [CodeBlock docs](https://tiptap.dev/docs/editor/extensions/nodes/code-block)
- [CodeBlockLowlight docs](https://tiptap.dev/docs/editor/extensions/nodes/code-block-lowlight)

### Alternative list implementations
- [prosemirror-flat-list](https://github.com/ocavue/prosemirror-flat-list)
- [prosemirror-flat-list discussion](https://discuss.prosemirror.net/t/prosemirror-flat-list-alpha/5191)

### Other editors
- [BlockNote custom inline content](https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content)
- [tiptap-extension-code-block-shiki](https://github.com/timomeh/tiptap-extension-code-block-shiki)

### Y.js / CRDT
- [Y.XmlElement docs](https://docs.yjs.dev/api/shared-types/y.xmlelement)
- [y-prosemirror GitHub](https://github.com/yjs/y-prosemirror)

### discuss.prosemirror.net
- [Cursor movement on atom nodes](https://discuss.prosemirror.net/t/cursor-movement-on-node-with-atom-true/1252)
- [Marks on inline nodes](https://discuss.prosemirror.net/t/nodespec-marks-not-work-at-inline-node/2414)
- [What are marks?](https://discuss.prosemirror.net/t/discussion-what-are-marks/862)
- [Correct way to apply marks to inline nodes](https://discuss.prosemirror.net/t/correct-way-to-apply-marks-to-inline-nodes/5989)
- [Node.eq() comparison](https://discuss.prosemirror.net/t/when-comparing-nodes-using-eq-what-exactly-is-being-compared/4369)
- [Custom JSON serialization](https://discuss.prosemirror.net/t/adding-custom-json-serialization-for-nodes-and-marks/6060)
- [Nested objects in attrs](https://discuss.prosemirror.net/t/full-documents-inside-node-attributes/1894)
- [ListItem content recommendation](https://discuss.prosemirror.net/t/recommended-spec-for-list-item-content/8247)
