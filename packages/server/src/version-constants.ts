/**
 * Version constants for cross-install drift detection.
 *
 * Single source of truth for the durable version dimensions:
 *
 * - `RUNTIME_VERSION` — semver of `@inkeep/open-knowledge-server`. Read from
 *   the package's own `package.json` at module load. Used in lock metadata
 *   and state-manifest diagnostic fields. Changes every release.
 * - `STATE_SCHEMA_VERSION` — integer. Bumped whenever on-disk durable state
 *   changes shape in a way older binaries cannot safely read (writer-ID
 *   category, shadow-repo branch naming, agent-presence map shape).
 *
 * `RUNTIME_VERSION` is read at runtime rather than build-time-injected so the
 * value is correct in both `dev` mode (Bun running `src/*.ts` directly) and
 * `default` export (the bundled `dist/index.mjs`). Both layouts have a
 * `package.json` adjacent — `src/version-constants.ts` → `../package.json`
 * for dev, `dist/index.mjs` → `../package.json` for the bundle.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readRuntimeVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/version-constants.ts → ../package.json
    // dist/index.mjs → ../package.json (tsdown bundles to dist/)
    const pkgPath = resolve(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // Fall through to sentinel.
  }
  return '0.0.0-unknown';
}

export const RUNTIME_VERSION: string = readRuntimeVersion();

/**
 * Durable on-disk state version. Bumped when the shadow repo, the
 * `.open-knowledge/` directory, or any other durable artifact changes shape
 * in a way older binaries cannot safely read. The state manifest at
 * `<contentDir>/.open-knowledge/state.json` records the writer's
 * `STATE_SCHEMA_VERSION`; cold-start refuses incompatible.
 *
 * Sentinel `0` is the pre-manifest adoption marker (see `state-manifest.ts`'s
 * fresh-vs-adopt rules). v1 is the first manifest-aware schema; v1 binaries
 * can read schema-0 state by definition.
 */
export const STATE_SCHEMA_VERSION = 1 as const;
