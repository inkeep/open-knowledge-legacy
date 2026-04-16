/**
 * Read frontmatter from a Y.Doc's metadata map.
 *
 * The bridge convention: Y.Map('metadata')['frontmatter'] holds the
 * frontmatter string for a doc. Observer B writes it on source-mode
 * parses; Observer A reads it on XmlFragment→Y.Text serialization to
 * prepend it to the body.
 *
 * Used by both the client observer (`packages/app/src/editor/observers.ts`)
 * for baseline tracking and the server observer
 * (`packages/server/src/server-observers.ts`) for cross-CRDT sync.
 */
import type * as Y from 'yjs';

export function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}
