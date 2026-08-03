export type TutorialSeries = "get-started" | "concepts" | "advanced";

export type TutorialDeck = {
  id: string;
  slug: string;
  title: string;
  series: TutorialSeries;
  order: number;
  blurb: string;
  tryThis: string;
  deck: string;
  /** Slide count from the deck file; used for partial completion. */
  slideCount: number;
};

export type TutorialNeighbors = {
  prev: TutorialDeck | null;
  next: TutorialDeck | null;
  seriesIndex: number;
  seriesTotal: number;
  seriesDecks: TutorialDeck[];
};

export const tutorialSeriesOrder: TutorialSeries[] = [
  "get-started",
  "concepts",
  "advanced",
];

export const tutorialSeriesMeta: Record<TutorialSeries, { title: string }> = {
  "get-started": { title: "Get started" },
  concepts: { title: "Concepts" },
  advanced: { title: "Advanced" },
};

function decksInSeries(
  allDecks: TutorialDeck[],
  series: TutorialSeries,
): TutorialDeck[] {
  return allDecks
    .filter((deck) => deck.series === series)
    .sort((a, b) => a.order - b.order);
}

/** Prev/next within the series, bridging get-started → concepts → advanced. */
export function getTutorialNeighbors(
  tutorial: TutorialDeck,
  allDecks: TutorialDeck[],
): TutorialNeighbors {
  const seriesDecks = decksInSeries(allDecks, tutorial.series);
  const seriesIndex = seriesDecks.findIndex((deck) => deck.id === tutorial.id);
  const seriesTotal = seriesDecks.length;

  let prev: TutorialDeck | null =
    seriesIndex > 0 ? seriesDecks[seriesIndex - 1]! : null;
  let next: TutorialDeck | null =
    seriesIndex >= 0 && seriesIndex < seriesTotal - 1
      ? seriesDecks[seriesIndex + 1]!
      : null;

  const seriesPos = tutorialSeriesOrder.indexOf(tutorial.series);
  if (!prev && seriesPos > 0) {
    const prior = decksInSeries(allDecks, tutorialSeriesOrder[seriesPos - 1]!);
    prev = prior[prior.length - 1] ?? null;
  }
  if (!next && seriesPos >= 0 && seriesPos < tutorialSeriesOrder.length - 1) {
    const following = decksInSeries(
      allDecks,
      tutorialSeriesOrder[seriesPos + 1]!,
    );
    next = following[0] ?? null;
  }

  return {
    prev,
    next,
    seriesIndex: Math.max(0, seriesIndex),
    seriesTotal,
    seriesDecks,
  };
}

export function tutorialMatchesQuery(
  tutorial: TutorialDeck,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    tutorial.title,
    tutorial.blurb,
    tutorial.tryThis,
    tutorial.id,
    tutorialSeriesMeta[tutorial.series].title,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
