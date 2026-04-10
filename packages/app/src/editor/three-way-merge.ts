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
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
// diffArrays retained from jsdiff — operates on small block arrays where
// pathological performance is unlikely. diffLinesFast (diff-match-patch)
// is used for string-level diffs where worst-case matters.
import { diffArrays } from 'diff';
import type * as Y from 'yjs';
import { diffLinesFast as diffLines } from './diff-lines-fast';

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
export function splitMarkdownBlocks(md: string): string[] {
  const normalized = md.replace(/\n+$/, '');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fenceChar: string | null = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const char = fenceMatch[1][0]; // '`' or '~'
      if (!fenceChar)
        fenceChar = char; // opening
      else if (char === fenceChar) fenceChar = null; // matching close
    }
    const inFence = fenceChar !== null;
    if (!inFence && line.trim() === '' && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    const block = current.join('\n').trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

/**
 * Serialize the current Y.XmlFragment to markdown.
 */
function serializeFragment(fragment: Y.XmlFragment, mdManager: MarkdownManager): string {
  const json = yXmlFragmentToProsemirrorJSON(fragment);
  return mdManager.serialize(json);
}

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
export function threeWayMerge(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  snapshotMarkdown: string,
  userEditedMarkdown: string,
  mdManager: MarkdownManager,
  schema: Schema,
): ThreeWayMergeResult {
  // Fast path: no user changes → leave Y.Doc as-is (agent writes fully preserved)
  if (snapshotMarkdown === userEditedMarkdown) {
    return {
      selective: true,
      userChangedCount: 0,
      agentPreservedCount: 0,
      conflicts: [],
    };
  }

  // Serialize the current Y.Doc (includes agent writes)
  const currentMarkdown = serializeFragment(fragment, mdManager);
  const currentBlocks = splitMarkdownBlocks(currentMarkdown);
  const snapshotBlocks = splitMarkdownBlocks(snapshotMarkdown);

  // Fast path: Y.Doc hasn't changed since snapshot → no agent writes to preserve
  // Just apply the user's edits directly (same as old behavior, but it's safe here)
  if (currentMarkdown.replace(/\n+$/, '').trim() === snapshotMarkdown.replace(/\n+$/, '').trim()) {
    return applyWholeDoc(doc, fragment, userEditedMarkdown, mdManager, schema, undefined);
  }

  // Build per-snapshot-block resolution using diff-based alignment.
  // For each snapshot block, determine what the agent did (modified/unchanged/removed).
  const conflicts: ConflictInfo[] = [];
  const userBlocks = splitMarkdownBlocks(userEditedMarkdown);

  // Agent diff: snapshot → current Y.Doc. Tells us which snapshot blocks the agent changed.
  const agentDiff = diffArrays(snapshotBlocks, currentBlocks);

  // Build a map: snapshot block (by index) → agent's replacement blocks (if modified).
  // For unchanged blocks, no entry. For modified blocks, map to the replacement(s).
  const agentReplacements = new Map<number, string[]>();
  const agentAppended: string[] = []; // truly new blocks added after all snapshot content
  let sIdx = 0;
  for (const part of agentDiff) {
    if (!part.added && !part.removed) {
      // Common — agent didn't change these snapshot blocks
      sIdx += part.count ?? 0;
    } else if (part.removed) {
      // These snapshot blocks were removed/replaced by agent
      for (let i = 0; i < (part.count ?? 0); i++) {
        agentReplacements.set(sIdx + i, []); // initially empty, filled by subsequent 'added' part
      }
      sIdx += part.count ?? 0;
    } else if (part.added) {
      // These are agent's new/replacement blocks.
      // Attach them to the most recently removed snapshot block, or as appended.
      const lastRemovedIdx = sIdx - 1;
      if (agentReplacements.has(lastRemovedIdx)) {
        // This 'added' part replaces the preceding 'removed' snapshot blocks
        const existing = agentReplacements.get(lastRemovedIdx) ?? [];
        agentReplacements.set(lastRemovedIdx, [...existing, ...part.value]);
      } else {
        // Truly new content (appended beyond snapshot range)
        agentAppended.push(...part.value);
      }
    }
  }

  // User diff: snapshot → user's edited version. Tells us what the user changed.
  const userDiff = diffArrays(snapshotBlocks, userBlocks);

  // Build merged output by walking the user diff.
  // For each snapshot block encountered in the user diff:
  //   - If user changed it: use user's version (from 'added' parts)
  //   - If user didn't change it but agent did: use agent's version
  //   - If both changed: user wins (conflict)
  //   - If neither changed: keep as-is
  // User-added blocks (not matching any snapshot block) pass through as-is.
  const mergedBlocks: string[] = [];
  let agentPreservedCount = 0;
  let conflictParagraph = 0;

  for (const part of userDiff) {
    if (!part.added && !part.removed) {
      // Common: user kept these snapshot blocks unchanged.
      // Check if agent modified any of them.
      for (const block of part.value) {
        const blockIdx = snapshotBlocks.indexOf(block, conflictParagraph);
        if (blockIdx >= 0 && agentReplacements.has(blockIdx)) {
          // Agent modified this block, user didn't — use agent's version
          const replacements = agentReplacements.get(blockIdx) ?? [];
          mergedBlocks.push(...replacements);
          agentPreservedCount++;
        } else {
          // Neither changed — keep as-is
          mergedBlocks.push(block);
        }
        conflictParagraph = (blockIdx >= 0 ? blockIdx : conflictParagraph) + 1;
      }
    } else if (part.removed) {
      // User removed/modified these snapshot blocks. Check for conflicts.
      for (const block of part.value) {
        const blockIdx = snapshotBlocks.indexOf(
          block,
          conflictParagraph > 0 ? conflictParagraph - (part.count ?? 0) : 0,
        );
        if (blockIdx >= 0 && agentReplacements.has(blockIdx)) {
          // Both user and agent modified — conflict, user wins
          conflicts.push({ paragraphIndex: blockIdx, resolution: 'user-wins' });
          console.warn(
            `[three-way-merge] Conflict at paragraph ${blockIdx}: both user and agent modified. User version wins.`,
          );
        }
        // User's replacement comes from the subsequent 'added' part — handled below
      }
    } else if (part.added) {
      // User-added blocks (replacements for removed blocks, or new blocks)
      mergedBlocks.push(...part.value);
    }
  }

  // Append agent-appended blocks (beyond snapshot range)
  const mergedSet = new Set(mergedBlocks.map((b) => b.trim()));
  for (const block of agentAppended) {
    if (!mergedSet.has(block.trim())) {
      mergedBlocks.push(block);
      agentPreservedCount++;
    }
  }

  const mergedMarkdown = `${mergedBlocks.join('\n\n')}\n`;

  // Apply the merged markdown via updateYFragment
  const parsedJson = mdManager.parse(mergedMarkdown);
  const pmNode = schema.nodeFromJSON(parsedJson);

  doc.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, pmNode, meta);
  });

  // Count user changes using diff
  const changes = diffLines(snapshotMarkdown, userEditedMarkdown);
  const userChangedCount = changes.filter((c) => c.added || c.removed).length;

  return {
    selective: true,
    userChangedCount,
    agentPreservedCount,
    conflicts,
  };
}

/**
 * Fallback or direct application: apply markdown to the Y.Doc.
 */
function applyWholeDoc(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  markdown: string,
  mdManager: MarkdownManager,
  schema: Schema,
  reason: string | undefined,
): ThreeWayMergeResult {
  if (reason) {
    console.warn(`[three-way-merge] Falling back to whole-doc update: ${reason}`);
  }

  const parsedJson = mdManager.parse(markdown);
  const pmNode = schema.nodeFromJSON(parsedJson);

  doc.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, pmNode, meta);
  });

  return {
    selective: false,
    userChangedCount: 0,
    agentPreservedCount: 0,
    conflicts: [],
    fallbackReason: reason,
  };
}
