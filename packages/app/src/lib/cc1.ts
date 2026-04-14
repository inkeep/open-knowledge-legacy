export const SYSTEM_DOC_NAME = '__system__';
export const CC1_CONTRACT_VERSION = 1;

export type DerivedViewChannel = 'files' | 'backlinks' | 'graph';

export interface CC1Signal {
  v: typeof CC1_CONTRACT_VERSION;
  ch: DerivedViewChannel;
  seq: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseCC1Signal(payload: string): CC1Signal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;
  if (parsed.v !== CC1_CONTRACT_VERSION) return null;
  if (
    (parsed.ch !== 'files' && parsed.ch !== 'backlinks' && parsed.ch !== 'graph') ||
    typeof parsed.seq !== 'number'
  ) {
    return null;
  }

  return {
    v: CC1_CONTRACT_VERSION,
    ch: parsed.ch,
    seq: parsed.seq,
  };
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
