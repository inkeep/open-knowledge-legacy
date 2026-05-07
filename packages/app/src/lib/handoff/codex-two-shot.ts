import {
  buildCodexUrl,
  type HandoffOutcome,
  type HandoffPayload,
} from '@inkeep/open-knowledge-core';
import { type OpenExternalDeps, openExternal } from './open-external.ts';

export const CODEX_WAKE_URL = 'codex://new';

export const CODEX_SETTLE_MS = 1500;

export interface DispatchCodexDeps {
  readonly openExternalDeps?: OpenExternalDeps;
  readonly sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let codexWarmedThisSession = false;

export function __resetCodexWarmedForTests(): void {
  codexWarmedThisSession = false;
}

export async function dispatchCodex(
  payload: HandoffPayload,
  deps: DispatchCodexDeps = {},
): Promise<HandoffOutcome> {
  const realUrl = buildCodexUrl(payload);
  if (codexWarmedThisSession) {
    return openExternal(realUrl, deps.openExternalDeps);
  }
  const wake = await openExternal(CODEX_WAKE_URL, deps.openExternalDeps);
  if (!wake.ok) return wake;
  const sleep = deps.sleep ?? defaultSleep;
  await sleep(CODEX_SETTLE_MS);
  codexWarmedThisSession = true;
  return openExternal(realUrl, deps.openExternalDeps);
}
