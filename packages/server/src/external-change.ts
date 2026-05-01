/**
 * Shared handler for applying external file changes to a live Y.Doc.
 *
 * Used by both server-factory.ts (CLI server) and hocuspocus-plugin.ts (Vite dev).
 * Extracted to prevent drift between copies — a bug fix in one would
 * otherwise easily miss the other.
 */

import type { Hocuspocus } from '@hocuspocus/server';
import { applyFastDiff, prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { formatReconcileSubject } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { recordContributor } from './contributor-tracker.ts';
import { recordFrontmatterEditSurface } from './frontmatter-telemetry.ts';
import { mdManager, schema } from './md-manager.ts';
import { setReconciledBase } from './persistence.ts';
import type { PairedWriteOrigin } from './server-observers.ts';
import { FILE_SYSTEM_WRITER } from './shadow-repo.ts';

/**
 * Transaction origin for file-watcher disk→CRDT bridge operations.
 *
 * Exported so the bridge-invariant watcher (FR-11) can include it in its
 * enforcing-origins Set by identity (not by string literal). Y.js transaction
 * matching uses `Set.has(tx.origin)` which is identity-based for objects;
 * a string literal `'file-watcher'` would never match this object.
 *
 * skipStoreHooks: true — prevents persistence from re-saving a file we just
 * loaded from disk (feedback loop prevention).
 *
 * paired: true — `applyExternalChange` atomically writes BOTH XmlFragment and
 * Y.Text inside one `doc.transact(..., FILE_WATCHER_ORIGIN)` block. Server
 * Observer A/B match via `context.paired === true` and short-circuit
 * symmetrically (bridge-correctness SPEC §6 R0/R0b/R0c).
 */
export const FILE_WATCHER_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'file-watcher', paired: true },
} as const satisfies PairedWriteOrigin;

/**
 * Apply file content to a live Y.Doc inside a single FILE_WATCHER_ORIGIN
 * transact. Pure CRDT update — no contributor recording, no reconciledBase
 * advance, no `Hocuspocus` lookup. Used both by the file-watcher path
 * (`applyExternalChange`, which adds those side effects) and by the
 * persistence tripwire reset path (which must NOT advance attribution or
 * the reconciled base because no disk write happened).
 */
export function applyDiskContentToDoc(
  document: Y.Doc,
  content: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
  sourcePath?: string,
): void {
  const { frontmatter, body } = stripFrontmatter(content);
  const parseOpts = resolveEmbed && sourcePath ? { resolveEmbed, sourcePath } : undefined;
  const parsedJson = mdManager.parseWithFallback(body, parseOpts);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const xmlFragment = document.getXmlFragment('default');

  // Y.Text body must match XmlFragment's serialization so the bridge invariant
  // (`stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize
  // (fragment))`) holds. Markdown has multiple equivalent representations for
  // some constructs (NG7-NG11 — e.g. doc-start `---` → canonical `***` for
  // thematic breaks; whitespace-collapse normalization in the mdast pipeline)
  // — writing the raw disk bytes to Y.Text would diverge from XmlFragment's
  // canonical form for any such input.
  //
  // FM region is preserved VERBATIM (D8/D26): `frontmatter` is the YAML
  // bytes from disk, including user-authored indentation, scalar styles, and
  // comments. The canonical-body composition only canonicalizes the body
  // half. Malformed YAML round-trips as-is; the panel renders last-valid +
  // a banner per D21.
  const canonicalBody = mdManager.serialize(parsedJson);
  const canonicalContent = prependFrontmatter(frontmatter, canonicalBody);

  document.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    const ytext = document.getText('source');
    const currentText = ytext.toString();
    if (currentText !== canonicalContent) {
      applyFastDiff(ytext, currentText, canonicalContent);
    }
  }, FILE_WATCHER_ORIGIN);
}

/**
 * Apply external file content to a live Y.Doc — the throwing core of the
 * disk→CRDT bridge. Both server-factory.ts (CLI) and the dev plugin delegate here.
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
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
): void {
  if (isSystemDoc(docName) || isConfigDoc(docName)) return;
  const document = hocuspocus.documents.get(docName);
  if (!document) return;

  // Capture prior FM region from Y.Text so the edit_surface counter only
  // fires when disk content actually changed FM (body-only edits shouldn't
  // count). After D8, the YAML region of `Y.Text('source')` IS the FM source
  // of truth — read it before applyDiskContentToDoc applies the disk content.
  const priorFm = stripFrontmatter(document.getText('source').toString()).frontmatter;
  const { frontmatter: nextFm } = stripFrontmatter(content);

  applyDiskContentToDoc(document, content, resolveEmbed, docName);

  if (priorFm !== nextFm) {
    recordFrontmatterEditSurface('file-watcher');
  }

  // Attribute this disk-originated write to the file-system classified writer (D41).
  // FILE_WATCHER_ORIGIN has skipStoreHooks:true so persistence.ts:onStoreDocument
  // will not auto-record this origin. The explicit call here ensures the next L2
  // drain produces a commit on refs/wip/<branch>/file-system (D7, D8, FR-6).
  recordContributor(
    docName,
    FILE_SYSTEM_WRITER.id,
    FILE_SYSTEM_WRITER.name,
    FILE_SYSTEM_WRITER.id,
    formatReconcileSubject(docName),
  );

  // Set the reconciled base so persistence does not re-serialize and re-write
  // the same content on next flush (EC3 blocker resolution — FR-6).
  setReconciledBase(docName, content);
}

/**
 * Create a handler function that wraps `applyExternalChange` with error-swallowing
 * semantics for the dev plugin consumer. Errors are logged and swallowed — the
 * document is left unchanged on failure.
 */
export function createExternalChangeHandler(
  hocuspocus: Hocuspocus,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
): (docName: string, content: string) => Promise<void> {
  return async (docName: string, content: string): Promise<void> => {
    try {
      applyExternalChange(hocuspocus, docName, content, resolveEmbed);
      console.log(`[file-watcher] Applied external change: ${docName}`);
    } catch (err) {
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}
