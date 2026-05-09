import { applyFastDiff, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { updateYFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { mdManager, schema } from './md-manager.ts';

interface EmbedResolverContext {
  resolveEmbed: (basename: string, sourcePath: string) => string | null;
  resolveSize?: (basename: string, sourcePath: string) => number | null;
  sourcePath: string;
}

export function composeAndWriteRawBody(
  document: Y.Doc,
  rawContent: string,
  embedResolver?: EmbedResolverContext,
): void {
  const xmlFragment = document.getXmlFragment('default');
  const ytext = document.getText('source');
  const currentYText = ytext.toString();

  const { body } = stripFrontmatter(rawContent);
  const parseOpts = embedResolver
    ? {
        resolveEmbed: embedResolver.resolveEmbed,
        resolveSize: embedResolver.resolveSize,
        sourcePath: embedResolver.sourcePath,
      }
    : undefined;
  const parsedJson = mdManager.parseWithFallback(body, parseOpts);
  const pmNode = schema.nodeFromJSON(parsedJson);

  if (currentYText !== rawContent) {
    applyFastDiff(ytext, currentYText, rawContent);
  }

  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(document, xmlFragment, pmNode, meta);
}
