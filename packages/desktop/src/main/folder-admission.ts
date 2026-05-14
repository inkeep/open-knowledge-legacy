/**
 * Folder-pick admission helpers — classifiers the desktop main process runs
 * against a path the user picked (system folder dialog, drag-drop from Finder,
 * Recents click, or `openknowledge://` deep-link) BEFORE spawning a project
 * window. `validateFolderPick` is pure and surfaces "this looks like an
 * unusual choice" warnings without ever blocking (warn, never refuse).
 * `discoverProject` walks the filesystem to decide whether the picked path
 * (a) is already inside an OK-managed tree (promote to ancestor),
 * (b) sits inside a git working tree (promote `.ok/` to git root),
 * or (c) is a fresh standalone folder.
 *
 * `homeDir` and `gitTopLevel` are injectable so tests don't depend on the real
 * process environment or shell out to git.
 */

import { execFile } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir as nodeHomedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { isProjectRoot } from '@inkeep/open-knowledge-server';

const execFileAsync = promisify(execFile);

export type SensitivePathWarning =
  | { readonly kind: 'root' }
  | { readonly kind: 'home' }
  | { readonly kind: 'home-documents' }
  | { readonly kind: 'home-desktop' }
  | { readonly kind: 'home-downloads' }
  | { readonly kind: 'volumes-mount' }
  | { readonly kind: 'drive-root' };

export interface FolderPickValidation {
  readonly warnings: readonly SensitivePathWarning[];
  readonly blocked: boolean;
}

export interface ValidateFolderPickOptions {
  /** Defaults to `os.homedir()`. Tests inject a fixed value to avoid coupling
   * assertions to the real environment's home path. */
  homeDir?: string;
}

export function validateFolderPick(
  absPath: string,
  opts: ValidateFolderPickOptions = {},
): FolderPickValidation {
  const home = opts.homeDir ?? nodeHomedir();
  const warnings: SensitivePathWarning[] = [];

  if (/^[A-Za-z]:[\\/]?$/.test(absPath)) {
    warnings.push({ kind: 'drive-root' });
  }

  const resolved = resolve(absPath);

  if (resolved === '/') {
    warnings.push({ kind: 'root' });
  }

  if (resolved === home) {
    warnings.push({ kind: 'home' });
  }

  if (resolved === join(home, 'Documents')) {
    warnings.push({ kind: 'home-documents' });
  }

  if (resolved === join(home, 'Desktop')) {
    warnings.push({ kind: 'home-desktop' });
  }

  if (resolved === join(home, 'Downloads')) {
    warnings.push({ kind: 'home-downloads' });
  }

  if (resolved === '/Volumes' || resolved.startsWith('/Volumes/')) {
    warnings.push({ kind: 'volumes-mount' });
  }

  return { warnings, blocked: false };
}

export type GitState = 'present' | 'absent' | 'shell-only';

export type RejectionReason = 'symlink-escape' | 'unreadable';

export type DiscoverProjectResult =
  | {
      readonly kind: 'managed';
      readonly pickedPath: string;
      readonly projectDir: string;
      readonly ancestorPromoted: boolean;
    }
  | {
      readonly kind: 'managed-requires-confirmation';
      readonly pickedPath: string;
      readonly projectDir: string;
      readonly ancestorPromoted: true;
    }
  | {
      readonly kind: 'fresh';
      readonly pickedPath: string;
      readonly projectDir: string;
      readonly defaultContentDir: string;
      readonly gitState: GitState;
      readonly gitRootPromoted: boolean;
    }
  | { readonly kind: 'rejected'; readonly reason: RejectionReason };

export interface DiscoverProjectOptions {
  /** Defaults to `os.homedir()`. The walk stops without checking home (and
   * never promotes to a git root at-or-above home). Tests inject a fixed
   * value to keep assertions stable. */
  homeDir?: string;
  /** Resolves the git working-tree root for a given cwd. Defaults to shelling
   * out to `git rev-parse --show-toplevel`; tests inject a deterministic
   * stub. Returns `null` when the cwd is not inside a git working tree (or
   * when `git` itself is unavailable). */
  gitTopLevel?: (cwd: string) => Promise<string | null>;
  dirSizeProbe: ((dir: string) => Promise<{ readonly exceedsCap: boolean }>) | null;
}

const ANCESTOR_WALK_DEPTH_LIMIT = 30;

export async function discoverProject(
  pickedPath: string,
  opts: DiscoverProjectOptions,
): Promise<DiscoverProjectResult> {
  const home = opts.homeDir ?? nodeHomedir();
  const gitTopLevel = opts.gitTopLevel ?? defaultGitTopLevel;
  const dirSizeProbe = opts.dirSizeProbe;
  const absPicked = resolve(pickedPath);

  let realPicked: string;
  let realParent: string;
  try {
    realPicked = realpathSync(absPicked);
    realParent = realpathSync(dirname(absPicked));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'ELOOP' || code === 'ENOENT') {
      return { kind: 'rejected', reason: 'unreadable' };
    }
    throw err;
  }

  if (!isDescendantOrEqual(realPicked, realParent)) {
    return { kind: 'rejected', reason: 'symlink-escape' };
  }

  let cursor = realPicked;
  let depth = 0;
  while (depth < ANCESTOR_WALK_DEPTH_LIMIT) {
    if (cursor === home || cursor === '/' || cursor === '') break;
    if (isProjectRoot(cursor)) {
      const ancestorPromoted = cursor !== realPicked;
      if (ancestorPromoted && dirSizeProbe !== null) {
        const { exceedsCap } = await dirSizeProbe(cursor);
        if (exceedsCap) {
          return {
            kind: 'managed-requires-confirmation',
            pickedPath: realPicked,
            projectDir: cursor,
            ancestorPromoted: true,
          };
        }
      }
      return {
        kind: 'managed',
        pickedPath: realPicked,
        projectDir: cursor,
        ancestorPromoted,
      };
    }
    const next = dirname(cursor);
    if (next === cursor) break;
    cursor = next;
    depth += 1;
  }

  const gitRoot = await gitTopLevel(realPicked);
  let projectDir = realPicked;
  let gitRootPromoted = false;
  if (gitRoot !== null && isDescendantOfHome(gitRoot, home)) {
    projectDir = gitRoot;
    gitRootPromoted = gitRoot !== realPicked;
  }

  return {
    kind: 'fresh',
    pickedPath: realPicked,
    projectDir,
    defaultContentDir: '.',
    gitState: computeGitState(projectDir),
    gitRootPromoted,
  };
}

function isDescendantOrEqual(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function isDescendantOfHome(p: string, home: string): boolean {
  const rel = relative(home, p);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function computeGitState(projectDir: string): GitState {
  const dotGit = resolve(projectDir, '.git');
  if (!existsSync(dotGit)) return 'absent';
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(dotGit);
  } catch {
    return 'absent';
  }
  if (!stat.isDirectory()) return 'present';
  if (existsSync(resolve(dotGit, 'HEAD'))) return 'present';
  return 'shell-only';
}

async function defaultGitTopLevel(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
