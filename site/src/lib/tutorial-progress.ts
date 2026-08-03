export type CompletionState = "none" | "partial" | "complete";

export type TutorialProgress = {
  courses: Record<string, boolean>;
  lessons: Record<string, boolean>;
  /** Keys are `${deckId}:${slideNumber}` (1-based). */
  slides: Record<string, boolean>;
};

export type LessonProgressInput = {
  id: string;
  slideCount: number;
};

export const TUTORIAL_PROGRESS_KEY = "reqlan.tutorial-progress.v1";

export const emptyTutorialProgress = (): TutorialProgress => ({
  courses: {},
  lessons: {},
  slides: {},
});

export function slideProgressKey(deckId: string, slide: number): string {
  return `${deckId}:${slide}`;
}

export function completionGlyph(state: CompletionState): string {
  if (state === "complete") return "✓";
  if (state === "partial") return "-";
  return "";
}

export function completionLabel(
  state: CompletionState,
  name: string,
): { aria: string; title: string } {
  if (state === "complete") {
    return {
      aria: `Mark ${name} incomplete`,
      title: "Complete — click to clear",
    };
  }
  if (state === "partial") {
    return {
      aria: `Mark ${name} complete (currently partial)`,
      title: "Partial — click to mark complete",
    };
  }
  return {
    aria: `Mark ${name} complete`,
    title: "Mark complete",
  };
}

export function readTutorialProgress(): TutorialProgress {
  if (typeof window === "undefined") return emptyTutorialProgress();
  try {
    const raw = window.localStorage.getItem(TUTORIAL_PROGRESS_KEY);
    if (!raw) return emptyTutorialProgress();
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    return {
      courses: parsed.courses ?? {},
      lessons: parsed.lessons ?? {},
      slides: parsed.slides ?? {},
    };
  } catch {
    return emptyTutorialProgress();
  }
}

export function writeTutorialProgress(progress: TutorialProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
}

export function isSlideComplete(
  progress: TutorialProgress,
  deckId: string,
  slide: number,
): boolean {
  return Boolean(progress.slides[slideProgressKey(deckId, slide)]);
}

export function countCompletedSlides(
  progress: TutorialProgress,
  deckId: string,
  slideCount: number,
): number {
  if (slideCount <= 0) return 0;
  let count = 0;
  for (let slide = 1; slide <= slideCount; slide += 1) {
    if (isSlideComplete(progress, deckId, slide)) count += 1;
  }
  return count;
}

export function lessonCompletionState(
  progress: TutorialProgress,
  deckId: string,
  slideCount: number,
): CompletionState {
  if (progress.lessons[deckId]) return "complete";
  const done = countCompletedSlides(progress, deckId, slideCount);
  if (done <= 0) return "none";
  if (slideCount > 0 && done >= slideCount) return "complete";
  return "partial";
}

export function courseCompletionState(
  progress: TutorialProgress,
  series: string,
  lessons: LessonProgressInput[],
): CompletionState {
  if (progress.courses[series]) return "complete";
  if (lessons.length === 0) return "none";
  const states = lessons.map((lesson) =>
    lessonCompletionState(progress, lesson.id, lesson.slideCount),
  );
  if (states.every((state) => state === "complete")) return "complete";
  if (states.some((state) => state !== "none")) return "partial";
  return "none";
}

export function clearLessonSlides(
  progress: TutorialProgress,
  deckId: string,
): TutorialProgress {
  const prefix = `${deckId}:`;
  const slides = { ...progress.slides };
  for (const key of Object.keys(slides)) {
    if (key.startsWith(prefix)) delete slides[key];
  }
  return { ...progress, slides };
}
