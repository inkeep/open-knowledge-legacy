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
