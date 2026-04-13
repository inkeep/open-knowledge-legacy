---
type: code-trace
sources:
  - packages/app/src/editor/extensions/slash-command.ts
  - packages/app/src/editor/extensions/wiki-link-suggestion.ts
created: 2026-04-13
---

# Slash-Command command() Non-Atomic Delete

## Finding

`slash-command.ts:108-115`:
```ts
command: ({ editor, range, props: item }) => {
  editor.chain().focus().deleteRange(range).run();  // chain 1 — dispatches immediately
  try {
    item.command(editor);  // chain 2 — if throws, trigger text already gone
  } catch (err) {
    console.error(`SlashCommand: command "${item.name}" threw an error`, err);
  }
},
```

`wiki-link-suggestion.ts:212-232` (post PR #78):
```ts
command: ({ editor, range, props: item }) => {
  try {
    // ... derive attrs ...
    editor.chain().focus().deleteRange(range).insertContent({ type: 'wikiLink', attrs }).run();
    // single chain — atomic
  } catch (err) { ... }
},
```

## Risk

Slash-command runs `deleteRange` as a SEPARATE chain that dispatches BEFORE the try/catch on `item.command()`. If a pluggable item's command throws:
- The `/heading` trigger text is already deleted (chain 1 succeeded)
- Nothing replaces it (chain 2 threw)
- User sees text disappear with no replacement

This is latent today (built-in items are simple) but becomes live when PR #12/#23 add component insertion commands with more complex editor operations.

## Note on fix approach

Cannot combine into a single chain because `item.command(editor)` is an arbitrary function — it may chain internally or use direct dispatch. The fix wraps both in a single try/catch so at minimum errors are caught. The trigger text deletion on item select is intentional (user chose an item), but the error should be caught rather than crashing the editor.
