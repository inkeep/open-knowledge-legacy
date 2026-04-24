import { type ResolvedNavigationTarget, resolveNavigationTarget } from './navigation-targets';

type TargetDisplayState = 'doc' | 'folder' | 'missing';

interface TargetNavigationIntent {
  resolvedTarget: ResolvedNavigationTarget;
  hashDocName: string;
  displayState: TargetDisplayState;
}

function getTargetDisplayState(resolvedTarget: ResolvedNavigationTarget): TargetDisplayState {
  switch (resolvedTarget.kind) {
    case 'doc':
      return 'doc';
    case 'folder':
    case 'folder-index':
      return 'folder';
    case 'missing':
      return 'missing';
  }
}

export function resolveTargetNavigationIntent(
  target: string,
  options: {
    pages: ReadonlySet<string>;
    folderPaths?: ReadonlySet<string>;
  },
): TargetNavigationIntent {
  const resolvedTarget = resolveNavigationTarget(target, options);

  return {
    resolvedTarget,
    hashDocName: resolvedTarget.target,
    displayState: getTargetDisplayState(resolvedTarget),
  };
}
