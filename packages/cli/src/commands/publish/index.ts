import { Command } from 'commander';
import type { Config } from '../../config/schema.ts';
import { publishBuildCommand } from './build.ts';

export function publishCommand(getConfig: () => Config): Command {
  return new Command('publish')
    .description('Build and publish a static site from the current knowledge base')
    .addCommand(publishBuildCommand(getConfig));
}
