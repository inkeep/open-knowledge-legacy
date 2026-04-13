# Evidence: D2 — Unknown-Component Degradation & Error UX

**Dimension:** Unknown-component degradation & error UX
**Date:** 2026-04-12
**Sources:** `~/.claude/oss-repos/tinacms` (HEAD c33e3d1); TinaCMS docs; GitHub issues

---

## Key files / pages referenced

- `packages/@tinacms/mdx/src/parse/index.ts:101-166` — top-level `parseMDX` try/catch and `invalidMarkdown()` node factory
- `packages/@tinacms/mdx/src/parse/mdx.ts:39-87` — `mdxJsxElement` handling: unknown-component-as-HTML fallback
- `packages/@tinacms/mdx/src/parse/remarkToPlate.ts:113-135, 394-405, 513-520` — `throw new RichTextParseError` sites
- `packages/@tinacms/mdx/src/parse/acorn.ts:24-29, 36-43` — extra/unknown prop throws during `extractAttributes`
- `packages/@tinacms/mdx/src/stringify/index.ts:52-54` — `invalid_markdown` stringifier returns original `value`
- `packages/@tinacms/mdx/src/stringify/acorn.ts:73, 84-90` — unknown component at stringify-time throws; unknown props silently dropped
- `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-invalid-markdown-plugin/index.tsx` — red error block UI
- `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/monaco/index.tsx:60-97, 145-157` — Monaco raw-mode editor
- `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/index.tsx:78-89` — form validation `'Unable to parse rich-text'`
- `packages/tinacms/src/rich-text/index.tsx:383-465, 526-527` — runtime renderer fallback
- `packages/@tinacms/graphql/src/resolver/index.ts:96-113` — GraphQL audit mode throws
- `packages/@tinacms/mdx/src/next/tests/markdown-shortcodes-invalid-{2,3,4}/` — snapshot tests for graceful fallback
- GitHub issue [#2881](https://github.com/tinacms/tinacms/issues/2881) — acorn parsing crash on shortcodes
- GitHub PR [#3055](https://github.com/tinacms/tinacms/pull/3055) — "no-mdx" parser path
- GitHub discussion [#2571](https://github.com/tinacms/tinacms/discussions/2571) — raw-mode toggle origin
- [TinaCMS Rich-Text Fields docs](https://tina.io/docs/reference/types/rich-text)

---

## Findings

### Finding 1: Unknown/undeclared JSX components are preserved as raw HTML blocks, not errored

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/mdx/src/parse/mdx.ts:40-55`

```ts
const template = field.templates?.find((template) => ... === node.name);
...
if (!template) {
  const string = toTinaMarkdown({ type: 'root', children: [node] }, field);
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'html' : 'html_inline',
    value: string.trim(),
    children: [{ type: 'text', text: '' }],
  };
}
```

When the editor encounters `<Foo />` with no matching template, Tina does NOT throw — it re-stringifies the JSX node to source text and stores it as an `html` node. The editor renders these as a plain HTML block ("so they remain editable" per comment in `remarkToPlate.ts:139-140`). The original source text is preserved byte-for-byte in the `value` field, so save round-trips don't lose the component.

**Implications for OK:** This is the key insight. Preserve unknown structure as opaque text nodes rather than hard-failing. OK should copy this "container-of-source" escape hatch for any MDX construct outside the known extension set — aligns with OK's NG4 (no storage-layer sanitization) and NG3 (constructs outside extension set are not semantically preserved but should survive round-trip).

---

### Finding 2: Expression props (`data={obj}`) and ESM (`export const x = ...`) hard-fail into a block-level error UI

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/mdx/src/parse/remarkToPlate.ts:113-123, 394-401`; `packages/@tinacms/mdx/src/next/parse/post-processing.ts:22-26`

Legacy parser:
```ts
case 'mdxFlowExpression':
case 'mdxjsEsm':
  throw new RichTextParseError(
    `Unexpected expression ${content.value}.`,
    content.position
  );
case 'mdxTextExpression':
  throw new RichTextParseError(`Unexpected expression ${content.value}.`, content.position);
```

Next parser for props:
```ts
if (attribute.type === 'mdxJsxAttribute') {
  props[attribute.name] = attribute.value;
} else {
  throw new Error('HANDLE mdxJsxExpressionAttribute');
}
```

The throw bubbles to `parseMDX`'s catch (index.ts:138-143), which converts the error into a single top-level `invalid_markdown` root node containing the full original source. **The whole file becomes one error block** — parsing is all-or-nothing at the document level.

**Implications for OK:** Tina treats expression props and ESM as fatal because they cannot be safely round-tripped without a JS runtime. OK already avoids this. If OK ever accepts MDX with such constructs, apply the same whole-document-fail-soft pattern: capture source intact rather than partial recovery that risks data loss.

---

### Finding 3: The `invalid_markdown` node is the universal "I couldn't parse this" carrier — and preserves the original source

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/mdx/src/parse/index.ts:146-166`; `packages/@tinacms/mdx/src/stringify/index.ts:51-54`

Parse side:
```ts
export const invalidMarkdown = (e: RichTextParseError, value: string): Plate.RootElement => {
  return {
    type: 'root',
    children: [{
      type: 'invalid_markdown',
      value,                       // ← entire original source
      message: e.message || `Error parsing markdown ${MDX_PARSE_ERROR_MSG}`,
      children: [{ type: 'text', text: '' }],
      ...extra,
    }],
  };
};
```

Stringify side (round-trip):
```ts
if (value?.children[0]) {
  if (value?.children[0].type === 'invalid_markdown') {
    return value.children[0].value;   // ← emits original verbatim
  }
}
```

The editor can neither parse nor edit, BUT saving is safe — raw source is re-emitted unchanged. Zero silent data loss.

**Implications for OK:** Elegant pattern. OK's fidelity-first storage contract would benefit from an equivalent "opaque document" sentinel: on parse failure, retain source string on a root-level node and pass through untouched. Prevents the worst failure mode without requiring the bridge to succeed.

---

### Finding 4: The editor UX is a red error block with a "Switch to raw-mode" button — not greyed-out document or silent drop

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/plate/plugins/create-invalid-markdown-plugin/index.tsx:33-55`

```tsx
<div contentEditable={false} className='bg-red-50 sm:rounded-lg'>
  <h3 className='text-lg leading-6 font-medium text-red-800'>
    ❌ Error parsing markdown
  </h3>
  <p>{message}</p>
  <p>To fix these errors, edit the content in raw-mode.</p>
  <button onClick={() => setRawMode(true)}>Switch to raw-mode</button>
</div>
```

Message format: `"<error.message> at line: X, column: Y"`. Node is `contentEditable={false}` (Plate void element with `isVoid: true`), so the user cannot click into it — they MUST switch to raw mode or leave the document.

**Implications for OK:** OK should avoid this pattern's sharpest edge (WYSIWYG becomes useless for the whole file on a single bad construct). But "error block inline in the tree + escape hatch button" is a clean UX when partial recovery isn't possible. OK's competitive differentiator: **block-level error scoping** (isolate the bad region, keep the rest editable) rather than document-level.

---

### Finding 5: Monaco raw-mode is the escape hatch, with inline error markers (squiggles) at failing position

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/fields/plugins/mdx-field-plugin/monaco/index.tsx:46-97`

```ts
const [rawMode, setRawMode] = React.useState(false);
// In raw mode:
React.useEffect(() => {
  const parsedValue = parseMDX(value, field, (value) => value);
  if (parsedValue.children[0]?.type === 'invalid_markdown') {
    setError(parsedValue.children[0]);
    return;                                 // ← don't commit to form state
  }
  props.input.onChange(parsedValue);
  setError(null);
}, [JSON.stringify(debouncedValue)]);

monaco.editor.setModelMarkers(..., [{
  ...errorMessage.position,
  message: errorMessage.message,
  severity: 8,
}]);
```

Raw mode is debounced (500ms). On parse failure, form state is NOT updated (stays last-known-valid). When the edit parses cleanly, the form updates. Raw mode is also directly accessible from the toolbar — not only as error recovery.

**Implications for OK:** OK already has dual-mode WYSIWYG + CodeMirror source via Y.Text bridge. Tina's raw-mode validates the approach. Worth stealing: **don't commit form state while current source is unparseable** — prevents rich-text from being overwritten by transient bad state during typing.

---

### Finding 6: Malformed directive/shortcode syntax degrades gracefully to plain paragraph text, not errors

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/mdx/src/next/tests/markdown-shortcodes-invalid-{2,3,4}/node.json`; `packages/@tinacms/mdx/src/parse/mdx.ts:110-115`

Input `Unexpected attribute in closing {{% /some-feature a="b" %}} tag turns into regular text` produces:
```json
{ "type": "root", "children": [{
  "type": "p",
  "children": [{ "type": "text", "text": "Unexpected attribute in closing {{% /some-feature a=\"b\" %}} tag turns into regular text" }]
}]}
```

The `directiveElement` fallback:
```ts
if (!template) {
  return {
    type: 'p',
    children: [{ type: 'text', text: source(node, raw || '') || '' }],
  };
}
```

**Implications for OK:** Two degradation tiers exist depending on parser path: shortcodes/directives → soft-fallback to text; MDX JSX / expressions / ESM → hard-fail → `invalid_markdown` whole-document block. OK can pick its tier per construct. Soft-fallback-to-literal-text should be the default where safe.

---

### Finding 7: Schema changes cause different failure modes by direction — no migration tooling

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/mdx/src/parse/acorn.ts:24-29`; `packages/@tinacms/mdx/src/stringify/acorn.ts:73, 84-89`

Parse side — content references a prop that no longer exists in schema:
```ts
const field = fields.find((field) => field.name === attribute.name);
if (!field) {
  throw new Error(`Unable to find field definition for property "${attribute.name}"`);
}
```

Throws, bubbles to whole-document `invalid_markdown`.

Stringify side — editor state references a removed template:
```ts
throw new Error(`Unable to find template for JSX element ${element.name}`);
```

Stringify side — editor state has a prop on a known template that no longer exists:
```ts
const field = template?.fields?.find((field) => field.name === name);
if (!field) {
  if (name === 'children') return;
  return;  // ← silently drop
}
```

No migration, no reconciliation UI. Removed-field data is **silently dropped on save** if the template is still known. A removed-template throws at save. A content file referencing a now-unknown prop on a known template blocks the entire rich-text field.

**Implications for OK:** Real gap in Tina — no schema evolution story. OK should treat schema drift as first-class: warn visibly when unknown props are being dropped, consider an "unknown data drawer" / diff UI to review discards before save. Strong differentiator if OK supports schema-scoped MDX components.

---

### Finding 8: GraphQL `audit` mode converts invalid_markdown into a hard failure — CI-visible error path

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/graphql/src/resolver/index.ts:98-112`

```ts
const tree = parseMDX(value, field, ...);
if (tree?.children[0]?.type === 'invalid_markdown') {
  if (isAudit) {
    const invalidNode = tree?.children[0];
    throw new GraphQLError(
      `${invalidNode?.message}${
        invalidNode.position
          ? ` at line ${invalidNode.position.start.line}, column ${invalidNode.position.start.column}`
          : ''
      }`
    );
  }
}
accumulator[field.name] = tree;
```

Normal resolution returns the tree (editor sees error block). Audit mode (`tinacms audit`) promotes invalid_markdown to a thrown `GraphQLError` — how CI/scheduled jobs detect bad content. Form-side validation (`index.tsx:78-88`) returns `'Unable to parse rich-text'` preventing submit while in rich-text mode.

**Implications for OK:** Three-tier visibility is sensible: (1) in-editor block for users, (2) form validation to prevent clobbering, (3) CLI audit for CI regressions. OK has (1) and (2) implicitly via bridge invariants; an `open-knowledge audit` or `check` tier surfacing unbridgeable content as non-zero exit would close the loop.

---

## Negative searches

- No `migration`, `migrator`, `reconciliation-ui` patterns in MDX/rich-text packages for schema evolution of existing content.
- No progressive/partial recovery in MDX-JSX path — single throw anywhere in `remarkToSlate` converts entire document to one `invalid_markdown` node.
- No workspace content-lint tooling beyond GraphQL audit — no AST-level "find all unknown components" report.
- No preservation of `export const meta = {...}` — ESM is hard-throw (`remarkToPlate.ts:116-123`); only frontmatter survives (handled upstream by `remark-mdx-frontmatter`).

---

## Gaps / follow-ups

- The "next" (newer, markdown-only) parser path in `packages/@tinacms/mdx/src/next/` may have refined fallback — PR #3055 introduced a "no-mdx" track. Worth a deeper pass if OK plans both strict-markdown and MDX tracks.
- Paste handlers, drag-drop may have separate error paths (paste `<Foo />` into rich-text without template — tries parse and falls back?).
- The `maybe_mdx` node type (`rich-text/index.tsx:513-518`) appears to be a transient editor-side intermediate for auto-detect "this text might be an MDX tag" UX — worth follow-up if OK plans agent-assisted component suggestion.
