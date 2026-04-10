# Evidence: D4 — "Lossless-Enough" TipTap Configuration

**Dimension:** D4 — What does a TipTap configuration look like that maximizes round-trip fidelity
**Date:** 2026-04-07
**Sources:** @tiptap/markdown v3 source code, TipTap extension API documentation, prosemirror-markdown schema analysis

---

## Key files referenced

- `@tiptap/markdown/src/MarkdownManager.ts` — `registerTokenizer()` method for custom tokenizers
- `@tiptap/markdown/src/Extension.ts` — `markdownTokenizer`, `parseMarkdown`, `renderMarkdown` config
- `tiptap-markdown/src/extensions/tiptap/tight-lists.js` — tight list extension pattern
- https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-parsing
- https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-serializing
- https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer

---

## Findings

### Finding: A "lossless-enough" configuration requires 4 custom fixes totaling ~150-200 lines of code

**Confidence:** INFERRED

Based on the D3 classification, the fixable losses and their implementation cost:

#### Fix 1: Frontmatter strip/prepend wrapper (~30 lines)

```typescript
// Pseudocode — wrap parse/serialize to handle frontmatter
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

function parseFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
  const match = markdown.match(FRONTMATTER_RE);
  if (match) {
    return { frontmatter: match[0], body: markdown.slice(match[0].length) };
  }
  return { frontmatter: null, body: markdown };
}

function serializeWithFrontmatter(frontmatter: string | null, body: string): string {
  return frontmatter ? frontmatter + body : body;
}
```

This wraps the parse/serialize calls. Frontmatter is stored separately (e.g., in editor metadata, a Yjs map, or a document attribute) and re-prepended on serialize. The frontmatter string survives byte-identical because it's never parsed by the markdown engine.

**Cost:** ~30 lines. Trivial.

#### Fix 2: Tight/loose list preservation (~40-60 lines)

Requires a custom TipTap extension that:
1. Adds a `tight` attribute to the BulletList and OrderedList schemas
2. Provides `parseMarkdown` that reads the `loose` property from marked's list token
3. Provides `renderMarkdown` that emits blank lines between items for loose lists

```typescript
// Pseudocode for the parseMarkdown handler
parseMarkdown(token, helpers) {
  const items = token.items?.map(item => helpers.parseChildren(item.tokens));
  return {
    type: 'bulletList',
    attrs: { tight: !token.loose },
    content: items.map(itemContent => ({ type: 'listItem', content: itemContent })),
  };
}

// Pseudocode for the renderMarkdown handler  
renderMarkdown(node, helpers, context) {
  const isTight = node.attrs?.tight !== false;
  const separator = isTight ? '\n' : '\n\n';
  const items = node.content?.map((item, i) => {
    const content = helpers.renderChild(item, i);
    return `- ${content}`;
  });
  return items?.join(separator) + '\n';
}
```

**Cost:** ~40-60 lines across parseMarkdown + renderMarkdown + schema extension.

#### Fix 3: Task list support (~20 lines if using TipTap extensions)

@tiptap/extension-task-list and @tiptap/extension-task-item exist. The @tiptap/markdown v3 MarkdownManager already has special handling for task list tokens (see `parseListToken()` which splits mixed lists into task/non-task groups). The extensions just need to be included and configured with parseMarkdown/renderMarkdown handlers.

If using the official TipTap task list extensions, the fix is mostly configuration:

```typescript
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

// Include in editor extensions
extensions: [
  TaskList,
  TaskItem.configure({ nested: true }),
]
```

The task list markdown handlers may need custom renderMarkdown to emit `- [x]` / `- [ ]` syntax.

**Cost:** ~20 lines of custom renderMarkdown + configuration.

#### Fix 4: Normalize-on-first-load strategy (~10-20 lines)

Since the round-trip converges after 1 cycle, the "lossless-enough" strategy is:
1. On first load of a .md file, run one parse-serialize cycle to normalize
2. Store the normalized form as the baseline
3. All subsequent round-trips produce identical output

```typescript
function normalizeMarkdown(md: string, manager: MarkdownManager): string {
  const { frontmatter, body } = parseFrontmatter(md);
  const json = manager.parse(body);
  const normalized = manager.serialize(json);
  return serializeWithFrontmatter(frontmatter, normalized);
}
```

This means the first save after opening a file may produce a diff (normalizing formatting), but subsequent saves are stable.

**Cost:** ~10-20 lines.

### Finding: What remains unfixable after all fixes

**Confidence:** CONFIRMED

After applying all 4 fixes, the remaining losses are:

1. **Reference-style links → inline links** — Semantic content preserved, formatting choice lost. Acceptable.
2. **Indented code → fenced code** — Lossless upgrade. Acceptable.
3. **Backslash hard breaks ↔ trailing space hard breaks** — One-time normalization to chosen style. Acceptable.
4. **Escaped characters** — Backslash escapes consumed when unnecessary. Context-dependent re-escaping works for most cases. Edge cases exist but are rare.
5. **HTML blocks** — Entity-encoded. Can be fixed with custom htmlBlock node but adds complexity. Depends on whether the project needs raw HTML support.
6. **Extra blank lines between blocks** — Partially preserved via empty paragraphs. Exact count may differ. Acceptable for knowledge platform use case.
7. **Table formatting** — Cell padding and dash counts reformatted. Content preserved. Acceptable.
8. **Nested blockquote syntax** — `>>` → `> >` with blank lines. Semantically identical. Acceptable.

### Finding: Total implementation cost is ~150-200 lines of TypeScript

**Confidence:** INFERRED

Breakdown:
- Frontmatter wrapper: 30 lines
- Tight/loose list extension: 50 lines
- Task list renderMarkdown: 20 lines
- Normalize-on-load: 15 lines
- Configuration / glue: 35 lines
- **Total: ~150 lines**

This estimate does not include tests. With tests, approximately 300-400 lines.

---

## Gaps / follow-ups

- The tight/loose list fix needs live testing with @tiptap/markdown v3's actual token structure
- Task list checkbox rendering needs verification with the official extensions
- The normalize-on-first-load strategy needs UX consideration (user sees a diff on first save)
