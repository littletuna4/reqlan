// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps]
// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_steps_page]
// rq:["../../../reqlan rq/marketing_and_media/first-steps.rq".first_step_order]
// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".accurate_rq_snippets_must_parse]

export const firstStepsPath = "/tutorials/first-steps";

export type FirstStepsDemoLanguage = "rq" | "ts" | "sh";

export type FirstStepsDemo = {
  label: string;
  language: FirstStepsDemoLanguage;
  code: string;
};

export type FirstStepsLessonLink = {
  /** Slug of a deck under /tutorials/[slug]. */
  id: string;
  label: string;
};

export type FirstStepsStep = {
  id: string;
  title: string;
  goal: string;
  actions: readonly string[];
  demo?: FirstStepsDemo;
  result: string;
  lesson: FirstStepsLessonLink;
};

export type FirstStepsContent = {
  title: string;
  kicker: string;
  intro: string;
  timeEstimate: string;
  workspaceName: string;
  steps: readonly FirstStepsStep[];
};

export const firstStepsContent: FirstStepsContent = {
  title: "First steps",
  kicker: "Start here",
  intro:
    "Install reqlan, write your first ideas, and link them to your code. Each step takes a minute and shows its result.",
  timeEstimate: "About 20 minutes",
  workspaceName: "focusflow-demo",
  steps: [
    {
      id: "fs-01-install",
      title: "Install reqlan",
      goal: "The extension runs in your editor, and your folder is open.",
      actions: [
        "Open the Extensions view in your editor.",
        "Search for \"reqlan\".",
        "Select Install.",
        "Open your project folder. An empty folder works.",
      ],
      result:
        "The reqlan icon shows in the activity bar, and the welcome page offers docs links.",
      lesson: { id: "gs-01-why-reqlan", label: "Why requirements as code" },
    },
    {
      id: "fs-02-create-a-base",
      title: "Create your first base",
      goal: "Your ideas get one home index.",
      actions: [
        "Run `reqlan init` in the workspace root.",
        "Check that a `.reqlan` folder appears with `config.json` inside.",
      ],
      demo: {
        label: "Terminal",
        language: "sh",
        code: "reqlan init",
      },
      result:
        "A `.reqlan` folder marks this folder as one ideas graph. The index fills up as you write.",
      lesson: { id: "gs-04-first-base", label: "Your first base" },
    },
    {
      id: "fs-03-write-your-first-idea",
      title: "Write your first idea",
      goal: "One file holds your first named requirements.",
      actions: [
        "Create a file `reqs/product.rq`.",
        "Type the demo below.",
        "Hover each name. The editor shows its summary text.",
      ],
      demo: {
        label: "reqs/product.rq",
        language: "rq",
        code: `product_name FocusFlow is a small task board for a five person team

welcome_flow {
    A new user opens the board and adds their first task.
    No account is needed for the first task.
}`,
      },
      result:
        "Two ideas exist: a one-line idea and a block idea. Names stay unique in the file.",
      lesson: { id: "gs-02-first-idea", label: "Your first idea" },
    },
    {
      id: "fs-04-add-an-attribute",
      title: "Add an attribute",
      goal: "Status and tags describe work state.",
      actions: [
        "Add `@status draft` inside `welcome_flow`.",
        "Add a tags line below it.",
      ],
      demo: {
        label: "reqs/product.rq",
        language: "rq",
        code: `welcome_flow {
    A new user opens the board and adds their first task.
    No account is needed for the first task.

    @status draft
    @tags (onboarding)
}`,
      },
      result:
        "Status and tags show in hover summaries, and search can filter on them.",
      lesson: {
        id: "adv-02-attributes-status-plans",
        label: "Attributes, status, and plans",
      },
    },
    {
      id: "fs-05-reference-another-idea",
      title: "Reference another idea",
      goal: "Two ideas link, so tools can walk between them.",
      actions: [
        "Add an `onboarding_checklist` idea below `welcome_flow`.",
        "Point `welcome_flow` at it with a wikilink.",
        "Ctrl+click the target name to jump. Cmd+click on macOS.",
      ],
      demo: {
        label: "reqs/product.rq",
        language: "rq",
        code: `welcome_flow {
    A new user opens the board and adds their first task.
    Needs [[onboarding_checklist]] before launch.

    @status draft
}

onboarding_checklist {
    Show three steps: add a task, invite the team, set a due date.
}`,
      },
      result:
        "Each idea lists the other as a neighbour. A misspelled target shows an error.",
      lesson: { id: "gs-03-link-ideas", label: "Link ideas" },
    },
    {
      id: "fs-06-reference-a-code-file",
      title: "Reference real code",
      goal: "An idea points at the function that implements part of it.",
      actions: [
        "Create a stub file `src/board.ts` with a `renderEmptyBoard` function.",
        'Add a path reference `["../src/board.ts".renderEmptyBoard]` inside `welcome_flow`.',
      ],
      demo: {
        label: "reqs/product.rq",
        language: "rq",
        code: `welcome_flow {
    A new user opens the board and adds their first task.
    The empty state renders in ["../src/board.ts".renderEmptyBoard].

    @status draft
}`,
      },
      result:
        "The link resolves because the file and symbol exist. Broken paths show errors.",
      lesson: { id: "gs-07-link-code", label: "Link code" },
    },
    {
      id: "fs-07-cross-reference-from-a-code-comment",
      title: "Cross-reference from a code comment",
      goal: "Code points back at the requirement it serves.",
      actions: [
        "Open `src/board.ts`.",
        "Type an `rq:` comment above `renderEmptyBoard`.",
      ],
      demo: {
        label: "src/board.ts",
        language: "ts",
        code: `// rq: welcome_flow - keep the empty state aligned with this idea
export function renderEmptyBoard() {
    return [];
}`,
      },
      result:
        "The comment resolves to `welcome_flow`. Navigation works from both directions.",
      lesson: { id: "adv-05-comment-references", label: "Comment references" },
    },
    {
      id: "fs-08-see-your-neighbourhood",
      title: "See your neighbourhood",
      goal: "Local context follows your caret.",
      actions: [
        "Leave the caret inside `welcome_flow`.",
        "Select the reqlan icon in the activity bar.",
        "Read the neighbour list. Sync follows the caret; hop depth sets the reach.",
      ],
      result:
        "The panel shows `onboarding_checklist` and the code reference as neighbours.",
      lesson: {
        id: "gs-05-activity-bar",
        label: "Neighbourhood in the activity bar",
      },
    },
    {
      id: "fs-09-open-the-graph",
      title: "Open the graph",
      goal: "You see the same ideas as a map.",
      actions: [
        "Open Ideas Summary or the graph view from the activity bar panel.",
      ],
      result:
        "Three nodes appear, connected by their references. Small graphs stay readable.",
      lesson: { id: "adv-03-ideas-summary-graph", label: "Ideas summary graph" },
    },
    {
      id: "fs-10-find-requirements-for-code",
      title: "Find requirements for a code file",
      goal: "You ask which requirements relate to one source file.",
      actions: [
        "Run the analyse command for `src/board.ts` in the workspace root.",
        "Read the matched ideas.",
      ],
      demo: {
        label: "Terminal",
        language: "sh",
        code: "reqlan analyse --file src/board.ts",
      },
      result:
        "`welcome_flow` comes back, through the reference you wrote two steps ago.",
      lesson: { id: "con-03-cli", label: "The CLI" },
    },
    {
      id: "fs-11-import-across-files",
      title: "Import across files",
      goal: "Ideas connect across files and folders.",
      actions: [
        "Create `reqs/auth.rq` with a `login_rules` idea.",
        "Import it into `product.rq`, then reference it.",
      ],
      demo: {
        label: "reqs/product.rq",
        language: "rq",
        code: `from "./auth.rq" import login_rules
import "./auth.rq" as auth

password_reset {
    Follows [login_rules] and every rule under [auth].
    Applies to flows in ["./src/**/*.ts".*_flow].
}`,
      },
      result: "Cross-file references resolve like local ones.",
      lesson: { id: "adv-01-imports-ideasets", label: "Imports and ideasets" },
    },
    {
      id: "fs-12-export-to-html",
      title: "Export to HTML",
      goal: "People without the extension can read your base.",
      actions: ["Run `reqlan export html`.", "Open the produced file in a browser."],
      demo: {
        label: "Terminal",
        language: "sh",
        code: "reqlan export html",
      },
      result:
        "A static report lists ideas, statuses, and links. You can share the file.",
      lesson: { id: "adv-06-html-export", label: "HTML export" },
    },
    {
      id: "fs-13-search-for-an-idea",
      title: "Search for an idea",
      goal: "Names come back fast, even with typos.",
      actions: [
        "Search from the command palette, or run the search command.",
      ],
      demo: {
        label: "Terminal",
        language: "sh",
        code: "reqlan search checklist",
      },
      result: "`onboarding_checklist` comes back as the top hit.",
      lesson: { id: "gs-06-chat-search", label: "Ask @reqlan" },
    },
    {
      id: "fs-14-trace-an-idea",
      title: "Trace an idea",
      goal: "You can answer: what breaks if this changes?",
      actions: [
        "Walk one hop out from `welcome_flow`: what it points at.",
        "Walk one hop in: what points at it.",
        "Use the activity bar panel, the local graph, or the analyse command.",
      ],
      demo: {
        label: "Terminal",
        language: "sh",
        code: "reqlan analyse --idea welcome_flow",
      },
      result:
        "Outbound and inbound neighbours list in one view. That list is your blast radius.",
      lesson: {
        id: "adv-04-context-and-tokens",
        label: "Context and tokens",
      },
    },
  ] satisfies readonly FirstStepsStep[],
};
