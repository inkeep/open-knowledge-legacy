// Type augmentation for diff v7 — the package exports diffArrays at runtime
// but its bundled .mjs lacks TypeScript declarations for this function.
declare module 'diff' {
  interface ArrayChange<T> {
    value: T[];
    added?: boolean;
    removed?: boolean;
    count?: number;
  }
  export function diffArrays<T>(
    oldArr: T[],
    newArr: T[],
    options?: { comparator?: (left: T, right: T) => boolean },
  ): ArrayChange<T>[];
}
