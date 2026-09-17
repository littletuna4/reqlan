import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getShowcase, showcases } from "@/content/showcases";
import { pageMetadata } from "@/lib/site-metadata";
import { ShowcaseDetailPage } from "@/views/ShowcaseDetailPage";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return showcases.map((showcase) => ({ slug: showcase.id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const showcase = getShowcase(slug);

  if (!showcase) {
    return {};
  }

  return pageMetadata({
    title: showcase.title,
    description: showcase.summary,
    path: `/showcase/${showcase.id}/`,
  });
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const showcase = getShowcase(slug);

  if (!showcase) {
    notFound();
  }

  return <ShowcaseDetailPage showcase={showcase} />;
}
