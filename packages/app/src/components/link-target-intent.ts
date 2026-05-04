import { docNameToDialogSeed } from '@/lib/doc-paths';
import { type ResolvedNavigationTarget, resolveNavigationTarget } from './navigation-targets';

type NavigableTarget = Extract<
  ResolvedNavigationTarget,
  { kind: 'doc' | 'folder-index' | 'folder' }
>;
type MissingTarget = Extract<ResolvedNavigationTarget, { kind: 'missing' }>;

type LinkTargetIntent =
  | {
      kind: 'navigate';
      displayState: 'resolved' | 'folder';
      resolvedTarget: NavigableTarget;
      hashDocName: string;
    }
  | {
      kind: 'create';
      displayState: 'missing';
      resolvedTarget: MissingTarget;
      initialDir: string;
      suggestedName: string;
    };

export function resolveLinkTargetIntent(
  target: string,
  options: {
    pages: ReadonlySet<string>;
    folderPaths?: ReadonlySet<string>;
    pagesBySlug?: ReadonlyMap<string, string>;
    fallbackTargets?: Iterable<string>;
    createDialogSeed?: {
      initialDir: string;
      suggestedName: string;
    };
  },
): LinkTargetIntent {
  const candidates = [target, ...(options.fallbackTargets ?? [])];
  const seen = new Set<string>();
  let missingTarget: MissingTarget | null = null;

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const resolvedTarget = resolveNavigationTarget(candidate, {
      pages: options.pages,
      folderPaths: options.folderPaths,
      pagesBySlug: options.pagesBySlug,
    });
    if (resolvedTarget.kind === 'asset') continue;
    if (resolvedTarget.kind === 'missing') {
      missingTarget ??= resolvedTarget;
      continue;
    }
    return {
      kind: 'navigate',
      displayState: resolvedTarget.kind === 'folder' ? 'folder' : 'resolved',
      resolvedTarget,
      hashDocName: resolvedTarget.target,
    };
  }

  const resolvedFallback =
    missingTarget ??
    resolveNavigationTarget(target, {
      pages: options.pages,
      folderPaths: options.folderPaths,
      pagesBySlug: options.pagesBySlug,
    });
  if (resolvedFallback.kind !== 'missing' && resolvedFallback.kind !== 'asset') {
    return {
      kind: 'navigate',
      displayState: resolvedFallback.kind === 'folder' ? 'folder' : 'resolved',
      resolvedTarget: resolvedFallback,
      hashDocName: resolvedFallback.target,
    };
  }
  const finalMissingTarget: MissingTarget =
    resolvedFallback.kind === 'asset' ? { kind: 'missing', target } : resolvedFallback;

  const seed = options.createDialogSeed ?? docNameToDialogSeed(finalMissingTarget.target);
  return {
    kind: 'create',
    displayState: 'missing',
    resolvedTarget: finalMissingTarget,
    initialDir: seed.initialDir,
    suggestedName: seed.suggestedName,
  };
}

export function folderIndexCreateSeed(intent: LinkTargetIntent): {
  initialDir: string;
  suggestedName: string;
} | null {
  if (intent.kind !== 'navigate' || intent.displayState !== 'folder') {
    return null;
  }

  const resolvedTarget = intent.resolvedTarget;
  if (!('folderPath' in resolvedTarget)) {
    return null;
  }

  return {
    initialDir: resolvedTarget.folderPath,
    suggestedName: 'index.md',
  };
}
