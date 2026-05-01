---
date: 2026-04-29
type: meta
sources:
  - "Code: packages/core/src/registry/types.ts (JsxComponentMetaBase, CanonicalMeta, CompatMeta, SerializeContext)"
  - "Code: packages/core/src/registry/built-ins.ts (5 canonical + 3 compat descriptors with serialize methods)"
  - "Code: packages/core/src/registry/index.ts (createRegistry, wildcard '*' descriptor, getOrWildcard)"
  - "Code: packages/core/src/markdown/mdast-to-hast-handlers.ts (mdxJsxFlowHandler, mdxJsxTextHandler, tryNativeHtmlPrimitive, HTML_PRIMITIVE_TAGS)"
  - "Code: packages/core/src/markdown/mdast-to-html.ts (rehypeSanitizeUrls, SAFE_URL_SCHEME, mdastToHtml/markdownToHtml entry points)"
  - "Code: packages/app/src/editor/clipboard/instrument.ts (ClipboardEventName, classifyError, JSON.stringify(console.warn) convention)"
  - "Code: packages/app/src/editor/components/Callout.tsx (renders: class='callout' + data-callout-type='note'; nested .callout-header, .callout-title, .callout-body)"
  - "Code: packages/app/src/globals.css §1620-1750 (callout-* CSS class taxonomy)"
  - "Spec text: ./SPEC.md §10 D3 LOCKED, D6 LOCKED; §6 NFR security, FR-20; §11 Q4/Q6/Q8/Q12/Q13/Q26"
  - "Evidence: ./q1-byte-preservation-matrix.md §J1.A.6/J1.A.7/J1.A.8 (compat round-trip mechanics); §J2 outbound shape recap"
  - "Evidence: ./_init_worldmodel.md §3 (entity taxonomy + compat compat=read-only=preserve-source-form)"
  - "Predecessor spec: 2026-04-23-cb-v2-md-foundation/SPEC.md (Option B carve-out + canonical/compat split)"
  - "External standard verified: GitHub markdown alerts render as <div class='markdown-alert markdown-alert-{type}'><p class='markdown-alert-title'>...</p>...</div> per https://github.blog/changelog/2023-12-14-new-markdown-extension-alerts-provide-distinctive-styling-for-significant-content/"
  - "CLAUDE.md STOP rule: 'Don't emit unbounded-cardinality span/metric attributes' (paths, document content, free-form user strings)"
---

# toClipboardHast contract design (Q4 + Q6 + Q8 + Q12 + Q13 + Q26)

Resolves SPEC §11 Q4 (contract signature), Q6 (compat semantics), Q8 (default fallback), Q12 (error cascade), Q13 (telemetry), Q26 (threat model). Gates §9 proposed-solution layer 3 + §6 functional requirements draft. Sister to `q1-byte-preservation-matrix.md` (which audited what currently fails); this file defines the per-descriptor sister method to `serialize` that fixes the conspicuous OK→external degradation class identified in J2.

## Context — what's locked and what's not

**D3 LOCKED.** Per-descriptor `toClipboardHast` contract sister to `serialize`. Canonical and compat arms each declare it. Dispatched at `mdast-to-hast-handlers.ts:mdxJsxFlowHandler/mdxJsxTextHandler` ahead of Option B's `tryNativeHtmlPrimitive`.

**D6 LOCKED.** Mechanism stays inside PM hooks (`clipboardSerializer.serializeFragment`); no DOM-level event handlers; no custom MIMEs.

**Contract purpose.** Each descriptor declares what shape it emits in cross-app text/html. Cross-app destinations render the semantic HTML; OK→OK goes through text/plain markdown via FR-13-first (D5) so this contract does NOT need to be parseable back into the descriptor. Outbound-only.

**Existing fallback chain.** `mdxJsxFlowHandler` and `mdxJsxTextHandler` currently dispatch:

1. `tryNativeHtmlPrimitive(node)` — name in `HTML_PRIMITIVE_TAGS = {img, video, audio}` AND all attrs are static (no spread, no expression) → emit native hast `<img>` / `<video>` / `<audio>`. Returns null otherwise.
2. Else → `<pre class="mdx-component"><code>{escaped raw}</code></pre>` (flow) or `<span class="mdx-inline">{escaped raw}</span>` (text), populated from `data.sourceRaw` via hast `text` node (FR-20 auto-escape).

The new contract inserts a per-descriptor dispatch step ahead of (1).

---

## Contract signature (Q4a)

### Type extension on `JsxComponentMetaBase`

