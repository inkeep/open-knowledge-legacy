import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

let manager: MarkdownManager | null = null;

export function getSharedMarkdownManager(): MarkdownManager {
  if (!manager) {
    manager = new MarkdownManager({ extensions: sharedExtensions });
  }
  return manager;
}
