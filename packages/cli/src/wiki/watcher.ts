import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
import { contentHash, generateCatalog, generateRootCatalog } from './catalog.ts';
import type { ResolvedWikiConfig } from './config.ts';

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

function isIndexFile(filePath: string): boolean {
  return basename(filePath) === 'INDEX.md';
}

export function rebuildCatalogs(openknowledgeDir: string, config: ResolvedWikiConfig): void {
  const okDir = resolve(openknowledgeDir);

  const sections = [
    {
      dir: config.articlesDir,
      title: 'Knowledge Articles',
      description: 'Architecture, processes, and decisions',
    },
    {
      dir: config.externalSourcesDir,
      title: 'External Sources',
      description: 'Ingested external content',
    },
    {
      dir: config.researchDir,
      title: 'Research',
      description: 'Exploratory research and findings',
    },
  ];

  for (const section of sections) {
    rebuildDirCatalog(section.dir, section.title, section.description);
  }

  // Root INDEX.md
  const rootContent = generateRootCatalog(okDir, {
    sections: [
      {
        label: 'Knowledge Articles',
        relativePath: `${relative(okDir, config.articlesDir)}/INDEX.md`,
      },
      {
        label: 'External Sources',
        relativePath: `${relative(okDir, config.externalSourcesDir)}/INDEX.md`,
      },
      { label: 'Research', relativePath: `${relative(okDir, config.researchDir)}/INDEX.md` },
    ],
  });
  writeIfChanged(join(okDir, 'INDEX.md'), rootContent);
}

function rebuildDirCatalog(dirPath: string, title?: string, description?: string): void {
  if (!existsSync(dirPath)) return;

  const content = generateCatalog(dirPath, { title, description });
  writeIfChanged(join(dirPath, 'INDEX.md'), content);

  // Rebuild subdirectory catalogs
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rebuildDirCatalog(join(dirPath, entry.name));
    }
  }
}

export async function startCatalogWatcher(
  openknowledgeDir: string,
  config: ResolvedWikiConfig,
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
      rebuildCatalogs(okDir, config);
    } catch (err) {
      console.error('[wiki-watcher] Catalog rebuild failed:', err);
    }
  }

  const subscription: AsyncSubscription = await subscribe(okDir, (_err, events) => {
    if (_err) {
      console.error('[wiki-watcher]', _err);
      return;
    }

    const hasRelevantChange = events.some((e) => e.path.endsWith('.md') && !isIndexFile(e.path));

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
