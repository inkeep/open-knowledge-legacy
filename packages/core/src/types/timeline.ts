import type { ParsedCheckpoint, ShadowContributor } from '../shadow-repo-layout.ts';

export type { ParsedCheckpoint, ShadowContributor };

/** Entry type classification — derived from shadow repo commit message prefix. */
export type EntryType = 'checkpoint' | 'wip' | 'upstream';

/** A single timeline entry representing a checkpoint or WIP auto-save from the shadow repo. */
export interface TimelineEntry {
  sha: string;
  timestamp: string; // ISO 8601
  author: string;
  authorEmail: string;
  type: EntryType;
  message: string;
  /** Agent contributors parsed from the WIP commit message body. Empty for pre-attribution commits. */
  contributors: ShadowContributor[];
  /**
   * Structured checkpoint metadata parsed from the `ok-checkpoint-v1:` body line.
   * Present only for `type === 'checkpoint'` rows produced by `saveInMemoryCheckpoint`
   * (silent rescue artifacts — bridge-merge-loss or external-change-rescue).
   * `null` for ordinary `saveVersion` checkpoints, WIP rows, upstream rows, and
   * any checkpoint whose body line is missing or malformed.
   */
  checkpoint: ParsedCheckpoint | null;
}

/** Diff line change type for full-file diff views. */
export type DiffLineType = 'added' | 'removed' | 'unchanged';

/** A single line in a full-file diff. */
export interface DiffLine {
  type: DiffLineType;
  text: string;
}
