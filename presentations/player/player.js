import Reveal from "../vendor/reveal.js/reveal.esm.js";
import RevealHighlight from "../vendor/reveal.js/plugin/highlight/highlight.esm.js";

const ASSET_EXT = {
  logo: "svg",
  "montage-ide": "png",
  "activity-bar": "png",
  "chat-search": "png",
  "file-link": "png",
};

const ASSET_SHAPE = {
  logo: "logo",
  "activity-bar": "portrait",
  "chat-search": "portrait",
  "montage-ide": "landscape",
  "file-link": "landscape",
};

const LANG_CLASS = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  md: "markdown",
  markdown: "markdown",
  txt: "plaintext",
  text: "plaintext",
  plain: "plaintext",
  bash: "bash",
  sh: "bash",
};

function deckIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get("deck") || "gs-01-why-reqlan";
}

/** Strip line/block comments outside strings, plus trailing commas. */
function stripJsonc(text) {
  let result = "";
  let i = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  while (i < text.length) {
    const c = text[i];

    if (inString) {
      result += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) inString = false;
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
      while (i < text.length && text[i] !== "\n") i += 1;
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

function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetUrl(key) {
  const ext = ASSET_EXT[key] || "svg";
  return `../assets/${encodeURIComponent(key)}.${ext}`;
}

function assetShape(key) {
  return ASSET_SHAPE[key] || "landscape";
}

function isReqlanLang(lang) {
  const normalized = String(lang || "").toLowerCase();
  return normalized === "rq" || normalized === "reqlan";
}

function languageClass(lang) {
  if (!lang) return "plaintext";
  return LANG_CLASS[lang.toLowerCase()] || lang.toLowerCase();
}

function renderCodeBlock(code, lang, label) {
  const parts = [];
  if (label) {
    parts.push(`<span class="code-label">${escapeHtml(label)}</span>`);
  }
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
  // Site embed uses site/src/lib/rq-highlight.ts; local shell keeps .rq unstyled.
  if (isReqlanLang(lang)) {
    parts.push(
      `<pre class="code"${langAttr}><code class="language-rq nohighlight" data-noescape>${escapeHtml(code)}</code></pre>`,
    );
    return parts.join("\n");
  }
  const hljsLang = languageClass(lang);
  parts.push(
    `<pre class="code"${langAttr}><code class="language-${escapeHtml(hljsLang)}" data-trim>${escapeHtml(code)}</code></pre>`,
  );
  return parts.join("\n");
}

function renderSlide(slide) {
  const content = slide.content || {};
  const bgClass = slide.background ? `bg-${slide.background}` : "bg-brand-dark";
  const transition = slide.transition || "fade";
  const mediaKey =
    content.asset && content.asset !== "logo" ? content.asset : undefined;
  const shape = mediaKey ? assetShape(mediaKey) : undefined;
  const hasCode = Boolean(content.code || content.code_b);

  const copy = [];
  if (content.asset === "logo") {
    copy.push(
      `<img class="slide-asset logo" src="${assetUrl("logo")}" alt="reqlan" width="96" height="96" />`,
    );
  }
  if (content.kicker) {
    copy.push(`<p class="kicker">${escapeHtml(content.kicker)}</p>`);
  }
  if (content.heading) {
    copy.push(`<h2>${escapeHtml(content.heading)}</h2>`);
  }
  if (content.body) {
    copy.push(`<p class="body">${escapeHtml(content.body)}</p>`);
  }
  if (content.code) {
    copy.push(
      renderCodeBlock(content.code, content.code_lang, content.code_label),
    );
  }
  if (content.code_b) {
    copy.push(
      renderCodeBlock(content.code_b, content.code_b_lang, content.code_b_label),
    );
  }
  if (Array.isArray(content.fragments)) {
    for (const fragment of content.fragments) {
      copy.push(
        `<p class="fragment fade-in highlight-cta">${escapeHtml(fragment)}</p>`,
      );
    }
  }

  const notes = slide.notes
    ? `<aside class="notes">${escapeHtml(slide.notes)}</aside>`
    : "";

  let bodyHtml;
  if (mediaKey && shape) {
    const media = `<figure class="slide-media"><img class="slide-asset slide-asset--${shape}" src="${assetUrl(mediaKey)}" alt="" /></figure>`;
    const layout =
      shape === "portrait"
        ? "slide-layout slide-layout--split-portrait"
        : hasCode
          ? "slide-layout slide-layout--split-landscape"
          : "slide-layout slide-layout--stack-landscape";
    bodyHtml = `<div class="${layout}"><div class="slide-copy">${copy.join("\n")}</div>${media}</div>`;
  } else {
    bodyHtml = `<div class="slide-layout slide-layout--copy">${copy.join("\n")}</div>`;
  }

  return `<section data-transition="${escapeHtml(transition)}" class="${bgClass}" data-slide-id="${escapeHtml(slide.id || "")}">${bodyHtml}${notes}</section>`;
}

function showError(message) {
  const el = document.getElementById("deck-error");
  el.style.display = "block";
  el.textContent = message;
  document.querySelector(".reveal")?.setAttribute("hidden", "true");
}

async function main() {
  const deckId = deckIdFromQuery();
  document.title = `reqlan · ${deckId}`;

  let deck;
  try {
    const response = await fetch(`../decks/${encodeURIComponent(deckId)}.jsonc`);
    if (!response.ok) {
      throw new Error(`Deck not found: ${deckId}`);
    }
    deck = parseJsonc(await response.text());
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
    return;
  }

  document.title = `reqlan · ${deck.title || deckId}`;
  const slidesRoot = document.getElementById("slides");
  slidesRoot.innerHTML = (deck.slides || []).map(renderSlide).join("\n");

  await Reveal.initialize({
    hash: true,
    slideNumber: false,
    controls: true,
    progress: true,
    transition: deck.transition || "fade",
    backgroundTransition: "fade",
    width: 960,
    height: 540,
    margin: 0.08,
    plugins: [RevealHighlight],
  });
}

main();
