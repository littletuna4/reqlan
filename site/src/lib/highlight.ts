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

let highlighter: Highlighter | null = null;

export async function initHighlighter(): Promise<void> {
  highlighter = await createHighlighter({
    themes: [reqlanTheme],
    langs: ["typescript", "markdown", "python"],
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
