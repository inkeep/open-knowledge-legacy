import type { Root, ThematicBreak } from 'mdast';
import type { VFile } from 'vfile';

export function applyDocStartThematicFix(tree: Root, file: VFile): void {
  if (tree.children.length === 0) return;

  const first = tree.children[0];
  if (first.type !== 'yaml') return;

  const value = (first as { value?: string }).value ?? '';
  if (value.trim() !== '') return;

  const startOff = first.position?.start?.offset;
  if (startOff !== 0) return;

  const endOff = first.position?.end?.offset;
  if (typeof endOff !== 'number') return;

  const source = typeof file.value === 'string' ? file.value : '';
  if (!source) return;

  const slice = source.slice(startOff, endOff);
  const lines = slice.split('\n');

  const hrPattern = /^-{3,}\s*$/;
  const hrLines = lines.filter((l) => hrPattern.test(l));

  if (hrLines.length === 0) return;

  const replacements: ThematicBreak[] = hrLines.map((raw) => ({
    type: 'thematicBreak' as const,
    data: { sourceRaw: raw.replace(/\s+$/, '') },
  }));

  if (replacements.length > 0) {
    const firstLineLen = hrLines[0].length;
    replacements[0].position = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: firstLineLen + 1, offset: firstLineLen },
    };
  }

  tree.children.splice(0, 1, ...replacements);
}
