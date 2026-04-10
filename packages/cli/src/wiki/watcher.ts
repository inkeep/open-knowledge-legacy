import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
import { CATALOG_FILENAME } from '../constants.ts';
import { contentHash, generateCatalog, generateRootCatalog, readIndexMeta } from './catalog.ts';
import type { WikiPaths } from './paths.ts';

const DEBOUNCE_QUIET_MS = 500;
const DEBOUNCE_MAX_MS = 2000;

function writeIfChanged(filePath: string, content: string): boolean {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8');
    if (contentHash(existing) === contentHash(content)) {
      return false;
    }
  }
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function rebuildCatalogs(openknowledgeDir: string, paths: WikiPaths): void {
  const okDir = resolve(openknowledgeDir);

  for (const root of paths.roots) {
    rebuildDirCatalog(root.dir, root.label);
  }

  // Root INDEX.md
  const rootContent = generateRootCatalog(okDir, {
    sections: paths.roots.map((root) => ({
      label: root.label,
      relativePath: `${relative(okDir, root.dir)}/INDEX.md`,
    })),
  });
  writeIfChanged(join(okDir, CATALOG_FILENAME), rootContent);
}

function rebuildDirCatalog(dirPath: string, title?: string, description?: string): void {
  if (!existsSync(dirPath)) return;

  // Sticky metadata: for nested subfolders (where the caller didn't pass an
  // explicit title/description), preserve whatever the existing INDEX.md
  // already has in its frontmatter. This lets authors set folder-level
  // metadata once, which then surfaces in the parent catalog's Subfolders list.
  let effectiveTitle = title;
  let effectiveDescription = description;
  if (title === undefined || description === undefined) {
    const existing = readIndexMeta(dirPath);
    if (existing) {
      if (effectiveTitle === undefined) effectiveTitle = existing.title;
      if (effectiveDescription === undefined) effectiveDescription = existing.description;
    }
  }

  const content = generateCatalog(dirPath, {
    title: effectiveTitle,
    description: effectiveDescription,
  });
  writeIfChanged(join(dirPath, CATALOG_FILENAME), content);

  // Rebuild subdirectory catalogs — no explicit title/description, so each
  // nested call does its own sticky read from the existing INDEX.md.
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rebuildDirCatalog(join(dirPath, entry.name));
    }
  }
}

export async function startCatalogWatcher(
  openknowledgeDir: string,
  paths: WikiPaths,
): Promise<{ stop: () => Promise<void> }> {
  const okDir = resolve(openknowledgeDir);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRebuild = false;

  function scheduleRebuild(): void {
    pendingRebuild = true;

    // Reset quiet timer
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(executeRebuild, DEBOUNCE_QUIET_MS);

    // Start max-wait timer if not already running
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(executeRebuild, DEBOUNCE_MAX_MS);
    }
  }

  function executeRebuild(): void {
    if (!pendingRebuild) return;
    pendingRebuild = false;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }

    try {
      rebuildCatalogs(okDir, paths);
    } catch (err) {
      console.error('[wiki-watcher] Catalog rebuild failed:', err);
    }
  }

  const subscription: AsyncSubscription = await subscribe(okDir, (_err, events) => {
    if (_err) {
      console.error('[wiki-watcher]', _err);
      return;
    }

    // Any .md change — including INDEX.md — schedules a rebuild.
    // Editing a sticky title/description in an INDEX.md must propagate to the
    // parent catalog, so we can't filter INDEX.md out here. Infinite loops
    // are prevented by writeIfChanged's content-hash dedup: after the first
    // rebuild, a second idle pass finds no content changes and writes nothing.
    const hasRelevantChange = events.some((e) => e.path.endsWith('.md'));

    if (hasRelevantChange) {
      scheduleRebuild();
    }
  });

  return {
    stop: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      await subscription.unsubscribe();
    },
  };
}
