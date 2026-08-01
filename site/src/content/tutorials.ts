import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getTutorialNeighbors as neighborsFromCatalog,
  type TutorialDeck,
  type TutorialNeighbors,
  type TutorialSeries,
} from "@/content/tutorial-model";

export type {
  TutorialDeck,
  TutorialNeighbors,
  TutorialSeries,
} from "@/content/tutorial-model";
export { tutorialSeriesMeta } from "@/content/tutorial-model";

type Manifest = {
  decks: TutorialDeck[];
};

function loadManifest(): Manifest {
  const path = join(process.cwd(), "..", "presentations", "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

const manifest = loadManifest();

export const tutorialDecks: TutorialDeck[] = [...manifest.decks].sort(
  (a, b) => {
    if (a.series !== b.series) {
      return a.series === "get-started" ? -1 : 1;
    }
    return a.order - b.order;
  },
);

export function getTutorial(slug: string): TutorialDeck | undefined {
  return tutorialDecks.find((deck) => deck.slug === slug || deck.id === slug);
}

export function tutorialsBySeries(series: TutorialSeries): TutorialDeck[] {
  return tutorialDecks.filter((deck) => deck.series === series);
}

export function getTutorialNeighbors(tutorial: TutorialDeck): TutorialNeighbors {
  return neighborsFromCatalog(tutorial, tutorialDecks);
}
