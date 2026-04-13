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

    // Default: strip `&` and `<` from unsafe list
    return safeText(state, node.value ?? '', info);
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
   * thematicBreak: emit node.data.sourceRaw verbatim.
   */
  thematicBreak(node: any) {
    return node.data?.sourceRaw ?? '---';
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
      const marker = ordered ? `${counter + i}${delim}` : (node.data?.bulletMarker ?? bullet);
      const pad = ' '.repeat(marker.length + 1);
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
 * Emit text through state.safe with `&` and `<` stripped from the unsafe list.
 */
function safeText(state: any, value: string, info: any): string {
  const originalUnsafe = state.unsafe;
  state.unsafe = originalUnsafe.filter((u: any) => {
    if (u.character === '&' && u.after === '[#A-Za-z]') return false;
    if (u.character === '<') return false;
    return true;
  });
  try {
    return state.safe(value, info);
  } finally {
    state.unsafe = originalUnsafe;
  }
}
