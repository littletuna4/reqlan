import type { Metadata } from "next";

import { pages } from "@/content/meta";
import { tutorialDecks } from "@/content/tutorials";
import { pageMetadata } from "@/lib/site-metadata";
import { TutorialsListPage } from "@/views/TutorialsListPage";

export const metadata: Metadata = pageMetadata({
  title: pages.tutorials.title,
  description: pages.tutorials.description,
  path: "/tutorials/",
});

export default function Page() {
  return <TutorialsListPage decks={tutorialDecks} />;
}