```ts
// packages/core/src/registry/types.ts

import type { Nodes as HastNodes } from 'hast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';

/**
 * State threaded into a descriptor's `toClipboardHast(node, ctx)` call.
 *
 * Sister to `SerializeContext` for the serialize: PmNode → mdast direction;
 * this one runs in the mdast → hast direction at clipboard-emit time. Provides
 * the minimum surface a descriptor needs to compose its cross-app HTML shape.
 *
 * `all` recursively renders an mdast container's children to hast nodes (the
 * canonical lowering — `state.all(node)` in mdast-util-to-hast handlers).
 * `applyData` propagates `data.hName/hProperties/hChildren` from mdast onto
 * the produced hast element per remark-rehype convention. Both come from the
 * mdast-util-to-hast handler `state` arg; the contract surfaces only the
 * minimum descriptors need.
 *
 * `registry` is read-only access to the registry, mirroring SerializeContext.
 * Kept narrow (Pick<>) so descriptors can't mutate during dispatch.
 *
 * `descriptorName` is the descriptor key the caller resolved — passed in so a
 * compat arm whose `toClipboardHast` was looked up via a non-name path (future
 * extension; not used in v1) can still self-identify in telemetry.
 */
export interface ClipboardHastContext {
  /** Recursively render an mdast node's children to hast. */
  all: (node: MdxJsxFlowElement | MdxJsxTextElement) => HastNodes[];
  /** Apply mdast `data.hName/hProperties/hChildren` overrides to the emitted hast. */
  applyData: (mdast: MdxJsxFlowElement | MdxJsxTextElement, hast: HastNodes) => HastNodes;
  /** Read-only registry access. */
  registry: Pick<ComponentRegistry, 'getOrWildcard'>;
  /** Descriptor key used to dispatch; mostly for telemetry. */
  descriptorName: string;
}

interface JsxComponentMetaBase {
  // ... existing fields (name, hasChildren, props, serialize, ...)

  /**
   * Emit this descriptor's cross-app text/html shape as hast. Optional. When
   * defined, takes precedence over the default Option B `tryNativeHtmlPrimitive`
   * carve-out and the `<pre class="mdx-component">` fallback.
   *
   * Return semantics:
   *   - HastNodes (Element | Element[] | Text) → use it; rehype-stringify will
   *     auto-escape any text-node children per FR-20.
   *   - null → "no opinion; cascade to default fallback chain" (Option B →
   *     `<pre class="mdx-component">`). Use this for descriptors whose shape
   *     reduces cleanly to the default for a particular input (e.g., compat
   *     img with spread attrs that can't statically render).
   *   - throws → caller catches; emits `clipboard-toclipboard-hast`
   *     telemetry with `result: 'error'` + classifyError(err); cascades to
   *     the same fallback chain as null. Symmetric with FR-11 inbound
   *     try-fall-through pattern.
   *
   * FR-20 contract: Children/attr values that originated as user input MUST
   * be emitted as hast `text` nodes, never hast `html` nodes — rehype-stringify
   * auto-escapes text but passes html through unescaped. Reuse `ctx.all(node)`
   * for the children stream; it composes through state.all which descends
   * into hast text nodes by default.
   *
   * No structural attribute (e.g. data-jsx-component) should be emitted —
   * this is OUTBOUND ONLY. OK→OK round-trip goes through text/plain markdown
   * via FR-13-first (D5), so a parseable-back-into-OK shape is not a goal.
   * Cross-app destinations render the semantic HTML; OK→OK uses plain bytes.
   */
  toClipboardHast?: (
    node: MdxJsxFlowElement | MdxJsxTextElement,
    ctx: ClipboardHastContext,
  ) => HastNodes | null;
}
```

### Behavior on each return path

| Return | Behavior | Telemetry `result` |
|---|---|---|
| `Element` / `Element[]` / valid hast | Use it; downstream `rehypeSanitizeUrls` runs; emit. | `'emitted'` |
| `null` | Cascade: Option B `tryNativeHtmlPrimitive` → `<pre class="mdx-component">` fallback. | `'null'` |
| `throw` | Catch at dispatch site; cascade as if `null`; record `errorClass` from `classifyError(err)`. | `'error'` |
| (descriptor lacks the method) | Cascade directly: Option B → fallback. | `'fallback'` (only when method not defined and descriptor was registered) |

### Behavior on spread / expression attrs

Mirror Option B's existing posture. The current `tryNativeHtmlPrimitive` returns null when ANY attr is a spread (`{...rest}`) or an expression value (`width={400}`) — those can't be faithfully rendered as static HTML attrs. New `toClipboardHast` implementations adopt the same posture:

- Static string attrs → use as-is (hast `properties` carries the string).
- Boolean attrs (no value) → `properties[name] = true`.
- Spread / expression attrs → return `null` to opt the descriptor out and let the fallback chain emit the source-form `<pre>` block, preserving the bytes.

Helper utility (to ship in `mdast-to-hast-handlers.ts` alongside `tryNativeHtmlPrimitive`): `extractStaticProperties(node) → Properties | null` — returns null on any non-static attr.

---

## Per-descriptor implementations (Q4b)

For each of the 5 canonical + 3 compat descriptors, the proposed cross-app HTML shape, the rationale, and pseudo-code keyed off `ctx.all(node)` for FR-20 escape compliance.

### Emission table

| # | Descriptor | Surface | Cross-app text/html shape | Rationale |
|---|---|---|---|---|
| 1 | `Callout` | canonical | `<aside class="callout callout-{type}" data-callout-type="{type}"><p class="callout-title"><strong>{type label}: {title?}</strong></p>...children...</aside>` | Aligns with the in-app `<div class="callout" data-callout-type="...">` shape (`Callout.tsx:142,156`). Cross-app receivers see a `<aside>` (semantic + screen-reader-friendly per WAI-ARIA `complementary`) with a callout-style chrome. The `markdown-alert` taxonomy from GitHub is rejected for the canonical Callout because OK's Callout has richer prop surface than GFM's 5-type alert (title, icon, color, collapsible, defaultOpen) — using OK's own class taxonomy keeps the cross-app shape consistent with what the in-app render already produces. |
| 2 | `img` | canonical | `<img src="..." alt="..." width=... height=...>` (existing Option B native) | Lowercase HTML primitive — Option B's `tryNativeHtmlPrimitive` produces the right shape today. Descriptor explicitly forwards to the helper (a one-line `toClipboardHast` calling `tryNativeHtmlPrimitive(node)`) to give it a contract-arm presence rather than relying on the implicit fallback. Spread/expression attrs → null cascade. |
| 3 | `video` | canonical | `<video src="..." controls poster="..." width=... height=...></video>` (existing Option B native; empty children) | Same as `img`. The descriptor's children are empty (canonical descriptor has `hasChildren: false`), so the hast element has `children: []` — rehype-stringify emits as a self-closed `<video>` with paired tag (HTML spec disallows self-close on void elements but `<video>` is paired). Spread/expression → null. |
| 4 | `audio` | canonical | `<audio src="..." controls></audio>` (existing Option B native) | Same. |
| 5 | `Accordion` | canonical | `<details{ open}{ name=""}{ id=""}><summary>{icon-glyph?} {title}{description?}</summary>...children...</details>` | Native HTML5 `<details>`/`<summary>` matches the in-app substrate (the Accordion component IS a `<details>` per D-MF14). Cross-app receivers (Slack rich, Notion, Gmail) render an expandable widget natively. Honors the descriptor's `defaultOpen`, `name`, `id` props. Icon emitted as inert text glyph (lucide name string is OK-specific; cross-app destinations don't have lucide so we degrade to text or omit — see open question below). Description rendered as a sibling small line inside `<summary>`. |
| 6 | `GFMCallout` | compat | `<div class="markdown-alert markdown-alert-{type}"><p class="markdown-alert-title">{type label}{title?}</p>...children...</div>` | GitHub's de facto convention — verified 2026-04-30 via github.blog announcement + `antfu/markdown-it-github-alerts` ecosystem. Cross-app destinations rendering markdown-alert content (GitHub itself, GitLab, several note-taking apps) recognize this class taxonomy. Distinct from canonical Callout (#1) because GFMCallout's source form is `> [!NOTE]\nbody` and its prop surface is the GFM 5-type subset; using GitHub's class convention is the canonical cross-app rendering. |
| 7 | `CommonMarkImage` | compat | `<img src="..." alt="..." title="...">` (same as canonical img) | Source form is `![alt](src "title")`; cross-app shape is identical to the canonical img native emission. Implementation: forward to `tryNativeHtmlPrimitive` — but the node is a paragraph mdast wrapping an image, not an mdxJsxFlowElement. The compat descriptor's serialize emits `paragraph + image` mdast; the standard mdast-to-hast handler for `image` already produces native `<img>`. So this compat descriptor's `toClipboardHast` should return `null` — the descriptor doesn't need a custom dispatch because the mdast it serializes (image inside paragraph) takes the standard remark-rehype path, not the custom mdxJsxFlowHandler dispatch. Listed for completeness; effectively no-op. |
| 8 | `HtmlDetailsAccordion` | compat | `<details{ open}{ name=""}{ id=""}><summary>{title}</summary>...children...</details>` | Source form is `<details><summary>X</summary>body</details>`; cross-app shape is the same `<details>`. The compat descriptor's serialize emits an `mdxJsxFlowElement` carrying `data.htmlBoundary` (special-cased by `to-markdown-handlers.ts`). For the clipboard path, the descriptor's `toClipboardHast` emits real `<details>` HTML. Bug flag: per Q1 §J1.A.8, `<details>` is not in `LOWERCASE_JSX_CANONICAL_TAGS` upstream — but that's an INBOUND parse-side issue for round-trip identity, NOT a blocker for outbound emission. The compat descriptor's serialize emits `mdxJsxFlowElement{name:'HtmlDetailsAccordion'}` which DOES reach `mdxJsxFlowHandler` at clipboard time (the handler routes by mdast type, not by registry-name lookup), so the dispatch hook fires correctly here. |

