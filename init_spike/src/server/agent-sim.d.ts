/**
 * V3: Agent simulator — triggers DirectConnection writes via HTTP API.
 *
 * Usage:
 *   bun run src/server/agent-sim.ts                    # single raw Y.XmlElement write
 *   bun run src/server/agent-sim.ts --rapid 5          # 5 rapid writes (100ms apart)
 *   bun run src/server/agent-sim.ts --markdown         # single markdown write (unified path)
 *   bun run src/server/agent-sim.ts --markdown --rapid 5
 *
 * Requires the Vite dev server to be running (bun run dev).
 */
export {};
