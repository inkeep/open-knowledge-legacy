import type { FileTreeDirectoryHandle, FileTree as PierreFileTreeModel } from '@pierre/trees';
import { type RefObject, useEffect } from 'react';

export function asDirectoryHandle(
  item: ReturnType<PierreFileTreeModel['getItem']>,
): FileTreeDirectoryHandle | null {
  if (!item?.isDirectory()) return null;
  return item as FileTreeDirectoryHandle;
}

function selectOnlyTreeItem(
  model: PierreFileTreeModel,
  item: NonNullable<ReturnType<PierreFileTreeModel['getItem']>>,
): void {
  const targetPath = item.getPath();
  for (const selectedPath of model.getSelectedPaths()) {
    if (selectedPath === targetPath) continue;
    model.getItem(selectedPath)?.deselect();
  }
  if (!item.isSelected()) {
    item.select();
  }
}

export function useSelectionMirror(
  model: PierreFileTreeModel,
  activeTreePath: string | null,
  activeAncestorTreePathsSignature: string,
  suppressSelectionRef: RefObject<boolean>,
): void {
  useEffect(() => {
    const releaseSelectionSuppression = () => {
      queueMicrotask(() => {
        suppressSelectionRef.current = false;
      });
    };
    suppressSelectionRef.current = true;
    if (!activeTreePath) {
      for (const selectedPath of model.getSelectedPaths()) {
        model.getItem(selectedPath)?.deselect();
      }
      releaseSelectionSuppression();
      return;
    }
    const ancestorPaths = activeAncestorTreePathsSignature
      ? activeAncestorTreePathsSignature.split('\0')
      : [];
    for (const ancestor of ancestorPaths) {
      const item = asDirectoryHandle(model.getItem(ancestor));
      if (item && !item.isExpanded()) {
        item.expand();
      }
    }
    const item = model.getItem(activeTreePath);
    if (!item) {
      releaseSelectionSuppression();
      return;
    }
    selectOnlyTreeItem(model, item);
    item.focus();
    releaseSelectionSuppression();
  }, [activeAncestorTreePathsSignature, activeTreePath, model, suppressSelectionRef]);
}
