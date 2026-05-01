import type { ParsedCheckpoint, ShadowContributor } from '../shadow-repo-layout.ts';

export type { ShadowContributor };

export type EntryType = 'checkpoint' | 'wip' | 'upstream' | 'park';

export interface TimelineEntry {
  sha: string;
  timestamp: string; // ISO 8601
  author: string;
  authorEmail: string;
  type: EntryType;
  message: string;
  contributors: ShadowContributor[];
  checkpoint: ParsedCheckpoint | null;
}

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}
