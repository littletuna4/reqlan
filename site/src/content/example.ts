// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".example_section]
// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]

export const example = {
  title: "A slice of a real graph",
  lead: "Imports, file anchors, wildcards, wikilinks, status, tags, and tests - one idea that tools can find.",
  code: `from "auth.rq" import login
import "./session.rq" as session

session_refresh {
    refresh tokens rotate on use
    aligns with [session.session_expiry] and [login]
    related panes ["./ui/**/*.rq".*_pane]
    implemented in ["./src/auth/session.ts".rotateRefresh]
    proven by ["./src/auth/session.test.ts:rejects reused refresh token"]

    @status in-progress
    @tags (auth, security)
    @todo reject reuse of the old refresh token
}`,
} as const;
