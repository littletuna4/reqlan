import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShowcaseDetail } from "@/components/ShowcaseDetail";
import { SiteShell } from "@/components/SiteShell";
import { getShowcase, showcases } from "@/content/showcases";

type ShowcaseDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return showcases.map((showcase) => ({ slug: showcase.id }));
}

export async function generateMetadata({
  params,
}: ShowcaseDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const showcase = getShowcase(slug);

  if (!showcase) {
    return { title: "Showcase · reqlan" };
  }

  return {
    title: `${showcase.title} · reqlan`,
    description: showcase.summary,
  };
}

export default async function ShowcaseDetailPage({
  params,
}: ShowcaseDetailPageProps) {
  const { slug } = await params;
  const showcase = getShowcase(slug);

  if (!showcase) {
    notFound();
  }

  return (
    <SiteShell>
      <main className="showcase-page">
        <ShowcaseDetail showcase={showcase} />
      </main>
    </SiteShell>
  );
}
