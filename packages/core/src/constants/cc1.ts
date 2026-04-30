export const SYSTEM_DOC_NAME = '__system__';
export const CC1_CONTRACT_VERSION = 1;

/**
 * Synthetic Hocuspocus document name for the project-scope config file.
 * Admitted Y.Text-only at boot via `hocuspocus.openDirectConnection()`.
 * Bridges bypass; agent-session bookkeeping skips. Public contract per
 * D39/FR-29 — extending the admission set requires explicit re-decision.
 */
export const CONFIG_DOC_NAME_PROJECT = '__config__/project';

/**
 * Synthetic Hocuspocus document name for the user-global config file.
 * Same admission shape as `CONFIG_DOC_NAME_PROJECT`, lifetime per
 * server instance. Public contract per D40/FR-29.
 */
export const CONFIG_DOC_NAME_USER = '__user__/config.yml';

/**
 * Frozen tuple of every well-known config doc name. The `isConfigDoc`
 * predicate gates membership; the admission set is intentionally bounded
 * (NG-style STOP rule per spec §16: any addition requires explicit
 * re-decision).
 */
export const CONFIG_DOC_NAMES = Object.freeze([
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
] as const);
export type ConfigDocName = (typeof CONFIG_DOC_NAMES)[number];
