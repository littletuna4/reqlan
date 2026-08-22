import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPhonebookLink } from "./phonebook.js";
import { googleFormEmbedSrc } from "./google-form-embed.js";

describe("googleFormEmbedSrc", () => {
  it("converts the phonebook sticker-form href into an embed src", () => {
    const sticker = getPhonebookLink("sticker-form");
    const src = googleFormEmbedSrc(sticker.href);
    const url = new URL(src);
    assert.equal(url.hostname, "docs.google.com");
    assert.match(url.pathname, /\/forms\/d\/e\/[^/]+\/viewform$/);
    assert.equal(url.searchParams.get("embedded"), "true");
  });

  it("adds embedded=true to a viewform URL", () => {
    const src = googleFormEmbedSrc(
      "https://docs.google.com/forms/d/e/1FAIpQLSeku06TWWmKPQ8F6npWxOf7LhwRgQ5cz2hmlFRbcn-UVzB0-w/viewform?usp=send_form",
    );
    const url = new URL(src);
    assert.equal(url.searchParams.get("embedded"), "true");
    assert.equal(url.searchParams.get("usp"), null);
  });

  it("rejects an unknown href", () => {
    assert.throws(() => googleFormEmbedSrc("https://example.com/form"), /Not a Google Form/);
  });
});
