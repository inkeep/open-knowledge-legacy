import { unlinkSync } from 'node:fs';
import { rename as nodeRename, writeFile as nodeWriteFile } from 'node:fs/promises';

export interface AtomicWriteFsAdapter {
  writeFile(
    path: string,
    content: string,
    opts: { encoding: 'utf-8'; mode?: number },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

const DEFAULT_FS: AtomicWriteFsAdapter = {
  writeFile: (path, content, opts) => nodeWriteFile(path, content, opts),
  rename: (from, to) => nodeRename(from, to),
};

export interface AtomicWriteOptions {
  mode?: number;
  fs?: AtomicWriteFsAdapter;
}

export async function atomicWriteFile(
  absPath: string,
  content: string,
  opts: AtomicWriteOptions = {},
): Promise<void> {
  const fs = opts.fs ?? DEFAULT_FS;
  const tmpPath = `${absPath}.tmp.${crypto.randomUUID()}`;
  try {
    await fs.writeFile(tmpPath, content, { encoding: 'utf-8', mode: opts.mode ?? 0o644 });
    await fs.rename(tmpPath, absPath);
  } catch (e) {
    try {
      unlinkSync(tmpPath);
    } catch {}
    throw e;
  }
}
