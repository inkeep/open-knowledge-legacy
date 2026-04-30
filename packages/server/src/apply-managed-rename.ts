import { randomUUID } from 'node:crypto';
import { prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import {
  rewriteMarkdownLinksForDocumentRename,
  rewriteOutboundMarkdownLinksForSourceMove,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';

interface ManagedRenameAffectedDocPair {
  from: string;
  to: string;
}

interface ManagedRenameRewriteSummary {
  markdown: string;
  rewrites: number;
}

/**
 * Thrown by `buildRenameMap` when two affected-doc entries would produce the
 * same destination. Caller surfaces as HTTP 409 with the colliding paths.
 *
 * Wire field names (`existing`/`incoming`/`to`) are stable and surfaced through
 * the MCP tool's structured error response.
 */
export class ManagedRenameCollisionError extends Error {
  readonly colliding: ReadonlyArray<{
    readonly existing: string;
    readonly incoming: string;
    readonly to: string;
  }>;

  constructor(
    colliding: ReadonlyArray<{
      readonly existing: string;
      readonly incoming: string;
      readonly to: string;
    }>,
  ) {
    super(
      `Managed rename collision: ${colliding
        .map((c) => `'${c.existing}' and '${c.incoming}' both target '${c.to}'`)
        .join('; ')}`,
    );
    this.name = 'ManagedRenameCollisionError';
    this.colliding = colliding;
  }
}

/**
 * Thrown when the rename source does not exist (race window — checked inside
 * the serialized critical section). Caller surfaces as 404.
 */
export class ManagedRenameSourceNotFoundError extends Error {
  readonly kind: 'file' | 'folder';
  constructor(kind: 'file' | 'folder') {
    super(`${kind} does not exist`);
    this.name = 'ManagedRenameSourceNotFoundError';
    this.kind = kind;
  }
}

/**
 * Thrown when the rename destination already exists (race window — checked
 * inside the serialized critical section). Caller surfaces as 409.
 */
export class ManagedRenameDestinationExistsError extends Error {
  constructor() {
    super('Destination already exists');
    this.name = 'ManagedRenameDestinationExistsError';
  }
}

/**
 * Thrown when the source path's stat type does not match the requested kind
 * (e.g. body says `kind: 'folder'` but the path is a file). Caller surfaces as 400.
 */
export class ManagedRenameSourceTypeMismatchError extends Error {
  readonly kind: 'file' | 'folder';
  constructor(kind: 'file' | 'folder') {
    super(`Source path is not a ${kind}`);
    this.name = 'ManagedRenameSourceTypeMismatchError';
    this.kind = kind;
  }
}

/**
 * Build a Map<from, to> from the affected-docs list. Throws
 * `ManagedRenameCollisionError` if two distinct entries collide on the
 * same destination path.
 *
 * Single-pass, O(n²) collision detection — n is small (folder rename of
 * even 1000 docs is rare per spec assumption A4).
 */
export function buildRenameMap(
  affectedDocs: readonly ManagedRenameAffectedDocPair[],
): Map<string, string> {
  const map = new Map<string, string>();
  const collisions: Array<{ existing: string; incoming: string; to: string }> = [];
  for (const { from, to } of affectedDocs) {
    for (const [otherFrom, otherTo] of map) {
      if (otherFrom !== from && otherTo === to) {
        collisions.push({ existing: otherFrom, incoming: from, to });
      }
    }
    map.set(from, to);
  }
  if (collisions.length > 0) throw new ManagedRenameCollisionError(collisions);
  return map;
}

function rewriteSupportedLinksForRename(
  markdown: string,
  sourceDocName: string,
  oldDocName: string,
  newDocName: string,
): ManagedRenameRewriteSummary {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const wikiRewrite = rewriteWikiLinksForDocumentRename(body, oldDocName, newDocName);
  const markdownRewrite = rewriteMarkdownLinksForDocumentRename(
    wikiRewrite.markdown,
    sourceDocName,
    oldDocName,
    newDocName,
  );
  return {
    markdown: prependFrontmatter(frontmatter, markdownRewrite.markdown),
    rewrites: wikiRewrite.rewrites + markdownRewrite.rewrites,
  };
}

/**
 * Apply a rename map to a single document's markdown body.
 *
 * Three logical passes when the doc whose body is being rewritten is itself
 * being moved (a "self-rename"):
 *
 *   1. Self-rename pass — rewrites self-targeting wiki/markdown links and
 *      recomputes relative image-ref hrefs (the existing FR-7 logic in
 *      `rewriteMarkdownLinksInLine`'s `isContainingDocMove` branch). Runs
 *      ONCE with the real (old, new) pair, never via the placeholder cycle
 *      (that would feed it a synthetic dirname and corrupt the path
 *      arithmetic).
 *   2. Outbound markdown source-move pass — recomputes relative hrefs of
 *      internal markdown-doc links that point to NON-renamed targets. The
 *      asset-recompute analog for images already runs in pass 1; this pass
 *      handles the markdown-link gap that previously left
 *      `[X](./x.md)` pointing at the wrong folder after a folder change.
 *   3. Placeholder cycle for OTHER renames — handles links to docs whose
 *      own paths changed. Two-pass placeholder substitute keeps swap cycles
 *      (`{A→B, B→A}`) correct; direct substitution would collapse them.
 *
 * After pass 1 the markdown's relative paths are anchored to the NEW source
 * dir (because pass 1 emitted them that way), so passes 2 and 3 use the
 * post-rename name as the resolution source.
 *
 * `currentDocName` is the doc whose body we are rewriting (the pre-rename
 * name when the doc itself is being moved). Backlink-source docs pass their
 * own name and never enter pass 1 / pass 2.
 *
 * `rewrites` counts user-visible rewrites — pass 1 + pass 2 + the
 * placeholder cycle's Phase 1 count (Phase 2 unwrap is a mechanical inverse
 * and doesn't double-count).
 */
export function applyRenameMap(
  content: string,
  currentDocName: string,
  renameMap: ReadonlyMap<string, string>,
): ManagedRenameRewriteSummary {
  let markdown = content;
  let rewrites = 0;

  let selfRenamedTo: string | undefined;
  const otherRenames: Array<readonly [string, string]> = [];
  for (const [from, to] of renameMap) {
    if (from === to) continue;
    if (from === currentDocName) {
      selfRenamedTo = to;
    } else {
      otherRenames.push([from, to] as const);
    }
  }

  // Pass 1 — self-rename. Real (old, new) pair so image-ref source-move
  // arithmetic and self-targeting link rewrites both compute correct paths.
  if (selfRenamedTo !== undefined) {
    const selfPass = rewriteSupportedLinksForRename(
      markdown,
      currentDocName,
      currentDocName,
      selfRenamedTo,
    );
    markdown = selfPass.markdown;
    rewrites += selfPass.rewrites;

    // Pass 2 — outbound markdown-link source-move (folder-change only).
    const outboundPass = rewriteOutboundMarkdownLinksForSourceMove(
      markdown,
      currentDocName,
      selfRenamedTo,
    );
    markdown = outboundPass.markdown;
    rewrites += outboundPass.rewrites;
  }

  // Pass 3 — placeholder cycle for OTHER renames. After pass 1, paths in
  // the body that point to non-renamed targets are anchored to the new
  // source dir (because pass 2 re-relativized them); paths to self are
  // anchored to the old source dir but resolve correctly from the new doc
  // name regardless. Use the post-rename name for resolution so the
  // resolver matches the body's anchor.
  const resolutionSourceName = selfRenamedTo ?? currentDocName;

  const placeholderToFinal = new Map<string, string>();
  for (const [from, to] of otherRenames) {
    const placeholder = `__OK_RENAME_${randomUUID().replaceAll('-', '')}__`;
    const phase1 = rewriteSupportedLinksForRename(
      markdown,
      resolutionSourceName,
      from,
      placeholder,
    );
    if (phase1.rewrites > 0) {
      markdown = phase1.markdown;
      rewrites += phase1.rewrites;
      placeholderToFinal.set(placeholder, to);
    }
  }

  for (const [placeholder, to] of placeholderToFinal) {
    const phase2 = rewriteSupportedLinksForRename(markdown, resolutionSourceName, placeholder, to);
    markdown = phase2.markdown;
  }

  return { markdown, rewrites };
}
