import type { OutlineNavDetail } from '@/components/OutlinePanel';
import type { RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';

export type PendingSourceNavigation =
  | { kind: 'outline'; detail: OutlineNavDetail }
  | { kind: 'raw-mdx'; detail: RawMdxNavDetail };

const pendingNavigations = new Map<string, PendingSourceNavigation>();

export function rememberPendingSourceNavigation(
  docName: string,
  navigation: PendingSourceNavigation,
): void {
  pendingNavigations.set(docName, navigation);
}

export function peekPendingSourceNavigation(docName: string): PendingSourceNavigation | null {
  return pendingNavigations.get(docName) ?? null;
}

export function consumePendingSourceNavigation(docName: string): PendingSourceNavigation | null {
  const navigation = pendingNavigations.get(docName) ?? null;
  pendingNavigations.delete(docName);
  return navigation;
}

export function clearPendingSourceNavigation(docName: string): void {
  pendingNavigations.delete(docName);
}

export function clearPendingSourceNavigationsForTest(): void {
  pendingNavigations.clear();
}
