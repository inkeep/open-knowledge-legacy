/**
 * Pure helpers for graph agent-attribution rendering.
 * No React, no DOM — canvas-ready numbers + filter functions.
 *
 * Paired with `specs/2026-04-16-graph-demo-iteration-loop/SPEC.md §10 S6`.
 */

import {
  ACTIVE_AGENT_WINDOW_MS,
  HALO_FADE_END_MS,
  HALO_FULL_ALPHA_MS,
  HALO_PULSE_MS,
  type LastEditedBy,
  MAX_ACTIVE_AGENTS,
} from '@inkeep/open-knowledge-core';

export interface ActiveAgent {
  agentName: string;
  colorSeed: string;
  /** Most recent edit timestamp across all docs for this agent. */
  timestamp: number;
}

/** True when `entry` is within the halo render window (i.e. alpha > 0). */
export function isHaloActive(entry: LastEditedBy | null | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.timestamp < HALO_FADE_END_MS;
}

/**
 * Alpha for the halo ring: 1.0 during pulse + full window, linear fade to 0
 * by HALO_FADE_END_MS.
 */
export function haloAlpha(entry: LastEditedBy | null | undefined, now: number): number {
  if (!entry) return 0;
  const age = now - entry.timestamp;
  if (age < 0) return 1; // clock-skew guard
  if (age >= HALO_FADE_END_MS) return 0;
  if (age < HALO_FULL_ALPHA_MS) return 1;
  const remaining = HALO_FADE_END_MS - age;
  const fadeWindow = HALO_FADE_END_MS - HALO_FULL_ALPHA_MS;
  return Math.max(0, Math.min(1, remaining / fadeWindow));
}

/**
 * Pulse scale: the halo expands from a small inner radius to a larger outer
 * radius in the first HALO_PULSE_MS, then settles back to 1.0. Returns a
 * multiplier that the caller multiplies into the halo's inset distance.
 */
export function haloPulseScale(entry: LastEditedBy | null | undefined, now: number): number {
  if (!entry) return 1;
  const age = now - entry.timestamp;
  if (age < 0 || age >= HALO_PULSE_MS) return 1;
  // Ease-out: quick expansion then settle.
  const t = age / HALO_PULSE_MS;
  return 1 + (1 - (1 - t) * (1 - t)) * 1.0; // peaks at ~2x at t=1, i.e. halo expanded.
}

/** Minimum shape consumed by the iterable helpers below. */
export interface NodeWithOptionalAttribution {
  lastEditedBy?: LastEditedBy | null;
}

/**
 * True when any node in the given iterable has a halo that would render now.
 * Used to decide whether to keep the rAF refresh loop running.
 */
export function anyHaloActive(nodes: Iterable<NodeWithOptionalAttribution>, now: number): boolean {
  for (const n of nodes) {
    if (isHaloActive(n.lastEditedBy, now)) return true;
  }
  return false;
}

/**
 * Extract the list of agents who edited any node within ACTIVE_AGENT_WINDOW_MS.
 * Deduped by colorSeed (agents with the same colorSeed share a pill),
 * sorted by most-recent-first, capped at MAX_ACTIVE_AGENTS.
 */
export function activeAgentsFromNodes(
  nodes: Iterable<NodeWithOptionalAttribution>,
  now: number,
): ActiveAgent[] {
  const best = new Map<string, ActiveAgent>();
  for (const node of nodes) {
    const entry = node.lastEditedBy;
    if (!entry) continue;
    if (now - entry.timestamp > ACTIVE_AGENT_WINDOW_MS) continue;
    const key = entry.colorSeed;
    const prev = best.get(key);
    if (!prev || entry.timestamp > prev.timestamp) {
      best.set(key, {
        agentName: entry.agentName,
        colorSeed: entry.colorSeed,
        timestamp: entry.timestamp,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ACTIVE_AGENTS);
}
