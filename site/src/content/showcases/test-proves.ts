// rq:["../../../../reqlan rq/site/site.rq".test_proves_showcase]
// rq:["../../../../reqlan rq/language/syntax.rq".reference_file]
// rq:["../../../../reqlan rq/language/syntax.rq".comment_reference]
import type { Showcase } from "./types";

export const testProvesShowcase = {
  id: "test-proves",
  title: "What this test actually proves",
  summary:
    "Test-name anchors bind intent to the case. The test file points back.",
  tags: ["testing", "traceability"],
  mechanism: "test-name anchors",
  domain: "Testing",
  tier: "depth",
  blocks: [
    {
      kind: "callout",
      text: "The assertion string is not the requirement. Link them.",
    },
    {
      language: "rq",
      label: "auth/expiry.rq",
      code: `session_expiry {
  expired tokens must reject requests
  refresh is not attempted for an expired access token
  proven by ["./auth.test.ts:rejects expired access token"]
  @status verified
}`,
    },
    {
      language: "ts",
      label: "auth.test.ts",
      // rq-ignore-error
      code: `// rq:["./expiry.rq".session_expiry]
test("rejects expired access token", async () => {
  const res = await request(app)
  .get("/me")
  .set("Authorization", \`Bearer \${expired}\`);
  expect(res.status).toBe(401);
});`,
    },
    {
      kind: "features",
      label: "what the link proves",
      items: [
        "Expired JWT returns 401",
        "Refresh flow is not attempted for expired access tokens",
        "Go-to-definition from the idea lands on the test(...) line",
      ],
    },
  ],
} satisfies Showcase;
