export type EntryPoint = 'start-fresh' | 'pick-existing' | 'recents' | 'deep-link' | 'drag-drop';

const ENTRY_POINT_VALUES: ReadonlySet<EntryPoint> = new Set([
  'start-fresh',
  'pick-existing',
  'recents',
  'deep-link',
  'drag-drop',
]);

export function isEntryPoint(value: unknown): value is EntryPoint {
  return typeof value === 'string' && ENTRY_POINT_VALUES.has(value as EntryPoint);
}
