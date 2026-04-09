---
topic: mdManager.serialize determinism
sources:
  - packages/app/src/editor/extensions/shared.ts (post-monorepo; pre-monorepo was init_spike/src/editor/extensions/shared.ts)
  - packages/app/src/editor/observers.ts
verified_at: 2026-04-08
verified_by: runtime test (pre-rebase) + path-confirmed post-rebase
---

# `mdManager.serialize` behavior under repeated runs

## Finding

`mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment))` is **deterministic across runs** for the same XmlFragment input. Two separate Y.Docs built from the same markdown source produce byte-identical serialized output.

## Verification

Ran a bun inline script with two separate Y.Doc instances, both populated from the same input markdown, both serialized. `s1 === s2` evaluated to `true`.

## Important caveat — trailing newline absence (not "stripping" — corrected per M4)

> **CORRECTION 2026-04-08 (audit M4):** Earlier version of this file said `mdManager.serialize` "strips trailing newlines." That framing is **imprecise**. Reading `@tiptap/markdown@3.22.0 src/MarkdownManager.ts:268-294`, `serialize` does NOT explicitly strip trailing newlines via trim/replace — it calls `renderNodes(doc, doc)` and returns the result directly. The "trailing newline absence" is actually a **convention**: the per-node renderers for paragraph/heading/list/codeBlock in `sharedExtensions` happen not to emit a trailing newline after the LAST node. If a custom extension's `renderMarkdown` handler were to emit a trailing `\n`, `serialize` would keep it — there is no global strip.

**Observed behavior for the current extension set:**

```
Input:  "# Heading\n\nParagraph.\n\n- List\n- Two\n\n```js\ncode\n```\n"  (102 chars)
Output: "# Heading\n\nParagraph.\n\n- List\n- Two\n\n```js\ncode\n```"     (101 chars)
```

This is because the code-block renderer doesn't add a trailing newline after the closing ``` — it's the final node.

**Fragility:** if someone adds a custom extension (like `JsxComponent`) whose `renderMarkdown` handler DOES emit a trailing `\n`, the serializer's output would end with `\n` for docs whose last node is that extension. The stress tests' convergence assertions must NOT rely on "serialize always returns a string that never ends in `\n`" — they must normalize trailing whitespace on BOTH sides before comparing.

## Implications for stress tests

1. **Strict convergence assertion** — comparing `ytext.toString()` to `mdManager.serialize(fragmentJson)` will NOT match if the original Y.Text has a trailing newline. The assertion logic must normalize by stripping trailing whitespace from both sides before comparing.

2. **`applyUserDelta` bug root cause** — the gap 2 bug was caused exactly by this behavior. An unterminated final line in `lastSyncedXmlMd` ("Agent paragraph" without `\n`) got aliased differently in diffLines than "Agent paragraph" with `\n` in the new state. Fix already in place (pad with `\n` + trim overlapping remove/add pairs).

3. **Input/output asymmetry** — the markdown that feeds into `mdManager.parse()` is normalized differently than the output from `mdManager.serialize()`. Round-tripping is NOT identity-preserving for whitespace. Stress test fixtures should be generated with the normalized form in mind.

## Not verified yet

- Whether different XmlFragment inputs that represent the "same" logical content (e.g., different attribute orders) produce identical serialized output.
- Whether `serialize` is deterministic after many transformations (e.g., parse → edit → parse → serialize chain).
