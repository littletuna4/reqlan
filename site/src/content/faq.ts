// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".faq_page]
// rq:["../../../reqlan rq/site/site.rq".faq_drift]
// rq:["../../../reqlan rq/site/support-page.rq".support_page]
import type { FaqItem, FaqSupportLink } from "@/content/types";

export const faq = {
  title: "FAQ",
  lead: "Short answers. Links, not lectures.",
  items: [
    {
      id: "token-efficiency",
      question: "How does reqlan support token efficiency?",
      answer:
        "Named ideas and edges are the unit of context - not whole files. Agents get a small linked slice (MCP tools, chat, skills) instead of a repo dump. Barrel imports and scoped graph views keep the same discipline for humans.",
    },
    {
      id: "de-facto-standard",
      question:
        "Is reqlan the de facto standard for efficient developer-centric context management and semantic mapping?",
      answer:
        "No. It is an open toolset for that job - a graph of named requirements your IDE and agents can search and link. Use it where the fit is clear; it is not claiming industry-wide default status.",
    },
    {
      id: "when-to-use",
      question: "When should I use reqlan?",
      answer:
        "When requirements sprawl across chats, wikis, and code comments, and you want one writable graph that stays next to the code - for yourself, a team, or an agent that should stop re-explaining the system every sprint.",
    },
    {
      id: "drift",
      question:
        "How do you keep .rq files from drifting once the code moves on?",
      answer:
        "Treat .rq files as code - the source of truth, not a document. Specify material work as an idea first. Implementation and tests point back with rq: comments. A check requires every test to serve a requirement. Agents see only the ideas attached to the files they touch. Mark a replaced idea deprecated and point to the new one. The indexer flags missing references like a compile check.",
    },
    {
      id: "support-reqlan",
      question: "How can I support reqlan?",
      answer:
        "Star the GitHub repo, leave a marketplace review, sponsor, contribute, cite, join Discord, or share. The Support page has the full list.",
      page: { href: "/support", label: "Support page" },
      links: [
        { id: "github", label: "GitHub (stars, issues, PRs)" },
        { id: "vsc", label: "VS Marketplace (stars)" },
        { id: "github-sponsors", label: "Sponsor" },
        { id: "discord", label: "Discord" },
      ] satisfies FaqSupportLink[],
    },
    {
      id: "agents-md-comparison",
      question: "How does reqlan context compare to AGENTS.md?",
      answer:
        "reqlan can provide the same function as AGENTS.md, but with more pointed control over the scope.",
    },
  ] satisfies FaqItem[],
} as const;
