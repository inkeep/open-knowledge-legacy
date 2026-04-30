/**
 * Pure env-builder for utilityProcess.fork (M4 SPEC AC8).
 *
 * Merges `process.env` with two desktop-only markers:
 *   - `OK_ELECTRON_PROTOCOL_HOST=1` — the utility's preview-url helper uses
 *     this to emit `openknowledge://` deep-links instead of `http://localhost:<port>`
 *     URLs (Electron host has the protocol handler registered). Set at fork
 *     time (NOT `createServer`) so only forks from this desktop main process
 *     carry the flag; CLI / bunx servers keep the existing http behavior.
 *   - `OK_LOCK_KIND=interactive` — pin the lock kind explicitly so an
 *     accidentally-inherited `mcp-spawned` from a surrounding shell never
 *     causes the desktop's own server to mark itself as MCP-spawned.
 *
 * Extracted so the merge can be unit-tested without standing up an Electron
 * runtime.
 */

export function buildUtilityForkEnv(parentEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...parentEnv,
    OK_ELECTRON_PROTOCOL_HOST: '1',
    OK_LOCK_KIND: 'interactive',
  };
}
