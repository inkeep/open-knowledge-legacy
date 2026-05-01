import type { FolderFrontmatter, FolderRule } from '../config/schema.ts';

export type { FolderFrontmatter, FolderRule };

export interface FileEntry {
  path: string;
  kind: 'folder' | 'file';
  template?: string;
  contentPreview?: string;
}

export interface SkipEntry {
  path: string;
  reason: 'already-exists' | 'user-content' | 'glob-collision';
}

export interface ConfigEdit {
  configPath: string;
  folderMatch: string;
  entry: FolderRule;
}

export interface ScaffoldPlan {
  created: FileEntry[];
  skipped: SkipEntry[];
  configEdits: ConfigEdit[];
  warnings: string[];
}

export interface ApplyResult {
  applied: number;
  errors: ApplyError[];
  durationMs: number;
}

export interface ApplyError {
  path: string;
  error: string;
}

export interface SeedOptions {
  projectDir?: string;
  rootDir?: string;
}

export class SeedPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedPrerequisiteError';
  }
}

export class SeedRootDirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRootDirError';
  }
}

export const SEED_CONFIG_FILENAME = 'config.yml';