### Pseudo-code per descriptor

#### 1. Callout (canonical capitalized)

```ts
{
  name: 'Callout',
  surface: 'canonical',
  // ... existing fields
  toClipboardHast: (node, ctx) => {
    // Static-attrs only; cascade on expression/spread.
    const properties = extractStaticProperties(node);
    if (properties === null) return null;

    const type = (typeof properties.type === 'string' ? properties.type : 'note') as
      | 'note' | 'tip' | 'important' | 'warning' | 'caution';
    const title = typeof properties.title === 'string' ? properties.title : null;
    const collapsible = properties.collapsible === true || properties.collapsible === 'true';

    // Type label — bounded enum, safe to interpolate into class names.
    const TYPE_LABEL: Record<string, string> = {
      note: 'Note', tip: 'Tip', important: 'Important',
      warning: 'Warning', caution: 'Caution',
    };

    const titleSpan: Element = {
      type: 'element',
      tagName: 'p',
      properties: { className: ['callout-title'] },
      // FR-20: title is user input → text node auto-escapes.
      children: title
        ? [
            { type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: TYPE_LABEL[type] }] },
            { type: 'text', value: ': ' + title },
          ]
        : [{ type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: TYPE_LABEL[type] }] }],
    };

    const body = ctx.all(node); // body children render as hast (text auto-escaped)

    const wrapper: Element = {
      type: 'element',
      tagName: collapsible ? 'details' : 'aside',
      properties: {
        className: ['callout', `callout-${type}`],
        // bounded enum — no user-controlled string in the data attribute
        dataCalloutType: type,
      },
      children: [titleSpan, ...body],
    };
    return ctx.applyData(node, wrapper);
  },
}
```

#### 2/3/4. img / video / audio (canonical lowercase)

```ts
// Each of img/video/audio:
{
  name: 'img', // (or 'video' / 'audio')
  surface: 'canonical',
  toClipboardHast: (node, ctx) => {
    const native = tryNativeHtmlPrimitive(node);
    return native ? ctx.applyData(node, native) : null;
  },
}
```

Identity-forwards to the existing helper. Listed explicitly so each descriptor declares its own contract arm rather than relying on the implicit fallback — makes the descriptor self-describing for tooling and audit.

#### 5. Accordion (canonical capitalized)

```ts
{
  name: 'Accordion',
  surface: 'canonical',
  toClipboardHast: (node, ctx) => {
    const properties = extractStaticProperties(node);
    if (properties === null) return null;

    const title = typeof properties.title === 'string' ? properties.title : '';
    const description = typeof properties.description === 'string' ? properties.description : '';
    const defaultOpen = properties.defaultOpen === true || properties.defaultOpen === 'true';
    const name = typeof properties.name === 'string' ? properties.name : '';
    const id = typeof properties.id === 'string' ? properties.id : '';
    // icon is a lucide identifier (e.g., 'lucide:Rocket') — degrade to omit
    // for cross-app since destinations don't have lucide; users reading the
    // pasted accordion still see the title text. Could emit Unicode glyph
    // shorthand in future (open design question below).

    const summaryChildren: HastNodes[] = [{ type: 'text', value: title }];
    if (description) {
      summaryChildren.push({
        type: 'element',
        tagName: 'small',
        properties: { className: ['accordion-description'] },
        children: [{ type: 'text', value: description }],
      });
    }

    const detailsProps: Properties = {};
    if (defaultOpen) detailsProps.open = true;
    if (name) detailsProps.name = name;
    if (id) detailsProps.id = id;

    const wrapper: Element = {
      type: 'element',
      tagName: 'details',
      properties: detailsProps,
      children: [
        {
          type: 'element',
          tagName: 'summary',
          properties: {},
          children: summaryChildren,
        },
        ...ctx.all(node),
      ],
    };
    return ctx.applyData(node, wrapper);
  },
}
```

