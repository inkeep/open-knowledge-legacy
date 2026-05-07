import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  addConfigSpanEvent,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_PROJECT_LOCAL,
  CONFIG_DOC_NAME_USER,
  type ConfigIssue,
  ConfigSchema,
  type ConfigValidationError,
  isKnownConfigError,
  type WriteScope,
  withConfigSpan,
  withConfigSpanSync,
} from '@inkeep/open-knowledge-core';
import { resolveConfigPath } from '@inkeep/open-knowledge-core/server';
import { parseDocument, stringify } from 'yaml';
import type * as Y from 'yjs';
import {
  CONFIG_FILE_WATCHER_ORIGIN,
  CONFIG_VALIDATION_REVERT_ORIGIN,
} from './config-edit-origin.ts';
import { tracedMkdir, tracedRename, tracedUnlinkSync, tracedWriteFile } from './fs-traced.ts';
import { getLogger } from './logger.ts';

function configScopeAttr(documentName: string): WriteScope | undefined {
  if (documentName === CONFIG_DOC_NAME_PROJECT) return 'project';
  if (documentName === CONFIG_DOC_NAME_PROJECT_LOCAL) return 'project-local';
  if (documentName === CONFIG_DOC_NAME_USER) return 'user';
  return undefined;
}

function emitSchemaInvalidIssueEvents(error: ConfigValidationError): void {
  if (!isKnownConfigError(error)) return;
  if (error.code !== 'SCHEMA_INVALID') return;
  for (const issue of error.issues as ConfigIssue[]) {
    addConfigSpanEvent('config.validation.issue', {
      'issue.path': issue.path.map((p) => String(p)).join('.'),
      'issue.message': issue.message,
    });
  }
}

export interface ConfigPersistenceCtx {
  projectDir: string;
  lkgCache: Map<string, string>;
  homedirOverride?: string;
  onConfigRejected?: (docName: string, error: ConfigValidationError) => void;
}

export function configDocAbsPath(documentName: string, ctx: ConfigPersistenceCtx): string {
  if (documentName === CONFIG_DOC_NAME_PROJECT) {
    return resolveConfigPath('project', ctx.projectDir, ctx.homedirOverride);
  }
  if (documentName === CONFIG_DOC_NAME_PROJECT_LOCAL) {
    return resolveConfigPath('project-local', ctx.projectDir, ctx.homedirOverride);
  }
  if (documentName === CONFIG_DOC_NAME_USER) {
    return resolveConfigPath('user', ctx.projectDir, ctx.homedirOverride);
  }
  throw new Error(`configDocAbsPath: not a config doc name: ${documentName}`);
}

let cachedDefaultsYaml: string | null = null;
function serializedDefaults(): string {
  if (cachedDefaultsYaml === null) {
    cachedDefaultsYaml = stringify(ConfigSchema.parse({}));
  }
  return cachedDefaultsYaml;
}

interface ValidConfig {
  readonly ok: true;
}
interface InvalidConfig {
  readonly ok: false;
  readonly error: ConfigValidationError;
}

function validateConfigYaml(content: string): ValidConfig | InvalidConfig {
  const parsed = parseDocument(content);
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      error: {
        code: 'YAML_PARSE',
        detail: parsed.errors.map((e) => e.message).join('; '),
      },
    };
  }
  const merged = parsed.toJSON() ?? {};
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        issues: result.error.issues.map((iss) => ({
          path: iss.path.map((seg) =>
            typeof seg === 'symbol' ? String(seg) : (seg as string | number),
          ),
          message: iss.message,
          issueCode: iss.code,
        })),
      },
    };
  }
  return { ok: true };
}

export function loadConfigDoc(
  document: Y.Doc,
  documentName: string,
  ctx: ConfigPersistenceCtx,
): void {
  const ytext = document.getText('source');
  if (ytext.length > 0) return;

  const filePath = configDocAbsPath(documentName, ctx);
  let raw = '';
  if (existsSync(filePath)) {
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn(`[config] Could not read ${filePath}: ${detail}. Seeding with empty content.`);
      raw = '';
    }
  }

  const validation = validateConfigYaml(raw);
  if (!validation.ok && raw.length > 0) {
    getLogger('config-persistence').warn(
      { docName: documentName, path: filePath },
      `[config-persistence] loadConfigDoc seeding invalid YAML for ${documentName} into Y.Text — first mutation will revert to LKG`,
    );
  }

  document.transact(() => {
    if (raw.length > 0) ytext.insert(0, raw);
  }, CONFIG_VALIDATION_REVERT_ORIGIN);

  if (validation.ok && raw.length > 0) {
    ctx.lkgCache.set(documentName, raw);
  } else {
    ctx.lkgCache.set(documentName, serializedDefaults());
  }
}

