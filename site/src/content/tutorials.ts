import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getTutorialNeighbors as neighborsFromCatalog,
  type TutorialDeck,
  type TutorialNeighbors,
  type TutorialSeries,
} from "@/content/tutorial-model";
import { parseJsonc } from "@/lib/parse-jsonc";

export type {
  TutorialDeck,
  TutorialNeighbors,
  TutorialSeries,
} from "@/content/tutorial-model";
export {
  tutorialSeriesMeta,
  tutorialSeriesOrder,
} from "@/content/tutorial-model";

type ManifestDeck = Omit<TutorialDeck, "slideCount">;

type Manifest = {
  decks: ManifestDeck[];
};

function presentationsRoot(): string {
  return join(process.cwd(), "..", "presentations");
}

function loadSlideCount(deckPath: string): number {
  try {
    const fullPath = join(presentationsRoot(), deckPath);
    const data = parseJsonc(readFileSync(fullPath, "utf8")) as {
      slides?: unknown[];
    };
    return Array.isArray(data.slides) ? data.slides.length : 0;
  } catch {
    return 0;
  }
}

function loadManifest(): Manifest {
  const path = join(presentationsRoot(), "manifest.jsonc");
  return parseJsonc(readFileSync(path, "utf8")) as Manifest;
}

const manifest = loadManifest();

const seriesRank: Record<TutorialSeries, number> = {
  "get-started": 0,
  concepts: 1,
  advanced: 2,
};

export const tutorialDecks: TutorialDeck[] = manifest.decks
  .map((deck) => ({
    ...deck,
    slideCount: loadSlideCount(deck.deck),
  }))
  .sort((a, b) => {
    if (a.series !== b.series) {
      return seriesRank[a.series] - seriesRank[b.series];
    }
    return a.order - b.order;
  });

export function getTutorial(slug: string): TutorialDeck | undefined {
  return tutorialDecks.find((deck) => deck.slug === slug || deck.id === slug);
}

export function tutorialsBySeries(series: TutorialSeries): TutorialDeck[] {
  return tutorialDecks.filter((deck) => deck.series === series);
}

export function getTutorialNeighbors(tutorial: TutorialDeck): TutorialNeighbors {
  return neighborsFromCatalog(tutorial, tutorialDecks);
}
