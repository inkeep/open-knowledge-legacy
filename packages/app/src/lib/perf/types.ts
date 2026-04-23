/**
 * Shared types for the perf emission layer.
 *
 * Shape mirrors the Chrome DevTools Extensibility API
 * (https://developer.chrome.com/docs/devtools/performance/extension) for the
 * `performance.measure` user-timing path — `detail.devtools` carries the
 * track-entry payload that DevTools uses to surface custom tracks.
 */

export type DevToolsColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'error';

export interface DevToolsTrackEntry {
  dataType: 'track-entry';
  track: string;
  trackGroup?: string;
  color?: DevToolsColor;
  properties?: Array<[string, string]>;
  tooltipText?: string;
}

export interface PerfMarkDetail {
  devtools: DevToolsTrackEntry;
}

export interface PerfMark {
  name: string;
  startTime: number;
  duration: number;
  track: string;
  properties?: Record<string, unknown>;
}

export type ProfilerPhase = 'mount' | 'update' | 'nested-update';

export interface ProfilerRenderEvent {
  id: string;
  phase: ProfilerPhase;
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}

export type WebVitalName = 'INP' | 'LCP' | 'CLS' | 'FCP' | 'TTFB';

export interface WebVitalsMark {
  name: WebVitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType?: string;
  attribution?: Record<string, unknown>;
}

export interface PerfCollector {
  marks: PerfMark[];
  vitals: WebVitalsMark[];
  startedAt: number;
  reset(): void;
}
