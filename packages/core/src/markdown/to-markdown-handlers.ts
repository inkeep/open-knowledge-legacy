
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
    const fenceChar = node.data?.sourceFenceChar;
    const char = fenceChar === '~' ? '~' : '`';
    const len = Math.max(3, node.data?.sourceFenceLength ?? 3);
    const fence = char.repeat(len);
    const lang = node.lang ?? '';
    const meta = node.meta ? ` ${node.meta}` : '';
    const value = node.value ?? '';
    return `${fence}${lang}${meta}\n${value}\n${fence}`;
  },

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

  mdxJsxFlowElement(node, _parent, state, info) {
    const mdxNode = node as unknown as MdxJsxFlowElement;
    const raw = mdxNode.data?.sourceRaw;
    if (typeof raw === 'string') return raw;

    const boundary = mdxNode.data?.htmlBoundary;
    if (boundary && typeof boundary.opener === 'string' && typeof boundary.closer === 'string') {
      const childContent = state.containerFlow(
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
      { type: 'root', children: mdxNode.children } as any,
      info,
    );

    return `${openTag}\n\n${childContent}\n\n${closeTag}`;
  },

  mdxJsxTextElement(node) {
    const raw = node.data?.sourceRaw;
    if (typeof raw === 'string') return raw;
    const name = node.name ?? '';
    return `<${name}/>`;
  },

  rawMdxFallback(node) {
    return (node.value ?? '') as string;
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
