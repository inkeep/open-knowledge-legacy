# E3: Plugin Ordering — Registration Mechanism and Constraints

**Sources:** remark-mdx, remark-gfm, remark-frontmatter, remark-directive (all from node_modules)

## Registration Pattern (Identical Across All Plugins)

Every remark plugin follows the same `this.data()` accumulation pattern:

```javascript
export default function remarkPlugin(options) {
  const self = this
  const data = self.data()

  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = [])
  const fromMarkdownExtensions = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = [])
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])

  micromarkExtensions.push(/* micromark syntax extension */)
  fromMarkdownExtensions.push(/* mdast-util-from-markdown extension */)
  toMarkdownExtensions.push(/* mdast-util-to-markdown extension */)
}
```

## How Extensions Are Consumed

**remark-parse** reads accumulated extensions:
```javascript
// packages/remark-parse/lib/index.js
self.parser = function (document) {
  return fromMarkdown(document, {
    ...self.data('settings'),
    ...options,
    extensions: self.data('micromarkExtensions') || [],
    mdastExtensions: self.data('fromMarkdownExtensions') || []
  })
}
```

**remark-stringify** reads accumulated extensions:
```javascript
// packages/remark-stringify/lib/index.js
self.compiler = function (tree) {
  return toMarkdown(tree, {
    ...self.data('settings'),
    ...options,
    extensions: self.data('toMarkdownExtensions') || []
  })
}
```

## Ordering Analysis

### Micromark Level

Extensions are **accumulated into arrays** and processed by `combineExtensions()`. At the micromark level, extensions provide construct definitions keyed by character codes. When multiple extensions define constructs for the same character code, they are **merged into arrays** and tried in order.

**Key insight:** micromark constructs are keyed by the character that triggers them. If two extensions both trigger on the same character (e.g., `{`), the first-registered extension's construct is tried first. If it fails (returns `nok`), the next is tried.

### mdast-util Level

- **fromMarkdown extensions:** Handler arrays are concatenated. Each handler specifies which token types it handles. No conflicts unless two extensions handle the same token type (which would be a bug).
- **toMarkdown extensions:** Merged via `configure()` — handlers use `Object.assign()` (last wins), join/unsafe arrays use `push()` (accumulative).

## Conflict Assessment

| Plugin Pair | Conflict Risk | Notes |
|-------------|---------------|-------|
| mdx + gfm | **None** | Different trigger characters (`<`/`{` vs `~`/`\|`) |
| mdx + frontmatter | **None** | Frontmatter triggers on `---`/`+++` at document start; MDX triggers on `<`/`{` |
| mdx + directive | **Low risk** | Both use `:` but in very different patterns. Directives use `:`/`::`/`:::`, MDX does not use colons |
| gfm + frontmatter | **None** | No overlapping trigger characters |
| gfm + directive | **None** | No overlapping trigger characters |
| frontmatter + directive | **None** | Different trigger patterns entirely |

## Recommended Order

While no ordering dependencies exist, this order is conventional and places syntax-claiming extensions before syntax-extending ones:

```javascript
unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])    // 1. Claim frontmatter delimiters first
  .use(remarkMdx)                       // 2. Claim JSX/expression syntax
  .use(remarkGfm)                       // 3. GFM extensions
  .use(remarkDirective)                 // 4. Generic directive syntax (if needed)
  .use(remarkStringify)
```

**Rationale:**
1. Frontmatter first — must recognize `---` as frontmatter delimiter before it's interpreted as a thematic break
2. MDX second — claims `<` and `{` for JSX/expressions before HTML processing
3. GFM third — extends with tables, strikethrough, etc.
4. Directive last — most generic extension

## Verified: No Documentation of Required Ordering

The unified ecosystem documentation does not specify any required ordering between these plugins. The `this.data()` accumulation pattern ensures all extensions are registered before parsing begins, regardless of `.use()` call order. The only ordering that matters is the *array position* of micromark constructs for same-character-code triggers.
