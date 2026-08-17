// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".motivation_section]
import type { MotivationSlide } from "@/content/types";

export const motivation = {
  title: "What is reqlan?",
  lead: "A token efficient data format for writing functional requirments - supporting personal knowledge management inspired naming linking and tagging, plus an editor extension and a CLI on the same index. Engineers who wrangle complexity use it so they can focus on describing their highest-alpha ideas.",
  slides: [
    {
      id: "language",
      label: "Language",
      what: "`.rq` files: a name, a short body, links to ideas, code, and tests.",
      why: "You write the alpha. Everything else points back to it. No more hunting the “real” rule in a six-month-old chat.",
      features: [
        {
          id: "named-ideas",
          label: "Names",
          what: "`auth.login` beats “that password thing from the deck.”",
          why: "Handles survive threads. Paragraphs don't.",
        },
        {
          id: "links",
          label: "Links",
          what: "Ideas cite other ideas, source files, tests - or a path+name pattern that fans out.",
          why: "Ask “what depends on this?” and get an answer, not a wiki hike.",
        },
        {
          id: "attributes",
          label: "Status",
          what: "`@status`, `@todo`, `@tests` sit next to the prose.",
          why: "Status lives with the requirement. Not in a sheet nobody opens.",
        },
      ],
    },
    {
      id: "extension",
      label: "Extension",
      what: "VS Code / Cursor: language server, graph views, agent hooks - one `.reqlan` index.",
      why: "Complexity shows up where you already type. Catch dead links before review does.",
      features: [
        {
          id: "lsp",
          label: "LSP",
          what: "Go-to-def, find refs, validation on `.rq` - wildcards open a match panel, not a guess.",
          why: "A red squiggle today beats a surprised PM tomorrow.",
        },
        {
          id: "graph-views",
          label: "Graph",
          what: "Ideas Summary and a neighbourhood scoped to the file you have open.",
          why: "You need the slice in front of you - not the whole galaxy.",
        },
        {
          id: "agent-hooks",
          label: "Agents",
          what: "@reqlan chat, MCP tools, rq-* skills.",
          why: "Feed the model six linked ideas. Not forty files of noise.",
        },
      ],
    },
    {
      id: "cli",
      label: "CLI",
      what: "`reqlan` / `rq` - search, analyse, export. Same index as the extension.",
      why: "Terminals and CI ask the editor's questions. No twin database to drift.",
      features: [
        {
          id: "search",
          label: "Search",
          what: "`reqlan search oauth` hits the workspace index.",
          why: "Scripts get the same ranked ideas your IDE shows.",
        },
        {
          id: "analyse",
          label: "Analyse",
          what: "`reqlan analyse` rebuilds and checks the graph.",
          why: "Broken refs fail the pipeline, not the demo.",
        },
        {
          id: "export",
          label: "Export",
          what: "HTML, JSON, Markdown or CSV from the live graph.",
          why: "Handoffs ship what you see now - not last quarter's export.",
        },
      ],
    },
    {
      id: "mcp",
      label: "MCP",
      what: "Chat tools on the same `.reqlan` index as the editor.",
      why: "Hand the model a linked slice. Keep the rest of the repo out of the prompt.",
      features: [
        {
          id: "mcp-search",
          label: "Search",
          what: "Ask for oauth. Get ranked ideas.",
          why: "The model finds the handle. Not a wall of grep.",
        },
        {
          id: "file-context",
          label: "Context",
          what: "The rules that bind the file in front of you.",
          why: "Six linked ideas. Not forty files of noise.",
        },
        {
          id: "local-graph",
          label: "Graph",
          what: "A neighbourhood around one idea - then a short summary.",
          why: "The slice the model needs. Not the galaxy.",
        },
      ],
    },
  ] satisfies MotivationSlide[],
} as const;
