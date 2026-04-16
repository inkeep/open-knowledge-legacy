/**
 * Deterministic cluster-to-color mapping for graph nodes.
 *
 * Palettes are hand-picked for WCAG AA contrast against their respective
 * backgrounds (dark ≈ hsl(0 0% 4%), light ≈ white).
 */

const DARK_PALETTE = [
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#fb923c', // orange-400
  '#f87171', // red-400
  '#2dd4bf', // teal-400
  '#c084fc', // purple-400
  '#38bdf8', // sky-400
  '#a3e635', // lime-400
  '#e879f9', // fuchsia-400
  '#fca5a5', // red-300
  '#86efac', // green-300
  '#93c5fd', // blue-300
  '#fcd34d', // amber-300
] as const;

const LIGHT_PALETTE = [
  '#db2777', // pink-600
  '#7c3aed', // violet-600
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#ea580c', // orange-600
  '#dc2626', // red-600
  '#0d9488', // teal-600
  '#9333ea', // purple-600
  '#0284c7', // sky-600
  '#65a30d', // lime-600
  '#c026d3', // fuchsia-600
  '#b91c1c', // red-700
  '#047857', // emerald-700
  '#1d4ed8', // blue-700
  '#b45309', // amber-700
] as const;

function stableHash(str: string): number {
  let h = 2;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function clusterColor(cluster: string, isDark: boolean): string {
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  return palette[stableHash(cluster) % palette.length];
}
