import { Contact } from "@/components/Contact";
import { Example } from "@/components/Example";
import { Hero } from "@/components/Hero";
import { Motivation } from "@/components/Motivation";
import { SiteShell } from "@/components/SiteShell";
import { Syntax } from "@/components/Syntax";

export function HomePage() {
  //rq:["../../../reqlan rq/distribution/landers.rq".landers]
  return (
    <SiteShell>
      <main>
        <Hero />
        <Motivation />
        <Syntax />
        <Example />
        <Contact />
      </main>
    </SiteShell>
  );
}
