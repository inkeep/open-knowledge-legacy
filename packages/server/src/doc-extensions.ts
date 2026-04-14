/**
 * Supported markdown-family file extensions for content files.
 *
 * Ordered by precedence — earlier entries win when the same docName exists
 * with multiple extensions on disk. Precedence matches the industry convention
 * (Next.js, Astro, Fumadocs): `.mdx` is a strict superset of `.md`, so a
 * co-located `.mdx` is presumed to intentionally override the `.md`.
 *
 * The extension-less docName is what flows through the CRDT layer, MCP tools,
 * wiki-link resolution, and the backlink index. Persistence uses
 * `getDocExtension()` to decide which file extension to write to.
 *
 * This module is intentionally small and free of I/O — it's consumed by the
 * file watcher, content filter, persistence, and API layers.
 */
import { extname } from 'node:path';

export const SUPPORTED_DOC_EXTENSIONS = ['.mdx', '.md'] as const;
export type DocExtension = (typeof SUPPORTED_DOC_EXTENSIONS)[number];

const DEFAULT_EXTENSION: DocExtension = '.md';

/** True when a path ends with any supported doc extension. */
export function isSupportedDocFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return (SUPPORTED_DOC_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Strip a supported doc extension from a path. Returns the input unchanged if
 * no supported extension is present (so plain docNames pass through).
 */
export function stripDocExtension(path: string): string {
  for (const ext of SUPPORTED_DOC_EXTENSIONS) {
    if (path.endsWith(ext)) return path.slice(0, -ext.length);
  }
  return path;
}

/**
 * Return the precedence rank of an extension (lower = higher precedence).
 * Returns `Infinity` for unknown extensions so they never win.
 */
function rank(ext: DocExtension): number {
  return SUPPORTED_DOC_EXTENSIONS.indexOf(ext);
}

/**
 * In-memory map from extension-less docName to the on-disk extension.
 *
 * Populated by the file watcher on initial scan and on create events. Read by
 * persistence, rescue-buffer, timeline query, and backlink-index when they
 * need to materialize a filesystem path from a docName.
 *
 * Scope: module-global singleton. Worktree isolation is enforced at the
 * content-dir boundary — each server process owns its own content dir and
 * therefore its own map.
 */
const docExtensionByName = new Map<string, DocExtension>();

/**
 * Record the on-disk extension for a docName. If an extension is already
 * recorded, the one with higher precedence wins. Returns the effective
 * extension after the call and whether the stored mapping changed.
 */
export function registerDocExtension(
  docName: string,
  ext: DocExtension,
): { effective: DocExtension; changed: boolean; shadowed: DocExtension | null } {
  const existing = docExtensionByName.get(docName);
  if (!existing) {
    docExtensionByName.set(docName, ext);
    return { effective: ext, changed: true, shadowed: null };
  }
  if (existing === ext) {
    return { effective: existing, changed: false, shadowed: null };
  }
  // Both extensions exist on disk for this docName — the higher-precedence one wins.
  if (rank(ext) < rank(existing)) {
    docExtensionByName.set(docName, ext);
    return { effective: ext, changed: true, shadowed: existing };
  }
  return { effective: existing, changed: false, shadowed: ext };
}

/**
 * Get the recorded extension for a docName, or the default (`.md`) when no
 * file has been observed for it yet (e.g. new-page creation via the API).
 */
export function getDocExtension(docName: string): DocExtension {
  return docExtensionByName.get(docName) ?? DEFAULT_EXTENSION;
}

/** Clear the recorded extension for a docName (e.g. on file delete). */
export function forgetDocExtension(docName: string): void {
  docExtensionByName.delete(docName);
}

/** Test hook — reset the map between tests that share the module scope. */
export function _resetDocExtensionsForTests(): void {
  docExtensionByName.clear();
}
