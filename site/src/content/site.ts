export type NavItem = {
  id: string;
  label: string;
};

export type SyntaxExample = {
  label: string;
  code: string;
};

export type LinkItem = {
  label: string;
  href: string;
};

export type MotivationTab = {
  id: string;
  label: string;
  code: string;
};

export const siteContent = {
  meta: {
    title: "reqlan",
    description: "Semantic requirements as code.",
  },

  brand: {
    name: "reqlan",
  },

  nav: [
    { id: "motivation", label: "Motivation" },
    { id: "syntax", label: "Syntax" },
    { id: "example", label: "Example" },
    { id: "contact", label: "Links" },
  ] satisfies NavItem[],

  hero: {
    snippet: `auth {
    login must use oauth
    @status: in-progress
}`,
  },

  cta: {
    label: "Install extension",
    href: "https://marketplace.visualstudio.com/items?itemName=btdigital.vscode-reqlan-extension",
  },

  motivation: {
    tabs: [
      {
        id: "llm-first",
        label: "LLM-first",
        code: `# /rq-search oauth flow
→ auth.login
→ auth.session
→ auth.logout

# not: dump the whole repo`,
      },
      {
        id: "editor-native",
        label: "Editor-native",
        code: `auth.login ──► session.rq:12
              └──► [[auth.logout]]

# LSP, inlay hints, command palette`,
      },
      {
        id: "traceable",
        label: "Traceable",
        code: `login {
    aligns with [[auth.session]]
    implemented in ["./auth.ts".login]
}`,
      },
      {
        id: "any-stack",
        label: "Any stack",
        code: `safety_interlock {
    valve must close before heater enables
    @tags: (iec-61131, critical)
}`,
      },
    ] satisfies MotivationTab[],
  },

  syntax: {
    examples: [
      {
        label: "one-liner",
        code: `my_idea ideas support one liners`,
      },
      {
        label: "block",
        code: `myidea {
    It should be a good thing.
}`,
      },
      {
        label: "links & attributes",
        code: `"my idea2" {
    compatible with [[myidea]]
    @status: pending
    @tags: (todo, highpriority)
}`,
      },
      {
        label: "imports",
        code: `from "main.rq" import myidea
import "./exampleimport.rq"

my_ideaset (myidea, "my idea2")`,
      },
      {
        label: "file refs",
        code: `["./apythonfile.py"]
["./apythonfile.py".APythonClass.say_hello]`,
      },
    ] satisfies SyntaxExample[],
  },

  example: {
    code: `from "main.rq" import myidea
import "./exampleimport.rq"
import "exampleimport2.rq" as exampleimport2

myidea3 {
    application must have something. this should align with [[myidea]]
    and also with [["./exampleimport.rq".myimportableIdea]]

    @tags: (style, accessibility, performance)
    @references: ({ [[exampleimport2.myimportableIdea]] })
}`,
  },

  contact: {
    links: [
      {
        label: "Extension",
        href: "https://marketplace.visualstudio.com/items?itemName=btdigital.vscode-reqlan-extension",
      },
      {
        label: "GitHub",
        href: "https://github.com/littletuna4/reqlan",
      },
      {
        label: "Email",
        href: "mailto:reqlan@tony.is-a.dev",
      },
    ] satisfies LinkItem[],
  },

  footer: {
    copyright: "reqlan",
  },
} as const;

export type SiteContent = typeof siteContent;
