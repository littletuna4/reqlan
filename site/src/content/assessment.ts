// rq:["../../../reqlan rq/site/certs.rq".assessment]
// rq:["../../../reqlan rq/site/certs.rq".assessment_page]
// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/ontology.rq".idea]
// rq:["../../../reqlan rq/core_analysis/check.rq".check]

export type AssessmentChoice = {
  id: string;
  label: string;
};

export type AssessmentQuestion = {
  id: string;
  prompt: string;
  choices: AssessmentChoice[];
  correctChoiceId: string;
};

export type AssessmentSection = {
  id: string;
  title: string;
  questions: AssessmentQuestion[];
};

export type Assessment = {
  id: string;
  title: string;
  blurb: string;
  sections: AssessmentSection[];
};

/** Pass when correct / total >= this ratio. */
export const PASS_RATIO = 0.8;

/** Current sole assessment id. Also the display target for legacy tokens. */
export const CORE_ASSESSMENT_ID = "core";

export function assessmentQuestions(
  assessment: Assessment,
): AssessmentQuestion[] {
  return assessment.sections.flatMap((section) => section.questions);
}

const coreSections: AssessmentSection[] = [
  {
    id: "ontology",
    title: "Ontology",
    questions: [
      {
        id: "ontology-idea",
        prompt: "What is the core unit in reqlan?",
        choices: [
          { id: "a", label: "A named idea" },
          { id: "b", label: "A chat prompt" },
          { id: "c", label: "A VS Code setting" },
          { id: "d", label: "A Git commit" },
        ],
        correctChoiceId: "a",
      },
      {
        id: "ontology-base",
        prompt: "What marks a directory as a reqlan base?",
        choices: [
          { id: "a", label: "Any folder with .rq files" },
          { id: "b", label: "Installing the extension" },
          { id: "c", label: "A .reqlan folder there" },
          { id: "d", label: "A README that mentions reqlan" },
        ],
        correctChoiceId: "c",
      },
      {
        id: "ontology-ideaset",
        prompt: "What is an ideaset?",
        choices: [
          { id: "a", label: "A required form on every idea" },
          { id: "b", label: "A namespace container for related ideas" },
          { id: "c", label: "The Ideas Summary export format" },
          { id: "d", label: "A folder that must contain package.json" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "ontology-attribute",
        prompt: "What is an @status line on an idea?",
        choices: [
          { id: "a", label: "A second idea that replaces the first" },
          { id: "b", label: "Metadata on the idea" },
          { id: "c", label: "A VS Code theme" },
          { id: "d", label: "The only way to name an idea" },
        ],
        correctChoiceId: "b",
      },
    ],
  },
  {
    id: "installation",
    title: "Installation",
    questions: [
      {
        id: "install-layers",
        prompt: "Which statement is true about install?",
        choices: [
          { id: "a", label: "Extension install creates a base" },
          {
            id: "b",
            label: "Extension install and base create are separate",
          },
          { id: "c", label: "CLI init installs the extension" },
          { id: "d", label: "Bases only exist in the marketplace package" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "install-init",
        prompt: "How do you create a base in a workspace?",
        choices: [
          { id: "a", label: "Run reqlan init" },
          { id: "b", label: "Star the GitHub repo" },
          { id: "c", label: "Open package.json" },
          { id: "d", label: "Export HTML" },
        ],
        correctChoiceId: "a",
      },
    ],
  },
  {
    id: "syntax",
    title: "Syntax",
    questions: [
      {
        id: "syntax-body",
        prompt: "What is the main body of a block idea?",
        choices: [
          { id: "a", label: "The last @todo line" },
          { id: "b", label: "The first unmarked text" },
          { id: "c", label: "The file name" },
          { id: "d", label: "The import list" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "syntax-ref",
        prompt: "How do ideas point at each other?",
        choices: [
          { id: "a", label: "Only spreadsheet IDs" },
          { id: "b", label: "Only chat mentions" },
          { id: "c", label: "Bracket names like [other_idea]" },
          { id: "d", label: "By renaming files" },
        ],
        correctChoiceId: "c",
      },
      {
        id: "syntax-import",
        prompt: "What can an import bring into a .rq file?",
        choices: [
          { id: "a", label: "Only other .rq files" },
          { id: "b", label: "Arbitrary files, not only .rq" },
          { id: "c", label: "Only package.json" },
          { id: "d", label: "Only images" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "syntax-file-ref",
        prompt: "What can [\"./module.py\".SessionStore] point at?",
        choices: [
          { id: "a", label: "Only another .rq idea" },
          { id: "b", label: "A file, or a symbol in a file" },
          { id: "c", label: "Only a Git commit hash" },
          { id: "d", label: "Only a marketplace listing" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "syntax-wildcard",
        prompt: "What does a wildcard reference do?",
        choices: [
          { id: "a", label: "Deletes unmatched ideas" },
          { id: "b", label: "Fans out to matching ideas by path and name" },
          { id: "c", label: "Encrypts the idea body" },
          { id: "d", label: "Publishes to npm" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "syntax-comment-ref",
        prompt: "How can source comments point at ideas?",
        choices: [
          { id: "a", label: "With an rq: comment that names the idea" },
          { id: "b", label: "By renaming the source file" },
          { id: "c", label: "Only through a spreadsheet column" },
          { id: "d", label: "Comments cannot point at ideas" },
        ],
        correctChoiceId: "a",
      },
    ],
  },
  {
    id: "graph",
    title: "Graph",
    questions: [
      {
        id: "graph-slice",
        prompt: "What is Ideas Summary best for?",
        choices: [
          { id: "a", label: "Curated tables and graph maps you choose" },
          { id: "b", label: "Editing package-lock.json" },
          { id: "c", label: "The marketplace listing alone" },
          { id: "d", label: "Git blame" },
        ],
        correctChoiceId: "a",
      },
      {
        id: "graph-neighbourhood",
        prompt: "What is the activity bar mainly for on day one?",
        choices: [
          { id: "a", label: "Dumping the whole workspace graph" },
          { id: "b", label: "Neighbourhood context near the caret" },
          { id: "c", label: "Editing package.json scripts" },
          { id: "d", label: "Publishing to npm" },
        ],
        correctChoiceId: "b",
      },
    ],
  },
  {
    id: "cli",
    title: "CLI",
    questions: [
      {
        id: "cli-index",
        prompt: "Which statement is true about the CLI?",
        choices: [
          { id: "a", label: "It uses a different index than the editor" },
          { id: "b", label: "reqlan / rq use the same .reqlan index" },
          { id: "c", label: "It only works without .rq files" },
          { id: "d", label: "It replaces the VS Code extension" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "cli-click",
        prompt: "What does click return?",
        choices: [
          { id: "a", label: "Every file in the workspace" },
          { id: "b", label: "Compact local context for a target" },
          { id: "c", label: "A marketplace listing" },
          { id: "d", label: "A certificate token" },
        ],
        correctChoiceId: "b",
      },
      {
        id: "cli-check",
        prompt: "Where would you use reqlan check?",
        choices: [
          { id: "a", label: "In CI/CD to check reference integrity" },
          { id: "b", label: "To mint a certificate" },
          { id: "c", label: "To install the VS Code extension" },
          { id: "d", label: "To replace package-lock.json" },
        ],
        correctChoiceId: "a",
      },
    ],
  },
];

export const assessments: Assessment[] = [
  {
    id: CORE_ASSESSMENT_ID,
    title: "reqlan",
    blurb: "",
    sections: coreSections,
  },
];

export function getAssessment(id: string): Assessment | undefined {
  return assessments.find((assessment) => assessment.id === id);
}

export function isAssessmentId(id: string): boolean {
  return getAssessment(id) !== undefined;
}

export type AssessmentScore = {
  total: number;
  correct: number;
  ratio: number;
  passed: boolean;
};

/**
 * Score answers keyed by question id → chosen choice id.
 * Unanswered questions count as incorrect.
 */
export function scoreAssessment(
  answers: Record<string, string | undefined>,
  questions: AssessmentQuestion[],
  passRatio: number = PASS_RATIO,
): AssessmentScore {
  const total = questions.length;
  let correct = 0;
  for (const question of questions) {
    if (answers[question.id] === question.correctChoiceId) {
      correct += 1;
    }
  }
  const ratio = total === 0 ? 0 : correct / total;
  return {
    total,
    correct,
    ratio,
    passed: ratio >= passRatio,
  };
}
