import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTutorial, tutorialDecks } from "@/content/tutorials";
import { pageMetadata } from "@/lib/site-metadata";
import { TutorialDetailPage } from "@/views/TutorialDetailPage";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return tutorialDecks.map((tutorial) => ({ slug: tutorial.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tutorial = getTutorial(slug);

  if (!tutorial) {
    return {};
  }

  return pageMetadata({
    title: tutorial.title,
    description: tutorial.blurb,
    path: `/tutorials/${tutorial.slug}/`,
  });
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const tutorial = getTutorial(slug);

  if (!tutorial) {
    notFound();
  }

  return <TutorialDetailPage tutorial={tutorial} />;
}
