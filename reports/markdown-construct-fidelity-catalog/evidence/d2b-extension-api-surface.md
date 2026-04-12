# Evidence: D2b — Extension API surface for customizing entity encoding

**Dimension:** D2b — API exhaustion for `encodeTextForMarkdown` bypass
**Date:** 2026-04-11
**Sources:** `node_modules/@tiptap/markdown/src/MarkdownManager.ts` (1298 lines, fully read), `node_modules/@tiptap/markdown/dist/index.js` (compiled output), `node_modules/@tiptap/core/src/Extendable.ts` (ExtendableConfig interface), `node_modules/@tiptap/core/src/types.ts` (MarkdownExtensionSpec), GitHub PR #7565, issue #7539
**Library versions:** `@tiptap/markdown@3.22.3` (latest as of 2026-04-11), `@tiptap/core@3.22.3`
**Baseline commit:** 2d35736

---

## TLDR

**No.** `@tiptap/markdown` v3.22.3 exposes **zero** documented hooks, options, or extension points to replace, disable, or customize the `encodeTextForMarkdown` → `encodeHtmlEntities` call path. However, a viable **undocumented escape hatch** exists: the compiled JS emits `encodeTextForMarkdown` as a regular prototype method (not `#private`), making **prototype monkey-patching** a low-cost, zero-fork bypass. This collapses the fix taxonomy: **Option A (post-process)** remains cheapest but has blind-decode limitations; **Option D (prototype patch)** is new, surgically precise, and nearly as cheap.

---

## Exhaustive API surface audit

### 1. Constructor options — NO encoding control

The `MarkdownManager` constructor accepts exactly 4 options:

```typescript
constructor(options?: {
  marked?: typeof marked           // custom marked instance
  markedOptions?: Parameters<typeof marked.setOptions>[0]  // marked.setOptions passthrough
  indentation?: { style?: 'space' | 'tab'; size?: number } // indent config
  extensions: AnyExtension[]       // tiptap extension registry
})
```

There is no `encodeEntities`, `encodeHtml`, `entityEncoder`, `textEncoder`, `rawMode`, `preserveLiterals`, or any other option that controls encoding behavior. **Confirmed negative.**

### 2. Extension registration — NO encode override

When extensions register via `registerExtension()`, the system reads these fields from `getExtensionField()`:

| Field | Type | Purpose | Encoding control? |
|---|---|---|---|
| `code` | `boolean` | Adds extension name to `codeTypes` Set → skips encoding for its text nodes | **Indirect only** — see §3 |
| `markdownTokenName` | `string` | Token name for parse registry | No |
| `parseMarkdown` | `function` | Parse handler | No |
| `renderMarkdown` | `function` | Render handler | No |
| `markdownTokenizer` | `object` | Custom marked tokenizer | No |
| `markdownOptions.indentsContent` | `boolean` | Indentation flag | No |
| `markdownOptions.htmlReopen` | `{open, close}` | HTML reopen tags for mark overlap | No |

The `ExtendableConfig` interface (`@tiptap/core/src/Extendable.ts`) contains no encode-related fields beyond `code: boolean`.

### 3. The `code: true` mechanism — indirect, limited

Extensions that declare `code: true` get added to the `codeTypes` Set. Text nodes inside these extensions bypass `encodeHtmlEntities`. This is the **only** existing mechanism to skip encoding.

**Can we abuse it?** In principle, you could declare `code: true` on custom extensions like `paragraph` or `heading` to exempt their text nodes. However:
- You would need to fork/re-register every built-in extension that contains text (paragraph, heading, listItem, blockquote, tableCell, etc.)
- `code: true` has other side effects in TipTap's rendering pipeline (affects ProseMirror schema, CSS classes, input rules)
- This is a non-starter for general text nodes

**Verdict: not viable as a bypass.**

### 4. `renderMarkdown` handler — does NOT control text encoding

The `renderMarkdown` handler on extensions receives `(node, helpers, ctx)` and returns a `string`. When rendering children, it calls `helpers.renderChildren()` or `helpers.renderChild()`, which internally call `renderNodeToMarkdown()`, which calls `encodeTextForMarkdown()` for text nodes.

