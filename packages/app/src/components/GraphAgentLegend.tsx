import { colorFromSeed } from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import type { ActiveAgent } from '@/components/graph-attribution';

/**
 * Overlay pill-cluster showing agents who have edited any graph node within
 * the active-agent window (see `ACTIVE_AGENT_WINDOW_MS`). Mirrors
 * `GraphLegend`'s positioning approach but anchors to the top-right so it
 * does not collide with the cluster legend at bottom-left.
 */
export function GraphAgentLegend({ agents }: { agents: ActiveAgent[] }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (agents.length === 0) return null;

  return (
    <section
      aria-label="Active graph editors"
      className={`pointer-events-none absolute right-3 top-3 z-10 flex max-w-[220px] flex-col gap-1 rounded-lg px-3 py-2 text-xs backdrop-blur-sm ${
        isDark ? 'bg-black/70 text-gray-200' : 'bg-white/80 text-gray-800 ring-1 ring-black/5'
      }`}
    >
      <div className={`mb-1.5 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        Editing now
      </div>
      <ul className="flex flex-col gap-1">
        {agents.map((agent) => (
          <li key={agent.colorSeed} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFromSeed(agent.colorSeed) }}
            />
            <span className="truncate">{agent.agentName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
