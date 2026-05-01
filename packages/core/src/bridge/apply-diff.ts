import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { diffLinesFast } from './diff-lines.ts';

const dmpDiff = new DiffMatchPatch();

export function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  const changes = diffLinesFast(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        offset += next.value.length;
        i++; // consume the paired ADDED
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++; // consume the paired ADDED
    } else if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}

export function applyFastDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  const diffs = dmpDiff.diff_main(currentText, newText);
  dmpDiff.diff_cleanupSemantic(diffs);
  let offset = 0;
  for (const [type, text] of diffs) {
    if (type === 0) {
      offset += text.length;
    } else if (type === -1) {
      ytext.delete(offset, text.length);
    } else if (type === 1) {
      ytext.insert(offset, text);
      offset += text.length;
    }
  }
}