**Critical:** Extensions can control how their own node is serialized to markdown (e.g., wrapping in fences, adding prefixes), but they **cannot** intercept or override how their child text nodes are encoded. The text-node encoding happens at the `MarkdownManager` level, not at the extension level.

The only way an extension could bypass encoding is by emitting raw text directly from its `renderMarkdown` handler — but this only works for leaf nodes that store content in `attrs`, not for container nodes with text children (paragraph, heading, etc.).

### 5. `serialize()` method — NO hooks or events

```typescript
serialize(docOrContent: JSONContent): string {
  if (!docOrContent) return ''
  const result = this.renderNodes(docOrContent, docOrContent)
  return this.isEmptyOutput(result) ? '' : result
}
```

No pre/post hooks, no events, no middleware chain. It's a direct call to `renderNodes()`. **Confirmed negative.**

### 6. Marked instance customization — irrelevant for serialize path

The `marked` option allows injecting a custom marked instance, but marked is only used for **parsing** (markdown → tokens). The serialize path (JSON → markdown) uses `renderNodes()` exclusively and never touches marked. **Not applicable.**

---

## Escape hatches (undocumented)

### Option D: Prototype monkey-patch on `encodeTextForMarkdown`

**Discovery:** The TypeScript source declares `encodeTextForMarkdown` as `private`, but the compiled `dist/index.js` emits it as a **regular prototype method** (no ES2022 `#private` syntax). This means it can be overridden.

**Compiled JS at `dist/index.js:750`:**
```javascript
encodeTextForMarkdown(text, node, parentNode) {
  const isInsideCode = (parentNode == null ? void 0 : parentNode.type) != null
    && this.codeTypes.has(parentNode.type)
    || (node.marks || []).some((m) => this.codeTypes.has(typeof m === "string" ? m : m.type));
  return isInsideCode ? text : encodeHtmlEntities(text);
}
```

**Call sites:** Used at exactly 2 locations in the serializer:
1. `renderNodeToMarkdown()` line 757 — standalone text node rendering
2. `renderNodesWithMarkBoundaries()` line 825 — text node rendering within mark boundary tracking

Both call `this.encodeTextForMarkdown(...)`, so a prototype override captures both.

**Patch code:**

```typescript
import { MarkdownManager } from '@tiptap/markdown';

// Disable HTML entity encoding for text nodes during serialization.
// The default behavior encodes & < > to &amp; &lt; &gt; which corrupts
// literal characters when markdown is the persistence format (not HTML).
(MarkdownManager.prototype as any).encodeTextForMarkdown = function(
  text: string,
  _node: any,
  _parentNode: any,
): string {
  return text;  // pass through unmodified
};
```

**Pros:**
- Surgically precise — overrides the exact function, at the root cause
- Zero fork required — works with the published npm package
- Both call sites captured automatically (they use `this.encodeTextForMarkdown`)
- Preserves code-context bypass logic if desired (can check `codeTypes` ourselves)
- Trivially reversible — remove the patch
- Can be applied once at module scope in `packages/server/` or `packages/core/`

**Cons:**
- Relies on undocumented implementation detail (method name + non-private compilation). A future `@tiptap/markdown` release could:
  - Rename the method → patch silently stops working (serializer falls back to built-in)
  - Switch to `#private` fields → patch has no effect (TypeScript `private` only)
  - Inline the encoding → patch has no effect
- TypeScript type error: `encodeTextForMarkdown` is `private`, so the patch requires `as any` cast
- Still passes through `&`, `<`, `>` even in positions where they form valid markdown syntax (e.g., `>` at start of line becomes blockquote). This is the same limitation as Option A but at a different layer.

**Risk mitigation:**
- Pin `@tiptap/markdown` version in `package.json` (already done at `3.22.3`)
- Add a unit test that verifies the patch works: serialize a node containing `&` and assert the output contains literal `&`
- Add a build-time assertion that `MarkdownManager.prototype.encodeTextForMarkdown` exists

### Option D' (variant): Instance patch instead of prototype patch

