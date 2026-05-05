import { parseFrontmatterYaml } from './yaml-codec.ts';

export const FRONTMATTER_TAG_VALUE_RE = /^[a-zA-Z][\w/-]*$/;

function stripLeadingHash(value: string): string {
  return value.startsWith('#') ? value.slice(1) : value;
}

function coerceCandidates(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function extractFrontmatterTags(yaml: string): string[] {
  if (!yaml || yaml.trim() === '') return [];
  const { map } = parseFrontmatterYaml(yaml);
  if (!map) return [];
  const candidates = coerceCandidates(map.tags);
  const out: string[] = [];
  for (const candidate of candidates) {
    const stripped = stripLeadingHash(candidate);
    if (FRONTMATTER_TAG_VALUE_RE.test(stripped)) {
      out.push(stripped);
    } else {
      console.warn(`[frontmatter-tags] dropping invalid tag entry: ${JSON.stringify(candidate)}`);
    }
  }
  return out;
}
