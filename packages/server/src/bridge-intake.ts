import { applyFastDiff, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { updateYFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { mdManager, schema } from './md-manager.ts';
import { withSpanSync } from './telemetry.ts';

interface EmbedResolverContext {
  resolveEmbed: (basename: string, sourcePath: string) => string | null;
  resolveSize?: (basename: string, sourcePath: string) => number | null;
  sourcePath: string;
}

type EmbedResolverArg = EmbedResolverContext | false | undefined;

function buildParseOpts(embedResolver: EmbedResolverArg):
  | {
      resolveEmbed: EmbedResolverContext['resolveEmbed'];
      resolveSize?: EmbedResolverContext['resolveSize'];
      sourcePath: string;
    }
  | undefined {
  return embedResolver
    ? {
        resolveEmbed: embedResolver.resolveEmbed,
        resolveSize: embedResolver.resolveSize,
        sourcePath: embedResolver.sourcePath,
      }
    : undefined;
}

export type ComposeWriteSurface =
  | 'agent'
  | 'file-watcher'
  | 'managed-rename'
  | 'undo'
  | 'frontmatter';

export function composeAndWriteRawBody(
  document: Y.Doc,
  rawContent: string,
  surface: ComposeWriteSurface,
  embedResolver?: EmbedResolverArg,
): void {
  withSpanSync(
    'bridge.composeAndWriteRawBody',
    {
      attributes: {
        surface,
        'body.bytes': rawContent.length,
        'doc.name': document.guid,
      },
    },
    () => {
      const xmlFragment = document.getXmlFragment('default');
      const ytext = document.getText('source');
      const currentYText = ytext.toString();

      const { body } = stripFrontmatter(rawContent);
      const parsedJson = withSpanSync(
        'md.parseWithFallback',
        { attributes: { 'body.bytes': body.length, 'doc.name': document.guid } },
        () => mdManager.parseWithFallback(body, buildParseOpts(embedResolver)),
      );
      const pmNode = schema.nodeFromJSON(parsedJson);

      if (currentYText !== rawContent) {
        applyFastDiff(ytext, currentYText, rawContent);
      }

      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(document, xmlFragment, pmNode, meta);
    },
  );
}

export function replaceRawBody(
  document: Y.Doc,
  rawContent: string,
  embedResolver?: EmbedResolverArg,
): void {
  const xmlFragment = document.getXmlFragment('default');
  const ytext = document.getText('source');

  const { body } = stripFrontmatter(rawContent);
  const parsedJson = mdManager.parseWithFallback(body, buildParseOpts(embedResolver));
  const pmNode = schema.nodeFromJSON(parsedJson);

  const currentText = ytext.toString();
  if (currentText !== rawContent) {
    ytext.delete(0, currentText.length);
    ytext.insert(0, rawContent);
  }

  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(document, xmlFragment, pmNode, meta);
}

export function deriveFragmentFromYtext(document: Y.Doc, embedResolver?: EmbedResolverArg): void {
  const xmlFragment = document.getXmlFragment('default');
  const ytext = document.getText('source');

  const fullMd = ytext.toString();
  const { body } = stripFrontmatter(fullMd);
  const parsedJson = mdManager.parseWithFallback(body, buildParseOpts(embedResolver));
  const pmNode = schema.nodeFromJSON(parsedJson);

  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(document, xmlFragment, pmNode, meta);
}
