/**
 * Heading construct (Phase 2) — tuned size hierarchy
 *
 * H1 caps at 1.25× base per D25. # markers visible but recede.
 */

import type { ConstructConfig } from '../registry';

const HEADING_CLASSES: Record<string, string> = {
  ATXHeading1: 'cm-heading-1',
  ATXHeading2: 'cm-heading-2',
  ATXHeading3: 'cm-heading-3',
  ATXHeading4: 'cm-heading-4',
  ATXHeading5: 'cm-heading-5',
  ATXHeading6: 'cm-heading-6',
};

export const headingConstruct: ConstructConfig = {
  id: 'heading',
  nodeName: [
    'ATXHeading1',
    'ATXHeading2',
    'ATXHeading3',
    'ATXHeading4',
    'ATXHeading5',
    'ATXHeading6',
  ],
  kind: 'line',
  class(node) {
    return HEADING_CLASSES[node.name] ?? 'cm-heading-1';
  },
};

export const headerMarkConstruct: ConstructConfig = {
  id: 'header-mark',
  nodeName: 'HeaderMark',
  kind: 'mark',
  class: 'cm-header-mark',
};