#### 6. GFMCallout (compat)

```ts
{
  name: 'GFMCallout',
  surface: 'compat',
  toClipboardHast: (node, ctx) => {
    const properties = extractStaticProperties(node);
    if (properties === null) return null;

    const GFM_ALERT_TYPES = new Set(['note', 'tip', 'important', 'warning', 'caution']);
    const rawType = (typeof properties.type === 'string' ? properties.type : 'note').toLowerCase();
    const type = GFM_ALERT_TYPES.has(rawType) ? rawType : 'note';
    const title = typeof properties.title === 'string' ? properties.title : null;

    const TYPE_LABEL: Record<string, string> = {
      note: 'Note', tip: 'Tip', important: 'Important',
      warning: 'Warning', caution: 'Caution',
    };

    const titlePara: Element = {
      type: 'element',
      tagName: 'p',
      properties: { className: ['markdown-alert-title'] },
      children: title
        ? [
            { type: 'text', value: TYPE_LABEL[type] + ' ' },
            { type: 'text', value: title }, // user input → auto-escape via text node
          ]
        : [{ type: 'text', value: TYPE_LABEL[type] }],
    };

    const wrapper: Element = {
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['markdown-alert', `markdown-alert-${type}`],
      },
      children: [titlePara, ...ctx.all(node)],
    };
    return ctx.applyData(node, wrapper);
  },
}
```

GitHub's class convention — verified against changelog post + remark-github-blockquote-alert + markdown-it-github-alerts implementations.

#### 7. CommonMarkImage (compat)

```ts
{
  name: 'CommonMarkImage',
  surface: 'compat',
  toClipboardHast: () => null, // mdast image inside paragraph already routes through standard remark-rehype
}
```

The compat descriptor's serialize produces `paragraph + image` mdast — neither node is mdxJsxFlowElement / mdxJsxTextElement, so the custom handlers don't fire; the standard mdast-to-hast image handler emits `<img>` natively. Explicit `null` here documents the intent.

#### 8. HtmlDetailsAccordion (compat)

```ts
{
  name: 'HtmlDetailsAccordion',
  surface: 'compat',
  toClipboardHast: (node, ctx) => {
    const properties = extractStaticProperties(node);
    if (properties === null) return null;

    // Reuse Accordion's shape; HtmlDetailsAccordion has a strict subset of props.
    const title = typeof properties.title === 'string' ? properties.title : '';
    const defaultOpen = properties.defaultOpen === true || properties.defaultOpen === 'true';
    const name = typeof properties.name === 'string' ? properties.name : '';
    const id = typeof properties.id === 'string' ? properties.id : '';

    const detailsProps: Properties = {};
    if (defaultOpen) detailsProps.open = true;
    if (name) detailsProps.name = name;
    if (id) detailsProps.id = id;

    const wrapper: Element = {
      type: 'element',
      tagName: 'details',
      properties: detailsProps,
      children: [
        title
          ? { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: title }] }
          : null,
        ...ctx.all(node),
      ].filter(Boolean) as HastNodes[],
    };
    return ctx.applyData(node, wrapper);
  },
}
```

Matches the source bytes (`<details>`) so pasting back into a Markdown-aware destination round-trips conservatively.

---

## Compat semantics (Q6)

For each compat descriptor, the text/plain shape (from mdManager.serialize via existing `serialize: (node, ctx) => mdast`), the text/html shape (from new `toClipboardHast`), and the OK→OK round-trip via FR-13-first text/plain path.

### GFMCallout

- **text/plain (serialize):** `> [!NOTE]\n>\n> body` — emitted by `built-ins.ts:635-682` GFMCallout serialize. Pristine path emits `data.sourceRaw` verbatim; dirty path reconstructs via blockquote + html marker.
- **text/html (toClipboardHast):** `<div class="markdown-alert markdown-alert-note"><p class="markdown-alert-title">Note</p>...body...</div>`.
- **OK→OK round-trip via FR-13-first (text/plain path):** `> [!NOTE]\n> body` → mdManager.parse → `callout-transformer.ts` re-promotes blockquote+`[!NOTE]` mdast → mdxJsxFlowElement{name:'GFMCallout'} → registry restores GFMCallout descriptor identity. Disk bytes round-trip byte-identical (modulo NG7 blank-line-count normalization between marker and body — accepted carve-out per D7).
- **Verification:** Q1 §J1.A.6 confirms post-D5 BYTE-PRESERVING. The new toClipboardHast doesn't change OK→OK behavior; it changes cross-app rendering only.

### CommonMarkImage

- **text/plain (serialize):** `![alt](x.png "title")` — paragraph + image mdast emitted by `built-ins.ts:686-711`.
- **text/html (toClipboardHast):** Returns null; standard mdast `image` handler emits `<p><img src="x.png" alt="alt" title="title"></p>`.
- **OK→OK round-trip via FR-13-first:** `![alt](x.png "title")` → mdManager.parse → image mdast → image PM node. The compat descriptor's identity (CommonMarkImage vs canonical img) is render-time only; storage is plain CommonMark image. Disk bytes round-trip byte-identical.
- **Verification:** Q1 §J1.A.7 confirms BYTE-PRESERVING in both pre- and post-D5.

### HtmlDetailsAccordion

- **text/plain (serialize):** `<details>\n<summary>X</summary>\n\nbody\n\n</details>` — htmlBoundary path in `to-markdown-handlers.ts:349-356`.
- **text/html (toClipboardHast):** `<details><summary>X</summary><p>body</p></details>` — real `<details>` HTML.
- **OK→OK round-trip via FR-13-first:** **DOES NOT round-trip cleanly today.** Per Q1 §J1.A.8, `<details>` is NOT in `LOWERCASE_JSX_CANONICAL_TAGS` upstream, so `<details>` source bytes get PUA-protected as raw HTML text on parse → eventually emerge as `html` mdast / `htmlBlock` PM node. The HtmlDetailsAccordion compat identity is LOST in both pre- and post-D5+D8. **This is a pre-existing gap that D5+D8 don't fix.** Fixing requires either: (a) extending `LOWERCASE_JSX_CANONICAL_TAGS` to include `details` + adding a sister inbound mdast transformer, OR (b) accepting it as a known limitation in NG-S list. **Surface as open design question — out of scope for this contract design but blocks G1 for HtmlDetailsAccordion.** This contract design's outbound emission is correct; the round-trip issue is upstream.

