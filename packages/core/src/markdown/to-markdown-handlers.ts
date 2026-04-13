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

export const toMarkdownHandlers: Record<string, any> = {
  /**
   * text: strip `&` (before [#A-Za-z]) and `<` from the unsafe list.
   * Without this, every literal `&` or `<` in prose gets backslash-escaped,
   * violating NG5 storage-layer fidelity.
   *
   * Also handles D20 escapeMark: if the text carries data.escapedChars,
   * re-emit backslash sequences for structurally-ambiguous escapes.
   */
  text(node: any, _parent: any, state: any, info: any) {
    // D20: if position-walker tagged escaped chars, reconstruct source form
    if (node.data?.escapedChars?.length > 0) {
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
  emphasis(node: any, _parent: any, state: any, info: any) {
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
  strong(node: any, _parent: any, state: any, info: any) {
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
   * link: write URL verbatim (no `&` escaping in URLs).
   */
  link(node: any, _parent: any, state: any, info: any) {
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
    value += tracker.move(String(node.url ?? ''));
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
   * thematicBreak: emit node.data.sourceRaw verbatim, EXCEPT when at doc
   * start — in that position `---` is indistinguishable from empty YAML
   * frontmatter under `remark-frontmatter`, and re-parsing would tokenize
   * the block differently. Normalize doc-start `---` thematicBreaks to
   * `***` to guarantee idempotent round-trip (I3/I4/I5/I7).
   *
   * Fidelity trade: a user authoring a document that begins with `---`
   * intending a thematicBreak (not frontmatter) will see it persisted as
   * `***`. Documented as NG10. Non-doc-start thematicBreaks preserve
   * `sourceRaw` faithfully.
   */
  thematicBreak(node: any, _parent: any, state: { indexStack: number[] }) {
    const sourceRaw = node.data?.sourceRaw;
    // Detect "at doc start": top-level parent (indexStack.length === 1) and
    // first child (indexStack[0] === 0). When both hold AND the preserved
    // form starts with `---`, normalize to `***` to avoid frontmatter
    // ambiguity on re-parse.
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
  break(node: any) {
    if (node.data?.sourceStyle === 'backslash') return '\\\n';
    return '  \n';
  },

  /**
   * code: preserve fence char and length.
   */
  code(node: any) {
    const fenceChar = node.data?.sourceFenceChar;
    if (fenceChar === 'indent') {
      const lines = String(node.value ?? '').split('\n');
      return lines.map((l: string) => `    ${l}`).join('\n');
    }
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
  heading(node: any, _parent: any, state: any, info: any) {
    const style = node.data?.sourceStyle ?? 'atx';
    const depth = node.depth;
    if (style === 'setext' && (depth === 1 || depth === 2)) {
      const content = state.containerPhrasing(node, { before: '\n', after: '\n', ...info });
      const underline = (depth === 1 ? '=' : '-').repeat(Math.max(content.length, 3));
      return `${content}\n${underline}`;
    }
    const hashes = '#'.repeat(depth);
    const content = state.containerPhrasing(node, {
      before: `${hashes} `,
      after: '\n',
      ...info,
    });
    if (!content) return hashes;
    return `${hashes} ${content}`;
  },

  /**
   * list: preserve bullet marker and ordered delimiter.
   */
  list(node: any, _parent: any, state: any, info: any) {
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
      const itemContent = state.containerFlow(child, {
        before: '\n',
        after: '\n',
        ...info,
      });
      const indented = itemContent
        .split('\n')
        .map((l: string, idx: number) => (idx === 0 ? `${marker} ${l}` : l ? `${pad}${l}` : l))
        .join('\n');
      out.push(indented);
    }

    state.bulletCurrent = savedBullet;
    state.bulletLastUsed = savedBulletLast;

    const sep = node.spread ? '\n\n' : '\n';
    return out.join(sep);
  },
};

/**
 * Emit text through state.safe with NG5-specific strips applied to the
 * mdast-util-to-markdown unsafe list.
 *
 * We preserve authoring-form fidelity by removing escapes the pipeline does
 * not need:
 *   - `&` before `[#A-Za-z]` — mdast-util-to-markdown escapes to avoid HTML
 *     entity round-trip; NG5 forbids storage-layer entity handling.
 *   - `<` — mdast-util-to-markdown escapes to prevent re-parse as inline HTML
 *     or JSX; our R23 `protectFromMdx` guard already handles those tokenizers,
 *     so escaping `<` in serialized text produces a false positive on re-parse.
 *   - `:` — mdast-util-to-markdown escapes to prevent re-parse as autolink
 *     scheme; our R23 guard already tames autolinks, so the escape adds a
 *     backslash that our autolink regex rejects on re-parse (breaking idempotence
 *     of `<url>` text when the URL body was preserved as literal text by the
 *     guard-and-restore path).
 */
function safeText(state: any, value: string, info: any): string {
  const originalUnsafe = state.unsafe;
  state.unsafe = originalUnsafe.filter((u: any) => {
    if (u.character === '&' && u.after === '[#A-Za-z]') return false;
    if (u.character === '<') return false;
    if (u.character === ':') return false;
    // `@` is escaped in the default unsafe list because remark-gfm's email
    // autolink-literal would re-claim `user@host` on re-parse. Our R23 guard
    // protects wrapped autolinks via GUARD_AT so we do not need the escape,
    // and keeping it would produce `<mailto:a\@b.com>` which is not
    // byte-identical and breaks idempotence through the autolink guard.
    if (u.character === '@') return false;
    return true;
  });
  try {
    return state.safe(value, info);
  } finally {
    state.unsafe = originalUnsafe;
  }
}
