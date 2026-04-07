import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { diffArrays, diffLines } from 'diff';
/**
 * Split markdown into top-level blocks (paragraphs, headings, etc.).
 * Blocks are separated by blank lines. Respects fenced code blocks
 * (``` and ~~~) — blank lines inside fences do not cause splits.
 */
export function splitMarkdownBlocks(md) {
    const normalized = md.replace(/\n+$/, '');
    if (!normalized)
        return [];
    const lines = normalized.split('\n');
    const blocks = [];
    let current = [];
    let fenceChar = null;
    for (const line of lines) {
        const fenceMatch = line.match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
            const char = fenceMatch[1][0]; // '`' or '~'
            if (!fenceChar)
                fenceChar = char; // opening
            else if (char === fenceChar)
                fenceChar = null; // matching close
        }
        const inFence = fenceChar !== null;
        if (!inFence && line.trim() === '' && current.length > 0) {
            blocks.push(current.join('\n').trim());
            current = [];
        }
        else {
            current.push(line);
        }
    }
    if (current.length > 0) {
        const block = current.join('\n').trim();
        if (block)
            blocks.push(block);
    }
    return blocks;
}
/**
 * Serialize the current Y.XmlFragment to markdown.
 */
function serializeFragment(fragment, mdManager) {
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
export function threeWayMerge(doc, fragment, snapshotMarkdown, userEditedMarkdown, mdManager, schema) {
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
    // Classify blocks using diff-based alignment (handles insertions/deletions)
    const conflicts = [];
    const userBlocks = splitMarkdownBlocks(userEditedMarkdown);
    // Align user blocks against snapshot using diffArrays (content-based, not positional).
    // This handles the common case where the user adds, removes, or reorders paragraphs.
    const userAlignment = diffArrays(snapshotBlocks, userBlocks);
    const agentAlignment = diffArrays(snapshotBlocks, currentBlocks);
    // Build lookup: for each snapshot block index, what did the user/agent do?
    // Walk the alignments to build per-snapshot-block maps.
    const userChanges = new Map(); // snapshot index → user's version
    const userAdded = []; // blocks user added (not in snapshot)
    let snapshotIdx = 0;
    for (const part of userAlignment) {
        if (!part.added && !part.removed) {
            // Common blocks — user didn't change these
            snapshotIdx += part.count ?? 0;
        }
        else if (part.removed) {
            // User removed or modified these snapshot blocks
            for (let i = 0; i < (part.count ?? 0); i++) {
                userChanges.set(snapshotIdx + i, ''); // mark as removed (may be replaced by an added part)
            }
            snapshotIdx += part.count ?? 0;
        }
        else if (part.added) {
            // User added these blocks — could be replacements for preceding removed blocks or new
            for (const val of part.value) {
                userAdded.push(val);
            }
        }
    }
    const agentChanges = new Map(); // snapshot index → agent's version
    const agentAdded = []; // blocks agent added (not in snapshot)
    snapshotIdx = 0;
    for (const part of agentAlignment) {
        if (!part.added && !part.removed) {
            snapshotIdx += part.count ?? 0;
        }
        else if (part.removed) {
            for (let i = 0; i < (part.count ?? 0); i++) {
                agentChanges.set(snapshotIdx + i, ''); // mark as removed/modified
            }
            snapshotIdx += part.count ?? 0;
        }
        else if (part.added) {
            for (const val of part.value) {
                agentAdded.push(val);
            }
        }
    }
    // Per-paragraph resolution for blocks in the snapshot range
    const mergedBlocks = [];
    let agentPreservedCount = 0;
    let conflictIdx = 0;
    // Resolve each snapshot block
    for (let i = 0; i < snapshotBlocks.length; i++) {
        const userChanged = userChanges.has(i);
        const agentChanged = agentChanges.has(i);
        if (userChanged && agentChanged) {
            // Both modified — user wins (spec: "user's version wins for P0")
            conflicts.push({ paragraphIndex: conflictIdx, resolution: 'user-wins' });
            console.warn(`[three-way-merge] Conflict at paragraph ${i}: both user and agent modified. User version wins.`);
            // User's version handled by the user-added blocks below
        }
        else if (agentChanged && !userChanged) {
            // Only agent modified — use agent's version (Critical fix: preserve agent in-place edits)
            // Don't include the snapshot block — agent's version is in agentAdded
            agentPreservedCount++;
            continue; // skip adding the snapshot block; agent version added below
        }
        else if (userChanged) {
            // Only user modified — user's version handled by userAdded
            continue; // skip the snapshot block
        }
        else {
            // Neither changed — keep snapshot version
            mergedBlocks.push(snapshotBlocks[i]);
        }
        conflictIdx++;
    }
    // Append user-added blocks (user modifications + new blocks)
    for (const block of userAdded) {
        mergedBlocks.push(block);
    }
    // Append agent-added blocks (agent modifications + new blocks)
    // Only if the block isn't already present in merged output
    const mergedSet = new Set(mergedBlocks.map((b) => b.trim()));
    for (const block of agentAdded) {
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
function applyWholeDoc(doc, fragment, markdown, mdManager, schema, reason) {
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
//# sourceMappingURL=three-way-merge.js.map