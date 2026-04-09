declare module 'diff' {
  interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  interface ArrayChange<T> {
    value: T[];
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export function diffLines(oldStr: string, newStr: string): Change[];
  export function diffArrays<T>(oldArr: T[], newArr: T[]): ArrayChange<T>[];
}
