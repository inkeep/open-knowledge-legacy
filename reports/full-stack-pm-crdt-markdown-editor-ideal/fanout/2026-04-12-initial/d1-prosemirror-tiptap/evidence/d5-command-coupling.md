# D5: Command Coupling to Schema Names

## TipTap command registration mechanism

Commands are registered via `addCommands()`, which returns an object where **keys are command names** and **values are command factory functions**. The ExtensionManager collects these by iterating all extensions:

```typescript
// ExtensionManager.ts
return {
  ...commands,
  ...addCommands(),  // keys = command names, chosen by extension author
}
```

The extension name does NOT automatically determine command names.

Source: [tiptap/packages/core/src/ExtensionManager.ts](https://github.com/ueberdosis/tiptap)

## Bold extension: Command names are arbitrary strings

```typescript
export const Bold = Mark.create<BoldOptions>({
  name: 'bold',
  addCommands() {
    return {
      setBold:    () => ({ commands }) => commands.setMark(this.name),
      toggleBold: () => ({ commands }) => commands.toggleMark(this.name),
      unsetBold:  () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})
```

The command name `toggleBold` is a plain string key. `this.name` inside the handler resolves to the schema mark name `'bold'`.

Source: [extension-bold/src/bold.tsx](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-bold/src/bold.tsx)

## Renaming `bold` to `strong`

If you rename the mark:
```typescript
Mark.create({
  name: 'strong',  // ProseMirror schema mark name
  addCommands() {
    return {
      toggleBold: () => ({ commands }) => commands.toggleMark(this.name),
      // this.name resolves to 'strong', toggleMark looks up schema.marks['strong']
    }
  },
})
```

This works because:
- `toggleBold` is just a key in the commands object -- an arbitrary string
- `commands.toggleMark(this.name)` calls `getMarkType('strong', schema)`, which looks up `schema.marks['strong']`
- The two namespaces (command names vs schema type names) are **fully decoupled**

## `editor.commands.toggleMark('bold')` vs `editor.commands.toggleBold()`

They are **different mechanisms** that converge on the same schema lookup:

- `editor.commands.toggleBold()`: Dispatches through CommandManager, finds `toggleBold` entry, handler calls `commands.toggleMark(this.name)`
- `editor.commands.toggleMark('bold')`: Directly calls built-in `toggleMark` which does `schema.marks['bold']`

**Critical:** If you rename to `strong`, `toggleMark('bold')` will **throw** because `schema.marks['bold']` won't exist.

## Keyboard shortcuts

Shortcuts bind to **closures**, not names:

```typescript
addKeyboardShortcuts() {
  return {
    'Mod-b': () => this.editor.commands.toggleBold(),
    'Mod-B': () => this.editor.commands.toggleBold(),
  }
}
```

If you rename the mark to `strong` but keep the command named `toggleBold`, `Mod-b` still works unchanged.

## `this.type` resolution

TipTap resolves `this.type` via:
```typescript
type: getSchemaTypeByName(extension.name, this.schema)

function getSchemaTypeByName(name, schema) {
  return schema.nodes[name] || schema.marks[name] || null;
}
```

The extension name **is** the schema type name. They must match.

## Summary: What's coupled, what's not

| Mechanism | Coupled to schema name? | Coupled to command name? |
|---|---|---|
| `addCommands()` keys | No | Yes (defines them) |
| Command handler body (`this.name`) | Yes | No |
| `toggleMark(nameString)` | Yes | No |
| `addKeyboardShortcuts()` | No | Indirectly (via closure) |
| `addInputRules()` via `this.type` | Yes (at resolution) | No |
| PM `wrappingInputRule` | No | No (takes NodeType object) |
| PM `textblockTypeInputRule` | No | No (takes NodeType object) |

## Implications for proposed renames

For renaming `bold` -> `strong`, `italic` -> `emphasis`:
1. Custom commands like `toggleBold` keep working if you keep the command key name
2. `editor.commands.toggleMark('bold')` would break -- callers must use `toggleMark('strong')`
3. Keyboard shortcuts work unchanged (closures)
4. Input rules work unchanged (`this.type` auto-resolves)
5. TypeScript `Commands` interface needs updating
6. TipTap's `wrappingInputRule` wrapper has hardcoded list node names -- needs updating for list renames
