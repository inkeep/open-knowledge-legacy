/**
 * Pure env-builder for utilityProcess.fork (M4 SPEC AC8).
 *
 * Merges `process.env` with the Electron-host marker
 * `OK_ELECTRON_PROTOCOL_HOST=1`. Extracted so the merge can be unit-tested
 * without standing up an Electron runtime.
 *
 * The marker tells the utility's preview-url helper that it's running inside
 * an Electron host — so MCP clients should receive `openknowledge://` deep-
 * link URLs instead of `http://localhost:<port>` URLs. Set at fork time (NOT
 * at `createServer` time) because only forks originating from this desktop
 * main process should carry the flag; CLI / bunx servers must keep the
 * existing `http://localhost:...` behavior.
 */

export function buildUtilityForkEnv(parentEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...parentEnv, OK_ELECTRON_PROTOCOL_HOST: '1' };
}
