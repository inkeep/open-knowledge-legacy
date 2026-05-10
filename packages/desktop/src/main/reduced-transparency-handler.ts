export type VibrancyMaterial = 'sidebar' | 'window';

export interface BrowserWindowVibrancyTarget {
  isDestroyed?: () => boolean;
  setVibrancy: (mat: VibrancyMaterial | null) => void;
}

export interface ReducedTransparencyDeps {
  getAllWindows: () => readonly BrowserWindowVibrancyTarget[];
  defaultVibrancy: VibrancyMaterial;
  warn?: (line: string) => void;
}

export function applyReducedTransparency(
  deps: ReducedTransparencyDeps,
  reducedTransparency: boolean,
): void {
  const material: VibrancyMaterial | null = reducedTransparency ? null : deps.defaultVibrancy;
  let windowCount = 0;
  for (const win of deps.getAllWindows()) {
    if (win.isDestroyed?.() === true) continue;
    try {
      win.setVibrancy(material);
      windowCount += 1;
    } catch (err) {
      deps.warn?.(
        JSON.stringify({
          event: 'reduced-transparency-window-failed',
          vibrancy: material,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  deps.warn?.(
    JSON.stringify({
      event: 'reduced-transparency-applied',
      reducedTransparency,
      vibrancy: material,
      windowCount,
    }),
  );
}
