/**
 * Custom mdast-util-to-markdown handlers for source-form fidelity.
 *
 * These handlers override remark-stringify defaults to preserve authoring
 * form — delimiters, fence chars, bullet markers, etc. — by reading
 * node.data.* fields populated by the PM→mdast reverse handlers.
 *
 * Key overrides from R1 probe (§19.7):
 * - text handler strips `&` and `<` from the unsafe list (NG5 storage-layer contract)
 * - link handler writes URLs verbatim (no `&` escaping)
 * - escapeMark: text with data.escapedChars re-emits backslash sequences
 */

import type { Nodes, Parents } from 'mdast';
import type { MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import type { Info, State } from 'mdast-util-to-markdown';

type MdastToMarkdownHandlerFor<N extends Nodes['type']> = (
  node: Extract<Nodes, { type: N }>,
  parent: Parents | undefined,
  state: State,
  info: Info,
) => string;

type MdastToMarkdownHandlers = {
  [K in Nodes['type']]: MdastToMarkdownHandlerFor<K>;
} & {
  // MDX extension types (mdast-util-mdx augments Nodes but the augmentation
  // may not be visible in all type-resolution contexts)
  mdxJsxFlowElement: (node: Nodes, parent: Parents | undefined, state: State, info: Info) => string;
};

export const toMarkdownHandlers = {
  /**
   * text: strip `&` (before [#A-Za-z]), `<`, `[`, and `(` from the unsafe list.
   * Without this, literal prose characters that already round-trip as plain
   * text get backslash-escaped during serialization, degrading source-mode UX
   * without adding fidelity value.
   *
   * Also handles D20 escapeMark: if the text carries data.escapedChars,
   * re-emit backslash sequences for structurally-ambiguous escapes.
   */
  text(node, _parent, state, info) {
    if (typeof node.data?.sourceRaw === 'string') {
      return node.data.sourceRaw;
    }

    // D20: if position-walker tagged escaped chars, reconstruct source form
    if (node.data?.escapedChars?.length) {
      const value: string = node.value ?? '';
      const escaped: Array<{ offset: number; char: string }> = node.data.escapedChars;
      let result = '';
      let lastIdx = 0;
      for (const { offset, char } of escaped) {
        // Emit everything before this escape as-is (through safe to handle
        // any other necessary escaping), then emit \char
        if (offset > lastIdx) {
          result += safeText(state, value.slice(lastIdx, offset), info);
        }
        result += `\\${char}`;
        lastIdx = offset + 1;
      }
      if (lastIdx < value.length) {
        result += safeText(state, value.slice(lastIdx), info);
      }
      return result;
    }

    // Default: strip `&` and `<` from unsafe list.
    // Also convert NBSP (U+00A0) back to regular space — the remark-prosemirror
    // PR #3 patch introduces NBSP to preserve whitespace-only text nodes during
    // parse, but on serialize we need plain spaces back.
    return safeText(state, (node.value ?? '').replaceAll('\u00A0', ' '), info);
  },

  /**
   * emphasis: use node.data.sourceDelimiter to pick `*` or `_`.
   */
  emphasis(node, _parent, state, info) {
    const delim = node.data?.sourceDelimiter ?? '*';
    const tracker = state.createTracker(info);
    const exit = state.enter('emphasis');
    let value = tracker.move(delim);
    value += state.containerPhrasing(node, {
      before: value,
      after: delim,
      ...tracker.current(),
    });
    value += tracker.move(delim);
    exit();
    return value;
  },

  /**
   * strong: use node.data.sourceDelimiter to pick `**` or `__`.
   */
  strong(node, _parent, state, info) {
    const delim = node.data?.sourceDelimiter ?? '**';
    const tracker = state.createTracker(info);
    const exit = state.enter('strong');
    let value = tracker.move(delim);
    value += state.containerPhrasing(node, {
      before: value,
      after: delim,
      ...tracker.current(),
    });
    value += tracker.move(delim);
    exit();
    return value;
  },

  /**
   * link: route URL through formatLinkUrl so unbalanced parens, angle chars,
   * and control/space chars pick the form (literal vs angle) that re-parses
   * byte-identically. Autolinks (data.sourceStyle === 'autolink') short-circuit
   * to `<url>` form (autolink URLs are scheme:uri — never have parens or
   * literal angles in practice; promoted by autolink-promotion.ts).
   */
  link(node, _parent, state, info) {
    // Autolink form — promoted by autolink-promotion.ts transformer
    if (node.data?.sourceStyle === 'autolink') {
      return `<${node.url ?? ''}>`;
    }
    const tracker = state.createTracker(info);
    const exit = state.enter('link');
    const subexit = state.enter('label');
    let value = tracker.move('[');
    value += tracker.move(
      state.containerPhrasing(node, {
        before: value,
        after: '](',
        ...tracker.current(),
      }),
    );
    value += tracker.move('](');
    subexit();

    const urlExit = state.enter('destinationRaw');
    value += tracker.move(formatLinkUrl(String(node.url ?? '')));
    urlExit();

    if (node.title) {
      const titleExit = state.enter('titleQuote');
      value += tracker.move(' "');
      value += tracker.move(
        state.safe(node.title, { before: value, after: '"', ...tracker.current() }),
      );
      value += tracker.move('"');
      titleExit();
    }
    value += tracker.move(')');
    exit();
    return value;
  },

  /**
   * image: mirror link's URL discipline.
   *
   * The default mdast-util-to-markdown image handler uses state.safe() with
   * the full unsafe list, which escapes literal `<` (and other chars) inside
   * the URL even when those chars came from R23-PUA-restored angle-bracket
   * URL forms. Compounds on round-trip: `![foo](<url>)` parses with url=`<url>`
   * (R23 restoration) → default serialize → `![foo](\<url>)` → re-parse url=
   * `\<url>` (backslash literal) → serialize → `![foo](\\\\\<url>)`.
   *
   * This handler routes the URL through `formatLinkUrl` (same as link), so
   * the destination form (literal vs angle) is chosen for byte-stable
   * round-trip regardless of what chars the URL value contains. Alt text
   * and title use state.safe() — those are body/quoted contexts where the
   * standard escape rules are correct (escapes consume cleanly on re-parse).
   */
  image(node, _parent, state, info) {
    const tracker = state.createTracker(info);
    const exit = state.enter('image');
    const subexit = state.enter('label');
    let value = tracker.move('![');
    value += tracker.move(
      state.safe(node.alt ?? '', {
        before: value,
        after: '](',
        ...tracker.current(),
      }),
    );
    value += tracker.move('](');
    subexit();

    const urlExit = state.enter('destinationRaw');
    value += tracker.move(formatLinkUrl(String(node.url ?? '')));
    urlExit();

    if (node.title) {
      const titleExit = state.enter('titleQuote');
      value += tracker.move(' "');
      value += tracker.move(
        state.safe(node.title, { before: value, after: '"', ...tracker.current() }),
      );
      value += tracker.move('"');
      titleExit();
    }
    value += tracker.move(')');
    exit();
    return value;
  },

  /**
   * thematicBreak: emit node.data.sourceRaw verbatim, EXCEPT at doc start.
   *
   * TWO complementary protections against remark-frontmatter ambiguity:
   *
   * 1. Parse-side: docStartThematicFixPlugin converts `---\n\n---` (empty
   *    yaml) back to thematicBreak nodes so they're not silently dropped.
   *
   * 2. Serialize-side (THIS handler): doc-start `---` thematicBreaks are
   *    normalized to `***` because `---` at position 0 triggers remark-
   *    frontmatter interference on re-parse — even when NOT matched as
   *    yaml, remark-frontmatter's presence causes remark-gfm to mis-parse
   *    subsequent list content as paragraphs. Using `***` avoids the
   *    trigger character entirely. NG10 documented in AGENTS.md.
   *
   * Non-doc-start thematicBreaks preserve `sourceRaw` faithfully.
   */
  thematicBreak(node, _parent, state) {
    const sourceRaw = node.data?.sourceRaw;
    const isDocStart =
      Array.isArray(state?.indexStack) &&
      state.indexStack.length === 1 &&
      state.indexStack[0] === 0;
    if (isDocStart && (!sourceRaw || /^-[-\s]*-\s*$/.test(sourceRaw))) {
      return '***';
    }
    return sourceRaw ?? '---';
  },

  /**
   * break: emit backslash or two-space form per data.sourceStyle.
   */
  break(node) {
    if (node.data?.sourceStyle === 'backslash') return '\\\n';
    return '  \n';
  },

  /**
   * code: preserve fence char and length.
   */
  code(node) {
    const fenceChar = node.data?.sourceFenceChar;
    const char = fenceChar === '~' ? '~' : '`';
    const len = Math.max(3, node.data?.sourceFenceLength ?? 3);
    const fence = char.repeat(len);
    const lang = node.lang ?? '';
    const meta = node.meta ? ` ${node.meta}` : '';
    const value = node.value ?? '';
    return `${fence}${lang}${meta}\n${value}\n${fence}`;
  },

  /**
   * heading: preserve ATX vs setext style.
   */
  heading(node, _parent, state, info) {
    const style = node.data?.sourceStyle ?? 'atx';
    const depth = node.depth;
    if (style === 'setext' && (depth === 1 || depth === 2)) {
      const content = state.containerPhrasing(node, { ...info, before: '\n', after: '\n' });
      const underline = (depth === 1 ? '=' : '-').repeat(Math.max(content.length, 3));
      return `${content}\n${underline}`;
    }
    const hashes = '#'.repeat(depth);
    const content = state.containerPhrasing(node, {
      ...info,
      before: `${hashes} `,
      after: '\n',
    });
    if (!content) return hashes;
    return `${hashes} ${content}`;
  },

  /**
   * list: preserve bullet marker and ordered delimiter.
   */
  list(node, _parent, state, info) {
    const bullet = state.options.bullet || '-';
    const ordered = !!node.ordered;
    const savedBullet = state.bulletCurrent;
    const savedBulletLast = state.bulletLastUsed;

    if (!ordered) {
      const m = node.data?.bulletMarker;
      if (m === '-' || m === '*' || m === '+') {
        state.bulletCurrent = m;
      }
    }

    const children = node.children || [];
    const out: string[] = [];
    const delim = ordered ? (node.data?.listMarkerDelimiter ?? '.') : null;
    const counter = node.start ?? 1;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const baseMarker = ordered ? `${counter + i}${delim}` : (node.data?.bulletMarker ?? bullet);
      // GFM task-list checkbox
      let marker = baseMarker;
      if (child.checked === true) marker += ' [x]';
      else if (child.checked === false) marker += ' [ ]';
      const pad = ' '.repeat(baseMarker.length + 1);
      const itemContent = state.containerFlow(child, info);
      const indented = itemContent
        .split('\n')
        .map((l, idx) => (idx === 0 ? `${marker} ${l}` : l ? `${pad}${l}` : l))
        .join('\n');
      out.push(indented);
    }

    state.bulletCurrent = savedBullet;
    state.bulletLastUsed = savedBulletLast;

    const sep = node.spread ? '\n\n' : '\n';
    return out.join(sep);
  },

  /**
   * mdxJsxFlowElement: 2-path handler unifying PR #171's sourceRaw-verbatim
   * pattern (precedent #19 sub-rule (d)) with PR #165's γ dirty-reconstruct
   * pattern (FR-5, FR-6, D7).
   *
   *   - Pristine path: `data.sourceRaw` is set → emit verbatim. Bit-exact
   *     round-trip for unedited content; also the production path for
   *     clipboard copy (the PM→mdast `jsxComponent` pristine branch) and for
   *     any non-PR-165 caller (file parse, agent write, etc.).
   *   - Dirty path: `data.sourceRaw` is absent; the node carries structural
   *     `name`, `attributes`, `children`. Reconstruct flush-left (children
   *     serialized via containerFlow without the library's 2-space-per-depth
   *     indent, which would trigger CommonMark's indented-code-block rule at
   *     depth 2+). Matches the fumadocs/Obsidian authoring convention.
   *
   * Fallback (neither path): `<${name}/>` — minimal self-closing tag, only
   * reached if an mdxJsxFlowElement appears with neither sourceRaw nor
   * structural children, which is outside our parse pipeline.
   */
  mdxJsxFlowElement(node, _parent, state, info) {
    const mdxNode = node as unknown as MdxJsxFlowElement;
    const raw = mdxNode.data?.sourceRaw;
    if (typeof raw === 'string') return raw;

    // Compat HTML-boundary descriptors (HtmlDetailsAccordion) emit raw HTML
    // opener/closer with a markdown body in between. Body is rendered via
    // state.containerFlow so block markdown inside `<details>` serializes
    // correctly. The mdast `name` and `attributes` are ignored on this path.
    const boundary = mdxNode.data?.htmlBoundary;
    if (boundary && typeof boundary.opener === 'string' && typeof boundary.closer === 'string') {
      const childContent = state.containerFlow(
        // biome-ignore lint/suspicious/noExplicitAny: safe cast for synthetic root
        { type: 'root', children: mdxNode.children ?? [] } as any,
        info,
      );
      return `${boundary.opener}\n\n${childContent}\n\n${boundary.closer}`;
    }

    const name = mdxNode.name ?? '';
    const attrs = serializeMdxJsxAttrs(mdxNode.attributes ?? []);

    if (!mdxNode.children || mdxNode.children.length === 0) {
      if (!name) return '';
      return attrs ? `<${name} ${attrs} />` : `<${name} />`;
    }

    const openTag = attrs ? `<${name} ${attrs}>` : `<${name}>`;
    const closeTag = `</${name}>`;

    // Serialize children flush-left via containerFlow (FR-6).
    // Cast needed: containerFlow expects FlowParents which is a union of
    // specific mdast parent types; our synthetic root satisfies the structural
    // requirement ({type, children}) but not the nominal type.
    const childContent = state.containerFlow(
      // biome-ignore lint/suspicious/noExplicitAny: safe cast for synthetic root
      { type: 'root', children: mdxNode.children } as any,
      info,
    );

    return `${openTag}\n\n${childContent}\n\n${closeTag}`;
  },

  /**
   * mdxJsxTextElement: sourceRaw-verbatim strategy. Covers inline
   * `<Icon />`, `<Badge>x</Badge>`, `<br/>` variants. jsxInline (NG14 thin
   * shape) always populates data.sourceRaw at the PM→mdast layer, so this
   * branch is the production path. Custom handler returns the string
   * directly — no state.safe() call — which avoids the text-context
   * `<` → `\<` escape that FR-5b originally needed {type:'html'} to work
   * around.
   */
  mdxJsxTextElement(node) {
    const raw = node.data?.sourceRaw;
    if (typeof raw === 'string') return raw;
    const name = node.name ?? '';
    return `<${name}/>`;
  },

  /**
   * rawMdxFallback (D7 / US-006): emit `value` verbatim so the raw source
   * round-trips byte-identically. `value` holds the exact bytes the parser
   * choked on — see parse-with-fallback.ts for the producer side.
   */
  rawMdxFallback(node) {
    return (node.value ?? '') as string;
  },
} satisfies Partial<MdastToMarkdownHandlers>;

