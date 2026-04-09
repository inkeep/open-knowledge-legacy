import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { mdManager } from './markdown';

export interface MarkdownStructuralSignature {
  frontmatterPresent: boolean;
  headingsByLevel: [number, number, number, number, number, number];
  listItems: number;
  blockquotes: number;
  tables: number;
  codeFences: number;
  jsxComponents: number;
}

interface PMNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
}

export function canonicalizeMarkdown(markdown: string): string {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const json = mdManager.parse(body);
  const serialized = mdManager.serialize(json);
  return prependFrontmatter(frontmatter, serialized);
}

export function structuralSignature(markdown: string): MarkdownStructuralSignature {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const root = mdManager.parse(body) as PMNode;

  const signature: MarkdownStructuralSignature = {
    frontmatterPresent: frontmatter.length > 0,
    headingsByLevel: [0, 0, 0, 0, 0, 0],
    listItems: 0,
    blockquotes: 0,
    tables: 0,
    codeFences: 0,
    jsxComponents: 0,
  };

  const visit = (node: PMNode): void => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'heading') {
      const level = Number(node.attrs?.level);
      if (Number.isInteger(level) && level >= 1 && level <= 6) {
        signature.headingsByLevel[level - 1]++;
      }
    } else if (node.type === 'listItem' || node.type === 'taskItem') {
      signature.listItems++;
    } else if (node.type === 'blockquote') {
      signature.blockquotes++;
    } else if (node.type === 'table') {
      signature.tables++;
    } else if (node.type === 'codeBlock') {
      signature.codeFences++;
    } else if (node.type === 'jsxComponent') {
      signature.jsxComponents++;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
  };

  visit(root);
  return signature;
}