### Summary

| Compat descriptor | text/plain shape | text/html shape (new) | OK→OK round-trip via FR-13-first |
|---|---|---|---|
| GFMCallout | `> [!NOTE]\n> body` | `<div class="markdown-alert markdown-alert-note">...` | BYTE-PRESERVING (modulo NG1) |
| CommonMarkImage | `![alt](src "title")` | standard `<p><img>...</p>` | BYTE-PRESERVING |
| HtmlDetailsAccordion | `<details>...<summary>...</summary>body</details>` | real `<details>...</details>` | **BUG — pre-existing, not fixed by D5+D8 + this contract; needs separate spec attention** |

---

## Fallback chain (Q8)

Three-layer cascade at the dispatch site (`mdast-to-hast-handlers.ts:mdxJsxFlowHandler`/`mdxJsxTextHandler`):

```
Layer 1: descriptor.toClipboardHast?.(node, ctx)  — defined? returns valid hast?
   ├─ defined + valid hast → emit. Done.
   ├─ defined + null → cascade to Layer 2.
   ├─ defined + throws → telemetry(error), cascade to Layer 2.
   └─ undefined → cascade directly to Layer 2.

Layer 2: tryNativeHtmlPrimitive(node)  — name in HTML_PRIMITIVE_TAGS, all attrs static
   ├─ returns Element → emit. Done.
   └─ returns null → cascade to Layer 3.

Layer 3: <pre class="mdx-component"><code>{escaped raw}</code></pre>  — flow handler
       OR <span class="mdx-inline">{escaped raw}</span>  — text handler
   Always succeeds. data.sourceRaw → hast text node → auto-escape.
```

Pseudocode for the new `mdxJsxFlowHandler`:

```ts
const mdxJsxFlowHandler: Handler = (state, node) => {
  const jsx = node as MdxJsxFlowElement;
  const name = jsx.name;
  const descriptor = name ? registry.getOrWildcard(name) : registry.getOrWildcard('*');
  const start = performance.now();

  // Layer 1
  if (descriptor.toClipboardHast) {
    try {
      const ctx: ClipboardHastContext = {
        all: (n) => state.all(n) as HastNodes[],
        applyData: (m, h) => state.applyData(m, h) as HastNodes,
        registry: { getOrWildcard: (n) => registry.getOrWildcard(n) },
        descriptorName: descriptor.name,
      };
      const result = descriptor.toClipboardHast(jsx, ctx);
      if (result) {
        recordTelemetry({ descriptor: descriptor.name, surface: descriptor.surface, result: 'emitted', durationMs: performance.now() - start });
        state.patch(node, result);
        return result; // already applyData'd inside descriptor
      }
      // null → fall through to Layer 2
      recordTelemetry({ descriptor: descriptor.name, surface: descriptor.surface, result: 'null', durationMs: performance.now() - start });
    } catch (err) {
      recordTelemetry({ descriptor: descriptor.name, surface: descriptor.surface, result: 'error', errorClass: classifyError(err), durationMs: performance.now() - start });
      // fall through to Layer 2
    }
  } else {
    recordTelemetry({ descriptor: descriptor.name, surface: descriptor.surface, result: 'fallback', durationMs: performance.now() - start });
  }

  // Layer 2
  const native = tryNativeHtmlPrimitive(jsx);
  if (native) {
    state.patch(node, native);
    return state.applyData(node, native);
  }

  // Layer 3
  const raw = typeof jsx.data?.sourceRaw === 'string' ? jsx.data.sourceRaw : '';
  const code: Element = { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: raw }] };
  const pre: Element = { type: 'element', tagName: 'pre', properties: { className: ['mdx-component'] }, children: [code] };
  state.patch(node, pre);
  return state.applyData(node, pre);
};
```

### When each layer fires

| Scenario | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|
| `<Callout>` (descriptor defines toClipboardHast, returns valid hast) | EMIT | — | — |
| `<Callout>` with spread attr (descriptor returns null) | null | null (capitalized) | EMIT (`<pre>`) |
| `<img>` with all-static attrs (descriptor forwards to tryNativeHtmlPrimitive) | EMIT | — | — |
| `<img>` with expression attr `width={400}` (descriptor returns null) | null | null (any attr non-static) | EMIT (`<pre>`) |
| `<UnknownCustomComponent>` (wildcard descriptor; no toClipboardHast defined → wildcard could omit it) | absent | null | EMIT (`<pre>`) |
| Descriptor throws | error | (cascade) | EMIT (`<pre>`) |

Wildcard descriptor (`registry/index.ts:24-34`) does NOT define `toClipboardHast` — leaving the cascade to handle unregistered components naturally via `<pre>`. Adding `toClipboardHast: () => null` to wildcard would be redundant.

---

## Error handling (Q12)

Three failure modes, three behaviors. Symmetric with FR-11 inbound try-catch-fallthrough pattern.

| Failure mode | Detection | Behavior | Telemetry |
|---|---|---|---|
| Descriptor returns valid hast | type check pass | use it | `result: 'emitted'` |
| Descriptor returns `null` | identity check | cascade to Layer 2 | `result: 'null'` |
| Descriptor throws | try/catch at dispatch site | cascade to Layer 2 with error context | `result: 'error'`, `errorClass: classifyError(err)` |
| Descriptor returns invalid hast (e.g., `undefined`, non-Element shape) | hast type check OR rehype-stringify failure downstream | **DEFENSIVE** — treat undefined as null; if hast is malformed and rehype-stringify throws downstream, the error surfaces at the upstream callsite (clipboardSerializer.serializeFragment) which already has fallback to `slice.content.textBetween` per FR-11 | `result: 'error'`, `errorClass: 'InvalidHastReturn'` (custom check at dispatch) |

