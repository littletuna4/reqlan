import { Contact } from "@/components/Contact";
import { Example } from "@/components/Example";
import { Hero } from "@/components/Hero";
import { Motivation } from "@/components/Motivation";
import { NavGraph } from "@/components/NavGraph";
import { SiteShell } from "@/components/SiteShell";
import { Syntax } from "@/components/Syntax";
import styles from "./HomePage.module.css";

export function HomePage() {
  //rq:["../../../reqlan rq/distribution/landers.rq".landers]
  return (
    <SiteShell>
      <main className={styles.home}>
        <div className={styles.column}>
          <Hero />
          <Motivation />
          <Syntax />
          <Example />
          <Contact />
        </div>
        <NavGraph />
      </main>
    </SiteShell>
  );
}
