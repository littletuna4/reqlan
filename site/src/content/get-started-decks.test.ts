//rq:["../../../reqlan rq/marketing_and_media/tutorials.rq".get_started_series]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseJsonc } from "../lib/parse-jsonc.ts";
import { tutorialDecks } from "./tutorials.ts";

type SlideContent = {
  heading?: unknown;
  body?: unknown;
  code?: unknown;
  code_b?: unknown;
};

type DeckFile = {
  id?: unknown;
  slides?: unknown;
};

function isSlideContent(value: unknown): value is SlideContent {
  return typeof value === "object" && value !== null;
}

function loadDeck(id: string): DeckFile {
  const path = join(
    process.cwd(),
    "..",
    "presentations",
    "decks",
    `${id}.jsonc`,
  );
  return parseJsonc(readFileSync(path, "utf8")) as DeckFile;
}

function slideIds(deck: DeckFile): string[] {
  assert.ok(Array.isArray(deck.slides), `${String(deck.id)} needs slides`);
  const ids: string[] = [];
  for (const slide of deck.slides) {
    assert.ok(isSlideContent(slide));
    const id = (slide as { id?: unknown }).id;
    assert.ok(typeof id === "string", "every slide needs an id");
    ids.push(id);
  }
  return ids;
}

function contentOf(deck: DeckFile, slideId: string): SlideContent {
  assert.ok(Array.isArray(deck.slides), `${String(deck.id)} needs slides`);
  for (const slide of deck.slides) {
    assert.ok(isSlideContent(slide));
    if ((slide as { id?: unknown }).id === slideId) {
      const content = (slide as { content?: unknown }).content;
      assert.ok(isSlideContent(content), `slide ${slideId} needs content`);
      return content;
    }
  }
  throw new Error(`${String(deck.id)} has no slide ${slideId}`);
}

describe("first-steps walkthrough absorbed into get-started decks", () => {
  const gsDecks = tutorialDecks.filter((deck) => deck.series === "get-started");

  it("keeps the seven get-started decks in the catalog", () => {
    assert.equal(gsDecks.length, 7);
    for (const deck of gsDecks) {
      const file = loadDeck(deck.id);
      assert.equal(file.id, deck.id);
      assert.ok(slideIds(file).length > 0);
    }
  });

  it("gs-02 checks ideas with hover feedback and unique names", () => {
    const deck = loadDeck("gs-02-first-idea");
    const raw = readFileSync(
      join(process.cwd(), "..", "presentations", "decks", "gs-02-first-idea.jsonc"),
      "utf8",
    );
    assert.ok(slideIds(deck).includes("hover"));
    // On-screen copy stays minimal; speaker notes carry the uniqueness rule.
    assert.match(String(contentOf(deck, "hover").heading), /Hover/);
    assert.match(String(contentOf(deck, "hover").body ?? ""), /summary/);
    assert.match(raw, /unique/);
  });

  it("gs-03 shows that broken links fail loudly", () => {
    const deck = loadDeck("gs-03-link-ideas");
    assert.ok(slideIds(deck).includes("broken-link"));
    const broken = contentOf(deck, "broken-link");
    assert.match(String(broken.body ?? ""), /error|red/i);
  });

  it("gs-06 keeps CLI search parity with fuzzy matching", () => {
    const deck = loadDeck("gs-06-chat-search");
    assert.ok(slideIds(deck).includes("cli-parity"));
    const cli = contentOf(deck, "cli-parity");
    assert.match(String(cli.code ?? ""), /reqlan search/);
  });

  it("gs-07 covers symbol references and comment references", () => {
    const deck = loadDeck("gs-07-link-code");
    const ids = slideIds(deck);
    assert.ok(ids.includes("comment-ref"));
    const fileRef = contentOf(deck, "file-ref");
    // Dual pane: file reference beside a symbol-qualified reference.
    assert.match(String(fileRef.code ?? ""), /\["\.\/src\/login\.ts"\]/);
    assert.match(String(fileRef.code_b ?? ""), /\.login\]/);
    const commentRef = contentOf(deck, "comment-ref");
    assert.match(String(commentRef.code ?? ""), /rq: login_api/);
    assert.equal(commentRef.code_lang, "ts");
  });

  it("drops the retired focusflow-demo fixture from get-started", () => {
    for (const deck of gsDecks) {
      const raw = readFileSync(
        join(
          process.cwd(),
          "..",
          "presentations",
          "decks",
          `${deck.id}.jsonc`,
        ),
        "utf8",
      );
      assert.ok(!raw.includes("focusflow"), `${deck.id} must not use focusflow`);
      assert.ok(
        !raw.includes("board.ts"),
        `${deck.id} must not use the board.ts stub`,
      );
    }
  });
});
