#!/usr/bin/env bun
/**
 * Build + validate `openknowledge.skill` — the release-time entry point.
 * Thin wrapper around `buildSkillZip` from `@inkeep/open-knowledge-server`.
 *
 * Replaces the prior `scripts/build-skill-zip.sh` (Ship 1a). The shared
 * TS module is a single source of truth for the build + validation logic,
 * reused by `ok install-skill` (Ship 1f). Bash had to duplicate the
 * smoke-tests and couldn't run on Windows without `zip` in PATH.
 *
 * Usage:  bun scripts/build-skill-zip.ts [output-path]
 * Default output: ./openknowledge.skill (cwd-relative).
 *
 * CI (.github/workflows/release.yml) invokes this via
 * `bun run build:skill-zip`. Fails loud on any validation error — release
 * aborts before `gh release create` so we never publish a broken asset.
 */

import { buildSkillZip } from '@inkeep/open-knowledge-server';

const outputPath = process.argv[2];

try {
  const result = await buildSkillZip(outputPath ? { outputPath } : {});
  const versionSuffix = result.skillVersion ? `, skill version: ${result.skillVersion}` : '';
  console.log(
    `Built ${result.outputPath} (size: ${result.size} bytes, sha256: ${result.sha256}, cli version: ${result.cliVersion}${versionSuffix})`,
  );
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
