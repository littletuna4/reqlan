"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";

import { highlightRqHtml } from "@/lib/rq-highlight";
import { sitePath } from "@/lib/paths";
import "@/styles/reveal-player.css";

const MSG_SOURCE = "reqlan-tutorial";

const slideParser = parseAsInteger.withDefault(1).withOptions({
  history: "replace",
  clearOnDefault: true,
  shallow: true,
});

type SlideContent = {
  kicker?: string;
  heading?: string;
  body?: string;
  code?: string;
  code_lang?: string;
  code_label?: string;
  code_b?: string;
  code_b_lang?: string;
  code_b_label?: string;
  asset?: string;
  fragments?: string[];
};

type Slide = {
  id?: string;
  transition?: string;
  background?: string;
  content?: SlideContent;
  notes?: string;
};

type Deck = {
  id?: string;
  title?: string;
  transition?: string;
  slides?: Slide[];
};

type RevealApi = {
  initialize: (options?: Record<string, unknown>) => Promise<RevealApi> | RevealApi;
  destroy?: () => void;
  next?: () => void;
  prev?: () => void;
  navigateNext?: () => void;
  navigatePrev?: () => void;
  right?: () => void;
  left?: () => void;
  slide?: (h: number, v?: number) => void;
  getIndices?: () => { h: number; v: number };
  getTotalSlides?: () => number;
  isLastSlide?: () => boolean;
  isFirstSlide?: () => boolean;
  availableRoutes?: () => {
    left?: boolean;
    right?: boolean;
    up?: boolean;
    down?: boolean;
  };
  availableFragments?: () => { prev?: boolean; next?: boolean };
  layout?: () => void;
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
  configure?: (options: Record<string, unknown>) => void;
  isReady?: () => boolean;
};

const LANG_CLASS: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  markdown: "markdown",
  txt: "plaintext",
  text: "plaintext",
  plain: "plaintext",
};

