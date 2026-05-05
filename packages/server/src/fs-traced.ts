import type { RmOptions, WriteFileOptions } from 'node:fs';
import {
  linkSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, sep } from 'node:path';
import type { Attributes } from '@opentelemetry/api';
import { withSpan, withSpanSync } from './telemetry.ts';

export function normalizeFsPath(p: string): string {
  const segments = p.split(sep).filter(Boolean);
  if (segments.length <= 2) return p;
  return `...${sep}${segments.slice(-2).join(sep)}`;
}

export function classifyFsPath(p: string): string {
  if (p.includes(`${sep}.git${sep}ok${sep}`) || p.includes('shadow-repo')) {
    return 'shadow-repo';
  }
  if (p.includes(`${sep}.git${sep}`)) return 'git';
  if (basename(p).endsWith('.lock') || basename(p) === 'lock') return 'lock';
  if (basename(p) === 'principal.json') return 'principal';
  if (p.includes(`${sep}.ok${sep}conflict`)) return 'conflict';
  if (p.includes(`${sep}.ok${sep}`)) return 'ok-internal';
  if (p.endsWith('.md') || p.endsWith('.mdx')) return 'content-md';
  return 'other';
}

function buildAttrs(operation: string, path: string, extra?: Attributes): Attributes {
  const attrs: Attributes = {
    'fs.operation': operation,
    'fs.path': normalizeFsPath(path),
    'fs.path.role': classifyFsPath(path),
  };
  if (extra) Object.assign(attrs, extra);
  return attrs;
}

function byteLength(data: string | Uint8Array | ArrayBufferView): number {
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf-8');
  if (data instanceof Uint8Array) return data.byteLength;
  return data.byteLength ?? 0;
}

export async function tracedWriteFile(
  path: string,
  data: string | Uint8Array,
  options?: WriteFileOptions,
): Promise<void> {
  return withSpan(
    'fs.writeFile',
    { attributes: buildAttrs('writeFile', path, { 'fs.bytes': byteLength(data) }) },
    async () => {
      await writeFile(path, data, options);
    },
  );
}

export async function tracedRename(from: string, to: string): Promise<void> {
  return withSpan(
    'fs.rename',
    { attributes: buildAttrs('rename', to, { 'fs.source_path': normalizeFsPath(from) }) },
    async () => {
      await rename(from, to);
    },
  );
}

export async function tracedMkdir(
  path: string,
  options?: Parameters<typeof mkdir>[1],
): Promise<string | undefined> {
  return withSpan('fs.mkdir', { attributes: buildAttrs('mkdir', path) }, async () => {
    return mkdir(path, options);
  });
}

export async function tracedUnlink(path: string): Promise<void> {
  return withSpan('fs.unlink', { attributes: buildAttrs('unlink', path) }, async () => {
    await unlink(path);
  });
}

export function tracedWriteFileSync(
  path: string,
  data: string | Uint8Array,
  options?: Parameters<typeof writeFileSync>[2],
): void {
  withSpanSync(
    'fs.writeFileSync',
    { attributes: buildAttrs('writeFileSync', path, { 'fs.bytes': byteLength(data) }) },
    () => {
      writeFileSync(path, data, options);
    },
  );
}

export function tracedMkdirSync(
  path: string,
  options?: Parameters<typeof mkdirSync>[1],
): string | undefined {
  return withSpanSync('fs.mkdirSync', { attributes: buildAttrs('mkdirSync', path) }, () => {
    return mkdirSync(path, options);
  });
}

export function tracedRenameSync(from: string, to: string): void {
  withSpanSync(
    'fs.renameSync',
    { attributes: buildAttrs('renameSync', to, { 'fs.source_path': normalizeFsPath(from) }) },
    () => {
      renameSync(from, to);
    },
  );
}

export function tracedUnlinkSync(path: string): void {
  withSpanSync('fs.unlinkSync', { attributes: buildAttrs('unlinkSync', path) }, () => {
    unlinkSync(path);
  });
}

export function tracedLinkSync(existingPath: string, newPath: string): void {
  withSpanSync(
    'fs.linkSync',
    {
      attributes: buildAttrs('linkSync', newPath, {
        'fs.source_path': normalizeFsPath(existingPath),
      }),
    },
    () => {
      linkSync(existingPath, newPath);
    },
  );
}

export function tracedRmSync(path: string, options?: RmOptions): void {
  withSpanSync('fs.rmSync', { attributes: buildAttrs('rmSync', path) }, () => {
    rmSync(path, options);
  });
}

export function tracedRmdirSync(path: string): void {
  withSpanSync('fs.rmdirSync', { attributes: buildAttrs('rmdirSync', path) }, () => {
    rmdirSync(path);
  });
}