async function atomicWriteConfig(absPath: string, content: string): Promise<void> {
  await tracedMkdir(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp.${crypto.randomUUID()}`;
  try {
    await tracedWriteFile(tmpPath, content, 'utf-8');
    await tracedRename(tmpPath, absPath);
  } catch (e) {
    try {
      tracedUnlinkSync(tmpPath);
    } catch {}
    throw e;
  }
}

type StoreConfigDocOutcome = 'persisted' | 'reverted' | 'write-failed' | 'no-op';

export async function storeConfigDoc(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: unknown,
  ctx: ConfigPersistenceCtx,
): Promise<StoreConfigDocOutcome> {
  return withConfigSpan(
    'config.persist',
    { 'config.scope': configScopeAttr(documentName), 'config.transport': 'fs' },
    async (span) => {
      const outcome = await storeConfigDocInner(document, documentName, lastTransactionOrigin, ctx);
      span.setAttribute('config.outcome', persistOutcomeAttr(outcome));
      return outcome;
    },
  );
}

function persistOutcomeAttr(outcome: StoreConfigDocOutcome): 'success' | 'reverted' | 'rejected' {
  if (outcome === 'reverted') return 'reverted';
  if (outcome === 'write-failed') return 'rejected';
  return 'success';
}

async function storeConfigDocInner(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: unknown,
  ctx: ConfigPersistenceCtx,
): Promise<StoreConfigDocOutcome> {
  if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return 'no-op';

  const ytext = document.getText('source');
  const content = ytext.toString();

  if (content.length === 0) return 'no-op';

  const lkg = ctx.lkgCache.get(documentName);
  if (lkg !== undefined && content === lkg) return 'no-op';

  const scope = configScopeAttr(documentName);
  const validation = withConfigSpanSync(
    'config.validate',
    { 'config.scope': scope, 'config.validation.layer': 'L3' },
    (validateSpan) => {
      const r = validateConfigYaml(content);
      validateSpan.setAttribute('config.outcome', r.ok ? 'success' : 'rejected');
      if (!r.ok) emitSchemaInvalidIssueEvents(r.error);
      return r;
    },
  );
  if (!validation.ok) {
    await withConfigSpan(
      'config.revert',
      { 'config.scope': scope, 'config.outcome': 'reverted' },
      async () => {
        const fallbackLkg = lkg ?? serializedDefaults();
        document.transact(() => {
          if (ytext.length > 0) ytext.delete(0, ytext.length);
          ytext.insert(0, fallbackLkg);
        }, CONFIG_VALIDATION_REVERT_ORIGIN);
        if (lkg === undefined) {
          ctx.lkgCache.set(documentName, fallbackLkg);
        }
        ctx.onConfigRejected?.(documentName, validation.error);
      },
    );
    return 'reverted';
  }

  const filePath = configDocAbsPath(documentName, ctx);
  try {
    await atomicWriteConfig(filePath, content);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    getLogger('config-persistence').warn(
      { docName: documentName, path: filePath, err: e },
      `[config-persistence] write-failed at ${filePath}: ${detail}`,
    );
    ctx.onConfigRejected?.(documentName, {
      code: 'WRITE_ERROR',
      detail: `Failed to persist config at ${filePath}: ${detail}`,
    });
    return 'write-failed';
  }
  ctx.lkgCache.set(documentName, content);
  return 'persisted';
}

type ApplyExternalConfigChangeOutcome = 'applied' | 'rejected' | 'no-op';

export function applyExternalConfigChange(
  document: Y.Doc | null,
  documentName: string,
  content: string,
  ctx: ConfigPersistenceCtx,
): ApplyExternalConfigChangeOutcome {
  if (!document) return 'no-op';

  const lkg = ctx.lkgCache.get(documentName);
  if (lkg !== undefined && lkg === content) return 'no-op';

  const scope = configScopeAttr(documentName);
  const validation = withConfigSpanSync(
    'config.validate',
    { 'config.scope': scope, 'config.validation.layer': 'L3' },
    (validateSpan) => {
      const r = validateConfigYaml(content);
      validateSpan.setAttribute('config.outcome', r.ok ? 'success' : 'rejected');
      if (!r.ok) emitSchemaInvalidIssueEvents(r.error);
      return r;
    },
  );
  if (!validation.ok) {
    ctx.onConfigRejected?.(documentName, validation.error);
    return 'rejected';
  }

  const ytext = document.getText('source');
  document.transact(() => {
    if (ytext.length > 0) ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  }, CONFIG_FILE_WATCHER_ORIGIN);

  ctx.lkgCache.set(documentName, content);
  return 'applied';
}
