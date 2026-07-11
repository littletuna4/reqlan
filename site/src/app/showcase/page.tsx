import type { Metadata } from "next";
import { ShowcaseCard } from "@/components/ShowcaseCard";
import { SiteShell } from "@/components/SiteShell";
import { showcases } from "@/content/showcases";

export const metadata: Metadata = {
  title: "Showcases · reqlan",
  description: "Example requirement graphs and extension workflows.",
};

export default function ShowcasePage() {
  return (
    <SiteShell>
      <main className="showcase-page">
        <header className="showcase-page-header">
          <h1 className="section-title">Showcases</h1>
          <p className="showcase-page-intro">
            Typed examples of reqlan in real workflows — short summaries here,
            full requirement snippets on each page.
          </p>
        </header>

        <div className="showcase-grid">
          {showcases.map((showcase) => (
            <ShowcaseCard key={showcase.id} showcase={showcase} />
          ))}
        </div>
      </main>
    </SiteShell>
  );
}
