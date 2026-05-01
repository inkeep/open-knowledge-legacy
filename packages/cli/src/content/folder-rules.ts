
import picomatch from 'picomatch';
import type { FolderFrontmatter, FolderRule } from '../config/schema.ts';

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
