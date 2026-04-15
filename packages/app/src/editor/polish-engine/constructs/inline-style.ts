/**
 * Inline style marks — emphasis / strong / delete / inlineCode (Phase 3)
 *
 * Content styled, delimiter marks visible but muted (opacity 0.65).
 * EmphasisMark is shared between * and ** — same visual treatment.
 */

import type { ConstructConfig } from '../registry';

export const emphasisConstruct: ConstructConfig = {
  id: 'emphasis',
  nodeName: 'Emphasis',
  kind: 'mark',
  class: 'cm-em',
};

export const strongConstruct: ConstructConfig = {
  id: 'strong',
  nodeName: 'StrongEmphasis',
  kind: 'mark',
  class: 'cm-strong',
};

export const strikethroughConstruct: ConstructConfig = {
  id: 'strikethrough',
  nodeName: 'Strikethrough',
  kind: 'mark',
  class: 'cm-del',
};

export const emphasisMarkConstruct: ConstructConfig = {
  id: 'emphasis-mark',
  nodeName: 'EmphasisMark',
  kind: 'mark',
  class: 'cm-em-marker',
};

export const strikethroughMarkConstruct: ConstructConfig = {
  id: 'strikethrough-mark',
  nodeName: 'StrikethroughMark',
  kind: 'mark',
  class: 'cm-del-marker',
};

export const inlineCodeConstruct: ConstructConfig = {
  id: 'inline-code',
  nodeName: 'InlineCode',
  kind: 'mark',
  class: 'cm-inline-code',
};
