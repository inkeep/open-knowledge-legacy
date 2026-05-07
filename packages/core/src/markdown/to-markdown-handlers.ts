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

declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    mark: 'mark';
    comment: 'comment';
    commentBlock: 'commentBlock';
  }
}

type MdastToMarkdownHandlerFor<N extends Nodes['type']> = (
  node: Extract<Nodes, { type: N }>,
  parent: Parents | undefined,
  state: State,
  info: Info,
) => string;

type MdastToMarkdownHandlers = {
  [K in Nodes['type']]: MdastToMarkdownHandlerFor<K>;
} & {
  mdxJsxFlowElement: (node: Nodes, parent: Parents | undefined, state: State, info: Info) => string;
};

export const toMarkdownHandlers = {
  text(node, _parent, state, info) {
    if (typeof node.data?.sourceRaw === 'string') {
      return node.data.sourceRaw;
    }

    if (node.data?.escapedChars?.length) {
      const value: string = node.value ?? '';
      const escaped: Array<{ offset: number; char: string }> = node.data.escapedChars;
      let result = '';
      let lastIdx = 0;
      for (const { offset, char } of escaped) {
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

    return safeText(state, (node.value ?? '').replaceAll('\u00A0', ' '), info);
  },

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

  link(node, _parent, state, info) {
    if (node.data?.sourceStyle === 'autolink') {
      return `<${node.url ?? ''}>`;
    }
    if (node.data?.sourceStyle === 'gfm-autolink') {
      const onlyChild = node.children?.length === 1 ? node.children[0] : null;
      if (onlyChild?.type === 'text' && typeof onlyChild.value === 'string') {
        return onlyChild.value;
      }
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
    const urlRaw = String(node.url ?? '');
    const wantAngles = node.data?.sourceUrlForm === 'angle-bracketed';
    const alreadyAngled = urlRaw.startsWith('<') && urlRaw.endsWith('>');
    const urlOut = wantAngles && !alreadyAngled ? `<${urlRaw}>` : formatLinkUrl(urlRaw);
    value += tracker.move(urlOut);
    urlExit();

    if (node.title) {
      const marker = node.data?.sourceTitleMarker ?? 'double';
      value += tracker.move(emitLinkTitle(node.title, marker));
    }
    value += tracker.move(')');
    exit();
    return value;
  },

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

  definition(node, _parent, state, info) {
    const layout = node.data?.sourceLayout ?? 'inline';
    const marker = node.data?.sourceTitleMarker ?? 'double';

    const exit = state.enter('definition');
    const tracker = state.createTracker(info);

    const labelExit = state.enter('label');
    let value = tracker.move('[');
    value += tracker.move(
      state.safe(state.associationId(node), {
        before: value,
        after: ']',
        ...tracker.current(),
      }),
    );
    value += tracker.move(']:');
    labelExit();

    const sep1 = layout === 'multiline' ? '\n  ' : ' ';
    value += tracker.move(sep1);

    const urlRaw = String(node.url ?? '');
    if (!urlRaw || /[\0- ]/.test(urlRaw)) {
      const destExit = state.enter('destinationLiteral');
      value += tracker.move('<');
      value += tracker.move(
        state.safe(urlRaw, { before: value, after: '>', ...tracker.current() }),
      );
      value += tracker.move('>');
      destExit();
    } else {
      const destExit = state.enter('destinationRaw');
      value += tracker.move(formatLinkUrl(urlRaw));
      destExit();
    }

    if (node.title) {
      const titleSep = layout === 'multiline' ? '\n  ' : ' ';
      value += tracker.move(emitLinkTitle(node.title, marker, titleSep));
    }

    exit();
    return value;
  },

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

  break(node) {
    if (node.data?.sourceStyle === 'backslash') return '\\\n';
    return '  \n';
  },

  code(node) {
    const value = node.value ?? '';
    if (node.data?.sourceStyle === 'indented') {
      const indented = value
        .split('\n')
        .map((line) => (line.length > 0 ? `    ${line}` : line))
        .join('\n');
      return indented;
    }
    const fenceChar = node.data?.sourceFenceChar;
    const char = fenceChar === '~' ? '~' : '`';
    const len = Math.max(3, node.data?.sourceFenceLength ?? 3);
    const fence = char.repeat(len);
    const lang = node.lang ?? '';
    const meta = node.meta ? ` ${node.meta}` : '';
    return `${fence}${lang}${meta}\n${value}\n${fence}`;
  },

  inlineCode(node) {
    let value = node.value ?? '';
    const requestedChar = node.data?.sourceFenceChar;
    const fenceChar = requestedChar === '~' ? '~' : '`';
    const requestedLen =
      typeof node.data?.sourceFenceLength === 'number' && node.data.sourceFenceLength > 0
        ? node.data.sourceFenceLength
        : 1;

    const escaped = fenceChar === '`' ? '`' : '~';
    let length = requestedLen;
    while (new RegExp(`(^|[^${escaped}])${escaped.repeat(length)}([^${escaped}]|$)`).test(value)) {
      length += 1;
    }
    const fence = fenceChar.repeat(length);

    if (
      /[^ \r\n]/.test(value) &&
      ((/^[ \r\n]/.test(value) && /[ \r\n]$/.test(value)) ||
        value.startsWith(fenceChar) ||
        value.endsWith(fenceChar))
    ) {
      value = ` ${value} `;
    }

    return `${fence}${value}${fence}`;
  },

  heading(node, _parent, state, info) {
    const style = node.data?.sourceStyle ?? 'atx';
    const depth = node.depth;
    if (style === 'setext' && (depth === 1 || depth === 2)) {
      const content = state.containerPhrasing(node, { ...info, before: '\n', after: '\n' });
      const captured = node.data?.sourceUnderlineLength;
      const underlineLength =
        typeof captured === 'number' && captured >= 1 ? captured : Math.max(content.length, 3);
      const underline = (depth === 1 ? '=' : '-').repeat(underlineLength);
      return `${content}\n${underline}`;
    }
    const hashes = '#'.repeat(depth);
    const content = state.containerPhrasing(node, {
      ...info,
      before: `${hashes} `,
      after: '\n',
    });
    const trailingCount = node.data?.sourceTrailingHashes;
    if (typeof trailingCount === 'number' && trailingCount > 0) {
      const trailing = '#'.repeat(trailingCount);
      if (!content) return `${hashes} ${trailing}`;
      return `${hashes} ${content} ${trailing}`;
    }
    if (!content) return hashes;
    return `${hashes} ${content}`;
  },

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

  table(node, _parent, state, info) {
    const around = ' ';
    const tableExit = state.enter('table');

    const matrix: string[][] = [];
    const rows = node.children ?? [];
    for (const row of rows) {
      const cellNodes = row.children ?? [];
      const cells: string[] = [];
      for (const cell of cellNodes) {
        const cellExit = state.enter('tableCell');
        const phrasingExit = state.enter('phrasing');
        const value = state.containerPhrasing(cell, {
          ...info,
          before: around,
          after: around,
        });
        phrasingExit();
        cellExit();
        cells.push(value);
      }
      matrix.push(cells);
    }
    tableExit();

    const alignArr = node.align ?? [];
    const dashCounts = node.data?.sourceDashCounts;
    const headerWidth = matrix[0]?.length ?? 0;
    const bodyWidth = matrix.slice(1).reduce((m, r) => Math.max(m, r.length), 0);
    const mostCellsPerRow = Math.max(headerWidth, bodyWidth, alignArr.length);

    const alignmentCells: string[] = [];
    for (let col = 0; col < mostCellsPerRow; col++) {
      const align = alignArr[col];
      let before = '';
      let after = '';
      if (align === 'center') {
        before = ':';
        after = ':';
      } else if (align === 'left') {
        before = ':';
      } else if (align === 'right') {
        after = ':';
      }
      const userDashCount = dashCounts?.[col];
      const dashCount = typeof userDashCount === 'number' && userDashCount >= 1 ? userDashCount : 1;
      alignmentCells.push(before + '-'.repeat(dashCount) + after);
    }

    const formatRow = (cells: string[]): string => {
      const padded = [...cells];
      while (padded.length < mostCellsPerRow) padded.push('');
      return `| ${padded.join(' | ')} |`;
    };

    if (matrix.length === 0) {
      return formatRow(alignmentCells);
    }

    const lines: string[] = [];
    lines.push(formatRow(matrix[0]));
    lines.push(formatRow(alignmentCells));
    for (let i = 1; i < matrix.length; i++) {
      lines.push(formatRow(matrix[i]));
    }
    return lines.join('\n');
  },

  mdxJsxFlowElement(node, _parent, state, info) {
    const mdxNode = node as unknown as MdxJsxFlowElement;
    const raw = mdxNode.data?.sourceRaw;
    if (typeof raw === 'string') return raw;

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

    const childContent = state.containerFlow(
      // biome-ignore lint/suspicious/noExplicitAny: safe cast for synthetic root
      { type: 'root', children: mdxNode.children } as any,
      info,
    );

    return `${openTag}\n\n${childContent}\n\n${closeTag}`;
  },

  mark(node, _parent, state, info) {
    const tracker = state.createTracker(info);
    const exit = state.enter('mark');
    let value = tracker.move('==');
    value += state.containerPhrasing(node as Parents, {
      before: value,
      after: '==',
      ...tracker.current(),
    });
    value += tracker.move('==');
    exit();
    return value;
  },

  /**
   * comment (literal authoring annotation, hidden in WYSIWYG): branch
   * on `data.sourceForm` to preserve the authored delimiter form on
   * round-trip. `'html'` emits `<!-- text -->`; `'percent'` (default)
   * emits `%%text%%`.
   *
   * Source-form preservation matters for two reasons:
   *
   *   1. Author intent: `<!--` is the universal HTML comment form
   *      familiar to anyone who's edited HTML or markdown that targets
   *      HTML rendering; `%%` is Obsidian-specific. Authors who type
   *      one shouldn't see it silently rewritten to the other.
   *
   *   2. Round-trip safety: HTML comments whose body contains literal
   *      `%%` produce invalid byte sequences when canonicalised to
   *      `%%body%%`. The inline `%%` walker re-claims part of the span
   *      on re-parse (e.g. `%%text with %%X%% inside%%` matches as one
   *      comment with body `text with %%X` plus orphan trailing `%%`),
   *      splitting one comment into two and leaving leftover prose.
   *      Preserving `<!--` form sidesteps this entirely — `<!--` /
   *      `-->` delimiters never collide with `%%` body content.
   *
   * Whitespace note: post-relaxation, the `%%` parser accepts
   * whitespace inside the delimiters (`%% text %%` matches with body
   * ` text `; rule 4 only requires at least one non-whitespace char
   * somewhere in the body). The serializer preserves the body bytes
   * verbatim — leading/trailing whitespace inside the body survives
   * round-trip. The `<!--` form has no flanking rules either; the
   * parser trims one inner space on either side, so we re-emit with
   * the same `<!-- text -->` spacing.
   */
  comment(node, _parent, state, info) {
    const sourceForm = node.data?.sourceForm;
    const open = sourceForm === 'html' ? '<!-- ' : '%%';
    const close = sourceForm === 'html' ? ' -->' : '%%';
    const tracker = state.createTracker(info);
    const exit = state.enter('comment');
    let value = tracker.move(open);
    value += state.containerPhrasing(node as Parents, {
      before: value,
      after: close,
      ...tracker.current(),
    });
    value += tracker.move(close);
    exit();
    return value;
  },

  commentBlock(node, _parent, state, info) {
    const tracker = state.createTracker(info);
    const exit = state.enter('commentBlock');

    const children = node.children ?? [];
    const sourceForm = node.data?.sourceForm;
    const sourceLayout = node.data?.sourceLayout;
    const isSingleParagraph = children.length === 1 && children[0]?.type === 'paragraph';

    if (sourceForm === 'html' && isSingleParagraph) {
      const para = children[0] as Parents;
      const inner = state.containerPhrasing(para, {
        before: '<!-- ',
        after: ' -->',
        ...tracker.current(),
      });
      exit();
      return `<!-- ${inner} -->`;
    }

    if (sourceLayout === 'inline' && isSingleParagraph) {
      const para = children[0] as Parents;
      const inner = state.containerPhrasing(para, {
        before: '%% ',
        after: ' %%',
        ...tracker.current(),
      });
      exit();
      return `%% ${inner} %%`;
    }

    // biome-ignore lint/suspicious/noExplicitAny: containerFlow's FlowParents type narrows to a closed set; commentBlock is a custom block-level promoted type that holds flow children, but its augmented mdast type isn't in the FlowParents union. The runtime call is correct.
    const inner = state.containerFlow(node as any, tracker.current());
    exit();
    return `%%\n\n${inner}\n\n%%`;
  },

  mdxJsxTextElement(node) {
    const raw = node.data?.sourceRaw;
    if (typeof raw === 'string') return raw;
    const name = node.name ?? '';
    const attrs = serializeMdxJsxAttrs(node.attributes ?? []);
    return attrs ? `<${name} ${attrs} />` : `<${name}/>`;
  },

  rawMdxFallback(node) {
    return (node.value ?? '') as string;
  },

  blockquote(node, _parent, state, info) {
    const exit = state.enter('blockquote');
    const tracker = state.createTracker(info);
    tracker.move('> ');
    tracker.shift(2);
    const inner = state.containerFlow(node, tracker.current());
    exit();

    const spacings = node.data?.sourceMarkerSpacings;
    let nonBlankIdx = 0;

    return state.indentLines(inner, (line, _lineNumber, blank) => {
      if (blank) return '>';
      const spacing = spacings?.[nonBlankIdx++];
      if (spacing === 'none') return `>${line}`;
      return `> ${line}`;
    });
  },
} satisfies Partial<MdastToMarkdownHandlers>;

function serializeMdxJsxAttrs(attrs: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>): string {
  const parts: string[] = [];
  for (const attr of attrs) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      parts.push(`{${attr.value}}`);
      continue;
    }
    const name = attr.name;
    if (attr.value === null || attr.value === undefined) {
      parts.push(name);
      continue;
    }
    if (typeof attr.value === 'string') {
      if (attr.value.includes('"')) {
        const escaped = attr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        parts.push(`${name}={"${escaped}"}`);
      } else {
        parts.push(`${name}="${attr.value}"`);
      }
      continue;
    }
    parts.push(`${name}={${attr.value.value}}`);
  }
  return parts.join(' ');
}

function emitLinkTitle(
  title: string,
  marker: 'single' | 'double' | 'paren',
  separator: string = ' ',
): string {
  if (marker === 'single') {
    return `${separator}'${title.replace(/'/g, "\\'")}'`;
  }
  if (marker === 'paren') {
    return `${separator}(${title.replace(/[()]/g, '\\$&')})`;
  }
  return `${separator}"${title.replace(/"/g, '\\"')}"`;
}

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

  return url.replace(/[\\()]/g, '\\$&');
}

function escapeEntityAmpersands(s: string): string {
  return s.replace(/(?<!\\)&(?=[A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#[xX][0-9A-Fa-f]+;)/g, '\\&');
}

function safeText(state: State, value: string, info: Info): string {
  const originalUnsafe = state.unsafe;
  state.unsafe = originalUnsafe.filter((u) => {
    if (u.character === '&' && u.after === '[#A-Za-z]') return false;
    if (u.character === '<') return false;
    if (u.character === '[') return false;
    if (u.character === '(') return false;
    if (u.character === '`') return false;
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
