# I4: Schema Attribute + Custom Node Extension Design Sketches

## Conventions

All sketches follow the pattern established by `wiki-link.ts` and `jsx-component.ts`:
- `markdownTokenName` — maps to marked token type for parse dispatch
- `parseMarkdown(token, helpers)` — extracts attrs from token, returns `helpers.createNode()`
- `renderMarkdown(node, helpers, context)` — emits markdown string from attrs
- Fallback: when attr is missing/undefined, emit the default CommonMark canonical form

---

## Tier 2: Attribute Preservation on Existing Nodes

### T2-1: Bullet List Marker (`bulletMarker`)

**Attr:** `bulletMarker: '-' | '*' | '+'` (default `'-'`)

**Parse:** The `list` token has `raw` field. Extract marker from first `list_item.raw`:
```ts
// In bulletList extension override
markdownTokenName: 'list',

parseMarkdown(token, helpers) {
  if (token.ordered) return []; // skip ordered
  const firstRaw = token.items?.[0]?.raw ?? '';
  const marker = firstRaw.match(/^([*+-])/)?.[1] ?? '-';
  const children = helpers.parseChildren(token.items);
  return helpers.createNode('bulletList', { bulletMarker: marker }, children);
},
```

**Render:**
```ts
renderMarkdown(node, helpers, context) {
  const marker = node.attrs?.bulletMarker ?? '-';
  return helpers.renderChildren(node.content, '\n').replace(/^- /gm, `${marker} `);
}
```

**Fallback:** `'-'` — standard Biome/prettier canonical form.  
**LOC:** ~35

---

### T2-2: Ordered List Marker (`listMarkerDelim`)

**Attr:** `listMarkerDelim: '.' | ')'` (default `'.'`)

**Parse:** From `token.raw`, match `/^\d+([.)]) /m`:
```ts
parseMarkdown(token, helpers) {
  if (!token.ordered) return [];
  const delim = token.raw?.match(/^\d+([.)])/m)?.[1] ?? '.';
  const children = helpers.parseChildren(token.items);
  return helpers.createNode('orderedList', {
    start: token.start || 1,
    listMarkerDelim: delim,
  }, children);
},
```

**Render:**
```ts
renderMarkdown(node, helpers, context) {
  const delim = node.attrs?.listMarkerDelim ?? '.';
  const start = node.attrs?.start ?? 1;
  return node.content.map((item, i) => {
    const num = start + i;
    const body = helpers.renderChild(item, i);
    return `${num}${delim} ${body}`;
  }).join('\n');
}
```

**Fallback:** `'.'` — CommonMark canonical.  
**LOC:** ~40

---

### T2-3: Emphasis Delimiter (`emphDelimiter`)

**Attr on `italic` mark:** `emphDelimiter: '*' | '_'` (default `'*'`)  
**Attr on `bold` mark:** `strongDelimiter: '**' | '__'` (default `'**'`)

**Parse:** The `em`/`strong` tokens expose `raw`. Inspect first char:
```ts
// italic mark extension
markdownTokenName: 'em',
parseMarkdown(token, helpers) {
  const delim = token.raw?.startsWith('_') ? '_' : '*';
  return helpers.applyMark('italic', helpers.parseInline(token.tokens), { emphDelimiter: delim });
},

// bold mark extension
markdownTokenName: 'strong',
parseMarkdown(token, helpers) {
  const delim = token.raw?.startsWith('__') ? '__' : '**';
  return helpers.applyMark('bold', helpers.parseInline(token.tokens), { strongDelimiter: delim });
},
```

**Render:** Wrap rendered children with stored delimiter:
```ts
// italic
renderMarkdown(node, helpers) {
  const d = node.attrs?.emphDelimiter ?? '*';
  return `${d}${helpers.renderChildren(node.content)}${d}`;
}
// bold
renderMarkdown(node, helpers) {
  const d = node.attrs?.strongDelimiter ?? '**';
  return `${d}${helpers.renderChildren(node.content)}${d}`;
}
```

**Fallback:** `'*'` / `'**'` — matches marked defaults.  
**LOC:** ~30 per mark (60 total)

---

### T2-4: Code Fence Delimiter (`fenceDelimiter`)