The dispatch site catches the descriptor's throws inline; downstream rehype-stringify failures are caught by the clipboardSerializer fallback chain that already exists.

### Symmetry with FR-11

FR-11 (inbound): every conversion call try/caught; falls through to next layer. Outbound symmetry: each per-descriptor handler try/caught; falls through to default fallback. Same pattern, same observability.

### Test coverage

Per descriptor, three tests:
1. `toClipboardHast returns valid hast → emitted`.
2. `toClipboardHast returns null → cascade Layer 2 → cascade Layer 3 → <pre>`.
3. `toClipboardHast throws → telemetry recorded → cascade Layer 2 → cascade Layer 3 → <pre>`.

Plus one fuzz test across 100+ adversarial inputs (per FR-20 testing pattern) confirming that descriptor-emitted hast text-node children survive entity-encoded.

---

## Telemetry contract (Q13)

### Event schema

```ts
// packages/app/src/editor/clipboard/instrument.ts (extended)

type ClipboardEventName =
  | 'clipboard-source-detected'
  | 'clipboard-html-conversion-failed'
  | /* … existing events … */
  | 'clipboard-toclipboard-hast'; // NEW

interface ClipboardToClipboardHastEvent {
  event: 'clipboard-toclipboard-hast';
  descriptor: string;        // bounded — registered descriptor name (~10-20 in v1)
  surface: 'canonical' | 'compat';  // bounded enum
  result: 'emitted' | 'null' | 'fallback' | 'error';  // bounded enum
  errorClass?: string;       // bounded — classifyError taxonomy
  durationMs: number;        // bounded numeric (small)
  view: 'wysiwyg' | 'source';  // bounded enum (existing)
}

// Emission convention: structured JSON via console.warn (matches existing
// instrument.ts pattern at lines 150-225).
function recordToClipboardHast(payload: Omit<ClipboardToClipboardHastEvent, 'event'>): void {
  console.warn(
    JSON.stringify({
      event: 'clipboard-toclipboard-hast' satisfies ClipboardEventName,
      ...payload,
    }),
  );
}
```

### Cardinality verification (CLAUDE.md STOP rule)

Per CLAUDE.md "Don't emit unbounded-cardinality span/metric attributes":

| Field | Cardinality | Bounded? | Source |
|---|---|---|---|
| `descriptor` | ~10 in v1 (5 canonical + 3 compat + wildcard `*` + future); <100 indefinitely | YES | Registered descriptor names — bounded enum |
| `surface` | 2 (`canonical`, `compat`) | YES | Discriminated union from `JsxComponentMeta` |
| `result` | 4 (`emitted`, `null`, `fallback`, `error`) | YES | Closed enum |
| `errorClass` | <20 (HtmlPayloadTooLargeError, ChunkedInsertError, custom Error subclasses, plus `undefined` for untyped) | YES | classifyError() taxonomy from instrument.ts:247 |
| `durationMs` | numeric scalar | YES | Number, not a label |
| `view` | 2 | YES | Existing field; bounded |

**Excluded from telemetry (would violate STOP rule):**
- `data.sourceRaw` content — unbounded user input (raw JSX bytes)
- Attribute values — user-controlled strings
- Hast output content — unbounded
- Document name / path — exists elsewhere via doc.name field but NOT emitted by this event since clipboard doesn't have doc context at hast-emit time

### Verification

| CLAUDE.md STOP rule | This event |
|---|---|
| "Raw paths" | None emitted. Event has no path field. |
| "Document content" | None emitted. No content fields. |
| "Free-form user strings" | None emitted. All string fields are bounded enums (descriptor name, surface, result, errorClass) or absent. |
| Numeric histogram safety | `durationMs` is the only numeric; bounded by per-call execution time (<<100ms in practice). |

PASS. Event is safe under the cardinality rule.

---

## Threat model (Q26)

Cross-app destinations don't run sanitization on inbound HTML. The new `toClipboardHast` shapes introduce new attack surfaces; FR-20 + `rehypeSanitizeUrls` must cover each.

### Attack surfaces by shape

| Shape | User-controlled input | Path to escape | Risk |
|---|---|---|---|
| `<aside class="callout callout-{type}" data-callout-type="{type}">` | `{type}` from descriptor enum | Bounded enum (`note`/`tip`/`important`/`warning`/`caution`) — defended by clamping to GFM_ALERT_TYPES set in descriptor implementation. | NONE |
| `<aside><strong>{type label}: {title}</strong>` | `{title}` user-controlled | Hast text node → rehype-stringify auto-escape | LOW (FR-20 covered) |
| `...children...` (Callout body) | User-controlled mdast subtree | `ctx.all(node)` → standard mdast-to-hast lowering → text nodes auto-escape, links go through rehypeSanitizeUrls | LOW (existing pipeline covers) |
| `<div class="markdown-alert markdown-alert-{type}">` | `{type}` clamped to GFM enum | Same as Callout's `{type}` | NONE |
| `<details name="{name}" id="{id}">` | `{name}` and `{id}` user-controlled string props | hast `properties` values get attribute-escaped by rehype-stringify | LOW (rehype-stringify covers) |
| `<details><summary>{title}{description?}</summary>` | `{title}` and `{description}` user-controlled | Hast text nodes → auto-escape | LOW (FR-20 covered) |
| `<a class="wiki-link" data-target="{target}">{label}</a>` | `{target}` and `{label}` user-controlled | Existing wikiLinkHandler — already FR-20 compliant; not changed by this contract | LOW (existing) |
| `<img src="{src}" alt="{alt}">` (canonical img / compat CommonMarkImage / native fallback) | `{src}` URL-bearing user input; `{alt}` user text | `src` flows through `rehypeSanitizeUrls` (drops `javascript:`/`data:`/`vbscript:`/`file:`/unknown schemes per `mdast-to-html.ts:70-110`); `{alt}` auto-escaped via property attr-escape | LOW (existing pipeline covers) |

### Specific threat scenarios

#### T1 — Title XSS via Callout

User crafts `<Callout title="</strong><script>alert(1)</script>">`.

