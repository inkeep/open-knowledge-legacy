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
import { diffLines } from 'diff';
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
export function splitMarkdownBlocks(md: string): string[] {
  const normalized = md.replace(/\n+$/, '');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;
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

  // Classify current Y.Doc blocks relative to the snapshot:
  // - Blocks within snapshot range: either unchanged, agent-modified, or user-modified
  // - Blocks beyond snapshot range: agent-added (new paragraphs)
  const conflicts: ConflictInfo[] = [];
  const userBlocks = splitMarkdownBlocks(userEditedMarkdown);

  // Guard: if user inserted or deleted paragraphs, positional comparison is unreliable.
  // Fall back to whole-doc update (spec A2 item 5: "fallback when markdown structure
  // changed too drastically for paragraph-level mapping").
  if (userBlocks.length !== snapshotBlocks.length) {
    return applyWholeDoc(
      doc,
      fragment,
      userEditedMarkdown,
      mdManager,
      schema,
      `User paragraph count changed (${snapshotBlocks.length} → ${userBlocks.length}), positional merge unreliable`,
    );
  }

  // Agent-added blocks: those beyond the snapshot's paragraph count
  const agentAddedBlocks: string[] = [];
  for (let i = snapshotBlocks.length; i < currentBlocks.length; i++) {
    agentAddedBlocks.push(currentBlocks[i]);
  }

  // Detect conflicts: both user and agent modified the same paragraph
  for (let i = 0; i < snapshotBlocks.length; i++) {
    const snapshotBlock = snapshotBlocks[i].trim();
    const userBlock = userBlocks[i]?.trim();
    const currentBlock = currentBlocks[i]?.trim();

    if (userBlock !== snapshotBlock && currentBlock !== snapshotBlock) {
      // Both user and agent modified this paragraph — user wins
      conflicts.push({ paragraphIndex: i, resolution: 'user-wins' });
      console.warn(
        `[three-way-merge] Conflict at paragraph ${i}: both user and agent modified. User version wins.`,
      );
    }
  }

  // Build merged markdown:
  // Start with user's edits, then append agent-added blocks not already present
  const userText = userEditedMarkdown.replace(/\n+$/, '');
  const parts: string[] = [userText];

  let agentPreservedCount = 0;
  for (const agentBlock of agentAddedBlocks) {
    // Only append if the user's edited text doesn't already contain this block
    if (!userEditedMarkdown.includes(agentBlock.trim())) {
      parts.push(agentBlock);
      agentPreservedCount++;
    }
  }

  const mergedMarkdown = `${parts.join('\n\n')}\n`;

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
