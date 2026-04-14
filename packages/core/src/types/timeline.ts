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
}

/** Diff line change type for full-file diff views. */
export type DiffLineType = 'added' | 'removed' | 'unchanged';

/** A single line in a full-file diff. */
export interface DiffLine {
  type: DiffLineType;
  text: string;
}
