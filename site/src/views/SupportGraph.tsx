"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Layout } from "webcola";

import {
  flattenSupportActions,
  isFeaturedSupportAction,
  isFeaturedSupportGroup,
  support,
  supportGroupById,
  supportGroups,
  supportGraphTitle,
  type SupportAction,
  type SupportGroupId,
} from "@/content/support";
import {
  clampGraphPoint,
  createLaidOutSupportGraph,
  graphCanvasForView,
  hungerOffset,
  nodeLabelDy,
  pinColaNode,
  pointerExceededDragThreshold,
  sameGraphCanvas,
  svgPoint,
  type SupportColaNode,
} from "@/lib/support-graph-cola";
import {
  copySupportText,
  isHttpSupportHref,
  runSupportShare,
  supportLinkHref,
} from "@/lib/support-action";
import { cn } from "@/lib/utils";
import styles from "@/views/support.module.css";

export function SupportGraph() {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]

  const actions = flattenSupportActions();
  const copied = useCopiedFlag();
  const tip = useNodeTip();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(createLaidOutSupportGraph());
  const dragRef = useRef<DragSession | null>(null);
  const [, setFrame] = useState(0);
  const { byId, layout, canvas } = graphRef.current;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const actionsByGroup = new Map<SupportGroupId, SupportAction[]>();
  for (const action of actions) {
    const list = actionsByGroup.get(action.groupId) ?? [];
    list.push(action);
    actionsByGroup.set(action.groupId, list);
  }

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }

    const applyView = (widthPx: number, heightPx: number) => {
      if (dragRef.current?.active) {
        return;
      }
      const next = graphCanvasForView(widthPx, heightPx);
      if (sameGraphCanvas(graphRef.current.canvas, next)) {
        return;
      }
      graphRef.current.layout.stop();
      graphRef.current = createLaidOutSupportGraph(next);
      setFrame((frame) => frame + 1);
    };

    applyView(wrap.clientWidth, wrap.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) {
        return;
      }
      applyView(box.width, box.height);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      layout.stop();
    };
  }, [layout]);

  const visualOf = (node: SupportColaNode) => {
    const dragging = dragRef.current;
    if (dragging?.active && dragging.id === node.id) {
      return { x: node.x, y: node.y };
    }
    if (reduceMotion) {
      return { x: node.x, y: node.y };
    }
    const lean = hungerOffset(node.x, node.y, cursor);
    return { x: node.x + lean.x, y: node.y + lean.y };
  };

  const nodeById = (id: string) => byId.get(id);

  const bump = () => setFrame((frame) => frame + 1);

  const onGraphPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || reduceMotion) {
      return;
    }
    setCursor(svgPoint(svg, event.clientX, event.clientY));
  };

  const onNodePointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    nodeId: string,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const session: DragSession = {
      id: nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      suppressClick: false,
    };
    dragRef.current = session;

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== session.pointerId) {
        return;
      }
      if (
        !session.active &&
        !pointerExceededDragThreshold(
          session.startX,
          session.startY,
          moveEvent.clientX,
          moveEvent.clientY,
        )
      ) {
        return;
      }
      const svg = svgRef.current;
      const node = nodeById(session.id);
      if (!svg || !node) {
        return;
      }
      if (!session.active) {
        session.active = true;
        Layout.dragStart(node);
        tip.set(null);
        wrapRef.current?.setAttribute("data-dragging", "true");
      }
      moveEvent.preventDefault();
      const point = clampGraphPoint(
        svgPoint(svg, moveEvent.clientX, moveEvent.clientY),
        node.radius,
        graphRef.current.canvas,
      );
      Layout.drag(node, point);
      node.x = point.x;
      node.y = point.y;
      bump();
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== session.pointerId) {
        return;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (session.active) {
        const node = nodeById(session.id);
        if (node) {
          pinColaNode(node);
        }
        session.suppressClick = true;
        wrapRef.current?.removeAttribute("data-dragging");
        bump();
      }
      window.setTimeout(() => {
        if (dragRef.current === session) {
          dragRef.current = null;
        }
      }, 0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onGraphClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current?.suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.suppressClick = false;
  };

  return (
    <div
      ref={wrapRef}
      className={styles.graphWrap}
      onClickCapture={onGraphClickCapture}
    >
      <svg
        ref={svgRef}
        className={styles.graph}
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        role="group"
        aria-label={support.title}
        onPointerMove={onGraphPointerMove}
        onPointerLeave={() => {
          if (!dragRef.current?.active) {
            setCursor(null);
          }
        }}
      >
        {supportGroups.map((group) => {
          const groupActions = actionsByGroup.get(group.id) ?? [];
          const featuredGroup = isFeaturedSupportGroup(group.id);
          const groupNode = nodeById(group.id);
          if (!groupNode) {
            return null;
          }
          const groupPos = visualOf(groupNode);
          return (
            <g
              key={group.id}
              className={cn(
                styles.graphCluster,
                featuredGroup && styles.graphClusterFeatured,
              )}
            >
              <g className={styles.graphEdges} aria-hidden="true">
                {groupActions.map((action) => {
                  const actionNode = nodeById(action.id);
                  if (!actionNode) {
                    return null;
                  }
                  const actionPos = visualOf(actionNode);
                  return (
                    <line
                      key={`${action.id}-${group.id}`}
                      x1={actionPos.x}
                      y1={actionPos.y}
                      x2={groupPos.x}
                      y2={groupPos.y}
                      className={styles.graphEdge}
                    />
                  );
                })}
              </g>

              <g
                className={cn(styles.graphGroup, styles.graphNode)}
                transform={`translate(${groupPos.x} ${groupPos.y})`}
                onPointerDown={(event) => onNodePointerDown(event, group.id)}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={groupNode.radius}
                  className={cn(
                    styles.graphGroupDisk,
                    featuredGroup && styles.graphGroupDiskFeatured,
                  )}
                />
                <text
                  x={0}
                  y={nodeLabelDy(groupNode.radius)}
                  className={cn(
                    styles.graphGroupLabel,
                    featuredGroup && styles.graphGroupLabelFeatured,
                  )}
                  textAnchor="middle"
                >
                  {group.title}
                </text>
              </g>

              <g className={styles.graphActions}>
                {groupActions.map((action) => {
                  const actionNode = nodeById(action.id);
                  if (!actionNode) {
                    return null;
                  }
                  const actionPos = visualOf(actionNode);
                  const label =
                    copied.id === action.id
                      ? copied.flag
                        ? "Copied"
                        : supportGraphTitle(action)
                      : supportGraphTitle(action);
                  const groupTitle = supportGroupById(action.groupId).title;

                  return (
                    <ActionNode
                      key={action.id}
                      action={action}
                      node={actionNode}
                      x={actionPos.x}
                      y={actionPos.y}
                      label={label}
                      groupTitle={groupTitle}
                      featured={isFeaturedSupportAction(action)}
                      onCopy={copied.run}
                      onTip={tip.set}
                      onPointerDown={onNodePointerDown}
                    />
                  );
                })}
              </g>
            </g>
          );
        })}
      </svg>
      {tip.current ? (
        <div
          className={styles.graphTooltip}
          data-anchor={tipAnchor(tip.current.x, canvas.width)}
          style={{
            left: `${tip.current.x}%`,
            top: `${(tip.current.y / canvas.height) * 100}%`,
          }}
          role="tooltip"
        >
          {tip.current.text}
        </div>
      ) : null}
    </div>
  );
}

type DragSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  suppressClick: boolean;
};

function ActionNode({
  action,
  node,
  x,
  y,
  label,
  groupTitle,
  featured,
  onCopy,
  onTip,
  onPointerDown,
}: {
  action: SupportAction;
  node: SupportColaNode;
  x: number;
  y: number;
  label: string;
  groupTitle: string;
  featured: boolean;
  onCopy: (id: string, text: string) => Promise<void>;
  onTip: (tip: { x: number; y: number; text: string } | null) => void;
  onPointerDown: (
    event: ReactPointerEvent<SVGGElement>,
    nodeId: string,
  ) => void;
}) {
  const ariaLabel = `${action.title}. ${groupTitle}. ${action.blurb}`;
  const className = cn(
    styles.graphAction,
    styles.graphNode,
    featured && styles.graphActionFeatured,
  );
  const diskClass = cn(
    styles.graphDisk,
    featured && styles.graphDiskFeatured,
  );
  const labelClass = cn(
    styles.graphActionLabel,
    featured && styles.graphActionLabelFeatured,
  );
  const showTip = () => onTip({ x, y, text: action.blurb });
  const hideTip = () => onTip(null);
  const body = (
    <>
      <circle cx={0} cy={0} r={node.radius} className={diskClass} />
      <text
        x={0}
        y={nodeLabelDy(node.radius)}
        className={labelClass}
        textAnchor="middle"
      >
        {label}
      </text>
    </>
  );

  if (action.kind === "copy" || action.kind === "share") {
    const activate = () => {
      if (action.kind === "copy") {
        void onCopy(action.id, action.text);
        return;
      }
      void (async () => {
        const result = await runSupportShare(action);
        if (result === "copied") {
          await onCopy(action.id, action.url);
        }
      })();
    };
    const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    };

    return (
      <g
        className={className}
        transform={`translate(${x} ${y})`}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={activate}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => onPointerDown(event, action.id)}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {body}
      </g>
    );
  }

  const href = supportLinkHref(action);
  const isHttp = isHttpSupportHref(href);

  return (
    <g
      className={styles.graphNode}
      transform={`translate(${x} ${y})`}
      onPointerDown={(event) => onPointerDown(event, action.id)}
    >
      <a
        className={className}
        href={href}
        aria-label={ariaLabel}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {body}
      </a>
    </g>
  );
}

function tipAnchor(x: number, width: number): "start" | "middle" | "end" {
  if (x < width * 0.2) return "start";
  if (x > width * 0.8) return "end";
  return "middle";
}

function useNodeTip() {
  const [current, setCurrent] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  return { current, set: setCurrent };
}

function useCopiedFlag() {
  const [id, setId] = useState<string | null>(null);
  const [flag, setFlag] = useState(false);

  const run = async (actionId: string, text: string) => {
    try {
      await copySupportText(text);
      setId(actionId);
      setFlag(true);
      window.setTimeout(() => {
        setFlag(false);
        setId(null);
      }, 1600);
    } catch {
      setFlag(false);
      setId(null);
    }
  };

  return { id, flag, run };
}
