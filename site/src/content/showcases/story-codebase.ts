// rq:["../../../../reqlan rq/site/site.rq".story_codebase_showcase]
// rq:["../../../../reqlan rq/development/core.rq".code_comment_references]
// rq:["../../../../reqlan rq/development/core.rq".testing]
// rq:["../../../../reqlan rq/cli/click.rq".click]
import type { Showcase } from "./types";

export const storyCodebaseShowcase = {
  id: "story-codebase",
  title: "The story that ships with the code",
  summary:
    "Write the feature in .rq. @implementation and @tests name the files. rq: comments point back.",
  tags: ["story", "traceability", "delivery"],
  mechanism: "story ↔ source ↔ tests",
  domain: "Product delivery",
  tier: "flagship",
  blocks: [
    {
      kind: "callout",
      text: "The story is an idea in the repo. Click returns the bound files.",
    },
    {
      language: "rq",
      label: "booking/seat.rq",
      code: `seat_hold {
  A selected seat stays reserved for eight minutes.
  Payment confirms the hold. Expiry returns the seat to sale.
  @status done
  @implementation (
      ["./src/booking/hold.ts".startHold]
      ["./src/booking/hold.ts".releaseExpired]
  )
  @tests (
      ["./src/booking/hold.test.ts:releases the seat after eight minutes"]
  )
}`,
    },
    {
      language: "ts",
      label: "src/booking/hold.ts",
      // rq-ignore-error
      code: `// rq:["../booking/seat.rq".seat_hold]
const HOLD_MS = 8 * 60 * 1000;

export function startHold(seatId: string, now: number): Hold {
  return { seatId, expiresAt: now + HOLD_MS };
}

export function releaseExpired(hold: Hold, now: number): boolean {
  return now >= hold.expiresAt;
}`,
    },
    {
      language: "ts",
      label: "src/booking/hold.test.ts",
      // rq-ignore-error
      code: `// rq:["../booking/seat.rq".seat_hold]
test("releases the seat after eight minutes", () => {
  const hold = startHold("A12", 0);
  expect(releaseExpired(hold, 8 * 60 * 1000)).toBe(true);
});`,
    },
    {
      kind: "exchange",
      label: "reqlan click",
      query: `click({ target: "seat_hold" })`,
      response: `sessionKey: clk-1  kind: unique
file: booking/seat.rq
idea: seat_hold
outbound (2): startHold, releaseExpired
commentRefs (2): hold.ts, hold.test.ts
  slice: 1 idea · 2 files · ~200 tokens`,
    },
  ],
} satisfies Showcase;
