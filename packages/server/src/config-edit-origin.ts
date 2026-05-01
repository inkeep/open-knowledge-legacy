import type { LocalTransactionOrigin } from '@hocuspocus/server';

export const CONFIG_VALIDATION_REVERT_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'config-validation-revert' },
} as const satisfies LocalTransactionOrigin;

export const CONFIG_FILE_WATCHER_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'config-file-watcher' },
} as const satisfies LocalTransactionOrigin;
