# Evidence: D1 — micromark-extension-mdxjs construct priority

**Dimension:** D1
**Date:** 2026-04-13
**Context:** Probe confirms mdx-jsx claims `<` (char code 60) unconditionally, irrespective of user extension registration order via `.push()`, `.unshift()`, or construct `add: 'before'` declarations.

**Sources:**
- `node_modules/micromark-extension-mdxjs/index.js` — main entry point
- `node_modules/micromark-extension-mdx-jsx/lib/syntax.js` — jsx construct registration
- `node_modules/micromark-extension-mdx-jsx/lib/jsx-text.js` — text-level JSX construct
- `node_modules/micromark-extension-mdx-jsx/lib/jsx-flow.js` — flow-level JSX construct
- `node_modules/micromark-util-combine-extensions/index.js` — extension merge logic
- `node_modules/micromark-util-types/index.d.ts` — Construct and Extension types
- `node_modules/micromark/lib/create-tokenizer.js` — tokenizer that consumes constructs
- `node_modules/micromark-extension-mdx-md/index.js` — disable mechanism
- `node_modules/remark-mdx/lib/index.js` — remark plugin wrapper

---

## Key files / pages referenced

- **micromark-extension-mdxjs/index.js:33–38** — `combineExtensions([mdxjsEsm, mdxExpression, mdxJsx, mdxMd])` call orchestrates all four sub-extensions; `mdxJsx` is 3rd in the list.
- **micromark-extension-mdx-jsx/lib/syntax.js:38–50** — mdxJsx returns extension object with `flow: {[60]: jsxFlow(...)}` and `text: {[60]: jsxText(...)}`. No `add` field → defaults to `add: 'before'`.
- **micromark-util-combine-extensions/index.js:82–92** — `constructs()` function merges construct arrays: `list[index].add === 'after' ? existing : before` then `splice(existing, 0, 0, before)` → constructs WITHOUT `add: 'after'` (or with `add: 'before'` or undefined) are spliced to the **front**.
- **micromark-util-types/index.d.ts:445–543** — `Construct` interface; `add?: 'after' | 'before'` field docs state: "Whether the construct, when in a ConstructRecord, precedes over existing constructs for the same character code when merged. The default is that new constructs precede over existing ones."
- **micromark/lib/create-tokenizer.js:358–370** — `handleMapOfConstructs()` retrieves construct array from `map[code]` and attempts each construct in order via `handleListOfConstructs(list)`.
- **micromark-extension-mdx-md/index.js:14–16** — disables CommonMark 'autolink', 'codeIndented', 'htmlFlow', 'htmlText' via `{disable: {null: [...]}}`.
- **remark-mdx/lib/index.js:41** — simply `.push(mdxjs(settings))` onto `micromarkExtensions` array; **no options to selectively disable constructs**.

---

## Findings

### Finding 1: mdx-jsx unconditionally registers at char code 60 with implicit `add: 'before'` (default priority)

**Confidence:** CONFIRMED
**Evidence:** 
- micromark-extension-mdx-jsx/lib/syntax.js:37–50 — Returns Extension object with `flow: {[60]: jsxFlow(...)}` and `text: {[60]: jsxText(...)}`. Both constructs lack an `add` property.
- micromark-util-types/index.d.ts:450–452 — Construct.add docs: "The default is that new constructs precede over existing ones."
- micromark-util-combine-extensions/index.js:82–92, line 89 — Logic: `list[index].add === 'after' ? existing : before` — if `add` is undefined or 'before', the construct goes into the `before` array, which is then spliced to position 0 (front).

**Implications:** 
No matter what order a user calls `.push()` or `.unshift()` on `micromarkExtensions`, or what order remark plugins are registered, mdx-jsx's text and flow JSX constructs will **always** precede at the `<` (char code 60) slot because:
1. No explicit `add: 'after'` is set, so default (precede) applies.
2. When `combineExtensions()` is called, constructs with implicit "before" (default) are spliced to array index 0.
3. Later-added extensions cannot override this without also using `add: 'before'` and being re-combined in a later call—but remark stacks extensions sequentially and only one `combineExtensions()` call occurs at parse time.

---

