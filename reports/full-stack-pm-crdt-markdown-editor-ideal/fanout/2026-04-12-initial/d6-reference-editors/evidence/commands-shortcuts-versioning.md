# Commands, Shortcuts, and Schema Versioning — Evidence

## Commands and Shortcuts

### Milkdown Commands

**Pattern:** `$command('CommandName', (ctx) => (args?) => prosemirrorCommand)`
**Invocation:** `editor.action(callCommand(commandKey, ...args))`
**Chaining:** `commandManager.chain().pipe(key).run()`

**Keyboard shortcuts (preset-commonmark):**

| Shortcut | Action | Command |
|---|---|---|
| `Mod-Alt-1` through `Mod-Alt-6` | Heading levels 1-6 | `wrapInHeadingCommand` |
| `Mod-Shift-b` | Blockquote | wrap in blockquote |
| `Mod-Alt-8` | Bullet list | |
| `Mod-Alt-7` | Ordered list | |
| `Mod-Alt-c` | Code block | |
| `Shift-Enter` | Hard break | |
| `Mod-Alt-0` | Paragraph | |
| `Mod-b` | Toggle bold | `toggleStrongCommand` |
| `Mod-i` | Toggle italic | `toggleEmphasisCommand` |
| `Mod-e` | Toggle inline code | |

**GFM additions:**
| `Mod-Alt-x` | Toggle strikethrough | |
| `Mod-]` / `Tab` | Next table cell | |
| `Mod-[` / `Shift-Tab` | Previous table cell | |

Source: [milkdown.dev/docs/guide/keyboard-shortcuts](https://milkdown.dev/docs/guide/keyboard-shortcuts), [milkdown.dev/docs/guide/commands](https://milkdown.dev/docs/guide/commands)

### BlockNote Commands

BlockNote exposes a **block-level API** rather than ProseMirror-style commands:

- `editor.insertBlocks()` — Insert blocks at position
- `editor.updateBlock()` — Update block properties
- `editor.removeBlocks()` — Remove blocks
- `editor.replaceBlocks()` — Replace blocks
- `editor.setTextCursorPosition()` — Move cursor to block
- `editor.setSelection()` — Set block selection range
- `editor.openSuggestionMenu()` — Open slash menu

Custom keyboard shortcuts added via TipTap extensions in the block spec.

Source: [blocknotejs.org/docs](https://www.blocknotejs.org/docs)

### Plate Commands

**Editor API pattern:** `editor.tf.*` for transforms:
- `editor.tf.escape` — Exit current context
- `editor.tf.tab` — Tab behavior
- `editor.tf.moveLine` — Move line up/down
- `editor.tf.selectAll` — Select all

**Keyboard shortcuts (BasicBlocksKit):**
| `Mod-Alt-1` through `Mod-Alt-6` | Heading levels | |
| `Mod-Shift-.` (period) | Toggle blockquote | |

Source: [platejs.org/docs](https://platejs.org/docs)

### Comparison of Shortcut Conventions

| Action | Milkdown | Plate | TipTap/ProseMirror |
|---|---|---|---|
| Bold | `Mod-b` | `Mod-b` | `Mod-b` |
| Italic | `Mod-i` | `Mod-i` | `Mod-i` |
| Heading 1 | `Mod-Alt-1` | `Mod-Alt-1` | `Mod-Alt-1` |
| Bullet list | `Mod-Alt-8` | varies | `Mod-Shift-8` |
| Ordered list | `Mod-Alt-7` | varies | `Mod-Shift-7` |
| Code block | `Mod-Alt-c` | varies | `Mod-Alt-c` |

**Key finding:** Shortcuts are largely standardized across editors, following Google Docs / VS Code conventions. Bold/Italic are universal (`Mod-b`/`Mod-i`). Heading shortcuts vary slightly but converge on `Mod-Alt-N`.

---

## Schema Versioning Approaches

### ProseMirror Core: No Built-In Migration

From [discuss.prosemirror.net/t/schema-versioning-and-migrations/321](https://discuss.prosemirror.net/t/schema-versioning-and-migrations/321):

Marijn: "This is best left to the user. Write your own upgrade function, and if you're able, run it on all existing documents right away."

For deferred migrations: "Store schema versions with documents and upgrade them automatically during reading."

### Community Patterns (kiejo)

**Pattern 1: Direct JSON Modification**
Manipulate ProseMirror JSON document structure with standard JavaScript. Suitable for format changes like MarkType serialization updates.

**Pattern 2: Transform-Based (Complex)**
1. Create interim schema supporting both source and target constraints
2. Convert JSON to nodes via migration schema
3. Collect transforms through node traversal
4. Sort operations by position (descending)
5. Apply transforms
6. Convert back to JSON

### Milkdown: $nodeSchema.extendSchema()

Milkdown handles schema extension (not versioning) through `extendSchema()`. Example: GFM task list items extend `list_item` by adding a `checked` attribute. The ProseMirror node type name stays `list_item` — no migration needed.

### BlockNote: Implicit

BlockNote does not expose a schema versioning API. Documents stored as JSON blocks can be migrated with standard JSON transformation.

### Plate: Package Version = Schema Version

- No formal schema versioning system
- No version field in documents
- `normalizeInitialValue` plugin hook for runtime migration
- Plugin key stability across versions (string values like `'p'`, `'h1'`, `'bold'` stayed stable even as API surface changed)
- Breaking changes tracked through semver major releases and migration guides
- Historical: `ELEMENT_PARAGRAPH` constants replaced by `KEYS` object, but underlying strings unchanged

### Practical Recommendations

1. **For greenfield projects:** Don't add schema versioning until you need it. Start with stable node type names.
2. **For production editors:** Store schema version as document metadata. Run migrations on read.
3. **For CRDT documents:** Migration is harder — Y.js documents encode structural history. Schema changes may require full document re-creation.
4. **For markdown-backed storage:** The markdown IS the serialized format. Schema changes are transparent if the markdown remains valid.

Source: [discuss.prosemirror.net/t/upgrading-a-doc-to-a-different-schema/5370](https://discuss.prosemirror.net/t/upgrading-a-doc-to-a-different-schema/5370)
