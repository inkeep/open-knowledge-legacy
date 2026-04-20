/**
 * Well-known content markers for the repo's canonical test docs.
 *
 * Scenarios that need to confirm "the visible editor is doc X" use a
 * substring-match against the rendered ProseMirror text. Each entry below
 * is a short phrase present in the first few blocks of the named doc and
 * not shared with other entries in the map.
 *
 * Keys match the doc identifier used in hash-routes (`#/<key>`). When
 * scenarios target a doc without a registered marker, they fall back to
 * a content-length heuristic — this module only owns the exact-phrase path.
 */

export const DOC_MARKERS: Record<string, string> = {
  README: 'Local-first knowledge base',
  PROJECT: 'Build an agent-native knowledge platform',
  CLAUDE: 'Bun monorepo',
  AGENTS: 'Bun monorepo',
};

export function markerFor(docName: string): string | null {
  return DOC_MARKERS[docName] ?? null;
}
