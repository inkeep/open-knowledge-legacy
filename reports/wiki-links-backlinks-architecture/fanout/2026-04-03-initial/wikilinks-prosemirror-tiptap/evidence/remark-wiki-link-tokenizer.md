# Evidence: remark-wiki-link Tokenizer Architecture

**Source:** Three-package stack: `remark-wiki-link`, `mdast-util-wiki-link`, `micromark-extension-wiki-link`  
**Repo:** https://github.com/landakram/remark-wiki-link  
**Local path:** `/Users/edwingomezcuellar/.claude/oss-repos/remark-wiki-link/`

## Three-Package Stack

| Package | Role |
|---|---|
| `micromark-extension-wiki-link` | Character-level tokenizer (state machine) |
| `mdast-util-wiki-link` | Token → mdast AST node construction + serialization |
| `remark-wiki-link` | Remark plugin glue (registers above two into unified) |

---

## Micromark Tokenizer: State Machine

**File:** `node_modules/micromark-extension-wiki-link/src/index.js`

### Registration (line 160)

```javascript
return { text: { 91: call } }  // char code 91 = '['
```

### State Transitions

1. **`start`** (line 36): Checks first `[`. Enters token `wikiLink` + `wikiLinkMarker`.
2. **`consumeStart`** (line 45): Consumes second `[`. After both consumed, exits `wikiLinkMarker`, enters `consumeData`.
3. **`consumeData`** (line 61): Enters `wikiLinkData` + `wikiLinkTarget`. Fails (`nok`) on line endings.
4. **`consumeTarget`** (line 71): Consumes target characters. Transitions:
   - Alias divider (default `:`) → exits target, enters `wikiLinkAliasMarker`
   - `]` → exits target+data, enters `wikiLinkMarker` for closing
   - Line ending/EOF → `nok`
   - Empty target (no non-whitespace data seen) → `nok` (lines 91-93)
5. **`consumeAliasMarker`** (line 100): Consumes multi-character alias divider.
6. **`consumeAlias`** (line 117): Consumes alias text until `]]`.
7. **`consumeEnd`** (line 139): Consumes closing `]]`. Exits all tokens.

### Token Structure

```
wikiLink (container)
  ├── wikiLinkMarker (the '[[')
  ├── wikiLinkData (container)
  │   ├── wikiLinkTarget ("Real Page")
  │   ├── wikiLinkAliasMarker (":" or "|")
  │   └── wikiLinkAlias ("Page Alias")
  └── wikiLinkMarker (the ']]')
```

### Key Behaviors

- Single-line only — any line ending inside `[[...]]` causes `nok`
- Empty `[[]]` rejected — `data` flag on line 73/91
- Empty alias `[[Page:]]` rejected — `alias` flag on line 119
- Alias divider is configurable, can be multi-character
- NO built-in `#heading` fragment support — `#` consumed as part of target string

---

## AST Node: mdast `wikiLink`

**File:** `node_modules/mdast-util-wiki-link/src/from-markdown.ts`

### Initial Node (lines 19-28)

```typescript
{
  type: 'wikiLink',
  value: null,
  data: { alias: null, permalink: null, exists: null }
}
```

### Fully Resolved Node (lines 48-86)

```typescript
{
  type: 'wikiLink',
  value: 'Real Page',               // raw target text
  data: {
    alias: 'Page Alias',            // display text (= value if no alias)
    permalink: 'real_page',          // from pageResolver
    exists: false,                   // true if in permalinks array
    hName: 'a',                      // HAST element name
    hProperties: {
      className: 'internal new',     // 'new' when exists=false
      href: '#/page/real_page'       // from hrefTemplate
    },
    hChildren: [{
      type: 'text',
      value: 'Page Alias'
    }]
  }
}
```

---

## Configuration Options

| Option | Default | Description |
|---|---|---|
| `permalinks` | `[]` | Known permalink strings; matches set `exists=true` |
| `pageResolver` | `name => [name.replace(/ /g, '_').toLowerCase()]` | Maps page name → permalink candidates |
| `hrefTemplate` | `` permalink => `#/page/${permalink}` `` | Maps permalink → `href` value |
| `wikiLinkClassName` | `'internal'` | CSS class always applied |
| `newClassName` | `'new'` | Additional class when `exists=false` |
| `aliasDivider` | `':'` | Separator in `[[Target:Alias]]` |

### Page Resolution Logic (from-markdown.ts, lines 52-61)

1. Call `pageResolver(wikiLink.value)` → array of permalink candidates
2. Search candidates against `permalinks` array
3. First match → `exists = true`, use that permalink
4. No match → `exists = false`, use `pagePermalinks[0]`

---

## Remark Plugin Integration

**File:** `src/index.ts`, lines 6-30

```typescript
function wikiLinkPlugin(this: any, opts = {}) {
  const data = this.data()
  add('micromarkExtensions', syntax(opts))         // tokenizer
  add('fromMarkdownExtensions', fromMarkdown(opts)) // mdast builder
  add('toMarkdownExtensions', toMarkdown(opts))     // serializer
}
```

---

## Serialization Back to Markdown

**File:** `node_modules/mdast-util-wiki-link/src/to-markdown.ts`

Serializes `wikiLink` nodes back to `[[Target]]` or `[[Target:Alias]]` format using the configured `aliasDivider`.

---

## TipTap Integration Assessment

**Cannot integrate directly** — TipTap does not use the unified/remark/micromark pipeline.

**Integration paths:**
1. **Remark as preprocessor** — use full remark pipeline to convert markdown → HTML, then feed to TipTap
2. **Port the tokenizer logic** — reimplement the state machine as a markdown-it inline rule for tiptap-markdown
3. **Reference implementation** — use the AST node structure and configuration design as a model for a TipTap node
