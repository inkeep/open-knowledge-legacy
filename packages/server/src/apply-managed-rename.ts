import { randomUUID } from 'node:crypto';
import { prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import {
  rewriteMarkdownLinksForDocumentRename,
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
 */
export class ManagedRenameCollisionError extends Error {
  readonly colliding: Array<{ a: string; b: string; to: string }>;

  constructor(colliding: Array<{ a: string; b: string; to: string }>) {
    super(
      `Managed rename collision: ${colliding
        .map((c) => `'${c.a}' and '${c.b}' both target '${c.to}'`)
        .join('; ')}`,
    );
    this.name = 'ManagedRenameCollisionError';
    this.colliding = colliding;
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
  const collisions: Array<{ a: string; b: string; to: string }> = [];
  for (const { from, to } of affectedDocs) {
    for (const [otherFrom, otherTo] of map) {
      if (otherFrom !== from && otherTo === to) {
        collisions.push({ a: otherFrom, b: from, to });
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
 * Two-pass placeholder-substitute trick — handles swap cycles
 * (`{A→B, B→A}`) correctly. Phase 1 substitutes each `from` with a fresh
 * UUID-based placeholder; Phase 2 swaps each placeholder for its real `to`.
 * Direct substitution would over-collapse swap cycles ({A→B, B→A} would
 * leave content unchanged after both passes apply naively).
 *
 * `currentDocName` is the doc whose body we are rewriting (used by the
 * markdown-link primitive for relative-path resolution against the doc's
 * own location). Backlink-source docs pass their own name; renamed docs
 * pass their pre-rename name (matches today's behavior in
 * `_performManagedRename`).
 *
 * `rewrites` counts user-visible rewrites (Phase 1 count) — Phase 2's
 * unwrapping is a mechanical inverse and does not double-count.
 */
export function applyRenameMap(
  content: string,
  currentDocName: string,
  renameMap: ReadonlyMap<string, string>,
): ManagedRenameRewriteSummary {
  let markdown = content;
  let rewrites = 0;
  const placeholderToFinal = new Map<string, string>();

  for (const [from, to] of renameMap) {
    if (from === to) continue;
    const placeholder = `__OK_RENAME_${randomUUID().replaceAll('-', '')}__`;
    const phase1 = rewriteSupportedLinksForRename(markdown, currentDocName, from, placeholder);
    if (phase1.rewrites > 0) {
      markdown = phase1.markdown;
      rewrites += phase1.rewrites;
      placeholderToFinal.set(placeholder, to);
    }
  }

  for (const [placeholder, to] of placeholderToFinal) {
    const phase2 = rewriteSupportedLinksForRename(markdown, currentDocName, placeholder, to);
    markdown = phase2.markdown;
  }

  return { markdown, rewrites };
}
