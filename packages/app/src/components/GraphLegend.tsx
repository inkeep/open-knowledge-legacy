import { bucketKeyForDocName, colorForFolderPath } from '@inkeep/open-knowledge-core';

interface GraphLegendProps {
  nodes: Array<{ id: string }>;
  depth: number;
  theme: 'light' | 'dark';
}

export function GraphLegend({ nodes, depth, theme }: GraphLegendProps) {
  if (depth === 0) return null;

  const bucketSet = new Set<string>();
  for (const node of nodes) {
    const key = bucketKeyForDocName(node.id, depth);
    if (key !== null) bucketSet.add(key);
  }
  const buckets = [...bucketSet].sort();

  if (buckets.length === 0) return null;

  return (
    <section
      aria-label="Directory color legend"
      className="absolute top-10 right-2 z-10 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto rounded-md bg-background/80 p-2 text-xs backdrop-blur-sm"
    >
      {buckets.map((bucket) => (
        <div key={bucket} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: colorForFolderPath(bucket, { depth, theme }) }}
          />
          <span className="text-muted-foreground">{bucket}</span>
        </div>
      ))}
    </section>
  );
}
