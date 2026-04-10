# Wiki-links in ProseMirror/TipTap Editor

**Dimension:** D3 — Wiki-links in ProseMirror/TipTap (P0, Deep)  
**Parent report:** Wiki-links and Backlinks Architecture for Agent-Native Knowledge Platform  
**Date:** 2026-04-04  
**Evidence:** See `evidence/` directory for file:line citations from all source code reviewed

---

## Executive Summary

Implementing wiki-links in a TipTap/ProseMirror editor is architecturally straightforward. TipTap's Suggestion utility already supports multi-character triggers like `[[` out of the box. The Mention extension provides a proven template for inline atomic nodes that can be adapted for wiki-links with minimal code changes. Markdown round-tripping through `tiptap-markdown` requires a custom markdown-it inline rule but uses well-documented extension points. The critical architectural decision is **ID-based vs name-based linking** — every production collaborative editor (Outline, AFFiNE, Notion) uses ID-based linking, while only local-first file-based tools (Obsidian) use name-based linking.

---

## 1. `[[` Autocomplete in TipTap

### The Trigger Detection Already Works

TipTap's Suggestion utility (`@tiptap/suggestion`) accepts a `char` option that is a **string**, not a single character. Setting `char: '[['` works with zero modifications:

1. `escapeForRegEx()` properly escapes `[` to `\\[` ([source: `tiptap/packages/core/src/utilities/escapeForRegEx.ts:2-4`](https://github.com/ueberdosis/tiptap))
2. The regex constructor builds `/(?:^)?\[\[[^\s\[\[]*/gm` which matches `[[` followed by non-whitespace characters ([source: `tiptap/packages/suggestion/src/findSuggestionMatch.ts:25-31`](https://github.com/ueberdosis/tiptap))
3. Query extraction (`match[0].slice(char.length)` at line 73) correctly slices off 2 characters

### Suggestion Plugin Lifecycle

The Suggestion utility is a ProseMirror Plugin with a well-defined state machine:

```
User types "[[" → findSuggestionMatch() detects trigger → state.active = true
  → view.update() fires onStart() → popup opens
User types query → state.query updates → onUpdate() fires → items re-fetched
User selects item → command() fires → trigger text replaced with node
User presses Escape → exit metadata dispatched → onExit() fires → popup closes
```

Key configuration options ([source: `suggestion.ts:29-178`](https://github.com/ueberdosis/tiptap)):
- `char: '[['` — trigger string
- `allowSpaces: true` — page titles often contain spaces
- `items: async ({ query }) => searchPages(query)` — async item provider
- `command: ({ editor, range, props }) => { ... }` — insert wikilink node on selection
- `render: () => ({ onStart, onUpdate, onExit, onKeyDown })` — popup lifecycle

### Popup Positioning

Two production-proven strategies:

**TipTap's approach** — Inline Decoration wraps trigger+query text. Popup queries the decoration element's `getBoundingClientRect()` ([source: `suggestion.ts:612-634`](https://github.com/ueberdosis/tiptap)):
```typescript
Decoration.inline(range.from, range.to, {
  nodeName: 'span',
  class: 'suggestion',
  'data-decoration-id': decorationId,
})
```

**Outline's approach** — `view.coordsAtPos(selection.from)` with Radix PopoverAnchor via virtual ref ([source: `outline/app/editor/components/SuggestionsMenu.tsx:99-117`](https://github.com/outline/outline)). More direct but less stable during text reflow.

### No Existing TipTap Extension Required

There is no need for a third-party extension. The Mention extension + Suggestion utility provide the full foundation. The adaptation is:

| Component | Mention Extension | Wikilink Adaptation |
|---|---|---|
| Trigger char | `@` | `[[` |
| Node type | `mention` | `wikiLink` |
| Attributes | `id`, `label`, `mentionSuggestionChar` | `targetId`, `targetTitle`, `alias` |
| HTML tag | `<span data-type="mention">` | `<a data-type="wikilink">` |
| Atom node | Yes | Yes |
| Inline | Yes | Yes |

---

## 2. Existing Extensions Landscape

### Published Packages: None

There are **no mature, published npm packages** for TipTap/ProseMirror wikilinks. The ecosystem gap is notable.

### GitHub Repositories

| Name | Type | Stars | Status | Assessment |
|---|---|---|---|---|
| [aarkue/tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) | TipTap Node | ~5 | Stale (Jun 2023) | Proof-of-concept. Correct architecture (Node + Suggestion) but unmaintained, not on npm |
| [benrbray/noteworthy](https://github.com/benrbray/noteworthy) | ProseMirror | 258 | Stale | Embedded in Electron app, not extractable |

### Production App Implementations

| App | Architecture | Link Storage | Resolution |
|---|---|---|---|
| **Outline** (30k+ stars) | Unified Mention node (`inline: true`, `atom: true`) | UUID `modelId` | ID-based, cached `label` fallback |
| **AFFiNE** (7k+ stars) | Reference inline node + `[[` trigger + popover widget | UUID `pageId` | ID-based, reactive signal subscription |
| **Notion** | Page block references | 32-char UUID in URL | ID-based, title prefix ignored in resolution |

**Bottom line:** Every production collaborative editor builds its own internal link system using inline atomic nodes with ID metadata. The `[[` syntax is a user-facing trigger, not persistent storage — the stored representation is always a structured node.

---

## 3. ProseMirror Node Spec for Wikilinks

### Recommended Schema

```typescript
const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,        // cursor cannot enter; indivisible unit
  selectable: true,  // can be selected for deletion

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: el => el.getAttribute('data-target-id'),
        renderHTML: attrs => ({ 'data-target-id': attrs.targetId }),
      },
      targetTitle: {
        default: null,
        parseHTML: el => el.getAttribute('data-target-title'),
        renderHTML: attrs => ({ 'data-target-title': attrs.targetTitle }),
      },
      alias: {
        default: null,
        parseHTML: el => el.getAttribute('data-alias'),
        renderHTML: attrs => attrs.alias ? { 'data-alias': attrs.alias } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="wikilink"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['a', {
      ...HTMLAttributes,
      'data-type': 'wikilink',
      class: 'wikilink',
      href: `/doc/${node.attrs.targetId}`,
    }, node.attrs.alias || node.attrs.targetTitle || 'Untitled']
  },
})
```

### Design Rationale

**Inline atom node** (not a mark): Wikilinks are self-contained references, not character-range annotations. Marks would allow partial selection and editing of the link text, which breaks the semantics. All production implementations (Outline: `atom: true`, AFFiNE: atomic reference node) use this approach.

**Three attributes**: `targetId` (stable UUID), `targetTitle` (cached display text for offline/fallback), `alias` (optional user-defined display text, for `[[Page|custom text]]` syntax).

**`<a>` tag**: Renders as a link element for accessibility and click handling, with `data-type="wikilink"` for CSS targeting and parseHTML matching.

---

## 4. WYSIWYG Rendering

### Rendering Patterns from Production Apps

**Outline** ([source: `Mentions.tsx:95-131`](https://github.com/outline/outline)): Renders as a styled `<a>` element with:
- Document icon prefix (📄)
- Live-resolved title from document store
- Hover: shows document preview tooltip
- Click: navigates to document

**AFFiNE** ([source: `reference-node.ts:238-293`](https://github.com/toeverything/blocksuite)): Renders as an inline chip/pill with:
- Page icon prefix
- Live-resolved title via reactive signal
- Different styling for deleted docs (strikethrough + disabled color)
- Click: navigates to document or opens in sidebar

### Recommended Rendering

For an agent-native knowledge platform, render as a **clickable inline chip**:

```css
.wikilink {
  background: var(--color-surface-secondary);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--color-text-link);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}
.wikilink:hover {
  background: var(--color-surface-hover);
  text-decoration: underline;
}
.wikilink[data-exists="false"] {
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border-muted);
}
```

---

## 5. Link Resolution Strategy

### ID-Based Resolution (Recommended)

Store a stable UUID `targetId`. Resolve the display title at render time from the knowledge base.

**Why ID-based:**
- Rename-safe: renaming a page requires zero updates to linking documents
- Unambiguous: UUIDs are globally unique; no disambiguation needed
- Collaborative: multiple users can rename pages without conflict
- Agent-compatible: agents can reference pages by ID without worrying about title drift

**Trade-off — Human readability in markdown:**

ID-based links produce opaque markdown like `[Page Title](/doc/550e8400-e29b-41d4-a716-446655440000)` instead of human-readable `[[Page Title]]`. 

**Mitigation:** Store `targetTitle` as a cached snapshot. The markdown serialization becomes:
```markdown
[[Page Title|id:550e8400]]
```

Or, for pure markdown compatibility:
```markdown
[Page Title](/doc/550e8400-e29b-41d4-a716-446655440000 "wikilink")
```

### Resolution Fallback Chain

```
1. targetId → look up document by UUID
   ✓ Found → use current title as display text
   ✗ Not found → step 2

2. targetTitle → search by cached title (fuzzy match)
   ✓ Found → update targetId, display resolved document
   ✗ Not found → step 3

3. Display as broken link (strikethrough/muted, AFFiNE pattern)
   + Offer "Create page" action (Obsidian pattern)
```

---

## 6. Missing Target Handling

### Production Patterns Compared

| App | Visual Treatment | Action on Click |
|---|---|---|
| **Obsidian** | Different text color (lighter/muted) | Creates the target file |
| **Wikipedia** | Red link color | Navigates to edit/create page |
| **AFFiNE** | Strikethrough + disabled color (inline); "Deleted doc" banner (card) | No navigation |
| **Outline** | Falls back to cached label; generic icon | Navigates to 404 page |

### Recommended Approach

Combine the best patterns:

1. **Visual indicator**: Dashed border + muted color (distinguishable but not alarming)
2. **Tooltip**: "This page doesn't exist yet. Click to create."
3. **Click action**: Create the page with the cached title, then navigate to it
4. **Agent interaction**: Agents should be able to detect broken links and either create targets or report them

---

## 7. Rename/Move Propagation

### With ID-Based Linking: No Propagation Needed

This is the primary advantage of ID-based linking. When a page is renamed:

1. The page's metadata (title) is updated
2. All references still point to the same UUID
3. Display text is re-resolved from the updated metadata

**AFFiNE demonstrates this with reactive signals** ([source: `doc-display-meta-service.ts:155-184`](https://github.com/toeverything/blocksuite)):
```typescript
const disposable = this.std.workspace.slots.docListUpdated.subscribe(() => {
  title$.value = doc.meta?.title || 'Untitled';
});
```

Every reference automatically updates when the subscription fires.

### Alias Handling

When a user has set an alias (`[[Page|custom text]]`), renaming the target page should NOT change the alias. The alias is an explicit user choice. Only auto-resolved display text (where alias is null) should update.

### Name-Based Fallback for Markdown Portability

If the platform also supports plain `[[Page Title]]` syntax in raw markdown files (e.g., for git-based workflows), a rename must update all markdown files. This is the Obsidian approach — full vault scan, regex replace. Known limitations:
- Links in code blocks may be incorrectly updated
- Heading references (`[[Page#heading]]`) are not updated when headings change
- Aliased links where alias matches old name get incorrectly rewritten

**Recommendation:** Support name-based resolution as a fallback for imported markdown, but always upgrade to ID-based on first save.

---

## 8. Markdown Serialization via tiptap-markdown

### Architecture

`tiptap-markdown` uses **markdown-it** (not remark/unified) as its parser. The pipeline:

```
Parse:  markdown → markdown-it.render() → HTML → ProseMirror DOMParser → doc
Serialize:  doc → prosemirror-markdown MarkdownSerializerState → markdown string
```

### Extension Registration

**File:** `tiptap-markdown/src/util/extensions.js:4-16`

Any TipTap extension can register markdown handling via `addStorage()`:

```typescript
addStorage() {
  return {
    markdown: {
      serialize(state, node) {
        // Write [[target]] syntax
        const alias = node.attrs.alias;
        const title = node.attrs.targetTitle;
        if (alias && alias !== title) {
          state.write(`[[${title}|${alias}]]`);
        } else {
          state.write(`[[${title}]]`);
        }
      },
      parse: {
        setup(markdownit) {
          // Register markdown-it plugin for [[...]] syntax
          markdownit.use(markdownItWikilinks, {
            // Plugin must render to <a data-type="wikilink" ...>
            // so that parseHTML() can match it
          });
        },
      },
    },
  };
}
```

### The markdown-it Plugin Requirement

Since tiptap-markdown uses markdown-it (not remark), the `remark-wiki-link` package **cannot be used directly**. You need a markdown-it wikilink plugin. Options:

1. **`markdown-it-wikilinks`** (npm) — basic `[[...]]` parser for markdown-it
2. **Custom inline rule** — register with `markdownit.inline.ruler.push('wikilink', rule)`

The plugin must render to HTML that matches the node's `parseHTML()` spec:
```html
<a data-type="wikilink" data-target-id="..." data-target-title="...">Display Text</a>
```

### Best Example in tiptap-markdown Codebase

The task-list extension demonstrates the `parse.setup()` pattern perfectly:

**File:** `tiptap-markdown/src/extensions/nodes/task-list.js:17-20`
```javascript
parse: {
  setup(markdownit) {
    markdownit.use(taskListPlugin);
  },
}
```

---

## 9. remark-wiki-link Architecture (Reference Implementation)

While `remark-wiki-link` cannot be used directly with tiptap-markdown, its architecture is an excellent reference for the AST node design.

### Three-Package Stack

| Layer | Package | Role |
|---|---|---|
| Tokenizer | `micromark-extension-wiki-link` | Character-level `[[...]]` parsing |
| AST | `mdast-util-wiki-link` | Token → `wikiLink` mdast node |
| Plugin | `remark-wiki-link` | Glues above into unified/remark |

### Tokenizer State Machine

The micromark tokenizer ([source: `micromark-extension-wiki-link/src/index.js`](https://github.com/landakram/remark-wiki-link)) is a character-level state machine registered on char code `91` (`[`):

```
start → consumeStart ([[) → consumeData → consumeTarget
  → consumeAliasMarker (:) → consumeAlias → consumeEnd (]])
  → consumeEnd (]]) — if no alias
```

Key behaviors:
- Single-line only (line endings inside `[[...]]` cause failure)
- Empty `[[]]` rejected
- Alias divider is configurable (default `:`, can be `|`)
- No built-in `#heading` fragment parsing

### AST Node Structure

```typescript
{
  type: 'wikiLink',
  value: 'Real Page',           // raw target text
  data: {
    alias: 'Display Text',     // null if no alias
    permalink: 'real_page',    // resolved via pageResolver()
    exists: true,              // true if in permalinks array
    hName: 'a',               // HAST element for rehype
    hProperties: { className: 'internal', href: '#/page/real_page' },
    hChildren: [{ type: 'text', value: 'Display Text' }]
  }
}
```

### Configuration Design (Worth Adopting)

| Option | Purpose | Adaptation for TipTap |
|---|---|---|
| `permalinks` | Known page list for exists-checking | Feed from knowledge base index |
| `pageResolver` | Name → permalink mapping | Name → document ID lookup |
| `hrefTemplate` | Permalink → URL | Document ID → route URL |
| `aliasDivider` | `:`/`\|` separator | Use `\|` for Obsidian compatibility |
| `wikiLinkClassName` | Base CSS class | `'wikilink'` |
| `newClassName` | Class when target missing | `'wikilink-broken'` |

---

## 10. ProseMirror Plugin for `[[` Detection

### Implementation Sketch

The cleanest approach uses TipTap's Suggestion utility directly, with one customization: a custom `findSuggestionMatch` function that handles the `]]` closing delimiter and `|` alias separator.

```typescript
import Suggestion from '@tiptap/suggestion'

function findWikiLinkMatch({ char, $position, allowSpaces }) {
  const text = $position.nodeBefore?.isText && $position.nodeBefore.text
  if (!text) return null

  // Match [[ followed by any non-] characters
  const regex = /\[\[([^\]]*)?$/g
  const match = Array.from(text.matchAll(regex)).pop()
  if (!match || match.index === undefined) return null

  const textFrom = $position.pos - text.length
  const from = textFrom + match.index
  const to = from + match[0].length

  if (from < $position.pos && to >= $position.pos) {
    return {
      range: { from, to },
      query: match[1] || '',
      text: match[0],
    }
  }
  return null
}

// Usage in the Wikilink extension:
addProseMirrorPlugins() {
  return [
    Suggestion({
      editor: this.editor,
      char: '[[',
      allowSpaces: true,
      findSuggestionMatch: findWikiLinkMatch,  // custom override
      items: async ({ query }) => {
        return searchKnowledgeBase(query)
      },
      command: ({ editor, range, props }) => {
        editor.chain().focus().insertContentAt(range, [
          {
            type: 'wikiLink',
            attrs: {
              targetId: props.id,
              targetTitle: props.title,
            },
          },
          { type: 'text', text: ' ' },
        ]).run()
      },
      render: () => wikiLinkPopupRenderer,
    }),
  ]
}
```

### Why Override `findSuggestionMatch`

The default implementation constructs a regex from `char` that works for basic cases, but has two limitations for wikilinks:

1. **`allowToIncludeChar`** logic (line 30 of `findSuggestionMatch.ts`) causes issues when `char` is `[[` because `[` appears in the exclusion character class
2. **No `]]` awareness** — the default regex doesn't know about closing brackets

The custom override uses `/\[\[([^\]]*)?$/g` which correctly matches `[[` followed by any non-`]` characters up to the cursor position.

---

## 11. Architectural Recommendation

For an agent-native knowledge platform built on CRDT + git + MCP:

### Editor Layer

1. **TipTap Wikilink Extension** — custom `Node.create()` modeled on `@tiptap/extension-mention`:
   - Inline, atomic, selectable
   - Attributes: `targetId` (UUID), `targetTitle` (cached), `alias` (optional)
   - Renders as `<a data-type="wikilink">` with chip/pill styling

2. **Suggestion Popup** — use `@tiptap/suggestion` with `char: '[['`, custom `findSuggestionMatch`, and `allowSpaces: true`

3. **Markdown Round-Trip** — via `tiptap-markdown` extension points:
   - Serialize: `[[Title]]` or `[[Title|alias]]`
   - Parse: custom markdown-it inline rule that produces `<a data-type="wikilink">`

### Storage Layer

4. **ID-based linking** — store UUID `targetId` in the node, resolve display text at render time. This eliminates rename propagation entirely.

5. **Cached title** — store `targetTitle` as a creation-time snapshot for offline rendering and broken-link fallback.

6. **Git compatibility** — serialize to markdown with both human-readable title and machine-readable ID:
   ```markdown
   [[Page Title|id:550e8400-e29b-41d4-a716-446655440000]]
   ```
   Or as extended markdown link:
   ```markdown
   [Page Title](/doc/550e8400 "wikilink")
   ```

### Agent Interaction Layer

7. **MCP tool surface** for agents:
   - `resolve_wikilink(title_or_id)` — resolve a wikilink target
   - `list_backlinks(page_id)` — get all pages linking to a given page
   - `create_wikilink(source_id, target_id, alias?)` — insert a wikilink into a document
   - `search_pages(query)` — same API as the suggestion popup uses

8. **Broken link detection** — agents can scan for wikilinks where `targetId` resolves to a deleted/missing page and either create the target or report the broken link.

---

## Evidence Index

| File | Content |
|---|---|
| `evidence/tiptap-suggestion-plugin.md` | TipTap Suggestion utility + Mention extension source analysis |
| `evidence/tiptap-markdown-extension-points.md` | tiptap-markdown parser/serializer architecture and extension API |
| `evidence/remark-wiki-link-tokenizer.md` | remark-wiki-link micromark tokenizer, AST node, configuration |
| `evidence/outline-mention-node.md` | Outline's Mention node, ID-based resolution, backlink tracking |
| `evidence/affine-linked-doc-widget.md` | AFFiNE's reference system, reactive resolution, `[[` trigger |

---

## Sources

- TipTap Suggestion utility: https://github.com/ueberdosis/tiptap/tree/main/packages/suggestion
- TipTap Mention extension: https://github.com/ueberdosis/tiptap/tree/main/packages/extension-mention
- tiptap-markdown: https://github.com/aguingand/tiptap-markdown
- remark-wiki-link: https://github.com/landakram/remark-wiki-link
- micromark-extension-wiki-link: https://github.com/landakram/micromark-extension-wiki-link
- mdast-util-wiki-link: https://github.com/landakram/mdast-util-wiki-link
- Outline editor: https://github.com/outline/outline
- AFFiNE BlockSuite: https://github.com/toeverything/blocksuite
- aarkue/tiptap-wikilink-extension: https://github.com/aarkue/tiptap-wikilink-extension
- benrbray/noteworthy: https://github.com/benrbray/noteworthy
