export function normalizeBridge(s: string): string {
  return s
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .replace(/^\n+/, '')
    .replace(/^[*-]{3,}(?=\n|$)/, '---')
    .replace(/(\n)([#>+-]|\d+[.)]|`{3,}|~{3,})/g, '\n\n$2')
    .replace(/^([#>+-].*|\d+[.)].*|`{3,}.*|~{3,}.*)\n([^\n])/gm, '$1\n\n$2')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}

export const BRIDGE_TOLERANCE_CLASSES = [
  'bom',
  'crlf',
  'leading-newline',
  'doc-start-thematic',
  'block-separator-collapse',
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
