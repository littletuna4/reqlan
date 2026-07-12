import { SiteShell } from "@/components/SiteShell";
import { sitePath } from "@/lib/paths";

export default function NotFound() {
  return (
    <SiteShell>
      <main>
        <p>404 — this requirement node does not exist in the graph.</p>
        <p>
          <a href={sitePath("/")}>Back to reqlan</a>
        </p>
      </main>
    </SiteShell>
  );
}
