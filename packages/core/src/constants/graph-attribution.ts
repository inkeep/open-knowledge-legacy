/**
 * Constants controlling live agent attribution on the graph view.
 *
 * Shared between server (LiveAttributionTracker windowing) and client
 * (halo rendering + active-agent legend) so both layers agree on the
 * recency semantics.
 */

/** Duration of the initial "ping" ring expansion when an edit lands. */
export const HALO_PULSE_MS = 400;

/** Halo stays at full alpha for this long before beginning to fade. */
export const HALO_FULL_ALPHA_MS = 800;

/** Halo reaches alpha=0 at this age; no longer rendered. */
export const HALO_FADE_END_MS = 12_000;

/**
 * Agents with an edit within this window appear in the active-agent legend.
 * Longer than HALO_FADE_END_MS so an agent stays listed briefly even after
 * their last node's halo has faded, so viewers can still connect name → color.
 */
export const ACTIVE_AGENT_WINDOW_MS = 15_000;

/** Maximum agents rendered in the active-agent legend at once. */
export const MAX_ACTIVE_AGENTS = 8;
