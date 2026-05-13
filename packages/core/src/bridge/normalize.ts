const COMMONMARK_ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g;

const TABLE_ALIGN_ROW_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

const LIST_ITEM_INDENT_RE = /^[ \t]+([-+*]|\d+[.)]|[a-zA-Z][.)])\s/;

const EMPHASIS_AROUND_CODE_RE = /\*\*\s*(`[^`]+`)\s*\*\*/g;

export function normalizeBridge(s: string): string {
  return s
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .replace(COMMONMARK_ESCAPE_RE, '$1')
    .replace(EMPHASIS_AROUND_CODE_RE, '$1')
    .replace(/^\n+/, '')
    .replace(/^[*-]{3,}(?=\n|$)/, '---')
    .replace(/(\n)([#>+-]|\d+[.)]|`{3,}|~{3,})/g, '\n\n$2')
    .replace(/^([#>+-].*|\d+[.)].*|`{3,}.*|~{3,}.*)\n([^\n])/gm, '$1\n\n$2')
    .split('\n')
    .map((l) => {
      const trimmed = l.trimEnd();
      if (TABLE_ALIGN_ROW_RE.test(trimmed)) {
        return trimmed.replace(/\s+/g, '');
      }
      if (LIST_ITEM_INDENT_RE.test(trimmed)) {
        return trimmed.replace(/^[ \t]+/, '');
      }
      return trimmed;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

export const BRIDGE_TOLERANCE_CLASSES = [
  'bom',
  'crlf',
  'commonmark-escape',
  'emphasis-around-code',
  'leading-newline',
  'doc-start-thematic',
  'block-separator-collapse',
  'table-align-row-spacing',
  'list-indent-canonical',
  'trailing-whitespace',
  'blank-line-collapse',
  'trailing-newline',
] as const;

export type BridgeToleranceClass = (typeof BRIDGE_TOLERANCE_CLASSES)[number];

export function detectAppliedToleranceClasses(left: string, right: string): BridgeToleranceClass[] {
  const classes: BridgeToleranceClass[] = [];

  if (left.charCodeAt(0) === 0xfeff || right.charCodeAt(0) === 0xfeff) {
    classes.push('bom');
  }
  if (left.includes('\r') || right.includes('\r')) {
    classes.push('crlf');
  }

  if (
    /\\[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]/.test(left) ||
    /\\[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]/.test(right)
  ) {
    classes.push('commonmark-escape');
  }

  if (/\*\*\s*`[^`]+`\s*\*\*/.test(left) || /\*\*\s*`[^`]+`\s*\*\*/.test(right)) {
    classes.push('emphasis-around-code');
  }

  const leftNoBom = left.replace(/^﻿/, '');
  const rightNoBom = right.replace(/^﻿/, '');
  if (leftNoBom.startsWith('\n') !== rightNoBom.startsWith('\n')) {
    classes.push('leading-newline');
  }

  const leftStart = leftNoBom.replace(/^\n+/, '');
  const rightStart = rightNoBom.replace(/^\n+/, '');
  const isStarsLeft = /^\*{3,}(?=\n|$)/.test(leftStart);
  const isDashesLeft = /^-{3,}(?=\n|$)/.test(leftStart);
  const isStarsRight = /^\*{3,}(?=\n|$)/.test(rightStart);
  const isDashesRight = /^-{3,}(?=\n|$)/.test(rightStart);
  if ((isStarsLeft && isDashesRight) || (isDashesLeft && isStarsRight)) {
    classes.push('doc-start-thematic');
  }

  const blockSepBeforeRe = /\n\n([#>+-]|\d+[.)]|`{3,}|~{3,})/;
  const blockSepAfterRe = /^([#>+-].*|\d+[.)].*|`{3,}.*|~{3,}.*)\n\n[^\n]/m;
  const beforeLeft = blockSepBeforeRe.test(leftNoBom);
  const beforeRight = blockSepBeforeRe.test(rightNoBom);
  const afterLeft = blockSepAfterRe.test(leftNoBom);
  const afterRight = blockSepAfterRe.test(rightNoBom);
  if (beforeLeft !== beforeRight || afterLeft !== afterRight) {
    classes.push('block-separator-collapse');
  }

  const leftLf = leftNoBom.replace(/\r/g, '');
  const rightLf = rightNoBom.replace(/\r/g, '');

  const tableAlignRowMultiline = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m;
  if (tableAlignRowMultiline.test(leftLf) || tableAlignRowMultiline.test(rightLf)) {
    classes.push('table-align-row-spacing');
  }

  const listIndentMultiline = /^[ \t]+([-+*]|\d+[.)]|[a-zA-Z][.)])\s/m;
  if (listIndentMultiline.test(leftLf) || listIndentMultiline.test(rightLf)) {
    classes.push('list-indent-canonical');
  }

  if (/[ \t]\n/.test(leftLf) || /[ \t]\n/.test(rightLf)) {
    classes.push('trailing-whitespace');
  }
  if (/[ \t]$/.test(leftLf) || /[ \t]$/.test(rightLf)) {
    if (!classes.includes('trailing-whitespace')) classes.push('trailing-whitespace');
  }

  if (/\n{3,}/.test(leftLf) || /\n{3,}/.test(rightLf)) {
    classes.push('blank-line-collapse');
  }
  if (leftLf.endsWith('\n') !== rightLf.endsWith('\n')) {
    classes.push('trailing-newline');
  }

  return classes;
}
