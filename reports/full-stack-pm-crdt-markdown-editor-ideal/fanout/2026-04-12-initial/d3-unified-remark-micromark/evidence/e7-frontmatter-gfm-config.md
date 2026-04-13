# E7: remark-frontmatter and remark-gfm Configuration

## remark-frontmatter

**Package:** `remark-frontmatter` (latest)
**Micromark extension:** `micromark-extension-frontmatter`

### Options Type

```typescript
type Options = Array<Matter | Preset> | Matter | Preset

type Preset = 'yaml' | 'toml'

// Marker-based (single char repeated 3x)
interface MatterMarker {
  type: string;                    // Node type name
  marker: string | { open: string; close: string };
  anywhere?: boolean;              // Allow non-start (discouraged)
}

// Fence-based (complete string delimiters)
interface MatterFence {
  type: string;
  fence: string | { open: string; close: string };
  anywhere?: boolean;
}

type Matter = MatterMarker | MatterFence
```

### Presets

| Preset | Node Type | Delimiter | Example |
|--------|-----------|-----------|---------|
| `'yaml'` | `yaml` | `---` | `---\ntitle: Hello\n---` |
| `'toml'` | `toml` | `+++` | `+++\ntitle = "Hello"\n+++` |

### Configuration Examples

```javascript
// YAML only (default)
.use(remarkFrontmatter)
// or
.use(remarkFrontmatter, ['yaml'])

// YAML + TOML
.use(remarkFrontmatter, ['yaml', 'toml'])

// Custom matter type
.use(remarkFrontmatter, [{
  type: 'json',
  fence: { open: '{', close: '}' }
}])

// Custom marker
.use(remarkFrontmatter, [{
  type: 'custom',
  marker: { open: '<', close: '>' }
  // Produces: <<<\ncontent\n>>>
}])
```

### Trade-offs: YAML Only vs YAML + TOML

| Factor | YAML Only | YAML + TOML |
|--------|-----------|-------------|
| Ecosystem support | Universal (Hugo, Jekyll, Docusaurus, MDX) | TOML mainly Hugo |
| `---` ambiguity | None | None (different delimiters) |
| Parser weight | Minimal | Slightly more micromark constructs |
| User expectation | Standard | Niche |

**Recommendation:** YAML-only for our use case. TOML support adds complexity for a format rarely used outside Hugo.

---

## remark-gfm

**Package:** `remark-gfm@4.0.1`
**Micromark extension:** `micromark-extension-gfm@3.0.0`

### Options Type

```typescript
interface Options extends MicromarkOptions, MdastOptions {
  // From micromark-extension-gfm-strikethrough
  singleTilde?: boolean;  // Allow ~text~ (default: true)

  // From mdast-util-gfm (serialization)
  firstLineBlank?: boolean;     // Blank line before footnote defs
  tableCellPadding?: boolean;   // Space between pipes and cells
  tablePipeAlign?: boolean;     // Align table pipes
  stringLength?: (value: string) => number;  // Custom width calc
}
```

### Feature Bundle

`remark-gfm` is **all-or-nothing** at the plugin level. It bundles:

1. **Autolink literals** — `www.example.com`, `user@example.com`
2. **Footnotes** — `[^1]` / `[^1]: definition`
3. **Strikethrough** — `~~deleted~~` (and optionally `~deleted~`)
4. **Tables** — `| cell | cell |`
5. **Task list items** — `- [x] done`, `- [ ] todo`

### Internal Composition

```javascript
// micromark-extension-gfm/index.js
export function gfm(options) {
  return combineExtensions([
    gfmAutolinkLiteral(),
    gfmFootnote(),
    gfmStrikethrough(options),  // Only sub-extension with options
    gfmTable(),
    gfmTaskListItem()
  ])
}
```

### Selective Feature Enable

**At remark-gfm level:** Not possible. All five features are always enabled.

**At micromark level:** Yes. Compose your own plugin using individual extensions:

```javascript
// Custom "tables-only" plugin
import { gfmTable } from 'micromark-extension-gfm-table'
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table'

function remarkGfmTablesOnly() {
  const data = this.data()
  const micro = data.micromarkExtensions || (data.micromarkExtensions = [])
  const from = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = [])
  const to = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])

  micro.push(gfmTable())
  from.push(gfmTableFromMarkdown())
  to.push(gfmTableToMarkdown())
}
```

**Third-party option:** `remark-gfm-configurable` (npm) provides per-feature toggles:
```javascript
.use(remarkGfmConfigurable, {
  table: true,
  strikethrough: true,
  taskList: true,
  autolink: true,
  footnote: false  // Disable footnotes
})
```

### Individual Extension Packages

| Feature | Micromark | mdast-util | Node Types |
|---------|-----------|-----------|------------|
| Autolink | `micromark-extension-gfm-autolink-literal` | `mdast-util-gfm-autolink-literal` | Reuses `link` |
| Footnotes | `micromark-extension-gfm-footnote` | `mdast-util-gfm-footnote` | `footnoteDefinition`, `footnoteReference` |
| Strikethrough | `micromark-extension-gfm-strikethrough` | `mdast-util-gfm-strikethrough` | `delete` |
| Tables | `micromark-extension-gfm-table` | `mdast-util-gfm-table` | `table`, `tableRow`, `tableCell` |
| Task lists | `micromark-extension-gfm-task-list-item` | `mdast-util-gfm-task-list-item` | Reuses `listItem` (adds `checked`) |
| Tag filter | `micromark-extension-gfm-tagfilter` | — | HTML output only |

### Recommendation for Our Pipeline

Use **full `remark-gfm`** rather than selective features:
1. The bundle is lightweight — no meaningful size/performance difference
2. All five features are standard in GitHub-flavored content
3. Footnotes may not be in our current schema, but they're harmless to parse and can be serialized as-is
4. Selective composition adds maintenance burden for no benefit