- text/plain emit: `<Callout title=...>` — already user-controlled; storage layer fidelity (D7).
- text/html emit via toClipboardHast: title goes through hast text node → rehype-stringify entity-encodes `<`, `>`, `&` → output is `&lt;/strong&gt;&lt;script&gt;...`. No execution.
- **MITIGATED.**

#### T2 — Class injection via type prop

User crafts `<Callout type="' onclick='alert(1)'">`.

- The descriptor implementation clamps `type` to the GFM 5-type enum — anything outside falls back to `'note'`. The string never lands in the `class` attribute as literal user input; only the bounded enum value does.
- **MITIGATED via descriptor-side validation. Critical: every descriptor that interpolates a prop into a class/id/data-attribute MUST clamp to a bounded enum.**

#### T3 — Spread attr injection

User crafts `<Callout {...evilProps}>` where `evilProps` resolves to `{ onclick: 'alert(1)' }`.

- `extractStaticProperties(node)` returns `null` on any spread (`mdxJsxExpressionAttribute`) → descriptor returns `null` → cascade to Layer 3 `<pre class="mdx-component">` with `data.sourceRaw` as text node. The spread expression is preserved verbatim as escaped source code; cross-app destinations render it as text.
- **MITIGATED via static-attrs-only posture.**

#### T4 — URL-bearing attr injection

User crafts `<img src="javascript:alert(1)">`.

- `tryNativeHtmlPrimitive` emits hast `<img src="javascript:...">`.
- Downstream `rehypeSanitizeUrls` checks `tag === 'img'` + `props.src`; `isSafeUrl` rejects `javascript:` (only matches `https?:`/`mailto:`/`tel:`/`ftp:`/`sms:`/`/`/`#`/`?`/`./`/`../`); deletes `props.src`.
- Result: `<img>` with no `src` (visible as broken image; no script execution).
- **MITIGATED via existing rehypeSanitizeUrls plugin in mdast-to-html.ts (runs on the same hast tree after toClipboardHast).**

#### T5 — Children with raw HTML mdast

User crafts `<Callout>foo<script>alert(1)</script>bar</Callout>`.

- mdast subtree contains `html` inline node → standard mdast-to-hast handler for `html` produces hast `raw` node (NOT `text`).
- rehype-stringify with `allowDangerousHtml: false` (the default we use per `mdast-to-html.ts:124`) DROPS hast `raw` nodes.
- Result: the `<script>` is silently stripped from the output HTML.
- **MITIGATED via rehype-stringify's default-safe posture.**

#### T6 — Compound attribute injection

User crafts `<Accordion id="a; onclick='alert(1)'" name="x">`.

- hast `properties.id = "a; onclick='alert(1)'"` → rehype-stringify attribute-encodes `'`, `;`, `<`, `>`, `&`, etc. via property-information's per-attribute attr-encode rules.
- Output: `<details id="a; onclick=&#x27;alert(1)&#x27;" name="x">` — semicolon and quotes are entity-encoded; cross-app receivers render as text inside the `id` attribute.
- **MITIGATED via rehype-stringify's per-attribute encoding.**

### FR-20 verification

For each new descriptor's emission:

| Descriptor | User input goes through | FR-20 compliance |
|---|---|---|
| Callout | hast text nodes (title, body) + bounded class/data-attr enums | PASS |
| img/video/audio | tryNativeHtmlPrimitive (existing); URL filtering via rehypeSanitizeUrls | PASS |
| Accordion | hast text nodes (title, description) + property values (name, id) attr-escaped by rehype-stringify | PASS |
| GFMCallout | hast text nodes + bounded class enum | PASS |
| CommonMarkImage | standard mdast `image` handler + rehypeSanitizeUrls | PASS |
| HtmlDetailsAccordion | hast text nodes (title) + property values (name, id) attr-escaped | PASS |

### Audit pattern

For each new descriptor's `toClipboardHast`, mandatory unit test with:

1. Adversarial title: `</strong><script>alert(1)</script>`
2. Adversarial type/enum value: `' onclick='alert(1)'`
3. Adversarial children: mdast subtree with `html` inline node containing `<script>`
4. Adversarial URL-bearing attr (where applicable): `javascript:alert(1)`, `data:text/html,...`
5. Spread/expression attr fuzz: `{...evilProps}` and `width={anyExpression}`

Expected behaviors:
1-3 → entity-encoded text in output
4 → attr removed by rehypeSanitizeUrls
5 → cascade to `<pre class="mdx-component">` with raw source text-encoded

### Net assessment

**No new XSS surfaces introduced.** Every user-controlled input flows through one of:
- Bounded enum clamping (descriptor-side, e.g. type)
- Hast text node emission (rehype-stringify auto-escape)
- Hast property emission (rehype-stringify per-attribute attr-escape)
- rehypeSanitizeUrls (URL-bearing attrs)
- rehype-stringify's default-safe `allowDangerousHtml: false` (drops `raw` nodes)
- Cascade-to-`<pre>` for non-static attrs (preserves bytes as escaped source)

**MITIGATED by composition.** No descriptor implementation adds a new sanitization path; all defenses already exist in the pipeline.

---

## Open design questions surfaced

These genuinely need user input — not pre-decided:

### O1. Should canonical Callout's cross-app emission align with GFM's `markdown-alert` taxonomy or use OK's own `callout` taxonomy?

