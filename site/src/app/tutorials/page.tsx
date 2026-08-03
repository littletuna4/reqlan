import { TutorialsListPage } from "@/views/TutorialsListPage";
import { tutorialDecks } from "@/content/tutorials";

export default function Page() {
  return <TutorialsListPage decks={tutorialDecks} />;
}
