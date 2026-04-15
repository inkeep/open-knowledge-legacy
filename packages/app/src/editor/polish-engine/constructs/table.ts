/**
 * Table construct — Tier 1 + Tier 2 + Tier 3 stack
 *
 * Tier 1: Row tint + left accent bar + content-hanging indent (on TableHeader + TableRow)
 * Tier 2: Per-cell alternating color bands (4-color cycle, ≤4% alpha)
 *         with box-decoration-break: clone for wrap-spanning
 * Tier 3: font-size 0.9em, line-height 1.4 (via CSS on the row classes)
 *
 * TableDelimiter lines (the `|---|---|` row) get the base table styling
 * via a separate line decoration on the Table node's delimiter line.
 */

import type { ConstructConfig } from '../registry';

/** Line decoration for TableHeader (first row — bold + slightly stronger tint). */
export const tableHeaderConstruct: ConstructConfig = {
  id: 'table-header',
  nodeName: 'TableHeader',
  kind: 'line',
  class: 'cm-table-header',
  hangingIndent: 'content',
};

/** Line decoration for TableRow (body rows). */
export const tableRowConstruct: ConstructConfig = {
  id: 'table-row',
  nodeName: 'TableRow',
  kind: 'line',
  class: 'cm-table-row',
  hangingIndent: 'content',
};

/**
 * Line decoration for the Table node itself — catches the delimiter
 * row (|---|---|) which is a direct child of Table but not wrapped
 * in TableHeader or TableRow.
 */
export const tableContainerConstruct: ConstructConfig = {
  id: 'table-container',
  nodeName: 'Table',
  kind: 'line',
  class: 'cm-table-row',
  hangingIndent: 'content',
};

/**
 * Per-cell mark decoration with 4-color cycling.
 * The cell index is determined by counting preceding TableCell siblings.
 */
export const tableCellConstruct: ConstructConfig = {
  id: 'table-cell',
  nodeName: 'TableCell',
  kind: 'mark',
  class(node) {
    let idx = 0;
    let sibling = node.prevSibling;
    while (sibling) {
      if (sibling.name === 'TableCell') idx++;
      sibling = sibling.prevSibling;
    }
    return `cm-table-cell-band-${idx % 4}`;
  },
};
