import { type GraphLabelDescriptor, pickGraphLabelText } from './graph-label-utils';
import type { GraphNode } from './graph-view-utils';

export interface GraphLabelLayoutNode extends GraphNode {
  x?: number;
  y?: number;
}

export interface GraphLabelLayoutLinkRef {
  id?: string | number | null;
}

export interface GraphLabelLayoutLink {
  source: string | GraphLabelLayoutLinkRef;
  target: string | GraphLabelLayoutLinkRef;
}

export interface GraphViewport {
  width: number;
  height: number;
}

export type GraphLabelAnchor = 'bottom' | 'top' | 'right' | 'left';

export interface GraphLabelPlacement {
  nodeId: string;
  text: string;
  anchor: GraphLabelAnchor;
  priority: number;
  isActive: boolean;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  textX: number;
  textY: number;
}

export interface PlanGraphLabelsInput {
  nodes: GraphLabelLayoutNode[];
  links: GraphLabelLayoutLink[];
  activeDocName: string;
  viewport: GraphViewport;
  maxLabels: number;
  maxLabelWidthPx: number;
  labelDescriptors: Map<string, GraphLabelDescriptor>;
  measureTextWidthPx: (text: string) => number;
  projectToScreen: (x: number, y: number) => { x: number; y: number };
  getNodeRadiusPx: (node: GraphLabelLayoutNode) => number;
}

interface LabelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PositionedNode {
  node: GraphLabelLayoutNode;
  screenX: number;
  screenY: number;
  radiusPx: number;
}

interface LabelCandidate extends PositionedNode {
  text: string;
  textWidthPx: number;
  isActive: boolean;
  degree: number;
  distanceToCenterPx: number;
}

const VIEWPORT_PADDING_PX = 8;
const LABEL_FONT_SIZE_PX = 10;
const LABEL_GAP_PX = 4;
const LABEL_PADDING_X_PX = 6;
const LABEL_PADDING_Y_PX = 4;
const LABEL_HEIGHT_PX = LABEL_FONT_SIZE_PX + LABEL_PADDING_Y_PX * 2;
const NODE_COLLISION_PADDING_PX = 2;
const DISTANCE_EPSILON_PX = 0.001;

export function planGraphLabels(input: PlanGraphLabelsInput): GraphLabelPlacement[] {
  const {
    nodes,
    links,
    activeDocName,
    viewport,
    maxLabels,
    maxLabelWidthPx,
    labelDescriptors,
    measureTextWidthPx,
    projectToScreen,
    getNodeRadiusPx,
  } = input;

  if (maxLabels <= 0 || viewport.width <= 0 || viewport.height <= 0 || nodes.length === 0) {
    return [];
  }

  const degreeByNodeId = buildDegreeMap(links);
  const viewportCenterX = viewport.width / 2;
  const viewportCenterY = viewport.height / 2;

  const positionedNodes = nodes.flatMap<PositionedNode>((node) => {
    if (typeof node.x !== 'number' || typeof node.y !== 'number') {
      return [];
    }
    const screen = projectToScreen(node.x, node.y);
    return [
      {
        node,
        screenX: screen.x,
        screenY: screen.y,
        radiusPx: getNodeRadiusPx(node),
      },
    ];
  });

  const candidates = positionedNodes
    .map<LabelCandidate | null>((positionedNode) => {
      const descriptor = labelDescriptors.get(positionedNode.node.id);
      const text = pickGraphLabelText(descriptor, maxLabelWidthPx, measureTextWidthPx);
      if (!text) return null;

      const textWidthPx = measureTextWidthPx(text);
      if (textWidthPx <= 0) return null;

      return {
        ...positionedNode,
        text,
        textWidthPx,
        isActive: positionedNode.node.id === activeDocName,
        degree: degreeByNodeId.get(positionedNode.node.id) ?? 0,
        distanceToCenterPx: Math.hypot(
          positionedNode.screenX - viewportCenterX,
          positionedNode.screenY - viewportCenterY,
        ),
      };
    })
    .filter((candidate): candidate is LabelCandidate => candidate !== null);

  candidates.sort(compareCandidates);

  const placements: GraphLabelPlacement[] = [];
  const acceptedRects: LabelRect[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    if (placements.length >= maxLabels) {
      break;
    }

    const candidate = candidates[index];
    const placement = placeCandidate(candidate, {
      priority: candidates.length - index,
      viewport,
      acceptedRects,
      positionedNodes,
    });

    if (!placement) continue;

    placements.push(placement);
    acceptedRects.push(placement.rect);
  }

  return placements;
}

