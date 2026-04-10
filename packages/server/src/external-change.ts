/**
 * Shared handler for applying external file changes to a live Y.Doc.
 *
 * Used by both standalone.ts (CLI server) and hocuspocus-plugin.ts (Vite dev).
 * Extracted to prevent drift between copies — a bug fix in one would
 * otherwise easily miss the other.
 */

import type { Hocuspocus, LocalTransactionOrigin } from '@hocuspocus/server';
import { sharedExtensions, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/**
 * Create a handler function for applying external file changes to a Hocuspocus document.
 *
 * The returned function:
 * 1. Looks up the live Y.Doc by docName
 * 2. Strips frontmatter and parses markdown → ProseMirror JSON
 * 3. Updates XmlFragment via updateYFragment
 * 4. Updates Y.Text if it differs from the file content
 * 5. Caches frontmatter in the metadata map
 *
 * All mutations happen in a single transaction with origin 'file-watcher'
 * and skipStoreHooks: true to prevent persistence feedback loops.
 */
export function createExternalChangeHandler(
  hocuspocus: Hocuspocus,
): (docName: string, content: string) => Promise<void> {
  return async (docName: string, content: string): Promise<void> => {
    try {
      const document = hocuspocus.documents.get(docName);
      if (!document) return;
      const { frontmatter, body } = stripFrontmatter(content);
      const parsedJson = mdManager.parse(body);
      const pmNode = schema.nodeFromJSON(parsedJson);
      const xmlFragment = document.getXmlFragment('default');

      document.transact(
        () => {
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(document, xmlFragment, pmNode, meta);
          const metaMap = document.getMap('metadata');
          metaMap.set('frontmatter', frontmatter);

          const ytext = document.getText('source');
          const currentText = ytext.toString();
          if (currentText !== content) {
            ytext.delete(0, currentText.length);
            ytext.insert(0, content);
          }
        },
        {
          source: 'local',
          skipStoreHooks: true,
          context: { origin: 'file-watcher' },
        } satisfies LocalTransactionOrigin,
      );

      console.log(`[file-watcher] Applied external change: ${docName}`);
    } catch (err) {
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}
