export type FrontmatterRecord = Record<string, unknown>;

export function mergeCascade(
  base: FrontmatterRecord,
  overlay: FrontmatterRecord,
): FrontmatterRecord {
  const result: FrontmatterRecord = { ...base };
  const arraySeen = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const merged = Array.isArray(result[key]) ? [...(result[key] as unknown[])] : [];
      const seen = arraySeen.get(key) ?? new Set(merged.map(toDedupKey));
      arraySeen.set(key, seen);
      for (const entry of value as unknown[]) {
        const dedupKey = toDedupKey(entry);
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          merged.push(entry);
        }
      }
      result[key] = merged;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergePatch(
  existing: FrontmatterRecord,
  patch: FrontmatterRecord,
): FrontmatterRecord {
  const result: FrontmatterRecord = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isEmpty(value)) {
      delete result[key];
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function dropEmpties(input: FrontmatterRecord): FrontmatterRecord {
  const result: FrontmatterRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string' && value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function toDedupKey(value: unknown): string {
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'boolean') return `b:${value}`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return `j:${JSON.stringify(value)}`;
}
