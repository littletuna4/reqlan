/**
 * Parse gate: every language-"rq" block in showcases.ts must parse
 * against the real Langium grammar. Fails the build on parser errors.
 */
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import {
  createReqlanServices,
  isModel,
  type Model,
} from "@reqlan/language";

import { showcases } from "../src/content/showcases.ts";

const services = createReqlanServices(EmptyFileSystem);
const parse = parseHelper<Model>(services.Reqlan);

function checkDocumentValid(document: LangiumDocument): string | undefined {
  return (
    (document.parseResult.parserErrors.length &&
      s`
        Parser errors:
          ${document.parseResult.parserErrors.map((e) => e.message).join("\n  ")}
    `) ||
    (document.parseResult.value === undefined && `ParseResult is 'undefined'.`) ||
    (!isModel(document.parseResult.value) &&
      `Root AST object is a ${document.parseResult.value.$type}, expected a 'Model'.`) ||
    undefined
  );
}

type Failure = {
  showcaseId: string;
  blockIndex: number;
  label?: string;
  detail: string;
};

const failures: Failure[] = [];
let checked = 0;

for (const showcase of showcases) {
  for (const [index, block] of showcase.blocks.entries()) {
    if (!("language" in block) || block.language !== "rq") {
      continue;
    }
    checked += 1;
    const document = await parse(block.code);
    const error = checkDocumentValid(document);
    if (error) {
      failures.push({
        showcaseId: showcase.id,
        blockIndex: index,
        label: block.label,
        detail: error.trim(),
      });
    }
  }
}

if (failures.length > 0) {
  console.error(`Showcase .rq parse gate failed (${failures.length}/${checked}):\n`);
  for (const failure of failures) {
    const where = failure.label
      ? `${failure.showcaseId} block ${failure.blockIndex} (${failure.label})`
      : `${failure.showcaseId} block ${failure.blockIndex}`;
    console.error(`— ${where}\n${failure.detail}\n`);
  }
  process.exit(1);
}

console.log(`Validated ${checked} showcase .rq blocks against Langium grammar.`);
