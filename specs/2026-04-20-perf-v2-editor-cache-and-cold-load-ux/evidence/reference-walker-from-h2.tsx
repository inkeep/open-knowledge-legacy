/**
 * Markdown → React pipeline v2 — custom mdast walker.
 *
 * Bypasses hast conversion entirely. Walks mdast and emits React.createElement
 * for each node. Handles mdxJsxFlowElement / mdxJsxTextElement by looking up
 * componentMap[name] and extracting simple string / expression attrs.
 *
 * This mirrors the pattern OK would need: our componentMap of fumadocs
 * components + custom handlers for our promoted mdast types (wikiLink, etc.).
 *
 * For attrs that are MDX expressions (`items={[...]}` — an array literal),
 * we eval the JS expression string. Intentionally trusts authored markdown
 * since MDX already runs arbitrary JS at compile time; no new attack surface.
 */
import React, { createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import type {
  Root,
  Content,
  Paragraph,
  Heading,
  Text,
  Strong,
  Emphasis,
  InlineCode,
  Code,
  List,
  ListItem,
  Blockquote,
  Link,
  Image,
  ThematicBreak,
  Break,
  Table,
  TableRow,
  TableCell,
  Delete,
  Html,
} from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement, MdxJsxAttribute } from 'mdast-util-mdx-jsx';

import { Callout } from 'fumadocs-ui/components/callout';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Accordions, Accordion } from 'fumadocs-ui/components/accordion';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Cards, Card } from 'fumadocs-ui/components/card';
import { Files, File, Folder } from 'fumadocs-ui/components/files';

const componentMap: Record<string, React.ComponentType<any>> = {
  Callout, Tabs, Tab, Accordions, Accordion, Steps, Step,
  Cards, Card, Files, File, Folder,
};

type AnyMdNode = Content | Root | MdxJsxFlowElement | MdxJsxTextElement;

function renderChildren(nodes: readonly AnyMdNode[] | undefined): ReactNode[] {
  if (!nodes) return [];
  return nodes.map((n, i) => renderNode(n, i));
}

function parseAttrValue(attr: MdxJsxAttribute): unknown {
  if (attr.value === null || attr.value === undefined) return true;
  if (typeof attr.value === 'string') return attr.value;
  // MdxJsxAttributeValueExpression — .value is the raw expression string
  // e.g. "['TypeScript', 'JavaScript']"
  // For a static fallback, trusted-source JS eval is acceptable (authored
  // content, not user input). Production OK code might replace this with
  // a restricted parser (JSON.parse for arrays/objects/primitives).
  const raw = attr.value.value;
  try {
    // eslint-disable-next-line no-new-func -- trusted authored markdown
    return new Function(`return (${raw})`)();
  } catch {
    return raw;
  }
}

function attrsToProps(attrs: MdxJsxAttribute[] | undefined): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (!attrs) return props;
  for (const a of attrs) {
    if (a.type !== 'mdxJsxAttribute') continue;
    props[a.name] = parseAttrValue(a);
  }
  return props;
}

function renderNode(node: AnyMdNode, key: number): ReactNode {
  switch (node.type) {
    case 'root': {
      return createElement(Fragment, { key }, ...renderChildren((node as Root).children as AnyMdNode[]));
    }
    case 'paragraph':
      return createElement('p', { key }, ...renderChildren((node as Paragraph).children as AnyMdNode[]));
    case 'heading': {
      const h = node as Heading;
      return createElement(`h${h.depth}`, { key }, ...renderChildren(h.children as AnyMdNode[]));
    }
    case 'text':
      return (node as Text).value;
    case 'strong':
      return createElement('strong', { key }, ...renderChildren((node as Strong).children as AnyMdNode[]));
    case 'emphasis':
      return createElement('em', { key }, ...renderChildren((node as Emphasis).children as AnyMdNode[]));
    case 'inlineCode':
      return createElement('code', { key }, (node as InlineCode).value);
    case 'code': {
      const c = node as Code;
      return createElement('pre', { key }, createElement('code', { className: c.lang ? `language-${c.lang}` : undefined }, c.value));
    }
    case 'list': {
      const l = node as List;
      const Tag = l.ordered ? 'ol' : 'ul';
      return createElement(Tag, { key, start: l.start ?? undefined }, ...renderChildren(l.children as AnyMdNode[]));
    }
    case 'listItem':
      return createElement('li', { key }, ...renderChildren((node as ListItem).children as AnyMdNode[]));
    case 'blockquote':
      return createElement('blockquote', { key }, ...renderChildren((node as Blockquote).children as AnyMdNode[]));
    case 'link': {
      const l = node as Link;
      return createElement('a', { key, href: l.url, title: l.title ?? undefined }, ...renderChildren(l.children as AnyMdNode[]));
    }
    case 'image': {
      const i = node as Image;
      return createElement('img', { key, src: i.url, alt: i.alt ?? '', title: i.title ?? undefined });
    }
    case 'thematicBreak':
      return createElement('hr', { key });
    case 'break':
      return createElement('br', { key });
    case 'delete':
      return createElement('del', { key }, ...renderChildren((node as Delete).children as AnyMdNode[]));
    case 'table':
      return createElement('table', { key }, createElement('tbody', null, ...renderChildren((node as Table).children as AnyMdNode[])));
    case 'tableRow':
      return createElement('tr', { key }, ...renderChildren((node as TableRow).children as AnyMdNode[]));
    case 'tableCell':
      return createElement('td', { key }, ...renderChildren((node as TableCell).children as AnyMdNode[]));
    case 'html':
      return createElement('span', { key, dangerouslySetInnerHTML: { __html: (node as Html).value } });
    case 'yaml':
    case 'toml':
      return null; // frontmatter — skip
    case 'mdxJsxFlowElement':
    case 'mdxJsxTextElement': {
      const el = node as MdxJsxFlowElement | MdxJsxTextElement;
      const name = el.name;
      if (!name) {
        // Fragment <>...</> — treat as Fragment
        return createElement(Fragment, { key }, ...renderChildren(el.children as AnyMdNode[]));
      }
      const Component = componentMap[name];
      const props = attrsToProps(el.attributes as MdxJsxAttribute[]);
      const children = renderChildren(el.children as AnyMdNode[]);
      if (Component) {
        return createElement(Component, { key, ...props }, ...children);
      }
      // Unknown component → fallback as inline-code label + raw children
      return createElement(
        'div',
        { key, style: { background: '#eee', padding: '4px 8px', borderRadius: 4 } },
        `<${name}>`,
        ...children,
        `</${name}>`,
      );
    }
    default:
      // Unrecognized node — render nothing rather than crash
      return null;
  }
}

export function renderMarkdown2(md: string): ReactElement {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(md) as Root;

  return renderNode(tree as AnyMdNode, 0) as ReactElement;
}
