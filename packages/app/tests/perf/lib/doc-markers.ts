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
  // STORIES is the canonical G2 regression-gate reference doc per V2 SPEC §11
  // (STORIES 541ms pre-V2 → target <300ms post-V2). Without this marker,
  // scenarios with OK_PERF_BIG_DOC=STORIES fall through to the content-length
  // heuristic and race against still-Activity-mounted previous docs —
  // producing pmLen numbers that match the wrong editor. See
  // tmp/ship/v2-perf-benchmark.md §"Scenario-coverage gap discovered".
  STORIES: 'Now phase workstreams',
};

export function markerFor(docName: string): string | null {
  return DOC_MARKERS[docName] ?? null;
}