/**
 * Serialize an MdxJsxAttribute[] to the string that appears inside the JSX
 * open tag. E.g., `type="warning" disabled data={[1,2,3]}`.
 */
function serializeMdxJsxAttrs(attrs: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>): string {
  const parts: string[] = [];
  for (const attr of attrs) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      // Spread: {...rest}
      parts.push(`{${attr.value}}`);
      continue;
    }
    const name = attr.name;
    if (attr.value === null || attr.value === undefined) {
      // Boolean shorthand: <Comp disabled />
      parts.push(name);
      continue;
    }
    if (typeof attr.value === 'string') {
      if (attr.value.includes('"')) {
        // Contains double quotes — use JSX expression form with escaped quotes
        const escaped = attr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`${name}={"${escaped}"}`);
      } else {
        // String literal: type="warning"
        parts.push(`${name}="${attr.value}"`);
      }
      continue;
    }
    // Expression: data={[1,2,3]}
    parts.push(`${name}={${attr.value.value}}`);
  }
  return parts.join(' ');
}

/**
 * Emit text through state.safe with NG5-specific strips applied to the
 * mdast-util-to-markdown unsafe list.
 *
 * COUPLING NOTE: The `<`, `:`, and `@` strips below depend on
 * protectFromMdx() in autolink-void-html-guard.ts guarding those characters
 * on parse. If a character is removed from the guard, the corresponding strip
 * here must also be removed — otherwise re-parse will mis-tokenize the output.
 *
 * We preserve authoring-form fidelity by removing escapes the pipeline does
 * not need:
 *   - `&` before `[#A-Za-z]` — mdast-util-to-markdown escapes to avoid HTML
 *     entity round-trip; NG5 forbids storage-layer entity handling.
 *   - `<` — mdast-util-to-markdown escapes to prevent re-parse as inline HTML
 *     or JSX; our R23 `protectFromMdx` guard already handles those tokenizers,
 *     so escaping `<` in serialized text produces a false positive on re-parse.
 *
 * Note: `:` and `@` strips were previously needed when autolinks survived as
 * literal `<url>` TEXT in PM (the text handler would otherwise escape them,
 * breaking idempotence). After the autolink-promotion transformer (autolink-
 * promotion.ts), autolinks are semantic `link` nodes — safeText never sees
 * `<url>` as text content, so `:` and `@` escaping follows the remark-stringify
 * default (safe for non-autolink text).
 */