### Finding 2: combineExtensions merges ALL extensions into ONE normalized extension; order is within-type, not between-type

**Confidence:** CONFIRMED
**Evidence:**
- micromark-extension-mdxjs/index.js:33–38 — Single `combineExtensions([mdxjsEsm, mdxExpression, mdxJsx, mdxMd])` call returns a SINGLE merged extension.
- micromark-util-combine-extensions/index.js:22–32 — `combineExtensions(extensions)` iterates through extensions and merges each via `syntaxExtension(all, extensions[index])`.
- micromark-util-combine-extensions/index.js:44–69 — `syntaxExtension()` merges by hook (e.g., 'flow', 'text'). For each hook, it iterates each character code and calls `constructs(left[code], Array.isArray(value) ? value : ...)`.
- micromark-util-combine-extensions/index.js:82–92 — `constructs(existing, list)` respects per-construct `add` field, NOT order of extensions in the combineExtensions list.

**Implications:** 
The user's extension order via `.push()` does **not** determine slot priority. What matters is:
1. Which extensions claim the character code at all.
2. Within those extensions, which constructs have `add: 'before'` vs `add: 'after'` vs undefined.
3. All user extensions are pushed to `micromarkExtensions` array, then passed to micromark's `parse()` function, which calls `combineExtensions()` internally. This is a **single, final merge**, not incremental.

---

### Finding 3: No documented or programmatic way to disable mdxJsxTextTag or mdxJsxFlowTag without building custom extension

**Confidence:** CONFIRMED
**Evidence:**
- micromark-extension-mdx-md/index.js:14–16 — Demonstrates the **only** documented disable mechanism: returning `{disable: {null: ['constructName', ...]}}`. mdxMd disables CommonMark constructs like 'autolink', 'htmlText', etc.
- micromark/lib/create-tokenizer.js:415–416 — Construct disabling is checked by name: `if (construct.name && context.parser.constructs.disable.null.includes(construct.name)) return nok(code)`.
- micromark-extension-mdx-jsx/lib/jsx-text.js:20–22 — Construct is named 'mdxJsxTextTag'.
- micromark-extension-mdx-jsx/lib/jsx-flow.js:22–26 — Construct is named 'mdxJsxFlowTag'.
- remark-mdx/lib/index.js:29–44 — `remarkMdx()` plugin provides **no Options** for disabling constructs. Options are passed to `mdxjs(settings)` and `mdxToMarkdown(settings)` only (for parser config, not disabling).

**Implications:** 
To disable mdxJsxTextTag or mdxJsxFlowTag, users must:
1. Create a custom micromark extension: `{disable: {null: ['mdxJsxTextTag', 'mdxJsxFlowTag']}}`.
2. Push it to `micromarkExtensions` **after** remark-mdx adds the mdxjs extension (or as a separate pre-processing step).
3. No remark-mdx plugin option exists to do this; it requires manual extension manipulation or a custom wrapper plugin.

---

### Finding 4: `add: 'before'` vs `add: 'after'` semantics are ONE-WAY per-construct, NOT a merge strategy for competing extensions

**Confidence:** CONFIRMED
**Evidence:**
- micromark-util-types/index.d.ts:445–452 — `add?: 'after' | 'before'`. Field controls whether a construct "precedes over existing constructs for the same character code when merged. The default is that new constructs precede over existing ones."
- micromark-util-combine-extensions/index.js:87–92:
  ```javascript
  while (++index < list.length) {
    ;(list[index].add === 'after' ? existing : before).push(list[index])
  }
  splice(existing, 0, 0, before)
  ```
  If `add === 'after'`, construct goes into `existing` (appended at end).
  Otherwise (undefined, 'before', or any other value), it goes into `before` (inserted at position 0).

**Implications:** 
- `add: 'before'` (or undefined/default) means "put me at the front; I win over existing constructs."
- `add: 'after'` means "put me at the end; I lose to existing constructs."
- This is a **per-construct property**, not a negotiation between two competing extensions.
- Two extensions both claiming char code 60 with both having `add: 'before'` will **both** go to the front, in the order they were processed. The last one processed (in the combineExtensions iteration) will win because `before.push()` then `splice()` maintains FIFO.

