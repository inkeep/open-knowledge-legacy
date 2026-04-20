/**
 * NG10 parse-side fix: doc-start empty-frontmatter → thematicBreak.
 *
 * remark-frontmatter greedily claims `---\n\n---` (and `---\n---`) at document
 * start as a single empty YAML frontmatter block (yaml.value === '').
 * CommonMark says `---` is a thematicBreak; the ambiguity is structural and
 * unfixable at the parser level (all major processors exhibit it — see
 * reports/r23-autolink-and-ng10-prior-art/evidence/d5-frontmatter-ambiguity.md).
 *
 * This transformer detects the specific case — empty yaml at position 0 — and
 * converts back to thematicBreak node(s) synthesized from the source. This
 * preserves `---` authoring form (previously NG10 normalized to `***` on
 * serialize, losing fidelity).
 *
 * Runs AFTER `restoreFromMdx` and BEFORE `positionSlicePlugin` so the
 * synthesized thematicBreak nodes get their `data.sourceRaw` set correctly.
 */
import type { Root, ThematicBreak } from 'mdast';
import type { VFile } from 'vfile';

/**
 * Core doc-start empty-frontmatter → thematicBreak rewrite. Mutates `tree` in
 * place. Exported so the R17 merged post-parse walker can invoke it once as a
 * tree-level pre-step; the standalone plugin below is preserved for legacy
 * callers and unit tests that exercise the plugin surface.
 */
export function applyDocStartThematicFix(tree: Root, file: VFile): void {
  if (tree.children.length === 0) return;

  const first = tree.children[0];
  if (first.type !== 'yaml') return;

  // Only process empty yaml blocks — real frontmatter (non-empty value) stays
  const value = (first as { value?: string }).value ?? '';
  if (value.trim() !== '') return;

  // Must be at document start (position.start.offset === 0)
  const startOff = first.position?.start?.offset;
  if (startOff !== 0) return;

  const endOff = first.position?.end?.offset;
  if (typeof endOff !== 'number') return;

  // Recover original source to identify `---` lines
  const source = typeof file.value === 'string' ? file.value : '';
  if (!source) return;

  const slice = source.slice(startOff, endOff);
  const lines = slice.split('\n');

  // Filter to lines that are thematicBreak-shaped (---  with optional trailing space)
  const hrPattern = /^-{3,}\s*$/;
  const hrLines = lines.filter((l) => hrPattern.test(l));

  if (hrLines.length === 0) return;

  // Synthesize thematicBreak nodes
  const replacements: ThematicBreak[] = hrLines.map((raw) => ({
    type: 'thematicBreak' as const,
    data: { sourceRaw: raw.replace(/\s+$/, '') },
  }));

  // Attach position to the first node so positionSlicePlugin can process it.
  // Later nodes: position absent → positionSlicePlugin no-ops, our pre-set
  // data.sourceRaw wins.
  if (replacements.length > 0) {
    const firstLineLen = hrLines[0].length;
    replacements[0].position = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: firstLineLen + 1, offset: firstLineLen },
    };
  }

  // Replace the yaml node with synthesized thematicBreaks
  tree.children.splice(0, 1, ...replacements);
}
