// rq:["../../../reqlan rq/site/site.rq".copy]
import type {
  PhonebookLink,
  PhonebookLinkId,
  PhonebookPackage,
} from "@/lib/phonebook";

export type NavItem = {
  id: string;
  label: string;
  /** Page path (e.g. `/faq`). Omit for the home hub (`/`). */
  href?: string;
  /** Same-page section anchors shown only while on this item's page. */
  children?: readonly NavItem[];
};

export type CodeLanguage =
  | "rq"
  | "ts"
  | "md"
  | "py"
  | "st"
  | "c"
  | "json"
  | "yaml";

export type SyntaxSnippet = {
  label?: string;
  code: string;
  language: CodeLanguage;
};

export type SyntaxExample = {
  label: string;
  /** Self-referential form - the snippet teaches the rule. */
  rule: SyntaxSnippet;
  /** Applied use; revealed by a toggle. */
  practical: SyntaxSnippet;
};

export type LinkItem = PhonebookLink;
export type PackageItem = PhonebookPackage;

export type MotivationFeature = {
  id: string;
  label: string;
  /** Concrete capability. */
  what: string;
  /** Why that capability matters. */
  why: string;
};

export type MotivationSlide = {
  id: string;
  label: string;
  /** What this part of reqlan is. */
  what: string;
  /** Why this part exists. */
  why: string;
  features: MotivationFeature[];
};

export type NavGraphNodeKind = "hub" | "section" | "page";

export type NavGraphNode = {
  id: string;
  label: string;
  kind: NavGraphNodeKind;
  /** Section anchor id when kind is hub/section; page path when kind is page. */
  target: string;
  /** Initial layout in viewBox units (0–100). */
  x: number;
  y: number;
};

export type NavGraphEdge = {
  from: string;
  to: string;
};

export type FaqSupportLink = {
  id: PhonebookLinkId;
  label: string;
};

export type FaqPageLink = {
  href: string;
  label: string;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  page?: FaqPageLink;
  links?: readonly FaqSupportLink[];
};

export type RoadmapItem = {
  id: string;
  horizon: "Now" | "Next" | "Later";
  label: string;
  detail: string;
};

export type FeaturedItem = {
  id: string;
  label: string;
  href: string;
};
