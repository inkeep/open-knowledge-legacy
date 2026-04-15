/**
 * Fenced code construct — line tinting + preserve-source-indent
 *
 * Preserve-source-indent pattern: the view-plugin computes each line's
 * leading whitespace and sets --line-indent CSS custom property. CSS uses
 * padding-inline-start + text-indent for hanging indent alignment.
 *
 * First/last line border classes are auto-added by the view-plugin.
 */

import type { ConstructConfig } from '../registry';

/** Line decoration for FencedCode — applies to every line in the block. */
export const fencedCodeConstruct: ConstructConfig = {
  id: 'fenced-code',
  nodeName: 'FencedCode',
  kind: 'line',
  class: 'cm-code-block',
  hangingIndent: 'preserve-source-indent',
};

/** Mark decoration for code fence markers (``` / ~~~). */
export const codeMarkConstruct: ConstructConfig = {
  id: 'code-mark',
  nodeName: 'CodeMark',
  kind: 'mark',
  class: 'cm-code-mark',
};

/** Mark decoration for the language info string. */
export const codeInfoConstruct: ConstructConfig = {
  id: 'code-info',
  nodeName: 'CodeInfo',
  kind: 'mark',
  class: 'cm-code-info',
};