/**
 * Format a URL value for the link/image destination position so it re-parses
 * byte-identically.
 *
 * CommonMark allows two forms for the destination:
 *   1. Literal `(url)` — must not contain ASCII control or space, and any
 *      parens must be balanced (matched pairs) or backslash-escaped.
 *   2. Angle `(<url>)` — must not contain line breaks or unescaped `<` or `>`.
 *
 * After parse, the URL value has all source escapes consumed (e.g.
 * `(foo\(bar\))` parses to url=`foo(bar)`).
 *
 * Strategy: ALWAYS use literal form. Angle form is structurally unusable
 * here because the R23 protector (`autolink-void-html-guard.ts:protectFromMdx`)
 * is not escape-aware for `<` / `>` — it PUA-substitutes them inside any
 * input string regardless of preceding backslash, mangling angle-form output.
 * Literal form survives the R23 round-trip cleanly: literal `<` and `>` chars
 * in the URL value get PUA-substituted on parse, restoreFromMdx puts them
 * back, so verbatim output → re-parse → byte-identical URL value (this is
 * how `![foo](<url>)` ends up with url-value=`<url>` after R23 promotes the
 * angle-form input to literal angles in the value).
 *
 * Two cases:
 *   - Parens balanced (or absent) → write verbatim. Literal form re-parses
 *     cleanly. Literal `<` / `>` / backslashes in V re-emerge unchanged.
 *
 *   - Parens unbalanced (only arises when source had `\(` / `\)` escapes that
 *     parse consumed) → escape every `(` and `)` AND every existing `\` so
 *     the literal form re-parses to the same V. Doubling pre-existing `\`
 *     prevents it from combining with the newly-inserted escape backslash.
 *
 * Control chars and spaces in URL values aren't representable in either
 * CommonMark form. They don't survive the parse pipeline (R23 PUA-prefix +
 * literal-form rejects whitespace), so we don't try to encode them.
 *
 * This is the URL-handler-parity contract referenced by `evidence/r6-failure-
 * modes.md` Findings 5 + 6 — fixed under US-010 (R6b/c).
 */
