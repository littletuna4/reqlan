// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import {
  createReqlanServices,
  isModel,
  type Model,
} from "@reqlan/language";

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

/** Returns a parse-error detail string, or undefined when the snippet is valid reqlan. */
export async function rqParseError(code: string): Promise<string | undefined> {
  const document = await parse(code);
  const error = checkDocumentValid(document);
  return error?.trim();
}