---

### Finding 5: No public third-party solutions found; mdx-jsx `<` priority is architectural, not a bug

**Confidence:** UNCERTAIN (negative search result)
**Evidence:**
- Web search "micromark extension disable construct" → found mdx-md and disable mechanism, but no third-party overrides of mdx-jsx.
- Web search "mdx-js mdx disable jsx parsing" → GitHub discussions show JSX parsing is fundamental to MDX, not optional. No configuration option to selectively disable JSX.
- Web search "remark mdx plugin order override" → Found plugin ordering docs (beforeDefaultRemarkPlugins, etc.), but NOT specific to overriding mdx-jsx at the micromark level.
- Web search "micromark construct priority add: before" → Confirmed add field exists but no examples of using it to override mdx-jsx.
- Web search "micromark mdx jsx override character code 60" → No results showing successful override; all results point to official mdx-jsx repo.

**Implications:** 
The mdx-jsx construct is **intentionally dominant** at char code 60 because:
1. MDX is designed to treat `<` as JSX by default; this is a core design choice, not an oversight.
2. Users who want to parse `<` as something else (e.g., HTML autolink `<http://...>`) must either:
   - Use mdx-extension-mdx-md to disable 'autolink' (already included in mdxjs()).
   - Write a custom disable extension and inject it carefully into the parser.
   - Fork mdx-jsx and set `add: 'after'` to let other constructs precede.

---

### Finding 6: remark-mdx accepts no plugin options for construct disabling or precedence control

**Confidence:** CONFIRMED
**Evidence:**
- remark-mdx/lib/index.js, lines 8–9:
  ```javascript
  @typedef {MicromarkOptions & ToMarkdownOptions} Options
  ```
  Options are only for micromark parser config (acorn, acornOptions, addResult) and to-markdown serialization, NOT for disabling.
- remark-mdx/lib/index.js:41 — `micromarkExtensions.push(mdxjs(settings))` — unconditional push with no logic to accept a `disableConstructs` or similar option.

**Implications:** 
To disable mdx-jsx constructs via remark-mdx, users must:
1. Create a **post-plugin** that mutates `processor.data().micromarkExtensions` after remark-mdx is attached.
2. Or use a unified plugin that wraps remark-mdx and injects a disable extension.
3. There is **no built-in, documented way** to pass options to remark-mdx saying "disable JSX on text" or "disable JSX on flow".

---

## Gaps / follow-ups

1. **Exact micromark parse internals**: Did not trace through the full `parse()` → `createTokenizer()` → `attempt(constructs)` call stack to see if there are other layers where priority can be overridden. However, evidence strongly suggests that once `combineExtensions()` returns, the construct array order at char code 60 is fixed.

2. **Custom `resolveAll` or `resolve` on override construct**: Could a user write a construct with `add: 'after'` and a `resolveAll` that re-interprets JSX-like text as autolinks? Theoretically yes, but would require deep knowledge of event manipulation and is not documented.

3. **Micromark 5.x or future changes**: This research is based on micromark v3.0.10 (from node_modules, Feb 2025). Breaking changes in future versions could alter the combine semantics.

4. **Third-party ecosystem scan**: Only searched npm and GitHub. Could there be a lesser-known package like `remark-mdx-no-jsx` or similar that solves this? Unlikely, given the architectural choice, but not exhaustively ruled out.

---

## Summary for Refactor Design

**The `<` character (code 60) is unconditionally claimed by mdx-jsx because:**
1. mdxJsx constructs register with implicit `add: 'before'` (default priority).
2. combineExtensions respects per-construct `add` fields, not extension order.
3. All extensions are merged once at parse time, so late-registered user extensions cannot re-order the combined array.
4. No public disable mechanism exists in remark-mdx; users must manually inject a `{disable: {null: ['mdxJsxTextTag', 'mdxJsxFlowTag']}}` extension.

**Refactor implication:** If autolink parsing is required BEFORE JSX, either:
- Disable mdxJsxTextTag/FlowTag before mdxjs is combined, OR
- Emit a bridge layer that intercepts JSX-like tokens and re-interprets them as autolinks (more fragile).
