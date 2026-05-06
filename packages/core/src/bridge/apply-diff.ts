import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { diffLinesFast } from './diff-lines.ts';

const dmpDiff = new DiffMatchPatch();
dmpDiff.Diff_Timeout = 0.25;

const APPLY_FAST_DIFF_MAX_BYTES = 256 * 1024;

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
  if (
    currentText.length > APPLY_FAST_DIFF_MAX_BYTES ||
    newText.length > APPLY_FAST_DIFF_MAX_BYTES
  ) {
    applyByPrefixSuffixMiddleReplace(ytext, currentText, newText);
    return;
  }
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

function applyByPrefixSuffixMiddleReplace(
  ytext: Y.Text,
  currentText: string,
  newText: string,
): void {
  let prefixLen = 0;
  const minLen = Math.min(currentText.length, newText.length);
  while (
    prefixLen < minLen &&
    currentText.charCodeAt(prefixLen) === newText.charCodeAt(prefixLen)
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText.charCodeAt(currentText.length - 1 - suffixLen) ===
      newText.charCodeAt(newText.length - 1 - suffixLen)
  ) {
    suffixLen++;
  }

  const deleteLen = currentText.length - prefixLen - suffixLen;
  const insertStr = newText.slice(prefixLen, newText.length - suffixLen);
  if (deleteLen > 0) ytext.delete(prefixLen, deleteLen);
  if (insertStr.length > 0) ytext.insert(prefixLen, insertStr);
}
