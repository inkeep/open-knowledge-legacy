export type ClickLevel = 0 | 1 | 2 | 3;
export type ActiveClickLevel = Exclude<ClickLevel, 0>;

export const RAGE_WINDOW_MS = 600;
export const IDLE_RESET_MS = 1000;
const MAX_LEVEL: ActiveClickLevel = 3;

export function nextClickLevel(
  previousLevel: ClickLevel,
  dtMs: number,
  opts?: { windowMs?: number; maxLevel?: ActiveClickLevel },
): ActiveClickLevel {
  const windowMs = opts?.windowMs ?? RAGE_WINDOW_MS;
  const maxLevel = opts?.maxLevel ?? MAX_LEVEL;
  if (previousLevel === 0 || dtMs >= windowMs) return 1;
  const incremented = previousLevel + 1;
  return (incremented > maxLevel ? maxLevel : incremented) as ActiveClickLevel;
}

export interface FireworkParticle {
  id: number;
  /** Horizontal offset from the blob center in SVG user units */
  dx: number;
  /** Vertical offset from the blob center in SVG user units */
  dy: number;
  /** Particle radius in SVG user units */
  size: number;
  /** CSS color string (either `var(--…)` or a literal color) */
  color: string;
  /** Per-particle stagger in ms (adds to the firework's chaos) */
  delay: number;
  /** Per-particle animation duration in ms */
  duration: number;
}

interface FireworkLevelConfig {
  count: number;
  baseDistance: number;
  distanceVariance: number;
  sizeMin: number;
  sizeMax: number;
  maxDelay: number;
  durationMin: number;
  durationMax: number;
}

export const FIREWORK_LEVEL_CONFIG: Record<ClickLevel, FireworkLevelConfig> = {
  0: {
    count: 0,
    baseDistance: 0,
    distanceVariance: 0,
    sizeMin: 0,
    sizeMax: 0,
    maxDelay: 0,
    durationMin: 0,
    durationMax: 0,
  },
  // Levels 1 and 2 get the bounce + eye squish only. The firework is reserved
  // for rage (level 3) so it stays a genuine reward rather than fading into
  // every click.
  1: {
    count: 0,
    baseDistance: 0,
    distanceVariance: 0,
    sizeMin: 0,
    sizeMax: 0,
    maxDelay: 0,
    durationMin: 0,
    durationMax: 0,
  },
  2: {
    count: 0,
    baseDistance: 0,
    distanceVariance: 0,
    sizeMin: 0,
    sizeMax: 0,
    maxDelay: 0,
    durationMin: 0,
    durationMax: 0,
  },
  3: {
    count: 16,
    baseDistance: 14,
    distanceVariance: 5.5,
    sizeMin: 0.45,
    sizeMax: 1.2,
    maxDelay: 130,
    durationMin: 620,
    durationMax: 920,
  },
};

export const FIREWORK_COLORS: readonly string[] = [
  'var(--color-azure-blue)',
  'var(--color-sky-blue)',
  'var(--color-agent)',
  'var(--color-orange-light)',
  'var(--color-crystal-blue)',
];

/**
 * Pure generator for a single firework burst. Called once per click with the
 * resolved `ClickLevel`. Each particle picks its own angle (evenly sliced
 * then jittered), distance, size, color, delay, and duration so bursts look
 * chaotic rather than geometric.
 *
 * `rng` is injectable for deterministic tests; production uses `Math.random`.
 */
export function generateFireworkParticles(
  level: ClickLevel,
  opts: { rng?: () => number; colors?: readonly string[] } = {},
): FireworkParticle[] {
  const rng = opts.rng ?? Math.random;
  const colors = opts.colors ?? FIREWORK_COLORS;
  const config = FIREWORK_LEVEL_CONFIG[level];
  if (config.count === 0 || colors.length === 0) return [];

  const particles: FireworkParticle[] = [];
  const slice = (Math.PI * 2) / config.count;
  for (let i = 0; i < config.count; i++) {
    const baseAngle = i * slice;
    const angleJitter = (rng() - 0.5) * slice * 0.7;
    const angle = baseAngle + angleJitter;
    const distance = config.baseDistance + (rng() - 0.5) * 2 * config.distanceVariance;
    const size = config.sizeMin + rng() * (config.sizeMax - config.sizeMin);
    const delay = rng() * config.maxDelay;
    const duration = config.durationMin + rng() * (config.durationMax - config.durationMin);
    const colorIndex = Math.floor(rng() * colors.length);
    particles.push({
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size,
      color: colors[colorIndex] ?? 'currentColor',
      delay,
      duration,
    });
  }
  return particles;
}
