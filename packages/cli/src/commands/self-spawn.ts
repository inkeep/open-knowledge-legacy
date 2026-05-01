export function resolveSelfSpawn(): { command: string; prefixArgs: readonly string[] } {
  const command = process.execPath;
  const entry = process.argv[1];
  if (!entry) {
    console.warn(
      '[self-spawn] process.argv[1] is empty — falling back to `npx @inkeep/open-knowledge`. ' +
        'This re-introduces the version-drift surface that re-exec was fixing. ' +
        `Observed argv: ${JSON.stringify(process.argv)}`,
    );
    return { command: 'npx', prefixArgs: ['@inkeep/open-knowledge'] };
  }
  return { command, prefixArgs: [entry] };
}