The proposed design uses **OK's own `callout` + `data-callout-type`** taxonomy for the canonical Callout (matches in-app render at `Callout.tsx`), and **GFM's `markdown-alert`** taxonomy for the GFMCallout compat (matches GFM source bytes' downstream destinations).

**Tradeoff.** Aligning with OK's own classes keeps the cross-app rendering consistent with what the user sees in-app and what the React renderer produces — better for user mental model. Aligning to GitHub's `markdown-alert` would be more recognized by destination apps that have markdown-alert-aware CSS (GitHub, GitLab, several note-taking apps).

**Recommendation pending user judgment.** The split (canonical=OK, compat=GFM) is internally consistent but produces TWO different cross-app HTML shapes for what looks like "the same thing" to users. Single-shape alternative: emit `<div class="markdown-alert markdown-alert-{type} callout">` for both — duplicate class taxonomy. Surface for user input.

### O2. Accordion icon prop — degrade silently or emit Unicode glyph?

The Accordion's `icon` prop is a lucide identifier (`lucide:Rocket`); cross-app destinations don't have lucide. Three options:

- **Degrade silently (proposed).** Icon omitted from cross-app HTML; user sees the title text. Simplest; loses information.
- **Emit Unicode glyph.** Maintain a small lucide → emoji/Unicode map (e.g. `lucide:Rocket` → 🚀). Adds maintenance surface; cross-app receivers render glyph.
- **Emit `<i class="lucide-rocket">` placeholder.** Cross-app destinations with lucide CSS render the icon. Niche.

**Recommendation pending user judgment.** Default to degradation; surface as future work if users report it.

### O3. HtmlDetailsAccordion outbound is correct; inbound round-trip is broken (Q1 §J1.A.8). Fix in this spec or carve out as NG?

The contract design's outbound HTML for HtmlDetailsAccordion is correct (`<details>` source bytes preserved). However, OK→OK round-trip fails because `<details>` is NOT in `LOWERCASE_JSX_CANONICAL_TAGS` upstream. D5+D8 don't fix this. Three options:

- **Extend LOWERCASE_JSX_CANONICAL_TAGS to include `details`** + add inbound transformer to re-promote `<details>` mdast → HtmlDetailsAccordion. ~30 LoC. Resolves G1 for this descriptor.
- **Carve out as NG-S in this spec.** Document explicitly that HtmlDetailsAccordion is outbound-only; inbound round-trip degrades to htmlBlock. Acceptable for v1; revisit if users report it.
- **Defer to a separate spec.** Owns `details`/inbound parsing scope; unblocks this spec's contract design.

**Recommendation pending user judgment.** Option 2 unblocks this spec; option 1 is the cleanest fix; option 3 is the conservative split.

### O4. Telemetry sampling — emit on every dispatch or sampled?

The proposed event fires on EVERY mdxJsxFlowHandler / mdxJsxTextHandler dispatch — potentially many per copy operation. Bounded cardinality is OK per the STOP rule, but volume is unbounded.

**Tradeoff.** Per-dispatch emission is simpler and gives full observability. Sampling (e.g., 1-in-100) reduces log volume but may miss low-frequency descriptors entirely.

**Recommendation pending user judgment.** Default to per-dispatch with a `bun run check`-time sanity check that ensures the event is bounded. Surface as Q if log volume becomes an issue.

### O5. Should the `wildcard` descriptor define `toClipboardHast`, or rely on the implicit fallback?

Wildcard descriptor (`registry/index.ts:24-34`) handles unregistered components. Two options:

- **Implicit fallback (proposed).** Wildcard does NOT define `toClipboardHast`; the cascade naturally hits `<pre>` for unregistered components. Telemetry records `result: 'fallback'`.
- **Explicit `toClipboardHast: () => null`.** Documents intent; identical behavior.

**Recommendation:** stick with implicit. If user prefers explicit for documentation purposes, easy to add.

---

## Cross-references

### Files modified during implementation

- **`packages/core/src/registry/types.ts`** — add `ClipboardHastContext` interface; extend `JsxComponentMetaBase` with `toClipboardHast?: (node, ctx) => HastNodes | null`.
- **`packages/core/src/registry/built-ins.ts`** — add per-descriptor `toClipboardHast` for Callout, img, video, audio, Accordion (canonical) and GFMCallout, CommonMarkImage, HtmlDetailsAccordion (compat). Add `escapeHtmlAttr`/`escapeHtmlText` siblings if needed for hast emission helpers.
- **`packages/core/src/markdown/mdast-to-hast-handlers.ts`** — extend `mdxJsxFlowHandler` and `mdxJsxTextHandler` to dispatch through `descriptor.toClipboardHast` ahead of `tryNativeHtmlPrimitive`. Add `extractStaticProperties` helper (refactor from `tryNativeHtmlPrimitive`'s static-attrs-loop). Pass `ClipboardHastContext` shape.
- **`packages/app/src/editor/clipboard/instrument.ts`** — add `'clipboard-toclipboard-hast'` to `ClipboardEventName` union; add `recordToClipboardHast()` emit helper.
- **`packages/core/src/markdown/mdast-to-hast-handlers.test.ts`** — per-descriptor unit tests for the three return paths (valid hast / null / throws); FR-20 adversarial input fuzz; tryNativeHtmlPrimitive-cascade tests.
- **`packages/core/src/registry/canonical-compat.test.ts`** — extend to assert every canonical+compat descriptor declares `toClipboardHast` (or explicitly opts out).

### Existing patterns referenced

- `serialize: (node, ctx) => mdast` on `JsxComponentMetaBase` — the SISTER PATTERN this contract mirrors (inverse direction).
- `tryNativeHtmlPrimitive(node)` in `mdast-to-hast-handlers.ts:84-104` — the EXISTING fallback Layer 2 that now sits behind the new contract.
- `rehypeSanitizeUrls` in `mdast-to-html.ts:70-110` — DOWNSTREAM URL sanitizer that runs after toClipboardHast emits hast.
- `classifyError(err)` in `instrument.ts:247-252` — bounded error taxonomy reused for telemetry's `errorClass` field.
- `wikiLinkHandler` in `mdast-to-hast-handlers.ts:117-139` — the EXISTING precedent for a custom hast emitter that uses `state.all()` / hast text nodes for FR-20 escape.
- `clipboardSerializer.serializeFragment` (D6 LOCKED entry point) — UPSTREAM mechanism that calls these handlers via `mdastToHtml`.

---

## Next steps

1. Lock O1-O5 with user judgment (or defer to spec finalize).
2. Convert this contract into FR-N drafts in SPEC §6 with acceptance criteria per descriptor.
3. Implementation: types extension first (SCOPE order); then per-descriptor handlers; then dispatch site refactor; then tests.
4. Verify Q11 test strategy intersects: per-descriptor handler unit tests, integration tests with full clipboard pipeline, E2E paste-fidelity for cross-app destinations.
5. Verify Q25 a11y: `<aside>` / `<details>` ship implicit semantics; axe-core sanity check on the fixture corpus.
