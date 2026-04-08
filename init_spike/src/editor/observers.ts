/**
 * Bidirectional observers between Y.XmlFragment('default') and Y.Text('source').
 *
 * Observer A (tree→text): Serializes XmlFragment to markdown, writes incrementally to Y.Text.
 * Observer B (text→tree): Parses Y.Text markdown, applies to XmlFragment via updateYFragment.
 *
 * Transaction origin guards prevent infinite loops:
 *   - Observer A writes with origin 'sync-from-tree', Observer B skips those.
 *   - Observer B writes with origin 'sync-from-text', Observer A skips those.
 */
import type { Schema } from '@tiptap/pm/model';
import type { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { diffLines } from 'diff';
import * as Y from 'yjs';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';

export const ORIGIN_TREE_TO_TEXT = 'sync-from-tree';
export const ORIGIN_TEXT_TO_TREE = 'sync-from-text';

const DEBOUNCE_MS = 50;

interface ObserverDeps {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
}

/**
 * Apply incremental diff from `currentText` to `newText` on a Y.Text instance.
 * Uses diffLines to minimize CRDT mutations — preserves concurrent source-mode edits.
 */
function applyIncrementalDiff(
  ytext: Y.Text,
  currentText: string,
  newText: string,
): void {
  if (currentText === newText) return;

  const changes = diffLines(currentText, newText);
  let offset = 0;
  for (const change of changes) {
    if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}

/**
 * Get frontmatter from Y.Doc metadata map.
 */
function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const fm = metaMap.get('frontmatter');
  return typeof fm === 'string' ? fm : '';
}

/**
 * Set up bidirectional observers between Y.XmlFragment and Y.Text.
 * Call after HocuspocusProvider connects. Observers persist for app lifetime.
 *
 * Returns a cleanup function that removes both observers.
 */
export function setupObservers(deps: ObserverDeps): () => void {
  const { doc, xmlFragment, ytext, mdManager, schema } = deps;

  // --- Observer A: XmlFragment → Y.Text ---
  let debounceA: ReturnType<typeof setTimeout> | null = null;

  const observerA = (_events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
    if (transaction.origin === ORIGIN_TEXT_TO_TREE) return;

    if (debounceA) clearTimeout(debounceA);
    debounceA = setTimeout(() => {
      try {
        const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
        const body = mdManager.serialize(json);
        const frontmatter = getFrontmatter(doc);
        const md = prependFrontmatter(frontmatter, body);

        const currentText = ytext.toString();
        if (currentText !== md) {
          console.log('[Observer A] sync tree→text');
          doc.transact(() => {
            applyIncrementalDiff(ytext, currentText, md);
          }, ORIGIN_TREE_TO_TEXT);
        }
      } catch (err) {
        console.error('[Observer A] Failed to sync tree→text:', err);
      }
    }, DEBOUNCE_MS);
  };

  // --- Observer B: Y.Text → XmlFragment ---
  let debounceB: ReturnType<typeof setTimeout> | null = null;

  const observerB = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === ORIGIN_TREE_TO_TEXT) return;

    if (debounceB) clearTimeout(debounceB);
    debounceB = setTimeout(() => {
      try {
        const md = ytext.toString();
        const { frontmatter, body } = stripFrontmatter(md);

        const parsedJson = mdManager.parse(body);
        const pmNode = schema.nodeFromJSON(parsedJson);

        console.log('[Observer B] sync text→tree');
        doc.transact(() => {
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(doc, xmlFragment, pmNode, meta);
          const metaMap = doc.getMap('metadata');
          metaMap.set('frontmatter', frontmatter);
        }, ORIGIN_TEXT_TO_TREE);
      } catch (err) {
        // Parse error — log but don't crash. XmlFragment keeps last valid state.
        console.error('[Observer B] Failed to sync text→tree:', err);
      }
    }, DEBOUNCE_MS);
  };

  xmlFragment.observeDeep(observerA);
  ytext.observe(observerB);

  // Initial sync: populate Y.Text from current XmlFragment content
  if (xmlFragment.length > 0 && ytext.length === 0) {
    try {
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
      const body = mdManager.serialize(json);
      const frontmatter = getFrontmatter(doc);
      const md = prependFrontmatter(frontmatter, body);
      doc.transact(() => {
        ytext.insert(0, md);
      }, ORIGIN_TREE_TO_TEXT);
    } catch (err) {
      console.error('[Observer A] Failed initial sync:', err);
    }
  }

  return () => {
    if (debounceA) clearTimeout(debounceA);
    if (debounceB) clearTimeout(debounceB);
    xmlFragment.unobserveDeep(observerA);
    ytext.unobserve(observerB);
  };
}