export function formatLinkUrl(url: string): string {
  if (!url) return '';

  let depth = 0;
  let parensBalanced = true;
  for (const ch of url) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) parensBalanced = false;
    }
  }
  if (depth !== 0) parensBalanced = false;

  if (parensBalanced) return url;

  // Unbalanced parens — escape parens (force literal form to re-parse) and
  // existing backslashes (so they don't combine with inserted escape chars).
  return url.replace(/[\\()]/g, '\\$&');
}

/**
 * Escape `&` followed by an HTML-entity-shaped tail (named, numeric, or hex).
 *
 * Why (R24 / US-017): Source `\&ouml;` parses to text value `&ouml;` (escape
 * consumed). On serialize, NG5's strip of mdast-util-to-markdown's
 * `&`-before-`[#A-Za-z]` unsafe rule means the `&` is emitted verbatim. Re-parse
 * then HTML-entity-decodes `&ouml;` to `ö`, breaking idempotence on the second
 * round-trip. The fix is to detect entity-shaped tails on serialize and emit
 * `\&entity;` so re-parse consumes the escape and preserves the literal entity
 * form.
 *
 * The negative lookbehind for `\` keeps already-escaped sequences (e.g. an
 * upstream `\&entity;` that survived through the pipeline) from doubling up.
 *
 * Loss mode (NG5, unchanged): bare `&entity;` in source still decodes to its
 * literal char on first parse — protection only kicks in when the source had
 * `\&entity;` (escape-marked) AND on subsequent serialize cycles to keep that
 * form stable. Plain text `Tom & Jerry` is untouched (`&` followed by space
 * is not an entity tail).
 */
function escapeEntityAmpersands(s: string): string {
  return s.replace(/(?<!\\)&(?=[A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#[xX][0-9A-Fa-f]+;)/g, '\\&');
}

function safeText(state: State, value: string, info: Info): string {
  const originalUnsafe = state.unsafe;
  state.unsafe = originalUnsafe.filter((u) => {
    if (u.character === '&' && u.after === '[#A-Za-z]') return false;
    if (u.character === '<') return false;
    // Plain text `[` / `(` is safe here: complete links/wiki-links parse into
    // dedicated mdast nodes, while incomplete bracket constructs should remain
    // literal prose instead of serializing with surprising backslashes.
    if (u.character === '[') return false;
    if (u.character === '(') return false;
    return true;
  });
  let result: string;
  try {
    result = state.safe(value, info);
  } finally {
    state.unsafe = originalUnsafe;
  }
  return escapeEntityAmpersands(result);
}
