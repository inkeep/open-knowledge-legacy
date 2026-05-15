import { emitTemplatesChanged } from './documents-events.ts';
import { parseApiError } from './parse-api-error.ts';

type FolderFrontmatterPatch = Record<string, unknown>;

interface TemplateFrontmatterFields {
  title?: string;
  description?: string;
  tags?: string[];
}

export type TemplateTarget = 'project' | 'user';

async function readErrorBody(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as unknown;
  return parseApiError(body) ?? `HTTP ${res.status}`;
}

export async function saveFolderConfig(
  path: string,
  frontmatter: FolderFrontmatterPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/folder-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, frontmatter }),
    });
    if (!res.ok) {
      return { ok: false, error: await readErrorBody(res) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveTemplate(input: {
  folder: string;
  name: string;
  frontmatter: TemplateFrontmatterFields;
  body: string;
  target?: TemplateTarget;
}): Promise<{ ok: true; created: boolean; warnings: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      return { ok: false, error: await readErrorBody(res) };
    }
    const payload = (await res.json().catch(() => null)) as {
      created?: boolean;
      warnings?: string[];
    } | null;
    emitTemplatesChanged();
    return {
      ok: true,
      created: payload?.created ?? false,
      warnings: payload?.warnings ?? [],
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteTemplate(
  folder: string,
  name: string,
  target?: TemplateTarget,
): Promise<{ ok: true; existed: boolean } | { ok: false; error: string }> {
  try {
    let qs = `?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`;
    if (target !== undefined) qs += `&target=${encodeURIComponent(target)}`;
    const res = await fetch(`/api/template${qs}`, { method: 'DELETE' });
    if (!res.ok) {
      return { ok: false, error: await readErrorBody(res) };
    }
    const payload = (await res.json().catch(() => null)) as { existed?: boolean } | null;
    emitTemplatesChanged();
    return { ok: true, existed: payload?.existed ?? false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