function buildDegreeMap(links: GraphLabelLayoutLink[]): Map<string, number> {
  const degrees = new Map<string, number>();

  for (const link of links) {
    const sourceId = getLinkEndpointId(link.source);
    const targetId = getLinkEndpointId(link.target);

    if (sourceId) {
      degrees.set(sourceId, (degrees.get(sourceId) ?? 0) + 1);
    }
    if (targetId) {
      degrees.set(targetId, (degrees.get(targetId) ?? 0) + 1);
    }
  }

  return degrees;
}

function getLinkEndpointId(endpoint: GraphLabelLayoutLink['source']): string | null {
  if (typeof endpoint === 'string') {
    return endpoint;
  }
  if (typeof endpoint?.id === 'string') {
    return endpoint.id;
  }
  if (typeof endpoint?.id === 'number') {
    return String(endpoint.id);
  }
  return null;
}

function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }
  if (Math.abs(a.distanceToCenterPx - b.distanceToCenterPx) > DISTANCE_EPSILON_PX) {
    return a.distanceToCenterPx - b.distanceToCenterPx;
  }
  if (a.degree !== b.degree) {
    return b.degree - a.degree;
  }
  if (a.text.length !== b.text.length) {
    return a.text.length - b.text.length;
  }
  return a.node.id.localeCompare(b.node.id);
}

function placeCandidate(
  candidate: LabelCandidate,
  {
    priority,
    viewport,
    acceptedRects,
    positionedNodes,
  }: {
    priority: number;
    viewport: GraphViewport;
    acceptedRects: LabelRect[];
    positionedNodes: PositionedNode[];
  },
): GraphLabelPlacement | null {
  for (const anchor of ['bottom', 'top', 'right', 'left'] as const) {
    const placement = buildPlacement(candidate, anchor, priority);
    if (!isRectWithinViewport(placement.rect, viewport)) continue;
    if (acceptedRects.some((acceptedRect) => rectsIntersect(acceptedRect, placement.rect)))
      continue;
    if (
      positionedNodes.some(
        (positionedNode) =>
          positionedNode.node.id !== candidate.node.id &&
          rectIntersectsCircle(placement.rect, {
            x: positionedNode.screenX,
            y: positionedNode.screenY,
            radius: positionedNode.radiusPx + NODE_COLLISION_PADDING_PX,
          }),
      )
    ) {
      continue;
    }
    return placement;
  }

  return null;
}

function buildPlacement(
  candidate: LabelCandidate,
  anchor: GraphLabelAnchor,
  priority: number,
): GraphLabelPlacement {
  const labelWidthPx = candidate.textWidthPx + LABEL_PADDING_X_PX * 2;
  const halfWidthPx = labelWidthPx / 2;
  const halfHeightPx = LABEL_HEIGHT_PX / 2;

  let left = candidate.screenX - halfWidthPx;
  let top = candidate.screenY + candidate.radiusPx + LABEL_GAP_PX;

  if (anchor === 'top') {
    top = candidate.screenY - candidate.radiusPx - LABEL_GAP_PX - LABEL_HEIGHT_PX;
  } else if (anchor === 'right') {
    left = candidate.screenX + candidate.radiusPx + LABEL_GAP_PX;
    top = candidate.screenY - halfHeightPx;
  } else if (anchor === 'left') {
    left = candidate.screenX - candidate.radiusPx - LABEL_GAP_PX - labelWidthPx;
    top = candidate.screenY - halfHeightPx;
  }

  return {
    nodeId: candidate.node.id,
    text: candidate.text,
    anchor,
    priority,
    isActive: candidate.isActive,
    rect: {
      left,
      top,
      right: left + labelWidthPx,
      bottom: top + LABEL_HEIGHT_PX,
    },
    textX: left + halfWidthPx,
    textY: top + LABEL_PADDING_Y_PX,
  };
}

function isRectWithinViewport(rect: LabelRect, viewport: GraphViewport): boolean {
  return (
    rect.left >= VIEWPORT_PADDING_PX &&
    rect.top >= VIEWPORT_PADDING_PX &&
    rect.right <= viewport.width - VIEWPORT_PADDING_PX &&
    rect.bottom <= viewport.height - VIEWPORT_PADDING_PX
  );
}

function rectsIntersect(a: LabelRect, b: LabelRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function rectIntersectsCircle(
  rect: LabelRect,
  circle: { x: number; y: number; radius: number },
): boolean {
  const nearestX = clamp(circle.x, rect.left, rect.right);
  const nearestY = clamp(circle.y, rect.top, rect.bottom);
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