**Attr:** `fenceDelimiter: '`' | '~'` (default `` '`' ``)

**Parse:** `code` token `raw` field starts with the fence sequence:
```ts
markdownTokenName: 'code',
parseMarkdown(token, helpers) {
  if (token.codeBlockStyle === 'indented') {
    return helpers.createNode('codeBlock', { language: null, fenceDelimiter: '`' });
  }
  const fence = token.raw?.match(/^([`~]+)/)?.[1] ?? '```';
  const delim = fence[0] as '`' | '~';
  const fenceLen = fence.length;
  return helpers.createNode('codeBlock', {
    language: token.lang || null,
    fenceDelimiter: delim,
    fenceLength: fenceLen,
  }, [helpers.createTextNode(token.text)]);
},
```

**Render:**
```ts
renderMarkdown(node, helpers) {
  const delim = node.attrs?.fenceDelimiter ?? '`';
  const len = node.attrs?.fenceLength ?? 3;
  const fence = delim.repeat(len);
  const lang = node.attrs?.language ?? '';
  const text = node.content?.[0]?.text ?? '';
  return `${fence}${lang}\n${text}\n${fence}`;
}
```

**Fallback:** 3 backticks.  
**LOC:** ~40

---

### T2-5: Heading Form (`headingStyle`)

**Attr:** `headingStyle: 'atx' | 'setext'` (default `'atx'`)

**Parse:** marked produces `heading` token. Setext detection from `raw`:
```ts
markdownTokenName: 'heading',
parseMarkdown(token, helpers) {
  const raw = token.raw ?? '';
  // Setext headings have underline of = or - on next line
  const isSetext = /\n[=-]+\s*$/.test(raw);
  return helpers.createNode('heading', {
    level: token.depth,
    headingStyle: isSetext ? 'setext' : 'atx',
  }, helpers.parseInline(token.tokens));
},
```

**Render:**
```ts
renderMarkdown(node, helpers) {
  const level = node.attrs?.level ?? 1;
  const style = node.attrs?.headingStyle ?? 'atx';
  const text = helpers.renderChildren(node.content);
  if (style === 'setext' && level <= 2) {
    const char = level === 1 ? '=' : '-';
    return `${text}\n${char.repeat(Math.max(text.length, 3))}`;
  }
  return `${'#'.repeat(level)} ${text}`;
}
```

**Fallback:** ATX form.  
**LOC:** ~35

---

### T2-6: Thematic Break Char (`hrChar`)

**Attr:** `hrChar: '-' | '*' | '_'`, `hrRaw: string` (default `'---'`)

**Parse:** `hr` token has `raw`:
```ts
markdownTokenName: 'hr',
parseMarkdown(token, helpers) {
  const raw = (token.raw ?? '---').trim();
  return helpers.createNode('horizontalRule', { hrRaw: raw });
},
```

**Render:**
```ts
renderMarkdown(node) {
  return node.attrs?.hrRaw ?? '---';
}
```

**Fallback:** `'---'`.  
**LOC:** ~15

---

### T2-7: Reference Link vs Inline Link (`linkStyle`)

**Attr on `link` mark:** `linkStyle: 'inline' | 'full' | 'collapsed' | 'shortcut'`, `refLabel?: string`

**Parse:** marked `link` token does not directly expose reference form — but `raw` does:
```ts
markdownTokenName: 'link',
parseMarkdown(token, helpers) {
  const raw = token.raw ?? '';
  let linkStyle: string = 'inline';
  let refLabel: string | null = null;

  if (/\]\[/.test(raw)) { linkStyle = 'full'; refLabel = raw.match(/\]\[([^\]]+)\]/)?.[1] ?? null; }
  else if (/\]\[\]/.test(raw)) { linkStyle = 'collapsed'; }
  else if (/^\[([^\]]+)\](?!\()/.test(raw)) { linkStyle = 'shortcut'; }

  return helpers.applyMark('link', helpers.parseInline(token.tokens), {
    href: token.href, title: token.title, linkStyle, refLabel,
  });
},
```

**Render:** For `inline`, emit `[text](url "title")`. For ref styles, emit `[text][label]` and register the definition for doc-footer emission. Requires doc-level state (see Tier 3 T3-2).

**Fallback:** `'inline'` — always safe.  
**LOC:** ~50 (parse), render depends on T3-2 definition node.

---

## Tier 3: Custom Node Types

### T3-1: HTML Block (`htmlBlock`)

A first-class atomic block node preserving raw HTML verbatim.

```ts
export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  priority: 55,

  addAttributes() {
    return { content: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]', getAttrs: (n) => ({ content: n.getAttribute('data-content') }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-html-block': '', 'data-content': HTMLAttributes.content }];
  },

  markdownTokenName: 'html',
  parseMarkdown(token, helpers) {
    if (!token.block) return []; // inline HTML handled elsewhere
    return helpers.createNode('htmlBlock', { content: token.raw ?? token.text });
  },
  renderMarkdown(node) {
    return node.attrs?.content ?? '';
  },
});
```

**Fallback:** Empty string.  
**LOC:** ~35

---

### T3-2: Link Reference Definition (`linkRefDef`)

Stores `[label]: url "title"` definitions to enable reference-link round-trip.

**Design Option A (recommended): Doc-footer invisible node.**

```ts
export const LinkRefDef = Node.create({
  name: 'linkRefDef',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      label: { default: '' },
      href: { default: '' },
      title: { default: null },
    };
  },

  markdownTokenName: 'def',
  parseMarkdown(token, helpers) {
    return helpers.createNode('linkRefDef', {
      label: token.tag, href: token.href, title: token.title || null,
    });
  },
  renderMarkdown(node) {
    const { label, href, title } = node.attrs ?? {};
    const titlePart = title ? ` "${title}"` : '';
    return `[${label}]: ${href}${titlePart}`;
  },
});
```

**Design Option B:** Store defs in `Y.Map('linkDefs')` side-channel, inject at serialize time.  
**Design Option C:** Per-link `refDef` embedded attr — no separate node, reconstruct at render.

Option A is simplest for lossless round-trip; B enables collaborative deduplication; C avoids a new node type but complicates rendering.

**Fallback:** When no `linkRefDef` nodes exist, reference-style links downgrade to inline.  
**LOC:** ~40 (Option A)

---

### T3-3: Hard Break Syntax Form (`hardBreakStyle`)

**Attr on `hardBreak` node:** `hardBreakStyle: 'backslash' | 'spaces'` (default `'backslash'`)

```ts
// Override existing hardBreak extension
markdownTokenName: 'br',
parseMarkdown(token, helpers) {
  const raw = token.raw ?? '';
  const style = raw.includes('\\') ? 'backslash' : 'spaces';
  return helpers.createNode('hardBreak', { hardBreakStyle: style });
},
renderMarkdown(node) {
  const style = node.attrs?.hardBreakStyle ?? 'backslash';
  return style === 'backslash' ? '\\\n' : '  \n';
}
```

**Fallback:** Backslash form (visible, explicit).  
**LOC:** ~20

---

## Summary Table

| Item | Attr(s) | Token Source | Est. LOC |
|------|---------|-------------|----------|
| T2-1 Bullet marker | `bulletMarker` | `list_item.raw` | 35 |
| T2-2 Ordered marker | `listMarkerDelim` | `list.raw` | 40 |
| T2-3 Emphasis delim | `emphDelimiter`, `strongDelimiter` | `em.raw`, `strong.raw` | 60 |
| T2-4 Code fence | `fenceDelimiter`, `fenceLength` | `code.raw` | 40 |
| T2-5 Heading style | `headingStyle` | `heading.raw` | 35 |
| T2-6 Thematic break | `hrRaw` | `hr.raw` | 15 |
| T2-7 Ref link | `linkStyle`, `refLabel` | `link.raw` | 50 |
| T3-1 HTML block | `content` (atom) | `html.block=true` | 35 |
| T3-2 Link ref def | `label`, `href`, `title` (atom) | `def` token | 40 |
| T3-3 Hard break | `hardBreakStyle` | `br.raw` | 20 |
| **Total** | | | **~370** |

## Key Implementation Notes

1. **Token `raw` is the primary source** — marked preserves original source text in every token's `raw` field, which is sufficient for all Tier 2 extractions without custom tokenizers.

2. **No custom tokenizers needed for Tier 2** — all items use standard marked token types and extract attrs from `raw`. Custom tokenizers (like wiki-link's) are only needed for syntax marked doesn't recognize.

3. **Extension override pattern** — Tier 2 items override the existing extensions (heading, codeBlock, bulletList, orderedList, italic, bold, hardBreak, horizontalRule). Use same `markdownTokenName` with higher `priority` value.

4. **Mark attrs require `addAttributes` on the Mark** — emphasis/bold/link need mark-level attrs, supported by TipTap's mark attribute system.

5. **Doc-level coordination for T2-7 + T3-2** — reference links need the definitions to be present in the serialized output. Option A co-locates them as block nodes; serialization order must place them after the last paragraph that references them (or at document end).
