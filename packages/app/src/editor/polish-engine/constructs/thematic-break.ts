/**
 * Thematic break construct (Phase 3) — rule dominates, text fades
 *
 * The --- chars fade to transparent but remain addressable per D9.
 * The border-bottom 1px solid acts as the visual rule.
 */

import type { ConstructConfig } from '../registry';

export const thematicBreakConstruct: ConstructConfig = {
  id: 'thematic-break',
  nodeName: 'HorizontalRule',
  kind: 'line',
  class: 'cm-thematic-break',
};
