/**
 * Barrel re-export for `_helpers/` (D-Q11 LOCKED).
 *
 * Consumers MUST import from `./_helpers` (which resolves here). Importing
 * directly from an inner file (`./_helpers/sidebar`, `./_helpers/provider`,
 * ...) is banned by the STOP rule in
 * `packages/app/tests/integration/e2e-stop-rules.test.ts` (US-010). The
 * indirection insulates consumers from domain-grouping churn — helpers can
 * move files without touching any e2e test's imports.
 */

export { simulateCopyAndRead, simulateCutAndRead } from './clipboard.ts';
export { selectAllAndWaitForSelection, waitForPmSelectionInNode } from './editor-state.ts';
export { filterCriticalErrors, type LogEntry } from './error-filters.ts';
export {
  type AgentIdentity,
  type ApiHelpers,
  expect,
  test,
  type WorkerServer,
} from './fixtures.ts';
export { waitForGraphSimulationSettled } from './graph.ts';
export {
  installClockAfterSync,
  type WaitForProviderOptions,
  waitForActiveProviderSynced,
} from './provider.ts';
export { sidebarFileButton } from './sidebar.ts';
export {
  getSelectedItemSnapshot,
  type SelectedItemSnapshot,
  type SlashMenuWaitOptions,
  slashMenu,
  waitForSlashMenuClosed,
  waitForSlashMenuFilteredBy,
  waitForSlashMenuFirstOption,
  waitForSlashMenuOpen,
} from './slash-menu.ts';
export { createMp3Buffer, createMp4Buffer, createPngBuffer } from './upload-fixtures.ts';
