// rq:["../../../reqlan rq/site/site.rq".copy]
export type {
  CodeLanguage,
  FaqItem,
  FaqSupportLink,
  LinkItem,
  MotivationFeature,
  MotivationSlide,
  NavGraphEdge,
  NavGraphNode,
  NavGraphNodeKind,
  NavItem,
  PackageItem,
  RoadmapItem,
  SyntaxExample,
  SyntaxSnippet,
} from "@/content/types";

import { contact } from "@/content/contact";
import { example } from "@/content/example";
import { faq } from "@/content/faq";
import { cta, hero } from "@/content/hero";
import { brand, footer, meta } from "@/content/meta";
import { motivation } from "@/content/motivation";
import { nav, navGraph } from "@/content/nav";
import { roadmap } from "@/content/roadmap";
import { stickyCta } from "@/content/sticky-cta";
import { syntax } from "@/content/syntax";

export const siteContent = {
  meta,
  brand,
  nav,
  navGraph,
  hero,
  cta,
  motivation,
  syntax,
  example,
  roadmap,
  contact,
  faq,
  stickyCta,
  footer,
} as const;

export type SiteContent = typeof siteContent;
