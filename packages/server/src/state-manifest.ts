/**
 * Durable per-project state schema manifest.
 *
 * `.open-knowledge/state.json` answers one question: *can the current binary
 * read this project's on-disk state at all?* A version-mismatching runtime
 * must refuse to boot rather than silently misinterpret durable state.
 *
 * Rules (specs/2026-04-24-cross-install-version-handshake/SPEC.md §6.2 +
 * G2 fresh-vs-adopt):
 *
 * - Manifest present + `stateSchemaVersion` matches → proceed. Update
 *   `lastWriteBy` opportunistically.
 * - Manifest present + version mismatch → throw. NG4 prohibits on-the-fly
 *   migration in this scope.
 * - Manifest present + corrupt → throw. NG8 — corrupt is NOT treated as
 *   absent; that would silently overwrite real durable state.
 * - Manifest absent + no `.open-knowledge/` AND no `.git/open-knowledge/`
 *   shadow repo → genuinely fresh project. Write the manifest at the
 *   current `STATE_SCHEMA_VERSION`.
 * - Manifest absent + any pre-existing state (`.open-knowledge/` directory
 *   OR a shadow repo) → adopting a pre-versioned project. Write the manifest
 *   at `stateSchemaVersion = 0` (pre-manifest sentinel) with `createdBy.adoptedAt`
 *   set, log a one-time adoption warning. v1 binaries can read schema-0 state
 *   by definition; future v≥2 binaries can still refuse.
 *
 * The fresh-vs-adopt split is load-bearing for the rollout — every existing
 * project on the day this ships has a shadow repo and no manifest. Stamping
 * today's `STATE_SCHEMA_VERSION` over them would erase the information that
 * they pre-date the manifest scheme.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getLogger } from './logger.ts';
import { PROTOCOL_VERSION, RUNTIME_VERSION, STATE_SCHEMA_VERSION } from './version-constants.ts';

/**
 * Filename for the state manifest, relative to the lock dir
 * (`<contentDir>/.open-knowledge/`).
 */
export const STATE_MANIFEST_FILENAME = 'state.json';

export interface StateManifestWriter {
  runtimeVersion: string;
  protocolVersion: number;
  /** Set on the adoption write to mark "this project pre-dates the manifest scheme". */
  adoptedAt?: string;
}

export interface StateManifestRecord {
  stateSchemaVersion: number;
  createdAt: string;
  createdBy: StateManifestWriter;
  lastWriteBy?: StateManifestWriter & { at: string };
}

export type ProjectShape = 'fresh' | 'adopt';

/**
 * Determine whether the project is genuinely fresh (no prior state) or has
 * pre-existing on-disk state that pre-dates the manifest scheme.
 *
 * Pre-existing state is signaled by EITHER (a) the `<contentDir>/.open-knowledge/`
 * directory existing OR (b) the project's shadow repo at
 * `<projectRoot>/.git/open-knowledge/` existing. Both pre-date this scheme.
 */
export function detectProjectShape(opts: { lockDir: string; shadowRepoDir: string }): ProjectShape {
  const lockDirExists = existsSync(opts.lockDir);
  const shadowRepoExists = existsSync(opts.shadowRepoDir);
  if (lockDirExists || shadowRepoExists) return 'adopt';
  return 'fresh';
}

function manifestPath(lockDir: string): string {
  return resolve(lockDir, STATE_MANIFEST_FILENAME);
}

/**
 * Compatibility table for the pre-flight gate.
 *
 * Strict equality is the default (D14 — strict-only, no `minCompatibleProtocol`
 * range). One special case: schema 0 is the pre-manifest adoption sentinel,
 * and v1 was the first manifest-aware schema. v1 binaries can read schema-0
 * state by definition — that's how the rollout works (every existing project
 * on the day v1 ships has shadow-repo state and no manifest).
 *
 * Future versions (v2+) need to make their own explicit decision. If v2 wants
 * to read schema-0 / schema-1 state it adds itself here. Migration tooling
 * (NG5) will eventually convert older schemas in place — this table only
 * answers "can I read this without migrating?"
 */
function isCompatibleSchema(manifestSchema: number, currentSchema: number): boolean {
  if (manifestSchema === currentSchema) return true;
  if (manifestSchema === 0 && currentSchema === 1) return true;
  return false;
}

export class StateManifestError extends Error {
  readonly kind: 'corrupt' | 'incompatible';
  readonly path: string;
  constructor(args: {
    kind: 'corrupt' | 'incompatible';
    path: string;
    message: string;
  }) {
    super(args.message);
    this.name = 'StateManifestError';
    this.kind = args.kind;
    this.path = args.path;
  }
}

export type ReadStateManifestResult =
  | { status: 'absent' }
  | { status: 'present'; manifest: StateManifestRecord };

function isStateManifestRecord(value: unknown): value is StateManifestRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.stateSchemaVersion !== 'number') return false;
  if (typeof v.createdAt !== 'string') return false;
  if (!v.createdBy || typeof v.createdBy !== 'object') return false;
  const c = v.createdBy as Record<string, unknown>;
  if (typeof c.runtimeVersion !== 'string') return false;
  if (typeof c.protocolVersion !== 'number') return false;
  return true;
}

/**
 * Read the manifest. Returns `{status: 'absent'}` when no file exists.
 * Throws `StateManifestError({kind: 'corrupt'})` for parse errors or shape
 * violations — corrupt is NEVER treated as absent (NG8).
 */
