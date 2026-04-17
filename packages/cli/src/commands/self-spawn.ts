/**
 * Re-exec the currently-running CLI binary, rather than shelling out through
 * `npx @inkeep/open-knowledge <subcommand>`.
 *
 * Rationale: an MCP client running `@inkeep/open-knowledge@0.X` must NOT
 * auto-spawn `@inkeep/open-knowledge@0.Y` as its sibling — that would mix
 * lockfile ABIs across the new dual-process contract. `npx` with an unpinned
 * spec also carries a live-registry-fetch on first-invocation path and a
 * supply-chain surface (the sibling gets resolved via a mechanism the user
 * never opted into — `ok mcp` did it on their behalf).
 *
 * We instead re-invoke the exact binary currently executing — whichever the
 * user's install shape (global npm bin, `npx` cache, monorepo dev) resolved.
 *
 * Call sites:
 * - `ok mcp` spawning `ok start` (MCP-mediated auto-start)
 * - `ok start` spawning `ok ui` (sibling UI at startup)
 */

/**
 * Returns the `(command, prefixArgs)` pair that re-invokes the current CLI.
 * The caller appends subcommand-specific args (e.g. `['start']`, `['ui']`).
 */
export function resolveSelfSpawn(): { command: string; prefixArgs: readonly string[] } {
  // process.execPath is the absolute path of the Node/Bun runtime.
  // process.argv[1] is the entry script (the bin shim or the .ts source in dev).
  // Running `<runtime> <entry> <subcommand>` reproduces the invocation that
  // brought the current process up — same version, same runtime, no registry
  // round-trip, no cross-version ABI drift.
  const command = process.execPath;
  const entry = process.argv[1];
  if (!entry) {
    // Should never happen for a normal CLI process — `process.argv[1]` is
    // populated whenever a script is executed via node/bun/npx/bin-shim. If
    // we hit this path, some unusual install shape (embedded runtime?
    // ExecSnapshot bundle?) has stripped argv[1]. Fall back to `npx` — the
    // pre-fix behavior — but WARN so operators notice the regression to
    // version-drift + registry-fetch semantics rather than getting a silent
    // downgrade.
    console.warn(
      '[self-spawn] process.argv[1] is empty — falling back to `npx @inkeep/open-knowledge`. ' +
        'This re-introduces the version-drift surface that re-exec was fixing. ' +
        `Observed argv: ${JSON.stringify(process.argv)}`,
    );
    return { command: 'npx', prefixArgs: ['@inkeep/open-knowledge'] };
  }
  return { command, prefixArgs: [entry] };
}
