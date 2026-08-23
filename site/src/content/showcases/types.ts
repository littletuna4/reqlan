// rq:["../../../../reqlan rq/site/site.rq".showcase_module]
import type { CodeLanguage } from "@/content/types";

export type ShowcaseTier = "flagship" | "depth";

export type ShowcaseCodeBlock = {
  language: CodeLanguage;
  code: string;
  label?: string;
  caption?: string;
};

export type ShowcaseFeaturesBlock = {
  kind: "features";
  label?: string;
  caption?: string;
  items: string[];
};

export type ShowcaseCalloutBlock = {
  kind: "callout";
  text: string;
};

export type ShowcaseExchangeBlock = {
  kind: "exchange";
  label?: string;
  query: string;
  response: string;
};

export type ShowcaseDiagnosticBlock = {
  kind: "diagnostic";
  label?: string;
  severity?: "error" | "warning";
  message: string;
  fixes?: string[];
};

export type ShowcaseDiagramBlock = {
  kind: "diagram";
  label?: string;
  caption?: string;
  content: string;
};

export type ShowcaseBlock =
  | ShowcaseCodeBlock
  | ShowcaseFeaturesBlock
  | ShowcaseCalloutBlock
  | ShowcaseExchangeBlock
  | ShowcaseDiagnosticBlock
  | ShowcaseDiagramBlock;

export type Showcase = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  /** Short badge: the mechanism this page demonstrates. */
  mechanism: string;
  domain: string;
  tier: ShowcaseTier;
  blocks: ShowcaseBlock[];
};

export function isCodeBlock(block: ShowcaseBlock): block is ShowcaseCodeBlock {
  return "language" in block && "code" in block;
}
