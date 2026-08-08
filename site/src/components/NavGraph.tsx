"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { siteContent, type NavGraphNode } from "@/content/site";
import { prefersReducedMotion } from "@/lib/deeplink";
import { sitePath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import styles from "./NavGraph.module.css";

const SECTION_ORDER = ["hero", "motivation", "syntax", "example", "roadmap", "contact"] as const;

function nodeHref(node: NavGraphNode): string {
  if (node.kind === "page") {
    return sitePath(`${node.target}/`);
  }
  return sitePath(`/#${node.target}`);
}

function nodeRadius(kind: NavGraphNode["kind"]): number {
  if (kind === "hub") return 7.5;
  if (kind === "page") return 4.2;
  return 5.2;
}

export function NavGraph() {
  const { navGraph } = siteContent;
  const reactId = useId().replace(/:/g, "");
  const hubGradId = `nav-graph-hub-${reactId}`;
  const activeGradId = `nav-graph-active-${reactId}`;
  const [activeId, setActiveId] = useState<string>("hero");
  const [reducedMotion, setReducedMotion] = useState(false);

  const nodesById = useMemo(() => {
    const map = new Map<string, NavGraphNode>();
    for (const node of navGraph.nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [navGraph.nodes]);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const sections = SECTION_ORDER.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target;
        if (top?.id) {
          setActiveId(top.id);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.08, 0.2, 0.4, 0.6],
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <aside
      className={cn(styles.rail, reducedMotion && styles.still)}
      aria-label={navGraph.label}
    >
      <svg
        className={styles.svg}
        viewBox="0 0 100 100"
        role="navigation"
        aria-label={navGraph.label}
      >
          <defs>
            <radialGradient id={hubGradId} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#0bbefb" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#0371c1" stopOpacity="0.85" />
            </radialGradient>
            <radialGradient id={activeGradId} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#b85c38" stopOpacity="1" />
              <stop offset="100%" stopColor="#8a4530" stopOpacity="0.95" />
            </radialGradient>
          </defs>

          <g className={styles.edges} aria-hidden="true">
            {navGraph.edges.map((edge) => {
              const from = nodesById.get(edge.from);
              const to = nodesById.get(edge.to);
              if (!from || !to) {
                return null;
              }
              const lit =
                activeId === from.target ||
                activeId === to.target ||
                activeId === from.id ||
                activeId === to.id;

              return (
                <line
                  key={`${edge.from}-${edge.to}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={cn(styles.edge, lit && styles.edgeLit)}
                />
              );
            })}
          </g>

          <g className={styles.nodes}>
            {navGraph.nodes.map((node) => {
              const isActive =
                node.kind !== "page" &&
                (activeId === node.target || activeId === node.id);
              const r = nodeRadius(node.kind);
              const fill = isActive
                ? `url(#${activeGradId})`
                : node.kind === "hub"
                  ? `url(#${hubGradId})`
                  : undefined;

              return (
                <a
                  key={node.id}
                  href={nodeHref(node)}
                  className={cn(
                    styles.node,
                    styles[`kind_${node.kind}`],
                    isActive && styles.nodeActive,
                  )}
                  aria-current={isActive ? "location" : undefined}
                >
                  <title>{node.label}</title>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    className={styles.disk}
                    fill={fill}
                  />
                  <text
                    x={node.x}
                    y={node.y + r + 4.2}
                    className={styles.label}
                    textAnchor="middle"
                  >
                    {node.label}
                  </text>
                </a>
              );
            })}
          </g>
        </svg>
    </aside>
  );
}
