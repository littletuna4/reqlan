/**
 * Parse gate: every accurate language-"rq" snippet on the site must parse
 * against the real Langium grammar. Fails the build on parser errors.
 */
import { accurateRqSnippets } from "../src/content/accurate-rq-snippets.ts";
import { rqParseError } from "../src/content/parse-rq-snippet.ts";

const failures: { id: string; detail: string }[] = [];
const snippets = accurateRqSnippets();

for (const snippet of snippets) {
  const error = await rqParseError(snippet.code);
  if (error) {
    failures.push({ id: snippet.id, detail: error });
  }
}

if (failures.length > 0) {
  console.error(
    `Accurate .rq parse gate failed (${failures.length}/${snippets.length}):\n`,
  );
  for (const failure of failures) {
    console.error(`— ${failure.id}\n${failure.detail}\n`);
  }
  process.exit(1);
}

console.log(
  `Validated ${snippets.length} accurate .rq snippets against Langium grammar.`,
);
