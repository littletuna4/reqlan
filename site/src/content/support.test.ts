import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mailtoWithSubject } from "../lib/mailto.js";
import { getPhonebookLink } from "../lib/phonebook.js";
import { supportLinkHref } from "../lib/support-action.js";
import {
  citationText,
  flattenSupportActions,
  githubPathHref,
  isFeaturedSupportAction,
  isFeaturedSupportGroup,
  marketplaceReviewHref,
  openVsxReviewHref,
  support,
  supportGraphTitle,
  supportGroups,
  supportNodeRadius,
  supportScore,
  supportScoreRange,
} from "./support.js";

function allActions() {
  return support.sections.flatMap((section) => [...section.actions]);
}

describe("support page phonebook wiring", () => {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]
  // rq:["../../../reqlan rq/phonebook.rq".phonebook]

  it("builds mailto subjects without replacing the phonebook address", () => {
    const email = getPhonebookLink("email");
    const href = mailtoWithSubject(email.href, "reqlan sponsorship");
    assert.ok(href.startsWith(email.href));
    assert.match(href, /subject=reqlan(\+|%20)sponsorship/);
  });

  it("derives the issues URL from the phonebook GitHub link", () => {
    const github = getPhonebookLink("github");
    const issues = allActions().find((action) => action.id === "issues");
    assert.equal(issues?.kind, "link");
    if (issues?.kind !== "link") return;
    assert.equal(issues.href, githubPathHref(github.href, "issues"));
    assert.ok(issues.href.startsWith(github.href));
  });

  it("cites the phonebook site and GitHub URLs", () => {
    const site = getPhonebookLink("site");
    const github = getPhonebookLink("github");
    assert.equal(support.citation, citationText(site.href, github.href));
    assert.ok(support.citation.includes(site.href));
    assert.ok(support.citation.includes(github.href));
  });

  it("uses phonebook hrefs for GitHub star, Sponsors, Discord, and share", () => {
    const actions = allActions();
    const star = actions.find((action) => action.id === "star");
    const sponsors = actions.find((action) => action.id === "github-sponsors");
    const discord = actions.find((action) => action.id === "discord");
    const share = actions.find((action) => action.id === "share");

    assert.equal(star?.kind, "link");
    if (star?.kind === "link") {
      assert.equal(star.href, getPhonebookLink("github").href);
    }

    assert.equal(sponsors?.kind, "link");
    if (sponsors?.kind === "link") {
      assert.equal(sponsors.href, getPhonebookLink("github-sponsors").href);
    }

    assert.equal(discord?.kind, "link");
    if (discord?.kind === "link") {
      assert.equal(discord.href, getPhonebookLink("discord").href);
    }

    assert.equal(share?.kind, "share");
    if (share?.kind === "share") {
      assert.equal(share.url, getPhonebookLink("site").href);
    }
  });

  it("derives marketplace and Open VSX review URLs from the phonebook", () => {
    const vsc = getPhonebookLink("vsc");
    const openvsx = getPhonebookLink("openvsx");
    const marketplaceReview = allActions().find(
      (action) => action.id === "vsc-review",
    );
    const openvsxReview = allActions().find(
      (action) => action.id === "openvsx-review",
    );

    assert.equal(marketplaceReview?.kind, "link");
    if (marketplaceReview?.kind === "link") {
      assert.equal(marketplaceReview.href, marketplaceReviewHref(vsc.href));
      assert.ok(marketplaceReview.href.startsWith(vsc.href));
      assert.match(marketplaceReview.href, /#review-details$/);
    }

    assert.equal(openvsxReview?.kind, "link");
    if (openvsxReview?.kind === "link") {
      assert.equal(openvsxReview.href, openVsxReviewHref(openvsx.href));
      assert.ok(openvsxReview.href.startsWith(openvsx.href));
      assert.match(openvsxReview.href, /\/reviews$/);
    }

    assert.equal(supportGraphTitle(marketplaceReview!), "Review:VSC");
    assert.equal(supportGraphTitle(openvsxReview!), "Review:VSX");
  });

  it("opens the phonebook sticker form for FREE stickers", () => {
    const stickers = allActions().find((action) => action.id === "stickers");
    assert.equal(stickers?.kind, "link");
    if (stickers?.kind === "link") {
      assert.equal(stickers.href, getPhonebookLink("sticker-form").href);
    }
    assert.equal(stickers?.title, "FREE stickers");
    assert.equal(stickers?.blurb, "Show the world you're a reqling.");
    assert.equal(supportGraphTitle(stickers!), "FREE Stickers");
  });

  it("ranks actions by ease, with star first", () => {
    const ids = allActions().map((action) => action.id);
    assert.deepEqual(ids, [
      "star",
      "share",
      "discord",
      "citation",
      "issues",
      "certificate",
      "vsc-review",
      "openvsx-review",
      "stickers",
      "email",
      "testimonial",
      "github-sponsors",
      "direct",
    ]);
  });

  it("sends the certificate action to the certs assessment", () => {
    const certificate = allActions().find((action) => action.id === "certificate");
    assert.equal(certificate?.kind, "link");
    if (certificate?.kind !== "link") return;
    assert.equal(certificate.href, "/certs/assessment");
  });
});

describe("support scores and groups", () => {
  // rq:["../../../reqlan rq/site/support-page.rq".support_page]

  it("sizes nodes from impact × ease", () => {
    assert.equal(supportScore(5, 5), 25);
    const actions = flattenSupportActions();
    const star = actions.find((action) => action.id === "star");
    assert.ok(star);
    assert.equal(supportScore(star.ease, star.impact), 25);
    const scores = actions.map((action) =>
      supportScore(action.ease, action.impact),
    );
    assert.equal(Math.max(...scores), supportScore(star.ease, star.impact));
  });

  it("maps the highest score to the largest radius", () => {
    const { min, max } = supportScoreRange(flattenSupportActions());
    assert.ok(supportNodeRadius(max, min, max) > supportNodeRadius(min, min, max));
  });

  it("links every action to a passive original group", () => {
    const groupIds = new Set(supportGroups.map((group) => group.id));
    assert.deepEqual(
      [...groupIds].sort(),
      ["advocacy", "cite", "community", "contribute", "sponsor"].sort(),
    );
    for (const action of flattenSupportActions()) {
      assert.ok(groupIds.has(action.groupId), `${action.id} missing group`);
    }
  });

  it("keeps ease, impact, and score out of table copy", () => {
    assert.deepEqual(Object.keys(support.table), ["action", "group"]);
  });

  it("features star and sponsor tags", () => {
    for (const action of flattenSupportActions()) {
      const featured = isFeaturedSupportAction(action);
      if (action.id === "star" || action.groupId === "sponsor") {
        assert.equal(featured, true, `${action.id} should be featured`);
      } else {
        assert.equal(featured, false, `${action.id} should not be featured`);
      }
    }
    assert.equal(isFeaturedSupportGroup("sponsor"), true);
    assert.equal(isFeaturedSupportGroup("advocacy"), false);
  });

  it("gives every table action a link, copy text, or share URL", () => {
    for (const action of flattenSupportActions()) {
      if (action.kind === "link") {
        assert.ok(supportLinkHref(action).length > 0, `${action.id} missing href`);
      } else if (action.kind === "copy") {
        assert.ok(action.text.length > 0, `${action.id} missing copy text`);
      } else {
        assert.ok(action.url.length > 0, `${action.id} missing share URL`);
      }
    }
  });
});
