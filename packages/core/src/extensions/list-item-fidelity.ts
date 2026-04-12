/**
 * ListItem extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-list-item (preserving Tab/Shift+Tab indent/dedent
 * and Enter split behavior) and reads the parent node's bulletMarker or
 * listMarkerDelimiter attribute to use the correct prefix when rendering markdown.
 */

import { renderNestedMarkdownContent } from '@tiptap/core';
import ListItem from '@tiptap/extension-list-item';

export const ListItemFidelity = ListItem.extend({
  priority: 60,

  markdownTokenName: 'list_item',

  parseMarkdown(token: any, helpers: any) {
    if (token.type !== 'list_item') {
      return [];
    }
    const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren;
    let content: any[] = [];
    if (token.tokens && token.tokens.length > 0) {
      const hasParagraphTokens = token.tokens.some((t: any) => t.type === 'paragraph');
      if (hasParagraphTokens) {
        content = parseBlockChildren(token.tokens);
      } else {
        const firstToken = token.tokens[0];
        if (
          firstToken &&
          firstToken.type === 'text' &&
          firstToken.tokens &&
          firstToken.tokens.length > 0
        ) {
          const inlineContent = helpers.parseInline(firstToken.tokens);
          content = [{ type: 'paragraph', content: inlineContent }];
          if (token.tokens.length > 1) {
            const remainingTokens = token.tokens.slice(1);
            content.push(...parseBlockChildren(remainingTokens));
          }
        } else {
          content = parseBlockChildren(token.tokens);
        }
      }
    }
    if (content.length === 0) {
      content = [{ type: 'paragraph', content: [] }];
    }
    return { type: 'listItem', content };
  },

  renderMarkdown(node: any, h: any, ctx: any) {
    return renderNestedMarkdownContent(
      node,
      h,
      (context: any) => {
        if (context.parentType === 'bulletList') {
          const marker = context.meta?.parentAttrs?.bulletMarker ?? '-';
          return `${marker} `;
        }
        if (context.parentType === 'orderedList') {
          const start = context.meta?.parentAttrs?.start || 1;
          const delim = context.meta?.parentAttrs?.listMarkerDelimiter ?? '.';
          return `${start + context.index}${delim} `;
        }
        return '- ';
      },
      ctx,
    );
  },
});
