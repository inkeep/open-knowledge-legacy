import { Table } from '@tiptap/extension-table';

export const TableFidelity = Table.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      sourceDashCounts: { default: null },
    };
  },
});
