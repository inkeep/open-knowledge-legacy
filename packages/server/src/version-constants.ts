/**
 * Version constants for cross-install drift detection.
 *
 * Single source of truth for the three version dimensions defined in
 * `specs/2026-04-24-cross-install-version-handshake/SPEC.md` §6.5 + D13:
 *
 * - `RUNTIME_VERSION` — semver of `@inkeep/open-knowledge-server`. Read from
 *   the package's own `package.json` at module load. Used in lock metadata
 *   and state-manifest diagnostic fields. Changes every release.
 * - `PROTOCOL_VERSION` — integer. Bumped whenever a cross-process contract
 *   changes shape in a way an existing installed binary cannot interpret
 *   safely (lock-field rename/removal, WS frame shape change, MCP handshake
 *   addition). Additive-only changes do NOT bump. Used by the MCP protocol
 *   gate to refuse incompatible spawns (§3 G6).
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
 * Cross-process contract version. Bumped on shape-breaking changes to the
 * lock fields, the WS protocol between server and Electron renderer, the MCP
 * auto-start handshake, or any HTTP API field an installed binary depends on.
 * Additive-only changes (new optional fields, new endpoints, new WS frame
 * types old readers can ignore) do NOT bump.
 */
export const PROTOCOL_VERSION = 1 as const;

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
