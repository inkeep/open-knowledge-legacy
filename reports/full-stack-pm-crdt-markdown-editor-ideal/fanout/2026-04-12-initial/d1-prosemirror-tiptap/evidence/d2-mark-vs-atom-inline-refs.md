# D2: Mark vs Atom Node for Inline References

## TipTap Extension Survey

| Construct | Extension | Type | Key Properties |
|---|---|---|---|
| `@mention` | @tiptap/extension-mention | Inline atom node | `atom: true, inline: true, selectable: false` |
| `[text](url)` | @tiptap/extension-link | Mark | `keepOnSplit: false, exitable: true` |
| `![alt](src)` | @tiptap/extension-image | Leaf node | `draggable: true`, no content, configurable inline/block |
| Footnote | ProseMirror example | Inline atom w/ hidden content | `atom: true, inline: true, content: "text*"` |

### Mention extension (atom node)

Source: [extension-mention/src/mention.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-mention/src/mention.ts)

```
name: 'mention'
group: 'inline'
inline: true
atom: true
selectable: false
```

Attrs: `id` (data-id), `label` (data-label), `mentionSuggestionChar` (data-mention-suggestion-char, default '@')

Provides `renderText({ node })` returning `@${node.attrs.id}` for clipboard serialization.

### Link extension (mark)

Source: [extension-link/src/link.ts](https://github.com/ueberdosis/tiptap/blob/main/packages/extension-link/src/link.ts)

```
name: 'link'
priority: 1000
keepOnSplit: false
exitable: true
inclusive: depends on autolink setting
```

Attrs: `href`, `target` (default `'_blank'`), `rel`, `class`, `title`

renderHTML: `['a', mergedAttributes, 0]` -- the `0` is the content hole for wrapped text.

## Marijn's guidance on marks vs nodes

### Inline nodes with content are problematic

> "Inline nodes with content are generally messy -- they don't fit the model of the document being a tree on the block level and flat on the inline level very well."

Source: [discuss.prosemirror.net/t/correct-way-to-apply-marks-to-inline-nodes/5989](https://discuss.prosemirror.net/t/correct-way-to-apply-marks-to-inline-nodes/5989)

### Decision rule

> If the construct is an indivisible semantic unit (mention, wiki-link, emoji, inline component), use an **inline atom node**. If the construct is a property overlay on editable text (bold, italic, standard hyperlink), use a **mark**.

Source: [discuss.prosemirror.net/t/discussion-what-are-marks/862](https://discuss.prosemirror.net/t/discussion-what-are-marks/862)

## Analysis: `[[Page|alias]]` wiki-link

### Atom node (RECOMMENDED)

**Advantages:**
- Indivisible unit: cannot be partially selected/deleted/split
- Clean data model: `target`, `alias`, `anchor` as node attrs
- Custom rendering: NodeView can render as chip/pill
- Markdown round-trip: trivial `[[target#anchor|alias]]` serialization
- Atomic selection: arrow keys step over it (Obsidian behavior)
- Industry standard: TipTap Mention, Remirror mention-atom, BlockNote mentions

**Disadvantages:**
- Cannot apply marks (bold/italic) to display text
- Display text not editable inline (requires popup/modal)
- Copy/paste produces empty text unless `renderText()` implemented

### Mark approach

**Advantages:**
- Display text is real editable inline content
- Marks (bold/italic) can apply to link text
- Lighter weight in document model

**Disadvantages:**
- Splitting problem: Enter key can split mark across paragraphs
- Boundary ambiguity: typing at edges extends the mark
- Markdown serialization complex: must reconstruct `[[target|text]]` from mark boundaries
- Partial deletion: user can delete half the display text
- No atomic selection: cannot arrow-over as unit

### Verdict

**Atom node is correct for wiki-links.** This is the industry consensus and matches the existing codebase implementation.

## Analysis: Inline MDX `<Comp prop="val" />`

### Pattern across editors

- **BlockNote**: `createReactInlineContentSpec` with `content: "none"` = inline atom
- **Milkdown**: `$node('iframe', ...)` with `atom: true, group: 'block'`
- **Remirror**: `MentionAtomExtension` for non-editable inline components

### Consensus

Inline MDX void components (`<Foo />`) should be inline atom nodes:
```
group: 'inline'
inline: true
atom: true
attrs: { componentName: string, props: Record<string, string> }
```

Source: [blocknotejs.org/docs/features/custom-schemas/custom-inline-content](https://www.blocknotejs.org/docs/features/custom-schemas/custom-inline-content)

## Implications for proposed schema

1. **wiki-link as inline atom node**: Validated. Correct pattern.
2. **Inline MDX (`mdxJsxTextElement`) as inline atom**: Validated. Follows BlockNote/Milkdown patterns.
3. **Block MDX (`mdxJsxFlowElement`) as block atom**: Validated. Matches existing JsxComponent.
4. **Standard links `[text](url)` must remain marks**: Link display text needs to be editable inline.
5. **Marks will apply to atom nodes from parent context**: Cannot be prevented per-node. Accept this or use appendTransaction stripping.
