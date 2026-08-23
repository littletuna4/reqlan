// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".sidebar_nav]
// rq:["../../../reqlan rq/site/site.rq".nav_graph]
// rq:["../../../reqlan rq/site/site.rq".routes]
// rq:["../../../reqlan rq/site/site.rq".faq_page]
// rq:["../../../reqlan rq/site/site.rq".faq_drift]
// rq:["../../../reqlan rq/site/support-page.rq".support_page]
import type { NavGraphEdge, NavGraphNode, NavItem } from "@/content/types";

export const nav = [
  {
    id: "home",
    label: "Home",
    children: [
      { id: "motivation", label: "Why reqlan" },
      { id: "syntax", label: "Syntax" },
      { id: "example", label: "Example" },
      { id: "roadmap", label: "Roadmap" },
      { id: "contact", label: "Links" },
    ],
  },
  {
    id: "quickstart",
    label: "Get started",
    href: "/quickstart",
    children: [
      { id: "extension", label: "Extension" },
      { id: "cli", label: "CLI" },
      { id: "mcp", label: "MCP" },
    ],
  },
  { id: "tutorials", label: "Tutorials", href: "/tutorials" },
  { id: "showcase", label: "Showcases", href: "/showcase" },
  {
    id: "faq",
    label: "FAQ",
    href: "/faq",
    children: [
      { id: "token-efficiency", label: "Token efficiency" },
      { id: "de-facto-standard", label: "De facto standard?" },
      { id: "when-to-use", label: "When to use" },
      { id: "drift", label: "Keeping in sync" },
      { id: "support-reqlan", label: "Support reqlan" },
    ],
  },
  {
    id: "support",
    label: "Support",
    href: "/support",
  },
  { id: "spec", label: "Spec", href: "/spec" },
] satisfies NavItem[];

export const navGraph = {
  label: "Page graph",
  nodes: [
    {
      id: "hero",
      label: "reqlan",
      kind: "hub",
      target: "hero",
      x: 50,
      y: 42,
    },
    {
      id: "motivation",
      label: "Why",
      kind: "section",
      target: "motivation",
      x: 22,
      y: 26,
    },
    {
      id: "syntax",
      label: "Syntax",
      kind: "section",
      target: "syntax",
      x: 16,
      y: 58,
    },
    {
      id: "example",
      label: "Example",
      kind: "section",
      target: "example",
      x: 34,
      y: 82,
    },
    {
      id: "roadmap",
      label: "Roadmap",
      kind: "section",
      target: "roadmap",
      x: 54,
      y: 86,
    },
    {
      id: "contact",
      label: "Links",
      kind: "section",
      target: "contact",
      x: 72,
      y: 74,
    },
    {
      id: "quickstart",
      label: "Start",
      kind: "page",
      target: "/quickstart",
      x: 78,
      y: 20,
    },
    {
      id: "tutorials",
      label: "Learn",
      kind: "page",
      target: "/tutorials",
      x: 90,
      y: 46,
    },
    {
      id: "showcase",
      label: "Shows",
      kind: "page",
      target: "/showcase",
      x: 80,
      y: 56,
    },
    { id: "faq", label: "FAQ", kind: "page", target: "/faq", x: 68, y: 28 },
    {
      id: "support",
      label: "Support",
      kind: "page",
      target: "/support",
      x: 58,
      y: 16,
    },
  ] satisfies NavGraphNode[],
  edges: [
    { from: "hero", to: "motivation" },
    { from: "motivation", to: "syntax" },
    { from: "syntax", to: "example" },
    { from: "example", to: "roadmap" },
    { from: "roadmap", to: "contact" },
    { from: "hero", to: "contact" },
    { from: "hero", to: "quickstart" },
    { from: "hero", to: "tutorials" },
    { from: "hero", to: "showcase" },
    { from: "hero", to: "faq" },
    { from: "hero", to: "support" },
  ] satisfies NavGraphEdge[],
} as const;
