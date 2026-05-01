import { Document, type Pair, parseDocument, type ToStringOptions } from 'yaml';
import { type FrontmatterMap, FrontmatterMapSchema, FrontmatterValueSchema } from './schema.ts';

export const STRINGIFY_OPTIONS: ToStringOptions = {
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  lineWidth: 0,
};

export type ParsedFrontmatter = {
  doc: Document;
  map: FrontmatterMap | null;
  parseError?: string;
};

export function parseFrontmatterYaml(yaml: string): ParsedFrontmatter {
  if (yaml.trim() === '') {
    return { doc: new Document({}), map: {} };
  }
  let doc: Document;
  try {
    doc = parseDocument(yaml);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc: new Document({}), map: null, parseError: `parse threw: ${msg}` };
  }
  if (doc.errors.length > 0) {
    return { doc, map: null, parseError: doc.errors[0]?.message ?? 'yaml parse errors' };
  }
  let json: unknown;
  try {
    json = doc.toJS();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc, map: null, parseError: `toJS threw: ${msg}` };
  }
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { doc, map: null, parseError: 'top-level value is not a mapping' };
  }
  const result = FrontmatterMapSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && Array.isArray(issue.path) ? issue.path.join('.') : '';
    const reason = issue?.message ?? 'unknown';
    return {
      doc,
      map: null,
      parseError: path
        ? `value at "${path}" failed schema: ${reason}`
        : `schema validation failed: ${reason}`,
    };
  }
  return { doc, map: result.data };
}

export function serializeFrontmatterMap(map: FrontmatterMap): string {
  if (Object.keys(map).length === 0) return '';
  const doc = new Document(map);
  return doc.toString(STRINGIFY_OPTIONS);
}

export function applyPatchToDocument(doc: Document, patch: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      doc.delete(key);
      continue;
    }
    const result = FrontmatterValueSchema.safeParse(value);
    if (!result.success) {
      throw new Error(`Invalid frontmatter value for "${key}": ${result.error.message}`);
    }
    doc.set(key, result.data);
  }
  return doc.toString(STRINGIFY_OPTIONS);
}

export function withFences(yamlBody: string): string {
  if (yamlBody === '') return '';
  const trimmed = yamlBody.endsWith('\n') ? yamlBody.slice(0, -1) : yamlBody;
  return `---\n${trimmed}\n---\n`;
}

export function getDocumentKeys(doc: Document): string[] {
  const contents = doc.contents;
  if (contents == null || typeof contents !== 'object' || !('items' in contents)) {
    return [];
  }
  const items = (contents as { items: Pair[] }).items;
  return items
    .map((pair) => {
      const key = pair.key as { value?: unknown } | string | undefined;
      if (typeof key === 'string') return key;
      if (key && typeof key === 'object' && 'value' in key && typeof key.value === 'string') {
        return key.value;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
