import type { Root as MdastRoot } from 'mdast';
import type { VFile } from 'vfile';

export const KNOWN_MDAST_TYPES: ReadonlySet<string> = new Set([
  'root',
  'paragraph',
  'heading',
  'text',
  'emphasis',
  'strong',
  'blockquote',
  'list',
  'listItem',
  'code',
  'inlineCode',
  'link',
  'image',
  'linkReference',
  'imageReference',
  'definition',
  'html',
  'thematicBreak',
  'break',
  'yaml',
  'toml',
  'table',
  'tableRow',
  'tableCell',
  'delete',
  'footnoteDefinition',
  'footnoteReference',
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'wikiLink',
  'wikiLinkEmbed',
  'tag',
  'math',
  'inlineMath',
  'mark',
  'comment',
  'commentBlock',
  'rawMdxFallbackMdast',
]);

export function unknownMdastGuardPlugin() {
  return (tree: MdastRoot, file: VFile) => {
    const source = String(file.value ?? '');
    walk(tree as unknown as WalkableNode, source);
  };
}

interface WalkableNode {
  type?: string;
  children?: unknown[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
}

function walk(node: WalkableNode | null | undefined, source: string): void {
  if (!node || typeof node !== 'object') return;
  if (!Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i] as WalkableNode;
    if (!child || typeof child !== 'object' || typeof child.type !== 'string') continue;
    if (!KNOWN_MDAST_TYPES.has(child.type)) {
      node.children[i] = toRawMdxFallbackMdast(child, source);
    } else {
      walk(child, source);
    }
  }
}

interface RawMdxFallbackMdast {
  type: 'rawMdxFallbackMdast';
  originalType: string;
  value: string;
  position?: WalkableNode['position'];
}

export function toRawMdxFallbackMdast(node: WalkableNode, source: string): RawMdxFallbackMdast {
  const start = node.position?.start?.offset ?? 0;
  const end = node.position?.end?.offset ?? 0;
  const sourceSlice = end > start ? source.slice(start, end) : '';
  return {
    type: 'rawMdxFallbackMdast',
    originalType: node.type ?? 'unknown',
    value: sourceSlice || (node.type ?? 'unknown'),
    position: node.position,
  };
}
