import { bucketKeyForPath, colorForFolderPath } from '@inkeep/open-knowledge-core';

interface GraphLegendProps {
  nodes: Array<{ id: string }>;
  depth: number;
  theme: 'light' | 'dark';
}

export function GraphLegend({ nodes, depth, theme }: GraphLegendProps) {
  if (depth === 0) return null;

  const seen = new Set<string>();
  const buckets: string[] = [];
  for (const node of nodes) {
    const parts = node.id.split('/');
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const key = bucketKeyForPath(dirPath, depth);
    if (key !== null && !seen.has(key)) {
      seen.add(key);
      buckets.push(key);
    }
  }

  if (buckets.length === 0) return null;

  return (
    <div className="absolute top-10 right-2 z-10 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto rounded-md bg-background/80 p-2 text-xs backdrop-blur-sm">
      {buckets.map((bucket) => (
        <div key={bucket} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: colorForFolderPath(bucket, { depth, theme }) }}
          />
          <span className="text-muted-foreground">{bucket}</span>
        </div>
      ))}
    </div>
  );
}
