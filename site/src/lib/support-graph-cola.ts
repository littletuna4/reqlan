import { Layout, type Link, type Node } from "webcola";

import {
  flattenSupportActions,
  supportGroupRadius,
  supportGroups,
  supportNodeRadius,
  supportScore,
  supportScoreRange,
} from "@/content/support";

// rq:["../../../reqlan rq/site/support-page.rq".support_page]

export const GRAPH_WIDTH = 100;
export const GRAPH_HEIGHT = 78;
export const HUNGER_MAX = 1.1;
export const HUNGER_RANGE = 34;
export const DRAG_THRESHOLD_PX = 5;
export const LABEL_GAP = 3;

export type SupportGraphCanvas = {
  width: number;
  height: number;
};

export type SupportColaNode = Node & {
  id: string;
  kind: "group" | "action";
  radius: number;
  px?: number;
  py?: number;
};

export function nodeLabelDy(radius: number): number {
  return radius + LABEL_GAP;
}

export function graphCanvasForView(
  widthPx: number,
  heightPx: number,
): SupportGraphCanvas {
  if (widthPx <= 0 || heightPx <= 0) {
    return { width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
  }
  const height = Math.max(
    36,
    Math.round(((GRAPH_WIDTH * heightPx) / widthPx) * 2) / 2,
  );
  return { width: GRAPH_WIDTH, height };
}

export function sameGraphCanvas(
  a: SupportGraphCanvas,
  b: SupportGraphCanvas,
): boolean {
  return a.width === b.width && a.height === b.height;
}

export function hungerOffset(
  x: number,
  y: number,
  cursor: { x: number; y: number } | null,
): { x: number; y: number } {
  if (!cursor) {
    return { x: 0, y: 0 };
  }
  const dx = cursor.x - x;
  const dy = cursor.y - y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    return { x: 0, y: 0 };
  }
  const falloff = Math.max(0, 1 - distance / HUNGER_RANGE);
  const magnitude = HUNGER_MAX * falloff * falloff;
  return {
    x: (dx / distance) * magnitude,
    y: (dy / distance) * magnitude,
  };
}

export function pointerExceededDragThreshold(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= DRAG_THRESHOLD_PX;
}

export function svgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const mapped = point.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

export function clampGraphPoint(
  point: { x: number; y: number },
  radius: number,
  canvas: SupportGraphCanvas = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT },
): { x: number; y: number } {
  const pad = Math.max(radius + 1, 6);
  return {
    x: Math.min(canvas.width - pad, Math.max(pad, point.x)),
    y: Math.min(canvas.height - pad - LABEL_GAP, Math.max(pad, point.y)),
  };
}

export function createSupportColaGraph(): {
  nodes: SupportColaNode[];
  links: Link<number>[];
} {
  const actions = flattenSupportActions();
  const range = supportScoreRange(actions);
  const nodes: SupportColaNode[] = [];

  for (const group of supportGroups) {
    nodes.push(colaNode(group.id, "group", supportGroupRadius));
  }

  for (const action of actions) {
    nodes.push(
      colaNode(
        action.id,
        "action",
        supportNodeRadius(
          supportScore(action.ease, action.impact),
          range.min,
          range.max,
        ),
      ),
    );
  }

  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const links: Link<number>[] = actions.map((action) => {
    const source = indexById.get(action.id);
    const target = indexById.get(action.groupId);
    if (source === undefined || target === undefined) {
      throw new Error(`Missing cola node for ${action.id}`);
    }
    return { source, target };
  });

  return { nodes, links };
}

export function pinColaNode(node: SupportColaNode): void {
  Layout.dragEnd(node);
  node.fixed = 1;
  node.px = node.x;
  node.py = node.y;
}

export function createLaidOutSupportGraph(
  canvas: SupportGraphCanvas = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT },
): {
  nodes: SupportColaNode[];
  links: Link<number>[];
  layout: Layout;
  byId: Map<string, SupportColaNode>;
  canvas: SupportGraphCanvas;
} {
  const { nodes, links } = createSupportColaGraph();
  const layout = new Layout()
    .nodes(nodes)
    .links(links)
    .size([canvas.width, canvas.height])
    .avoidOverlaps(true)
    .handleDisconnected(true)
    .defaultNodeSize(32)
    .linkDistance(36)
    .start(30, 0, 40, 0, false);
  containInCanvas(nodes, canvas);
  return {
    nodes,
    links,
    layout,
    byId: new Map(nodes.map((node) => [node.id, node])),
    canvas,
  };
}

function colaNode(
  id: string,
  kind: "group" | "action",
  radius: number,
): SupportColaNode {
  return {
    id,
    kind,
    radius,
    x: 0,
    y: 0,
    width: radius * 2 + 18,
    height: radius * 2 + LABEL_GAP + 18,
    fixed: 0,
  };
}

function containInCanvas(
  nodes: SupportColaNode[],
  canvas: SupportGraphCanvas,
): void {
  const pad = 8;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const innerW = canvas.width - pad * 2;
  const innerH = canvas.height - pad * 2;
  const scale = Math.min(1, innerW / spanX, innerH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const originX = pad + (innerW - usedW) / 2;
  const originY = pad + (innerH - usedH) / 2;
  for (const node of nodes) {
    node.x = originX + (node.x - minX) * scale;
    node.y = originY + (node.y - minY) * scale;
    node.px = node.x;
    node.py = node.y;
  }
}
