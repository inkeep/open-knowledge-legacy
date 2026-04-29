/**
 * Pure resolver for folder-level frontmatter defaults (D5 / FR5).
 *
 * Given an array of `FolderRule`s and a path, compute the effective
 * `{ title?, description?, tags? }` view by applying:
 *   - scalars (title, description): last matching rule wins (positional,
 *     declaration order — later rules in the `folders:` array override)
 *   - tags: concat across ALL matching rules in declaration order, then
 *     dedup preserving first-occurrence order
 *
 * Matching uses picomatch with `{ dot: true }` — same options as
 * `content.include`. Compiled matchers are memoized via a module-level
 * WeakMap keyed on the rules array so repeated calls with the same
 * (stable) array avoid recompilation.
 *
 * Pure: no I/O, does not mutate the input rules array.
 */

import type { FolderFrontmatter, FolderRule } from '@inkeep/open-knowledge-server';
import picomatch from 'picomatch';

type Matcher = (path: string) => boolean;

const matcherCache = new WeakMap<FolderRule[], Matcher[]>();

function getMatchers(rules: FolderRule[]): Matcher[] {
  const cached = matcherCache.get(rules);
  if (cached) return cached;
  const matchers = rules.map((rule) => picomatch(rule.match, { dot: true }));
  matcherCache.set(rules, matchers);
  return matchers;
}

export function resolveFolderFrontmatter(rules: FolderRule[], relPath: string): FolderFrontmatter {
  if (rules.length === 0) return {};
  const matchers = getMatchers(rules);

  const result: FolderFrontmatter = {};
  const tags: string[] = [];
  let anyMatch = false;

  for (let i = 0; i < rules.length; i++) {
    if (!matchers[i](relPath)) continue;
    anyMatch = true;
    const fm = rules[i].frontmatter;
    if (fm.title !== undefined) result.title = fm.title;
    if (fm.description !== undefined) result.description = fm.description;
    if (fm.tags !== undefined) {
      for (const tag of fm.tags) {
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  if (!anyMatch) return {};
  if (tags.length > 0) result.tags = tags;
  return result;
}
