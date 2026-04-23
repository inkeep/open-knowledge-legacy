import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { clusterColor } from './graph-colors';

type GraphLegendVariant = 'fullscreen' | 'docked';

interface GraphLegendLayout {
  maxEntries: number;
  containerClassName: string;
  titleClassName: string;
  rowClassName: string;
  swatchClassName: string;
  labelClassName: string;
  overflowClassName: string;
}

const GRAPH_LEGEND_LAYOUTS: Record<GraphLegendVariant, GraphLegendLayout> = {
  fullscreen: {
    maxEntries: 10,
    containerClassName: 'bottom-3 left-3 gap-1 rounded-lg px-3 py-2 text-xs',
    titleClassName: 'mb-1.5',
    rowClassName: 'gap-2',
    swatchClassName: 'size-2.5',
    labelClassName: 'max-w-[140px]',
    overflowClassName: 'pl-[18px]',
  },
  docked: {
    maxEntries: 6,
    containerClassName: 'bottom-2 left-2 gap-0.5 rounded-md px-2 py-1.5 text-[11px]',
    titleClassName: 'mb-1',
    rowClassName: 'gap-1.5',
    swatchClassName: 'size-2',
    labelClassName: 'max-w-[112px]',
    overflowClassName: 'pl-[14px]',
  },
};

function getGraphLegendLayout(variant: GraphLegendVariant): GraphLegendLayout {
  return GRAPH_LEGEND_LAYOUTS[variant];
}

export function GraphLegend({
  clusters,
  variant = 'fullscreen',
}: {
  clusters: string[];
  variant?: GraphLegendVariant;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const layout = getGraphLegendLayout(variant);

  if (clusters.length === 0) return null;

  const visible = clusters.slice(0, layout.maxEntries);
  const overflow = clusters.length - visible.length;

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 flex flex-col backdrop-blur-sm',
        layout.containerClassName,
        isDark ? 'bg-black/70 text-gray-200' : 'bg-white/80 text-gray-800 ring-1 ring-black/5',
      )}
    >
      <div
        className={cn(
          'font-medium',
          layout.titleClassName,
          isDark ? 'text-slate-300' : 'text-slate-700',
        )}
      >
        Clusters
      </div>
      {visible.map((cluster) => (
        <div key={cluster} className={cn('flex items-center', layout.rowClassName)}>
          <span
            className={cn('inline-block shrink-0 rounded-full', layout.swatchClassName)}
            style={{ backgroundColor: clusterColor(cluster, isDark) }}
          />
          <span className={cn('truncate', layout.labelClassName)}>{cluster}</span>
        </div>
      ))}
      {overflow > 0 && (
        <div className={cn('text-muted-foreground', layout.overflowClassName)}>
          + {overflow} more
        </div>
      )}
    </div>
  );
}
