/**
 * ActivityPanelDiffView — renders a unified-diff string produced by the
 * server's `synthesizeStackItemDiffText` (SPEC FR-P9). Uses `react-diff-view`
 * per SPEC D-P15 DIRECTED.
 *
 * Input: a unified-diff string (the output of `diff.createPatch(...)`), lazy-
 * fetched from `GET /api/agent-burst-diff?agentId=<>&docName=<>&stackIndex=<>`.
 *
 * When the server's `before === after` (no net change — e.g., an empty
 * StackItem or a write that was immediately overwritten), the endpoint
 * returns `diff: ""`. Render a subtle "No changes" placeholder rather than
 * an empty hunk.
 *
 * Dark-mode colours are defined in globals.css under `.activity-panel-diff`.
 */
import type * as React from 'react';
import { Diff, Hunk, parseDiff } from 'react-diff-view';

interface ActivityPanelDiffViewProps {
  diff: string;
}

/**
 * `diff.createPatch` (jsdiff) emits an `Index:` + `===` preamble that
 * `react-diff-view`'s parseDiff does NOT handle — it throws
 * "undefined is not an object (evaluating 'currentHunk.changes')". Strip
 * everything before the first `--- ` line so the parser sees a clean unified
 * diff.
 */
function stripIndexHeader(diff: string): string {
  const idx = diff.indexOf('\n--- ');
  if (idx >= 0) return diff.slice(idx + 1);
  // Already starts with `--- ` (or doesn't have the header): pass through.
  return diff;
}

export function ActivityPanelDiffView({ diff }: ActivityPanelDiffViewProps): React.JSX.Element {
  if (!diff.trim()) {
    return (
      <div className="activity-panel-diff px-3 py-2 text-xs text-muted-foreground italic">
        No changes
      </div>
    );
  }

  // parseDiff returns an array of files — for our single-file synthesis we
  // get exactly one. Tolerate malformed input by falling back to raw <pre>.
  let files: ReturnType<typeof parseDiff>;
  try {
    files = parseDiff(stripIndexHeader(diff));
  } catch {
    return (
      <pre className="activity-panel-diff font-mono text-xs whitespace-pre-wrap px-3 py-2">
        {diff}
      </pre>
    );
  }

  if (files.length === 0) {
    return (
      <div className="activity-panel-diff px-3 py-2 text-xs text-muted-foreground italic">
        No changes
      </div>
    );
  }

  return (
    <div className="activity-panel-diff">
      {files.map((file) => (
        <Diff
          key={`${file.oldPath ?? 'a'}→${file.newPath ?? 'b'}`}
          viewType="unified"
          diffType={file.type}
          hunks={file.hunks}
        >
          {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      ))}
    </div>
  );
}