Instead of patching the prototype globally, patch each `mdManager` instance after construction:

```typescript
const mdManager = new MarkdownManager({ extensions: sharedExtensions });
(mdManager as any).encodeTextForMarkdown = function(text: string) { return text; };
```

**Advantage:** Scoped — doesn't affect other MarkdownManager instances (if any exist).
**Disadvantage:** Must be applied at every construction site (4 files currently: `standalone.ts`, `persistence.ts`, `agent-sessions.ts`, `external-change.ts`).

---

## Upstream landscape

### PR #7565 — the origin of the encoding behavior

The `encodeHtmlEntities`/`decodeHtmlEntities` functions and their integration into `MarkdownManager` were introduced in [PR #7565](https://github.com/ueberdosis/tiptap/pull/7565) (merged 2026-03-05), which fixed [issue #7539](https://github.com/ueberdosis/tiptap/issues/7539). The fix was correct for the reporter's use case (HTML entities in markdown content should roundtrip safely when rendered to HTML).

No discussion of a configurable flag or opt-out mechanism exists in either the PR or the issue. The encoding was implemented as unconditional behavior, not as an option.

### No newer version addresses this

v3.22.3 is the latest published version (confirmed via `npm view @tiptap/markdown versions`). No open PRs or issues on the tiptap repo discuss making entity encoding configurable.

---

## Impact on fix taxonomy

The original D2 evidence identified three fix options (A, B, C). This investigation adds Option D and refines the cost assessment:

| Option | Description | Cost | Precision | Fork required? |
|---|---|---|---|---|
| A | Post-process `serialize` output with blind decode | ~5 LOC wrapper | Low (blind) | No |
| B | Upstream `encodeEntities: false` option | ~3 LOC in lib | High | Yes (fork or upstream PR) |
| C | Semantic rewrite of encoder | ~50 LOC | Highest | Yes |
| **D** | **Prototype monkey-patch** | **~5 LOC patch** | **High (root cause)** | **No** |
| D' | Instance monkey-patch | ~5 LOC × 4 sites | High (root cause) | No |

**Recommendation sequence:** D > A > B > C.

- **Option D** is the new best answer: same cost as A, but acts at the root cause instead of blindly decoding output. It prevents the encoding from happening rather than reversing it after the fact.
- **Option A** remains a good fallback if Option D breaks (e.g., future version changes method visibility).
- **Option B** is the upstream-correct answer but requires a PR to `ueberdosis/tiptap` with uncertain timeline.
- **Option C** is over-engineered for the problem.

---

## Verification

To verify the prototype patch works, the following test can be run:

```typescript
import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from '@inkeep/open-knowledge-core';

// Apply patch
(MarkdownManager.prototype as any).encodeTextForMarkdown = function(text: string) { return text; };

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// Test: literal & should survive roundtrip
const input = '# H&M Store\n';
const json = mdManager.parse(input);
const output = mdManager.serialize(json);
console.log('Input: ', JSON.stringify(input));
console.log('Output:', JSON.stringify(output));
console.log('Match: ', output.includes('H&M'));  // should be true
```

This test was not executed as a standalone script (the patch is straightforward enough that a unit test during implementation is more appropriate than a probe script).

---

## Pointers

- `node_modules/@tiptap/markdown/dist/index.js:750` — compiled `encodeTextForMarkdown` method (non-private)
- `node_modules/@tiptap/markdown/src/MarkdownManager.ts:901-911` — TypeScript source of same
- `node_modules/@tiptap/markdown/src/MarkdownManager.ts:50-54` — constructor options (no encoding control)
- `node_modules/@tiptap/core/src/Extendable.ts:289-316` — `markdownOptions` type (no encoding control)
- `node_modules/@tiptap/core/src/types.ts:954-968` — `MarkdownExtensionSpec` type (no encoding control)
- GitHub [PR #7565](https://github.com/ueberdosis/tiptap/pull/7565) — introduced the encoding behavior
- GitHub [issue #7539](https://github.com/ueberdosis/tiptap/issues/7539) — the bug that motivated #7565
