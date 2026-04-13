/**
 * Custom mdast-util-to-markdown handlers. These read node.data.* to preserve
 * source-form delimiters when serializing back to markdown.
 */

export const customMdToMdHandlers: Record<string, any> = {
  yaml: (node: any) => {
    return `---\n${node.value ?? ''}\n---`;
  },
  // Override text to prevent backslash-escaping of `&` before [#A-Za-z].
  // The default "safety" escapes `&` to avoid ambiguity with character references;
  // but entity corruption is already avoided (we never encode to &amp;). Literal
  // `&` in source must survive the round trip unmolested.
  text: (node: any, _parent: any, state: any, info: any) => {
    // If position-walker attached sourceRaw (original source slice w/ backslash
    // escapes), emit it verbatim — storage-layer fidelity preserves authored form.
    if (node.data?.sourceRaw) {
      return node.data.sourceRaw;
    }
    // Temporarily remove unsafe rules that backslash-escape literal chars the
    // user authored intentionally: `&` (entity start guard), `<` (autolink/HTML
    // guard). These are render-layer concerns — storage-layer fidelity requires
    // surviving the round-trip. See CLAUDE.md "Storage-layer fidelity contract".
    const originalUnsafe = state.unsafe;
    const filtered = originalUnsafe.filter((u: any) => {
      if (u.character === '&' && u.after === '[#A-Za-z]') return false;
      if (u.character === '<') return false;
      return true;
    });
    state.unsafe = filtered;
    try {
      return state.safe(node.value, info);
    } finally {
      state.unsafe = originalUnsafe;
    }
  },

  emphasis: (node: any, _parent: any, state: any, info: any) => {
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

  strong: (node: any, _parent: any, state: any, info: any) => {
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

  // Override link so the URL doesn't get `&` backslash-escaped.
  link: (node: any, _parent: any, state: any, info: any) => {
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

    // URL — write raw (we'll trust the author's URL)
    const urlExit = state.enter('destinationRaw');
    const url = String(node.url ?? '');
    value += tracker.move(url);
    urlExit();

    if (node.title) {
      const titleExit = state.enter('titleQuote');
      value += tracker.move(' "');
      value += tracker.move(state.safe(node.title, { before: value, after: '"', ...tracker.current() }));
      value += tracker.move('"');
      titleExit();
    }
    value += tracker.move(')');
    exit();
    return value;
  },

  thematicBreak: (node: any) => {
    return node.data?.sourceRaw ?? '---';
  },

  break: (node: any) => {
    if (node.data?.sourceStyle === 'backslash') return '\\\n';
    return '  \n';
  },

  code: (node: any, _parent: any, state: any, info: any) => {
    const fenceChar = node.data?.sourceFenceChar;
    // Indented code blocks — use default path (fall through by returning undefined is not possible
    // with handlers; so we manually format it)
    if (fenceChar === 'indent') {
      const lines = String(node.value ?? '').split('\n');
      return lines.map((l) => '    ' + l).join('\n');
    }
    const char = fenceChar === '~' ? '~' : '`';
    const len = Math.max(3, node.data?.sourceFenceLength ?? 3);
    const fence = char.repeat(len);
    const lang = node.lang ?? '';
    const meta = node.meta ? ' ' + node.meta : '';
    const value = node.value ?? '';
    return `${fence}${lang}${meta}\n${value}\n${fence}`;
  },

  // Heading — respect ATX vs Setext
  heading: (node: any, _parent: any, state: any, info: any) => {
    const style = node.data?.sourceStyle ?? 'atx';
    const depth = node.depth;
    if (style === 'setext' && (depth === 1 || depth === 2)) {
      // Setext
      const content = state.containerPhrasing(node, { before: '\n', after: '\n', ...info });
      const underline = (depth === 1 ? '=' : '-').repeat(Math.max(content.length, 3));
      return content + '\n' + underline;
    }
    // ATX
    const hashes = '#'.repeat(depth);
    const content = state.containerPhrasing(node, { before: hashes + ' ', after: '\n', ...info });
    if (!content) return hashes;
    return `${hashes} ${content}`;
  },

  // List — bullet/ordered with preserved marker
  list: (node: any, parent: any, state: any, info: any) => {
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

    // Use state's built-in list handler logic by calling containerFlow on children
    // We'll manually walk children
    const children = node.children || [];
    const out: string[] = [];
    const delim = ordered ? (node.data?.listMarkerDelimiter ?? '.') : null;
    let counter = node.start ?? 1;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const marker = ordered ? `${counter + i}${delim}` : (node.data?.bulletMarker ?? bullet);
      const pad = ' '.repeat(marker.length + 1);
      const itemContent = state.containerFlow(child, { before: '\n', after: '\n', ...info });
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

  listItem: (node: any, _parent: any, state: any, info: any) => {
    // Delegated from list; fall back to default
    const content = state.containerFlow(node, { before: '\n', after: '\n', ...info });
    return content;
  },
};
