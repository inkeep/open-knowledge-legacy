import { resolve } from 'node:path';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';

export function previewCommand(getConfig: () => Config): Command {
  return new Command('preview')
    .description('Show what content the watcher will track (read-only)')
    .action(async () => {
      const { previewContent, formatPreviewBlock } = await import('../content/preview.ts');
      const config = getConfig();
      const cwd = process.cwd();
      const contentDir = resolve(cwd, config.content.dir);

      const result = previewContent({
        projectDir: cwd,
        contentDir,
        include: config.content.include,
        exclude: config.content.exclude,
      });

      process.stdout.write(`${formatPreviewBlock(result, cwd)}\n`);

      if (result.totalCount === 0 && result.warnings.length > 0) {
        process.exitCode = 1;
      }
    });
}
