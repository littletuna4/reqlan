// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]
import { example } from "./example";
import { firstStepsContent } from "./first-steps";
import { hero } from "./hero";
import { isCodeBlock, showcases } from "./showcases";
import { syntax } from "./syntax";

export type AccurateRqSnippet = {
  id: string;
  code: string;
};

/** Site snippets that claim to be real reqlan (not ts/md/py comment-link demos). */
export function accurateRqSnippets(): AccurateRqSnippet[] {
  const snippets: AccurateRqSnippet[] = [
    { id: "hero.snippet", code: hero.snippet },
    { id: "example.code", code: example.code },
  ];

  for (const item of syntax.examples) {
    if (item.rule.language === "rq") {
      snippets.push({ id: `syntax.${item.label}.rule`, code: item.rule.code });
    }
    if (item.practical.language === "rq") {
      snippets.push({
        id: `syntax.${item.label}.practical`,
        code: item.practical.code,
      });
    }
  }

  for (const showcase of showcases) {
    for (const [index, block] of showcase.blocks.entries()) {
      if (!isCodeBlock(block) || block.language !== "rq") {
        continue;
      }
      const label = block.label ? `.${block.label}` : "";
      snippets.push({
        id: `showcase.${showcase.id}.${index}${label}`,
        code: block.code,
      });
    }
  }

  // rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps]
  for (const step of firstStepsContent.steps) {
    if (step.demo?.language !== "rq") {
      continue;
    }
    snippets.push({
      id: `first-steps.${step.id}`,
      code: step.demo.code,
    });
  }

  return snippets;
}
