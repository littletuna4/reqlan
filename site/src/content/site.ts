export type NavItem = {
  id: string;
  label: string;
};

export type SyntaxExample = {
  title: string;
  description: string;
  code: string;
};

export type LinkItem = {
  label: string;
  href: string;
  description?: string;
};

export type Principle = {
  title: string;
  description: string;
};

export const siteContent = {
  meta: {
    title: "reqlan",
    description:
      "Document semantic requirements as code. A structured framework for people working with LLMs.",
  },

  brand: {
    name: "reqlan",
  },

  nav: [
    { id: "motivation", label: "Motivation" },
    { id: "syntax", label: "Syntax" },
    { id: "example", label: "Example" },
    { id: "contact", label: "Contact" },
  ] satisfies NavItem[],

  hero: {
    title: "Document semantic requirements as code",
    subtitle:
      "A structured framework for people working with LLMs — define ideas in .rq files, link them into a graph, and consume them from your editor.",
    tagline: "Ideas, references, and attributes — in .rq files, inside your workflow.",
  },

  motivation: {
    title: "Why reqlan?",
    intro:
      "Requirements scatter across chat logs, docs, and code comments. LLMs need focused, token-efficient context — not whole-repo dumps. Reqlan keeps intent close to your workflow: traceable, editor-native, and designed for humans and models alike.",
    principles: [
      {
        title: "LLM-first",
        description:
          "Designed for token minimisation. Search and expand the requirement graph only as needed.",
      },
      {
        title: "Editor-native",
        description:
          "LSP navigation, validation, and computed views across the requirement graph — right in VS Code and Cursor.",
      },
      {
        title: "General-purpose",
        description:
          "Works in any stack. Simple enough for non-software domains too.",
      },
      {
        title: "Traceable",
        description:
          "Link ideas to files, symbols, and each other. Stop guessing intent from source code alone.",
      },
    ] satisfies Principle[],
    inspiration:
      "Reqlan draws on LLMs, software development, personal knowledge management, industrial control engineering, and ontology-based information systems.",
  },

  syntax: {
    title: "Syntax",
    intro:
      "Reqlan requirement documents use the .rq file suffix. Ideas are the core unit — written as one-liners, blocks, or grouped into ideasets.",
    examples: [
      {
        title: "One-liner idea",
        description: "A name followed by unstructured body text on the same line.",
        code: `my_unbracketed_one_liner_idea ideas should support one liners`,
      },
      {
        title: "Block idea",
        description: "A name followed by curly braces containing a body and optional attributes.",
        code: `myidea {
    It should be a good thing.
}`,
      },
      {
        title: "Attributes, tags, and references",
        description: "Metadata and wiki-style links between ideas.",
        code: `"my idea2" {
    it should be compatible with [[myidea]].

    @status: pending
    @tags: (
        todo
        highpriority
    )
}`,
      },
      {
        title: "Imports and ideasets",
        description: "Compose requirements across files and namespaces.",
        code: `from "main.rq" import myidea
import "./exampleimport.rq"

my_ideaset (
    myidea,
    "my idea2"
)`,
      },
      {
        title: "File and symbol references",
        description: "Link requirements to implementation.",
        code: `["./apythonfile.py"]
["./apythonfile.py".APythonClass.say_hello]`,
      },
    ] satisfies SyntaxExample[],
  },

  example: {
    title: "Example",
    intro:
      "A realistic requirement that imports from other files, links to related ideas, and carries classification metadata.",
    code: `from "main.rq" import myidea
import "./exampleimport.rq"
import "exampleimport2.rq" as exampleimport2

myidea3 {
    application must have something. this should align with [[myidea]]
    and also with [["./exampleimport.rq".myimportableIdea]]

    @tags: (
        style
        accessibility
        performance
    )
    @references: (
        { [[exampleimport2.myimportableIdea]] }
    )
}`,
    caption: "From example_rq_project/sub idea.rq",
  },

  contact: {
    title: "Links",
    intro: "Get in touch or explore the source.",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/littletuna4/reqlan",
        description: "Source, issues, and contributions.",
      },
      {
        label: "Email",
        href: "mailto:reqlan@tony.is-a.dev",
        description: "reqlan@tony.is-a.dev",
      },
    ] satisfies LinkItem[],
  },

  footer: {
    tagline: "A requirement graph for humans and LLMs.",
    copyright: "reqlan",
  },
} as const;

export type SiteContent = typeof siteContent;
