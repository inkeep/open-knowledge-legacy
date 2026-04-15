import { describe, expect, test } from 'bun:test';
import {
  type GraphLabelLayoutLink,
  type GraphLabelLayoutNode,
  planGraphLabels,
} from './graph-label-layout';
import { buildGraphLabelDescriptors } from './graph-label-utils';

function plan({
  nodes,
  links = [],
  activeDocName = '',
  viewport = { width: 200, height: 120 },
  maxLabels = 8,
  maxLabelWidthPx = 120,
}: {
  nodes: GraphLabelLayoutNode[];
  links?: GraphLabelLayoutLink[];
  activeDocName?: string;
  viewport?: { width: number; height: number };
  maxLabels?: number;
  maxLabelWidthPx?: number;
}) {
  return planGraphLabels({
    nodes,
    links,
    activeDocName,
    viewport,
    maxLabels,
    maxLabelWidthPx,
    labelDescriptors: buildGraphLabelDescriptors(nodes),
    measureTextWidthPx: (text) => text.length * 6,
    projectToScreen: (x, y) => ({ x, y }),
    getNodeRadiusPx: () => 6,
  });
}

describe('planGraphLabels', () => {
  test('active node wins when two labels would collide', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'active', label: 'Alpha', x: 92, y: 40 },
      { id: 'other', label: 'Bravo', x: 108, y: 40 },
    ];

    const placements = plan({ nodes, activeDocName: 'active', maxLabels: 1 });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('active');
  });

  test('higher-degree node wins a non-active collision', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'hub', label: 'Hub Node', x: 92, y: 40 },
      { id: 'leaf', label: 'Leaf Node', x: 108, y: 40 },
    ];

    const placements = plan({
      nodes,
      links: [
        { source: 'hub', target: 'doc-a' },
        { source: 'hub', target: 'doc-b' },
      ],
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('hub');
  });

  test('degree ranking still works when links contain force-graph object refs', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'hub', label: 'Hub Node', x: 92, y: 40 },
      { id: 'leaf', label: 'Leaf Node', x: 108, y: 40 },
    ];

    const placements = plan({
      nodes,
      links: [
        { source: { id: 'hub' }, target: { id: 'doc-a' } },
        { source: { id: 'hub' }, target: { id: 'doc-b' } },
      ],
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.nodeId).toBe('hub');
  });

  test('planner chooses a fallback anchor when the preferred anchor would leave the viewport', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'bottom-edge', label: 'Near Bottom', x: 60, y: 92 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'bottom-edge',
      viewport: { width: 120, height: 120 },
      maxLabels: 1,
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.anchor).toBe('top');
  });

  test('planner rejects a label that would cover another node circle', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'active', label: 'Center', x: 100, y: 100 },
      { id: 'above', label: 'Above', x: 100, y: 81 },
      { id: 'below', label: 'Below', x: 100, y: 119 },
      { id: 'left', label: 'Lefty', x: 79, y: 100 },
      { id: 'right', label: 'Right', x: 121, y: 100 },
    ];

    const placements = plan({
      nodes,
      activeDocName: 'active',
      viewport: { width: 200, height: 200 },
      maxLabels: 1,
    });

    expect(placements.some((placement) => placement.nodeId === 'active')).toBeFalse();
  });

  test('planner honors maxLabels deterministically', () => {
    const nodes: GraphLabelLayoutNode[] = [
      { id: 'a', label: 'Node', x: 60, y: 120 },
      { id: 'b', label: 'Node', x: 120, y: 60 },
      { id: 'c', label: 'Node', x: 180, y: 120 },
    ];

    const placements = plan({
      nodes,
      viewport: { width: 240, height: 240 },
      maxLabels: 2,
    });

    expect(placements.map((placement) => placement.nodeId)).toEqual(['a', 'b']);
  });
});
