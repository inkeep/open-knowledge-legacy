/**
 * Types for the `ok seed` scaffolder.
 *
 * `FolderRule` / `FolderFrontmatter` mirror the Zod schema shape in
 * `packages/cli/src/config/schema.ts:FolderRuleSchema`. The schema lives
 * in the CLI package alongside the rest of the config loader — this seed
 * module (in server) produces matching shapes structurally without
 * pulling Zod in. The CLI's config loader validates any data before it
 * reaches runtime consumers.
 */

/**
 * Per-folder frontmatter fields written into `config.yml` `folders:` entries.
 * Matches `FolderFrontmatterSchema` structurally.
 */
export interface FolderFrontmatter {
  title?: string;
  description?: string;
  tags?: string[];
}

/**
 * A single `folders:` rule. Matches `FolderRuleSchema` structurally:
 *   `{ match: <glob>, frontmatter: FolderFrontmatter }`.
 */
export interface FolderRule {
  match: string;
  frontmatter: FolderFrontmatter;
}

/**
 * A filesystem entry that the scaffolder will create on apply.
 */
export interface FileEntry {
  /** Path relative to the project root. */
  path: string;
  kind: 'folder' | 'file';
  /**
   * Template id used by apply() to look up the file content. Stable across
   * `rootDir` choices — the path may be `log.md` or `brain/log.md` depending
   * on where the user scaffolds, but the template id is always `log.md`.
   * Required for files; omitted for folders.
   */
  template?: string;
  /** For files, first N lines of the content to be written. Omitted for folders. */
  contentPreview?: string;
}

/**
 * An entry the scaffolder detected but will NOT write because it's already present
 * or would collide with user content. Surfaced so the plan is fully transparent.
 */
export interface SkipEntry {
  path: string;
  reason: 'already-exists' | 'user-content' | 'glob-collision';
}

/**
 * A config.yml edit that the scaffolder will apply by appending to the `folders:`
 * array.
 */
export interface ConfigEdit {
  /** Absolute or project-relative path to the config.yml being edited. */
  configPath: string;
  /** The glob pattern that the entry matches (keyed for collision detection). */
  folderMatch: string;
  /** The new folder rule to append. */
  entry: FolderRule;
}

/**
 * The full plan the scaffolder computed. A pure, read-only description of what
 * applySeed() would do — never performs writes itself.
 */
export interface ScaffoldPlan {
  /** Folders + files that will be newly created. */
  created: FileEntry[];
  /** Entries detected but skipped. */
  skipped: SkipEntry[];
  /** config.yml edits queued for append. */
  configEdits: ConfigEdit[];
  /** Non-fatal warnings surfaced during planning. */
  warnings: string[];
}

/**
 * Result of applying a ScaffoldPlan.
 *
 * Rollback semantics: on partial failure (e.g. EACCES mid-write), successfully-written
 * entries remain on disk; `errors` lists what failed. Not atomic.
 */
export interface ApplyResult {
  /** Count of folders/files/config-edits successfully written. */
  applied: number;
  /** Per-path errors captured during apply. */
  errors: ApplyError[];
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface ApplyError {
  /** Path that failed. */
  path: string;
  /** Error message. */
  error: string;
}

/**
 * Options accepted by planSeed() / applySeed(). `projectDir` defaults to cwd.
 *
 * `rootDir` is the folder (relative to `projectDir`) where the knowledge-base
 * starter pack is scaffolded. Defaults to `.` (project root) which matches the
 * historical behavior. Pass e.g. `'brain'` to place `external-sources/`,
 * `research/`, `articles/`, and `log.md` under `brain/`, with config.yml
 * `folders:` entries scoped to `brain/external-sources/**` etc.
 */
export interface SeedOptions {
  projectDir?: string;
  rootDir?: string;
}

/**
 * Thrown by planSeed() when `.open-knowledge/` is absent (user must run `ok init` first).
 */
export class SeedPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedPrerequisiteError';
  }
}

/**
 * Thrown by planSeed() when the user-supplied `rootDir` is unusable —
 * absolute, contains `..` segments, resolves outside the project directory,
 * or otherwise rejected by normalization. Distinct from
 * `SeedPrerequisiteError` so callers (CLI, HTTP route, Electron IPC) can
 * surface a focused "fix your input" message rather than emit telemetry as
 * if the server malfunctioned.
 */
export class SeedRootDirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRootDirError';
  }
}

/**
 * Filename of the project config under `.open-knowledge/`. Duplicates the
 * same literal defined in `packages/cli/src/constants.ts:CONFIG_FILENAME` —
 * kept local so the server-side seed module has no CLI dependency.
 */
export const SEED_CONFIG_FILENAME = 'config.yml';
