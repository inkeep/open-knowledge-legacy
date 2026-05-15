export function resolveSelfSpawn(): { command: string; prefixArgs: readonly string[] } {
  const command = process.execPath;
  const entry = process.argv[1];
  if (!entry) {
    console.warn(
      '[self-spawn] process.argv[1] is empty — falling back to `npx -y @inkeep/open-knowledge@latest`. ' +
        'This re-introduces the registry-fetch surface that re-exec was fixing. ' +
        `Observed argv: ${JSON.stringify(process.argv)}`,
    );
    return { command: 'npx', prefixArgs: ['-y', '@inkeep/open-knowledge@latest'] };
  }
  return { command, prefixArgs: [entry] };
}
