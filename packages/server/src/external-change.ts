/**
 * Shared handler for applying external file changes to a live Y.Doc.
 *
 * Used by both standalone.ts (CLI server) and hocuspocus-plugin.ts (Vite dev).
 * Extracted to prevent drift between copies — a bug fix in one would
 * otherwise easily miss the other.
 */

import type { Hocuspocus, LocalTransactionOrigin } from '@hocuspocus/server';
import { MarkdownManager, sharedExtensions, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment } from '@tiptap/y-tiptap';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

/**
 * Apply external file content to a live Y.Doc — the throwing core of the
 * disk→CRDT bridge. Both standalone.ts (CLI) and the dev plugin delegate here.
 *
 * 1. Looks up the live Y.Doc by docName (no-op if missing)
 * 2. Strips frontmatter and parses markdown → ProseMirror JSON
 * 3. Updates XmlFragment via updateYFragment (body only, no frontmatter)
 * 4. Updates Y.Text if it differs from the full file content (including frontmatter)
 * 5. Caches frontmatter in the metadata map
 *
 * All mutations happen in a single transaction with origin 'file-watcher'
 * and skipStoreHooks: true to prevent persistence feedback loops.
 *
 * Throws on parse failure — callers choose their own error strategy.
 */
export function applyExternalChange(
  hocuspocus: Hocuspocus,
  docName: string,
  content: string,
): void {
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
}

/**
 * Create a handler function that wraps `applyExternalChange` with error-swallowing
 * semantics for the dev plugin consumer. Errors are logged and swallowed — the
 * document is left unchanged on failure.
 */
export function createExternalChangeHandler(
  hocuspocus: Hocuspocus,
): (docName: string, content: string) => Promise<void> {
  return async (docName: string, content: string): Promise<void> => {
    try {
      applyExternalChange(hocuspocus, docName, content);
      console.log(`[file-watcher] Applied external change: ${docName}`);
    } catch (err) {
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}
