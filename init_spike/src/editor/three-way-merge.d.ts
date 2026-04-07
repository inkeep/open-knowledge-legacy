/**
 * Three-way merge for source mode toggle-back.
 *
 * Instead of replacing the entire Y.Doc with the user's parsed markdown
 * (which clobbers concurrent agent writes), this module:
 *
 * 1. Diffs the snapshot (taken when entering source mode) against the user's edited markdown
 * 2. Identifies agent-added content (present in Y.Doc but absent from the snapshot)
 * 3. Merges user edits + agent additions into a combined markdown
 * 4. Applies via updateYFragment (diff-based)
 *
 * Result: user changes are applied, agent writes to untouched paragraphs are preserved.
 */
import type { MarkdownManager } from '@tiptap/markdown';
import type { Schema } from '@tiptap/pm/model';
import type * as Y from 'yjs';
export interface ThreeWayMergeResult {
    /** Whether the merge was applied selectively (true) or fell back to whole-doc (false) */
    selective: boolean;
    /** Number of paragraphs the user changed */
    userChangedCount: number;
    /** Number of agent-added paragraphs preserved */
    agentPreservedCount: number;
    /** Conflicts detected (agent edited same paragraph as user) */
    conflicts: ConflictInfo[];
    /** If fallback was used, the reason */
    fallbackReason?: string;
}
export interface ConflictInfo {
    paragraphIndex: number;
    resolution: 'user-wins';
}
/**
 * Split markdown into top-level blocks (paragraphs, headings, etc.).
 * Blocks are separated by blank lines. Respects fenced code blocks
 * (``` and ~~~) — blank lines inside fences do not cause splits.
 */
export declare function splitMarkdownBlocks(md: string): string[];
/**
 * Perform a three-way merge on toggle-back from source mode.
 *
 * Three versions:
 * - base (snapshotMarkdown): what the user saw when entering source mode
 * - theirs (current Y.Doc): what the Y.Doc looks like now (may have agent writes)
 * - ours (userEditedMarkdown): what the user edited in source mode
 *
 * Strategy:
 * 1. If user made no changes → do nothing (preserve Y.Doc as-is with agent writes)
 * 2. Identify agent-added blocks (in Y.Doc but not in snapshot)
 * 3. Take the user's edited markdown
 * 4. Append agent-added blocks that aren't already in the user's text
 * 5. Apply the merged result
 */
export declare function threeWayMerge(doc: Y.Doc, fragment: Y.XmlFragment, snapshotMarkdown: string, userEditedMarkdown: string, mdManager: MarkdownManager, schema: Schema): ThreeWayMergeResult;
