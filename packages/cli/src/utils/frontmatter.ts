/**
 * YAML frontmatter parsing and serialization for markdown files.
 *
 * Follows the Jekyll frontmatter convention (2008) — the de facto standard
 * used by Hugo, gray-matter, Astro, Next.js, and most static site generators.
 * There is no formal spec (not part of CommonMark or GFM).
 *
 * Convention:
 *   - Opening `---` must be the first line of the file (byte position 0)
 *   - Closing `---` on its own line terminates the block
 *   - Content between delimiters is parsed as YAML 1.2 (via the `yaml` package)
 *   - Empty frontmatter (`---\n---`) is valid (parses to null)
 *
 * All frontmatter parsing should go through these functions — no raw regex
 * matching elsewhere.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { output, ZodSchema } from 'zod';

/** Force TS to fully resolve a type in tooltips instead of showing aliases. */
type Resolve<T> = { [K in keyof T]: T[K] } & {};

// Matches Jekyll-style frontmatter: `---` at file start, YAML content, `---` closing.
// Handles both Unix (\n) and Windows (\r\n) line endings.
// Empty frontmatter (`---\n---`) is matched via the optional content group.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown string into a key-value record.
 * Returns null if no frontmatter block is found or YAML is invalid.
 *
 * Optionally accepts a Zod schema for validation and strong typing:
 *
 * ```ts
 * const ArticleFm = z.object({ title: z.string(), tags: z.array(z.string()) });
 * const fm = parseFrontmatter(content, ArticleFm);
 * // fm is { title: string; tags: string[] } | null
 * ```
 *
 * Without a schema, returns `Record<string, unknown> | null`.
 */
export function parseFrontmatter<S extends ZodSchema = ZodSchema<Record<string, unknown>>>(
  content: string,
  schema?: S,
): Resolve<output<S>> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (schema) {
        const result = schema.safeParse(parsed);
        return result.success ? result.data : null;
      }
      return parsed as Resolve<output<S>>;
    }
  } catch {
    // gracefully handle invalid YAML
  }
  return null;
}

/**
 * Serialize a record into a YAML frontmatter block (with --- delimiters).
 */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  return `---\n${stringifyYaml(data).trim()}\n---`;
}
