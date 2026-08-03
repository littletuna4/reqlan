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

/** Pass when correct / total >= this ratio. */
export const PASS_RATIO = 0.8;

export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: "q-idea",
    prompt: "What is the core unit in a reqlan file?",
    choices: [
      { id: "a", label: "A base folder" },
      { id: "b", label: "A named idea (handle + prose)" },
      { id: "c", label: "A chat prompt" },
      { id: "d", label: "A VS Code setting" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q-base-marker",
    prompt: "What marks a directory as a reqlan base?",
    choices: [
      { id: "a", label: "Any folder that contains .rq files" },
      { id: "b", label: "Installing the VS Code extension" },
      { id: "c", label: "A .reqlan folder in that directory" },
      { id: "d", label: "A README that mentions reqlan" },
    ],
    correctChoiceId: "c",
  },
  {
    id: "q-install-layers",
    prompt: "Which statement is true about installation?",
    choices: [
      {
        id: "a",
        label: "Extension install automatically creates a base",
      },
      {
        id: "b",
        label: "Extension install and base create are separate layers",
      },
      {
        id: "c",
        label: "CLI init installs the VS Code extension",
      },
      {
        id: "d",
        label: "Bases only exist inside the marketplace package",
      },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q-neighbourhood",
    prompt: "What is the activity bar mainly for on day one?",
    choices: [
      { id: "a", label: "Dumping the entire workspace graph into chat" },
      {
        id: "b",
        label: "Neighbourhood context near the caret in the active base",
      },
      { id: "c", label: "Editing package.json scripts" },
      { id: "d", label: "Publishing to npm" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q-tokens",
    prompt: "Which habit matches reqlan’s LLM-first stance?",
    choices: [
      { id: "a", label: "Paste every .rq file into the prompt by default" },
      {
        id: "b",
        label: "Copy a focused neighbourhood slice when you ask a model",
      },
      { id: "c", label: "Disable search so the model sees everything" },
      { id: "d", label: "Only use AI outside the editor" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q-ideaset",
    prompt: "What is an ideaset?",
    choices: [
      { id: "a", label: "A namespace of unrelated files" },
      { id: "b", label: "A namespace namespace container for related idea names" },
      { id: "c", label: "A required metadata form on every idea" },
      { id: "d", label: "The Ideas Summary export format" },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q-reference",
    prompt: "How do ideas point at each other or at files?",
    choices: [
      { id: "a", label: "Only through spreadsheet IDs" },
      { id: "b", label: "Only via chat mentions" },
      {
        id: "c",
        label: "With bracket references / wikilinks (and file paths in brackets)",
      },
      { id: "d", label: "By renaming files to match idea names" },
    ],
    correctChoiceId: "c",
  },
  {
    id: "q-extension-map",
    prompt: "Which surface is best for curated tables and graph maps you choose?",
    choices: [
      { id: "a", label: "Ideas Summary" },
      { id: "b", label: "package-lock.json" },
      { id: "c", label: "The marketplace listing alone" },
      { id: "d", label: "Git blame" },
    ],
    correctChoiceId: "a",
  },
];

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
  questions: AssessmentQuestion[] = assessmentQuestions,
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
