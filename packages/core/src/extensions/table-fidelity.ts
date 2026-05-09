import { Table, TableCell, TableHeader } from '@tiptap/extension-table';

export const TableFidelity = Table.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceDashCounts: { default: null },
    };
  },
});

export const TableCellFidelity = TableCell.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourcePadding: { default: null },
    };
  },
});

export const TableHeaderFidelity = TableHeader.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourcePadding: { default: null },
    };
  },
});
