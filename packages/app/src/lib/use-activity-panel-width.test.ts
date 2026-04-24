/**
 * Unit tests for the pure helpers exported by `use-activity-panel-width.ts`.
 *
 * Rendering + persistence behavior requires a real React root + jsdom and
 * lives in Playwright E2E (`tests/stress/agent-activity-panel.e2e.ts`
 * would cover drag-to-resize if needed). The tests here target only
 * branches that can be exercised without React: `clampPanelWidth`'s
 * bounds handling + `NaN` / `Infinity` fallback behavior.
 */

import { describe, expect, test } from 'bun:test';
import {
  clampPanelWidth,
  DEFAULT_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
} from './use-activity-panel-width';

describe('clampPanelWidth', () => {
  test('returns the input unchanged when within bounds', () => {
    expect(clampPanelWidth(MIN_PANEL_WIDTH)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(MAX_PANEL_WIDTH)).toBe(MAX_PANEL_WIDTH);
    expect(clampPanelWidth(DEFAULT_PANEL_WIDTH)).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(600)).toBe(600);
  });

  test('clamps below-minimum to minimum', () => {
    expect(clampPanelWidth(0)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(100)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(MIN_PANEL_WIDTH - 1)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(-500)).toBe(MIN_PANEL_WIDTH);
  });

  test('clamps above-maximum to maximum', () => {
    expect(clampPanelWidth(MAX_PANEL_WIDTH + 1)).toBe(MAX_PANEL_WIDTH);
    expect(clampPanelWidth(2000)).toBe(MAX_PANEL_WIDTH);
    expect(clampPanelWidth(Number.MAX_SAFE_INTEGER)).toBe(MAX_PANEL_WIDTH);
  });

  test('rounds non-integer input to the nearest integer', () => {
    expect(clampPanelWidth(480.4)).toBe(480);
    expect(clampPanelWidth(480.5)).toBe(481);
    expect(clampPanelWidth(499.999)).toBe(500);
  });

  test('falls back to DEFAULT_PANEL_WIDTH for non-finite input', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_PANEL_WIDTH);
  });

  test('bounds are sensible — min fits collapsed-row affordances; max does not hide editor', () => {
    // The exact numbers are contractual: 320 < 480 < 900. If these tighten
    // or widen, every existing `data-testid="activity-panel"` test must be
    // reviewed for assertions that depend on pixel bounds.
    expect(MIN_PANEL_WIDTH).toBe(320);
    expect(DEFAULT_PANEL_WIDTH).toBe(480);
    expect(MAX_PANEL_WIDTH).toBe(900);
  });
});
