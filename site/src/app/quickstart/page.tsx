import type { Metadata } from "next";
import { QuickstartClient } from "@/components/QuickstartClient";
import { SiteShell } from "@/components/SiteShell";
import { quickstartContent } from "@/content/quickstart";

export const metadata: Metadata = {
  title: "Get started · reqlan",
  description: quickstartContent.intro,
};

export default function QuickstartPage() {
  return (
    <SiteShell>
      <main className="quickstart-page">
        <QuickstartClient />
      </main>
    </SiteShell>
  );
}