export function readStateManifest(lockDir: string): ReadStateManifestResult {
  const path = manifestPath(lockDir);
  if (!existsSync(path)) return { status: 'absent' };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new StateManifestError({
      kind: 'corrupt',
      path,
      message: `Failed to read state manifest at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new StateManifestError({
      kind: 'corrupt',
      path,
      message: `State manifest at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  if (!isStateManifestRecord(parsed)) {
    throw new StateManifestError({
      kind: 'corrupt',
      path,
      message: `State manifest at ${path} has invalid shape (missing or wrong-typed required fields)`,
    });
  }
  return { status: 'present', manifest: parsed };
}

/**
 * Write the manifest, atomically replacing any prior file. Creates the lock
 * dir if absent. Owner-only readable (`mode: 0o600`) — the manifest contains
 * project-identifying metadata that has no business being world-readable on
 * shared hosts.
 */
export function writeStateManifest(lockDir: string, record: StateManifestRecord): void {
  const path = manifestPath(lockDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

interface AssertCompatibleStateManifestOptions {
  lockDir: string;
  /** Path to the project's shadow repo (`.git/open-knowledge/`). Used for adopt detection. */
  shadowRepoDir: string;
  /** Override the current binary's STATE_SCHEMA_VERSION — primarily for tests. */
  currentStateSchemaVersion?: number;
  /** Override the current binary's RUNTIME_VERSION — primarily for tests. */
  currentRuntimeVersion?: string;
  /** Override the current binary's PROTOCOL_VERSION — primarily for tests. */
  currentProtocolVersion?: number;
  /** Injectable clock — primarily for deterministic tests. */
  now?: () => Date;
}

/**
 * Pre-flight gate called before any shadow-repo IO. Implements the full
 * fresh-vs-adopt rule set (G2). Writes the manifest on first open; throws
 * `StateManifestError({kind: 'incompatible'})` when an existing manifest
 * does not match the current binary's `STATE_SCHEMA_VERSION`.
 *
 * Returns the resolved manifest after the call so callers (notably
 * `bootServer`) can log the outcome with the actual `stateSchemaVersion`.
 */
export function assertCompatibleStateManifest(
  opts: AssertCompatibleStateManifestOptions,
): StateManifestRecord {
  const log = getLogger('state-manifest');
  const currentStateSchemaVersion = opts.currentStateSchemaVersion ?? STATE_SCHEMA_VERSION;
  const currentRuntimeVersion = opts.currentRuntimeVersion ?? RUNTIME_VERSION;
  const currentProtocolVersion = opts.currentProtocolVersion ?? PROTOCOL_VERSION;
  const now = (opts.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const path = manifestPath(opts.lockDir);

  const read = readStateManifest(opts.lockDir);

  if (read.status === 'present') {
    const m = read.manifest;
    if (!isCompatibleSchema(m.stateSchemaVersion, currentStateSchemaVersion)) {
      throw new StateManifestError({
        kind: 'incompatible',
        path,
        message:
          `State manifest at ${path} declares stateSchemaVersion=${m.stateSchemaVersion} ` +
          `but this binary supports ${currentStateSchemaVersion}. ` +
          `Refusing to boot — on-the-fly migration is out of scope. ` +
          `(Manifest written by runtime ${m.createdBy.runtimeVersion}, ` +
          `protocol ${m.createdBy.protocolVersion}.)`,
      });
    }
    // Compatible — opportunistically refresh `lastWriteBy`. Best-effort; a
    // failure here should not crash the boot path.
    try {
      const updated: StateManifestRecord = {
        ...m,
        lastWriteBy: {
          runtimeVersion: currentRuntimeVersion,
          protocolVersion: currentProtocolVersion,
          at: nowIso,
        },
      };
      writeStateManifest(opts.lockDir, updated);
      return updated;
    } catch (err) {
      log.warn({ err }, '[state-manifest] failed to update lastWriteBy — proceeding');
      return m;
    }
  }

  // Absent — fresh-vs-adopt split.
  const shape = detectProjectShape({
    lockDir: opts.lockDir,
    shadowRepoDir: opts.shadowRepoDir,
  });

  if (shape === 'fresh') {
    const fresh: StateManifestRecord = {
      stateSchemaVersion: currentStateSchemaVersion,
      createdAt: nowIso,
      createdBy: {
        runtimeVersion: currentRuntimeVersion,
        protocolVersion: currentProtocolVersion,
      },
    };
    writeStateManifest(opts.lockDir, fresh);
    log.info(
      { path, stateSchemaVersion: currentStateSchemaVersion },
      '[state-manifest] fresh project — wrote manifest',
    );
    return fresh;
  }

  // Adopt — pre-existing state, no manifest. Stamp schema-0 sentinel.
  const adopted: StateManifestRecord = {
    stateSchemaVersion: 0,
    createdAt: nowIso,
    createdBy: {
      runtimeVersion: currentRuntimeVersion,
      protocolVersion: currentProtocolVersion,
      adoptedAt: nowIso,
    },
  };
  writeStateManifest(opts.lockDir, adopted);
  log.warn(
    { path, runtimeVersion: currentRuntimeVersion },
    '[state-manifest] adopting pre-versioned project — wrote schema-0 manifest. ' +
      'Future binaries with STATE_SCHEMA_VERSION>=2 may refuse if they cannot read schema-0 state.',
  );
  return adopted;
}
