import { useTheme } from 'next-themes';
import { clusterColor } from './graph-colors';

const MAX_LEGEND_ENTRIES = 10;

export function GraphLegend({ clusters }: { clusters: string[] }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (clusters.length === 0) return null;

  const visible = clusters.slice(0, MAX_LEGEND_ENTRIES);
  const overflow = clusters.length - visible.length;

  return (
    <div
      className={`absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs backdrop-blur-sm ${
        isDark ? 'bg-black/70 text-gray-200' : 'bg-white/80 text-gray-800 ring-1 ring-black/5'
      }`}
    >
      {visible.map((cluster) => (
        <div key={cluster} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: clusterColor(cluster, isDark) }}
          />
          <span className="truncate max-w-[140px]">{cluster}</span>
        </div>
      ))}
      {overflow > 0 && <div className="text-muted-foreground pl-[18px]">+ {overflow} more</div>}
    </div>
  );
}
