import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

export interface DiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function diffLinesFast(oldStr: string, newStr: string): DiffChange[] {
  if (oldStr === newStr) return [{ value: oldStr }];

  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldStr, newStr);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const result: DiffChange[] = [];
  for (const [op, text] of diffs) {
    if (op === DiffMatchPatch.DIFF_DELETE) {
      result.push({ value: text, removed: true });
    } else if (op === DiffMatchPatch.DIFF_INSERT) {
      result.push({ value: text, added: true });
    } else {
      result.push({ value: text });
    }
  }

  return result;
}
