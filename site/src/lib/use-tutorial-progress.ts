"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  clearLessonSlides,
  courseCompletionState,
  emptyTutorialProgress,
  isSlideComplete,
  lessonCompletionState,
  readTutorialProgress,
  slideProgressKey,
  writeTutorialProgress,
  type CompletionState,
  type LessonProgressInput,
  type TutorialProgress,
} from "@/lib/tutorial-progress";

type Listener = () => void;

let memory = emptyTutorialProgress();
let hydrated = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  memory = readTutorialProgress();
  hydrated = true;
}

function subscribe(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TutorialProgress {
  hydrate();
  return memory;
}

function getServerSnapshot(): TutorialProgress {
  return emptyTutorialProgress();
}

function commit(next: TutorialProgress) {
  memory = next;
  writeTutorialProgress(next);
  emit();
}

function setFlag(
  bucket: "courses" | "lessons" | "slides",
  key: string,
  value: boolean,
): void {
  const current = getSnapshot();
  const group = { ...current[bucket] };
  if (value) group[key] = true;
  else delete group[key];
  commit({ ...current, [bucket]: group });
}

export function useTutorialProgress() {
  const progress = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrate();
    setReady(true);
  }, []);

  const getLessonState = useCallback(
    (deckId: string, slideCount: number): CompletionState =>
      lessonCompletionState(progress, deckId, slideCount),
    [progress],
  );

  const getCourseState = useCallback(
    (series: string, lessons: LessonProgressInput[]): CompletionState =>
      courseCompletionState(progress, series, lessons),
    [progress],
  );

  const toggleCourse = useCallback(
    (series: string, lessons: LessonProgressInput[]) => {
      const current = getSnapshot();
      const state = courseCompletionState(current, series, lessons);
      setFlag("courses", series, state !== "complete");
    },
    [],
  );

  const toggleLesson = useCallback((deckId: string, slideCount: number) => {
    const current = getSnapshot();
    const state = lessonCompletionState(current, deckId, slideCount);
    if (state === "complete") {
      const lessons = { ...current.lessons };
      delete lessons[deckId];
      commit(clearLessonSlides({ ...current, lessons }, deckId));
      return;
    }
    setFlag("lessons", deckId, true);
  }, []);

  const toggleSlide = useCallback((deckId: string, slide: number) => {
    const current = getSnapshot();
    setFlag(
      "slides",
      slideProgressKey(deckId, slide),
      !isSlideComplete(current, deckId, slide),
    );
  }, []);

  const markSlideComplete = useCallback((deckId: string, slide: number) => {
    if (slide < 1) return;
    const current = getSnapshot();
    if (isSlideComplete(current, deckId, slide)) return;
    setFlag("slides", slideProgressKey(deckId, slide), true);
  }, []);

  return {
    progress,
    ready,
    getLessonState,
    getCourseState,
    isSlideComplete: (deckId: string, slide: number) =>
      isSlideComplete(progress, deckId, slide),
    toggleCourse,
    toggleLesson,
    toggleSlide,
    markSlideComplete,
  };
}