const ASSET_EXT: Record<string, string> = {
  logo: "svg",
  "montage-ide": "svg",
  "activity-bar": "svg",
  "chat-search": "svg",
  "file-link": "svg",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetUrl(key: string): string {
  const ext = ASSET_EXT[key] || "svg";
  return sitePath(`/presentations/assets/${encodeURIComponent(key)}.${ext}`);
}

function isReqlanLang(lang?: string): boolean {
  const normalized = (lang || "").toLowerCase();
  return normalized === "rq" || normalized === "reqlan";
}

function languageClass(lang?: string): string {
  if (!lang) return "plaintext";
  return LANG_CLASS[lang.toLowerCase()] || lang.toLowerCase();
}

function renderCodeBlock(
  code: string,
  lang?: string,
  label?: string,
): string {
  const parts: string[] = [];
  if (label) {
    parts.push(`<span class="code-label">${escapeHtml(label)}</span>`);
  }
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";

  if (isReqlanLang(lang)) {
    // Same tokenizer as site RqCode — skip highlight.js for .rq.
    parts.push(
      `<pre class="code"${langAttr}><code class="language-rq nohighlight" data-noescape>${highlightRqHtml(code)}</code></pre>`,
    );
    return parts.join("\n");
  }

  const hljsLang = languageClass(lang);
  parts.push(
    `<pre class="code"${langAttr}><code class="language-${escapeHtml(hljsLang)}" data-trim>${escapeHtml(code)}</code></pre>`,
  );
  return parts.join("\n");
}

function renderSlide(slide: Slide): string {
  const content = slide.content || {};
  const bgClass = slide.background ? `bg-${slide.background}` : "bg-brand-dark";
  const transition = slide.transition || "fade";
  const parts: string[] = [];

  if (content.asset === "logo") {
    parts.push(
      `<img class="slide-asset logo" src="${assetUrl("logo")}" alt="reqlan" width="72" height="72" />`,
    );
  }
  if (content.kicker) {
    parts.push(`<p class="kicker">${escapeHtml(content.kicker)}</p>`);
  }
  if (content.heading) {
    parts.push(`<h2>${escapeHtml(content.heading)}</h2>`);
  }
  if (content.body) {
    parts.push(`<p class="body">${escapeHtml(content.body)}</p>`);
  }
  if (content.code) {
    parts.push(
      renderCodeBlock(content.code, content.code_lang, content.code_label),
    );
  }
  if (content.code_b) {
    parts.push(
      renderCodeBlock(content.code_b, content.code_b_lang, content.code_b_label),
    );
  }
  if (content.asset && content.asset !== "logo") {
    parts.push(
      `<img class="slide-asset" src="${assetUrl(content.asset)}" alt="" />`,
    );
  }
  if (Array.isArray(content.fragments)) {
    for (const fragment of content.fragments) {
      parts.push(
        `<p class="fragment fade-in highlight-cta">${escapeHtml(fragment)}</p>`,
      );
    }
  }
  if (slide.notes) {
    parts.push(`<aside class="notes">${escapeHtml(slide.notes)}</aside>`);
  }

  return `<section data-transition="${escapeHtml(transition)}" class="${bgClass}" data-slide-id="${escapeHtml(slide.id || "")}">${parts.join("\n")}</section>`;
}

function ensureStylesheet(href: string, datasetKey: string): void {
  if (document.querySelector(`link[data-rq-reveal="${datasetKey}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rqReveal = datasetKey;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[data-rq-reveal-src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.rqRevealSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function isFullscreenElement(node: Element | null): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement === node || doc.webkitFullscreenElement === node
  );
}

async function requestFullscreen(node: HTMLElement): Promise<void> {
  const el = node as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (node.requestFullscreen) {
    await node.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen();
  }
}

async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

declare global {
  interface Window {
    Reveal?: RevealApi;
    RevealHighlight?: unknown;
  }
}

export function PresentationPlayer() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deck") || "gs-01-why-reqlan";
  const embedded = searchParams.get("embed") === "1";
  const [urlSlide, setUrlSlide] = useQueryState("slide", slideParser);
  const rootRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<RevealApi | null>(null);
  const applyingFromUrl = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState<string>("");
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const goToSlide = useCallback((index0: number) => {
    const api = revealRef.current ?? window.Reveal;
    if (!api?.slide) return;
    const totalSlides = api.getTotalSlides?.() ?? 0;
    const clamped =
      totalSlides > 0
        ? Math.max(0, Math.min(index0, totalSlides - 1))
        : Math.max(0, index0);
    const current = api.getIndices?.().h;
    if (current === clamped) return;
    api.slide(clamped);
  }, []);

  const syncPosition = useCallback(() => {
    const api = revealRef.current ?? window.Reveal;
    if (!api?.getIndices) return;
    const { h } = api.getIndices();
    setIndex(h);
    const slideTotal = api.getTotalSlides?.() ?? 0;
    setTotal(slideTotal);
    const routes = api.availableRoutes?.() ?? {};
    const fragments = api.availableFragments?.() ?? {};
    const prev =
      Boolean(routes.left || routes.up || fragments.prev) ||
      (typeof api.isFirstSlide === "function" ? !api.isFirstSlide() : h > 0);
    const next =
      Boolean(routes.right || routes.down || fragments.next) ||
      (typeof api.isLastSlide === "function" ? !api.isLastSlide() : true);
    setCanPrev(prev);
    setCanNext(next);

    if (embedded && window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          source: MSG_SOURCE,
          type: "state",
          index: h,
          total: slideTotal,
          canPrev: prev,
          canNext: next,
        },
        window.location.origin,
      );
    } else if (!embedded) {
      applyingFromUrl.current = true;
      void setUrlSlide(h + 1);
    }
  }, [embedded, setUrlSlide]);

  const deckApi = useCallback((): RevealApi | null => {
    return revealRef.current ?? window.Reveal ?? null;
  }, []);

  const goPrev = useCallback(() => {
    const api = deckApi();
    if (!api) return;
    if (typeof api.prev === "function") {
      api.prev();
    } else if (typeof api.navigatePrev === "function") {
      api.navigatePrev();
    } else if (typeof api.left === "function") {
      api.left();
    }
    // Some builds emit slidechanged asynchronously; sync eagerly too.
    syncPosition();
  }, [deckApi, syncPosition]);

  const goNext = useCallback(() => {
    const api = deckApi();
    if (!api) return;
    if (typeof api.next === "function") {
      api.next();
    } else if (typeof api.navigateNext === "function") {
      api.navigateNext();
    } else if (typeof api.right === "function") {
      api.right();
    }
    syncPosition();
  }, [deckApi, syncPosition]);

  useEffect(() => {
    if (!embedded) return;

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== MSG_SOURCE) return;
      if (data.type === "nav") {
        if (data.dir === "prev") goPrev();
        if (data.dir === "next") goNext();
        return;
      }
      if (data.type === "goto") {
        const index0 = Number(data.index);
        if (Number.isFinite(index0)) goToSlide(index0);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded, goPrev, goNext, goToSlide]);

  // Standalone player: honor URL slide changes (back/forward).
  useEffect(() => {
    if (embedded) return;
    if (applyingFromUrl.current) {
      applyingFromUrl.current = false;
      return;
    }
    goToSlide(Math.max(0, urlSlide - 1));
  }, [embedded, urlSlide, goToSlide]);

  useEffect(() => {
    const onFsChange = () => {
      setFullscreen(isFullscreenElement(rootRef.current));
      window.setTimeout(() => deckApi()?.layout?.(), 50);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, [deckApi]);

  useEffect(() => {
    let cancelled = false;
    let onSlideChanged: (() => void) | null = null;

    async function boot() {
      setError(null);
      setIndex(0);
      setTotal(0);
      setCanPrev(false);
      setCanNext(true);
      try {
        ensureStylesheet(
          sitePath("/presentations/vendor/reveal.js/reset.css"),
          "reset",
        );
        ensureStylesheet(
          sitePath("/presentations/vendor/reveal.js/reveal.css"),
          "reveal",
        );

        await loadScript(sitePath("/presentations/vendor/reveal.js/reveal.js"));
        await loadScript(
          sitePath(
            "/presentations/vendor/reveal.js/plugin/highlight/highlight.js",
          ),
        );
        const RevealCtor = window.Reveal;
        const RevealHighlight = window.RevealHighlight;
        if (!RevealCtor) {
          throw new Error("Reveal.js failed to initialize");
        }
        if (!RevealHighlight) {
          throw new Error("Reveal Highlight plugin failed to load");
        }

        const response = await fetch(
          sitePath(`/presentations/decks/${encodeURIComponent(deckId)}.json`),
        );
        if (!response.ok) {
          throw new Error(`Deck not found: ${deckId}`);
        }
        const deck = (await response.json()) as Deck;
        if (cancelled || !slidesRef.current || !rootRef.current) return;

        const revealRoot = rootRef.current.querySelector(".reveal");
        if (!(revealRoot instanceof HTMLElement)) {
          throw new Error("Missing .reveal root");
        }

        setDeckTitle(deck.title || deckId);
        document.title = `reqlan · ${deck.title || deckId}`;
        slidesRef.current.innerHTML = (deck.slides || [])
          .map(renderSlide)
          .join("\n");

        // Singleton initialize mutates window.Reveal into the live deck API.
        await RevealCtor.initialize({
          embedded: true,
          // Parent tutorial URL (or standalone ?slide=) owns position — not Reveal hash.
          hash: false,
          slideNumber: false,
          controls: !embedded,
          controlsTutorial: false,
          controlsLayout: "edges",
          controlsBackArrows: "visible",
          progress: true,
          keyboard: true,
          keyboardCondition: "focused",
          touch: true,
          navigationMode: "linear",
          transition: deck.transition || "fade",
          backgroundTransition: "fade",
          width: 720,
          height: 480,
          margin: 0.04,
          minScale: 0.4,
          maxScale: 2.5,
          center: false,
          plugins: [RevealHighlight],
        });

        if (cancelled) return;

        const api = window.Reveal;
        if (!api?.next && !api?.navigateNext) {
          throw new Error("Reveal.js navigation API unavailable");
        }
        revealRef.current = api;
        onSlideChanged = () => syncPosition();
        api.on?.("slidechanged", onSlideChanged);
        api.on?.("ready", onSlideChanged);
        api.on?.("fragmentshown", onSlideChanged);
        api.on?.("fragmenthidden", onSlideChanged);

        const startFromUrl = Number(
          new URLSearchParams(window.location.search).get("slide") || "1",
        );
        const startIndex = Math.max(
          0,
          (Number.isFinite(startFromUrl) && startFromUrl >= 1
            ? Math.floor(startFromUrl)
            : 1) - 1,
        );
        if (startIndex > 0 && typeof api.slide === "function") {
          api.slide(startIndex);
        }
        syncPosition();

        // Focus so keyboard + chrome buttons share one deck instance.
        revealRoot.tabIndex = 0;
        revealRoot.focus({ preventScroll: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      const api = revealRef.current ?? window.Reveal;
      if (api && onSlideChanged) {
        api.off?.("slidechanged", onSlideChanged);
        api.off?.("ready", onSlideChanged);
        api.off?.("fragmentshown", onSlideChanged);
        api.off?.("fragmenthidden", onSlideChanged);
      }
      api?.destroy?.();
      revealRef.current = null;
    };
  }, [deckId, syncPosition, embedded]);

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (isFullscreenElement(root)) {
        await exitFullscreen();
      } else {
        await requestFullscreen(root);
      }
    } catch {
      // Browser denied fullscreen — ignore.
    }
  };

  if (error) {
    return (
      <div className="presentation-player-error" role="alert">
        {error}
      </div>
    );
  }

  const counter = total > 0 ? `${index + 1} / ${total}` : "—";

  return (
    <div className="presentation-player" ref={rootRef}>
      <div className="reveal">
        <div className="slides" ref={slidesRef} />
      </div>

      <nav className="presentation-chrome" aria-label="Deck chrome">
        <p className="presentation-chrome-title">{deckTitle}</p>
        <div className="presentation-chrome-actions">
          {!embedded && (
            <>
              <button
                type="button"
                className="presentation-chrome-btn"
                onClick={goPrev}
                disabled={!canPrev}
                aria-label="Previous slide"
              >
                {"<"}
              </button>
              <span className="presentation-chrome-counter" aria-live="polite">
                {counter}
              </span>
              <button
                type="button"
                className="presentation-chrome-btn"
                onClick={goNext}
                disabled={!canNext}
                aria-label="Next slide"
              >
                {">"}
              </button>
            </>
          )}
          {embedded && (
            <span className="presentation-chrome-counter" aria-live="polite">
              {counter}
            </span>
          )}
          <button
            type="button"
            className="presentation-chrome-btn presentation-chrome-btn-accent"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={fullscreen}
          >
            {fullscreen ? "Exit full" : "Fullscreen"}
          </button>
        </div>
      </nav>
    </div>
  );
}
