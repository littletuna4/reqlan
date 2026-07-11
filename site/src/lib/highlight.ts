import {
  createCssVariablesTheme,
  createHighlighter,
  type Highlighter,
} from "shiki";
import type { CodeLanguage } from "@/content/site";

const reqlanTheme = createCssVariablesTheme({
  name: "reqlan",
  variablePrefix: "--code-",
});

const SHIKI_LANGS: Record<Exclude<CodeLanguage, "rq">, string> = {
  ts: "typescript",
  md: "markdown",
  py: "python",
};

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [reqlanTheme],
      langs: ["typescript", "markdown", "python"],
    });
  }

  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  language: Exclude<CodeLanguage, "rq">,
): Promise<string> {
  const highlighter = await getHighlighter();

  return highlighter.codeToHtml(code.trimEnd(), {
    lang: SHIKI_LANGS[language],
    theme: "reqlan",
    defaultColor: false,
  });
}
