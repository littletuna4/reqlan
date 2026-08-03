/** Minimal JSONC parse: line comments, block comments outside strings, trailing commas. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}

export function stripJsonc(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  while (i < text.length) {
    const c = text[i]!;

    if (inString) {
      result += c;
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === quote) {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      result += c;
      i += 1;
      continue;
    }

    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i + 1 < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }

    result += c;
    i += 1;
  }

  return result.replace(/,(\s*[}\]])/g, "$1");
}
