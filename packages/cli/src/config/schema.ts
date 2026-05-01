
import type {
  Config as CoreConfig,
  FolderFrontmatter as CoreFolderFrontmatter,
  FolderRule as CoreFolderRule,
} from '@inkeep/open-knowledge-core';
import { ConfigSchema as CoreConfigSchema } from '@inkeep/open-knowledge-core';

export type Config = CoreConfig;
export type FolderFrontmatter = CoreFolderFrontmatter;
export type FolderRule = CoreFolderRule;
export const ConfigSchema = CoreConfigSchema;
