// rq:["../../../../reqlan rq/site/site.rq".showcase]
// rq:["../../../../reqlan rq/site/site.rq".showcase_module]
// rq:["../../../../reqlan rq/site/site.rq".showcase_set]
// rq:["../../../../reqlan rq/phonebook.rq".phonebook]
import { mailtoWithSubject } from "@/lib/mailto";
import { getPhonebookLink } from "@/lib/phonebook";
import type { Showcase } from "./types";
import { agentContextShowcase } from "./agent-context";
import { interlockShowcase } from "./interlock";
import { brokenLinksShowcase } from "./broken-links";
import { firmwareCloudShowcase } from "./firmware-cloud";
import { auditTrailShowcase } from "./audit-trail";
import { moduleSurfaceShowcase } from "./module-surface";
import { testProvesShowcase } from "./test-proves";
import { legacyArchaeologyShowcase } from "./legacy-archaeology";
import { graphViewShowcase } from "./graph-view";
import { attributeDialectShowcase } from "./attribute-dialect";
import { antipatternsShowcase } from "./antipatterns";

export type {
  Showcase,
  ShowcaseBlock,
  ShowcaseCalloutBlock,
  ShowcaseCodeBlock,
  ShowcaseDiagnosticBlock,
  ShowcaseDiagramBlock,
  ShowcaseExchangeBlock,
  ShowcaseFeaturesBlock,
  ShowcaseTier,
} from "./types";
export { isCodeBlock } from "./types";

export const showcaseFeatureMailto = mailtoWithSubject(
  getPhonebookLink("email").href,
  "reqlan showcase",
);

export const showcases = [
  agentContextShowcase,
  interlockShowcase,
  brokenLinksShowcase,
  firmwareCloudShowcase,
  auditTrailShowcase,
  moduleSurfaceShowcase,
  testProvesShowcase,
  legacyArchaeologyShowcase,
  graphViewShowcase,
  attributeDialectShowcase,
  antipatternsShowcase,
] satisfies Showcase[];

export type Showcases = typeof showcases;

export function getShowcase(slug: string): Showcase | undefined {
  return showcases.find((showcase) => showcase.id === slug);
}
