export type TutorialSeries = "get-started" | "advanced";

export type TutorialDeck = {
  id: string;
  slug: string;
  title: string;
  series: TutorialSeries;
  order: number;
  blurb: string;
  tryThis: string;
  deck: string;
};

export type TutorialNeighbors = {
  prev: TutorialDeck | null;
  next: TutorialDeck | null;
  seriesIndex: number;
  seriesTotal: number;
  seriesDecks: TutorialDeck[];
};

export const tutorialSeriesMeta: Record<
  TutorialSeries,
  { title: string; intro: string }
> = {
  "get-started": {
    title: "Get started",
    intro: "Six short decks — name ideas, link them, stay local, ask narrowly.",
  },
  advanced: {
    title: "Advanced",
    intro:
      "Overview plus eight deep dives — imports, attributes, maps, tokens, comments, export, CLI/MCP, patterns.",
  },
};

function decksInSeries(
  allDecks: TutorialDeck[],
  series: TutorialSeries,
): TutorialDeck[] {
  return allDecks
    .filter((deck) => deck.series === series)
    .sort((a, b) => a.order - b.order);
}

/** Prev/next within the series, bridging get-started → advanced at the seam. */
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

  if (!prev && tutorial.series === "advanced") {
    const getStarted = decksInSeries(allDecks, "get-started");
    prev = getStarted[getStarted.length - 1] ?? null;
  }
  if (!next && tutorial.series === "get-started") {
    const advanced = decksInSeries(allDecks, "advanced");
    next = advanced[0] ?? null;
  }

  return {
    prev,
    next,
    seriesIndex: Math.max(0, seriesIndex),
    seriesTotal,
    seriesDecks,
  };
}
