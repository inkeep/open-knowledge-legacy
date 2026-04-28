import { relative, resolve } from 'node:path';
import { Command } from 'commander';
import { resolveContentDir } from '../../config/paths.ts';
import { loadPublishConfig } from '../../config/publish.ts';
import type { Config } from '../../config/schema.ts';
import { buildStaticSite, type PublishBuildResult } from '../../publish/builder.ts';
import { accent, dim, error as errorColor, success, warning } from '../../ui/colors.ts';

interface PublishBuildCommandOptions {
  cwd?: string;
  outputDir?: string;
  siteTitle?: string;
  basePath?: string;
  clean?: boolean;
  json?: boolean;
}

interface PublishBuildCommandResult {
  status: 'built' | 'failed';
  exitCode: number;
  message: string;
  result?: PublishBuildResult;
}

function formatBuildResult(result: PublishBuildResult, cwd: string): string {
  const lines = [
    `${success('✓ Built static site')} ${dim(`(${result.pages.length} pages, ${result.assets.length} assets)`)}`,
    `${accent('Output:')} ${relative(cwd, result.outputDir) || '.'}`,
  ];
  if (result.warnings.length > 0) {
    lines.push('', warning(`Warnings (${result.warnings.length}):`));
    for (const item of result.warnings) {
      lines.push(`  ${warning('!')} ${item.message}`);
    }
  }
  return lines.join('\n');
}

export async function runPublishBuild(
  config: Config,
  opts: PublishBuildCommandOptions = {},
): Promise<PublishBuildCommandResult> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  try {
    const loaded = loadPublishConfig(cwd);
    const manifest = {
      ...loaded.config,
      ...(opts.outputDir ? { outputDir: opts.outputDir } : {}),
      ...(opts.siteTitle ? { siteTitle: opts.siteTitle } : {}),
      ...(opts.basePath !== undefined ? { basePath: opts.basePath } : {}),
    };
    const result = await buildStaticSite({
      projectDir: cwd,
      contentDir: resolveContentDir(config, cwd),
      include: config.content.include,
      contentExclude: config.content.exclude,
      manifest,
      clean: opts.clean,
    });
    return {
      status: 'built',
      exitCode: 0,
      message: opts.json ? JSON.stringify(result, null, 2) : formatBuildResult(result, cwd),
      result,
    };
  } catch (err) {
    return {
      status: 'failed',
      exitCode: 1,
      message: `${errorColor('Error:')} ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function publishBuildCommand(getConfig: () => Config): Command {
  return new Command('build')
    .description('Build a static site into the configured publish output directory')
    .option('-o, --output-dir <path>', 'Override publish output directory')
    .option('--site-title <title>', 'Override published site title')
    .option('--base-path <path>', 'Override hosted base path, for example /docs')
    .option('--no-clean', 'Do not clear the output directory before writing')
    .option('--json', 'Print the structured build result as JSON')
    .action(
      async (opts: {
        outputDir?: string;
        siteTitle?: string;
        basePath?: string;
        clean?: boolean;
        json?: boolean;
      }) => {
        const result = await runPublishBuild(getConfig(), opts);
        process.stdout.write(`${result.message}\n`);
        process.exitCode = result.exitCode;
      },
    );
}
