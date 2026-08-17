import {
  createCssVariablesTheme,
  createHighlighter,
  type Highlighter,
} from "shiki";
import type { CodeLanguage } from "@/content/types";

// rq:["../../../reqlan rq/site/site.rq".code_block_styling]

const reqlanTheme = createCssVariablesTheme({
  name: "reqlan",
  variablePrefix: "--code-",
});

/** Shiki lang ids for every non-.rq CodeLanguage. ST maps to Pascal (closest). */
export const SHIKI_LANGS: Record<Exclude<CodeLanguage, "rq">, string> = {
  ts: "typescript",
  md: "markdown",
  py: "python",
  st: "pascal",
  c: "c",
  json: "json",
  yaml: "yaml",
};

const SHIKI_LANG_IDS = [...new Set(Object.values(SHIKI_LANGS))];

let highlighter: Highlighter | null = null;

export async function initHighlighter(): Promise<void> {
  highlighter = await createHighlighter({
    themes: [reqlanTheme],
    langs: SHIKI_LANG_IDS,
  });
}

export async function highlightCode(
  code: string,
  language: Exclude<CodeLanguage, "rq">,
): Promise<string> {
  if (!highlighter) {
    await initHighlighter();
  }

  return highlighter!.codeToHtml(code.trimEnd(), {
    lang: SHIKI_LANGS[language],
    theme: "reqlan",
    defaultColor: false,
  });
}

export function highlightCodeSync(
  code: string,
  language: Exclude<CodeLanguage, "rq">,
): string {
  if (!highlighter) {
    throw new Error("Highlighter not initialized. Run generate-highlights first.");
  }

  return highlighter.codeToHtml(code.trimEnd(), {
    lang: SHIKI_LANGS[language],
    theme: "reqlan",
    defaultColor: false,
  });
}
