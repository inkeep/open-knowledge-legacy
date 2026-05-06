import {
  type AppState,
  emptyState,
  type SchemaIncompatibilityDiagnostic,
  type UpdateChannel,
} from './state-store.ts';

export interface UpdateStateHandlerDeps {
  getAppState: () => AppState;
  setAppState: (next: AppState) => void;
  saveAppState: (next: AppState) => boolean;
  setUpdaterChannel: (channel: UpdateChannel) => void;
  confirmDowngrade: () => Promise<void>;
  getPendingSchemaIncompatibility: () => SchemaIncompatibilityDiagnostic | null;
  clearPendingSchemaIncompatibility: () => void;
}

interface StateQueryResult {
  channel: UpdateChannel;
  schemaIncompatibility: SchemaIncompatibilityDiagnostic | null;
}

export async function applySetChannel(
  deps: UpdateStateHandlerDeps,
  request: { channel: UpdateChannel },
): Promise<undefined> {
  const next: UpdateChannel = request.channel;
  if (next !== 'latest' && next !== 'beta') {
    throw new Error(`Invalid update channel: ${String(next)}`);
  }
  const prev = deps.getAppState();
  const updated: AppState = { ...prev, updateChannel: next };
  deps.setAppState(updated);
  if (!deps.saveAppState(updated)) {
    deps.setAppState(prev);
    throw new Error('saveAppState failed — channel change not persisted');
  }
  deps.setUpdaterChannel(next);
  deps.clearPendingSchemaIncompatibility();
  return undefined;
}

export async function applyConfirmDowngrade(deps: UpdateStateHandlerDeps): Promise<undefined> {
  await deps.confirmDowngrade();
  return undefined;
}

export async function applyResetIncompatible(deps: UpdateStateHandlerDeps): Promise<undefined> {
  const prev = deps.getAppState();
  const fresh = emptyState();
  deps.setAppState(fresh);
  if (!deps.saveAppState(fresh)) {
    deps.setAppState(prev);
    throw new Error('saveAppState failed — incompatibility reset not persisted');
  }
  deps.setUpdaterChannel(fresh.updateChannel);
  deps.clearPendingSchemaIncompatibility();
  return undefined;
}

export async function applyStateQuery(deps: UpdateStateHandlerDeps): Promise<StateQueryResult> {
  const compat = deps.getPendingSchemaIncompatibility();
  return {
    channel: deps.getAppState().updateChannel,
    schemaIncompatibility: compat ? { ...compat } : null,
  };
}
