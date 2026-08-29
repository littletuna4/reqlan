import { Contact } from "@/components/Contact";
import { ElevatorPitch } from "@/components/ElevatorPitch";
import { Example } from "@/components/Example";
import { Hero } from "@/components/Hero";
import { Motivation } from "@/components/Motivation";
import { NavGraph } from "@/components/NavGraph";
import { Roadmap } from "@/components/Roadmap";
import { SiteShell } from "@/components/SiteShell";
import { Syntax } from "@/components/Syntax";
import styles from "./HomePage.module.css";

export function HomePage() {
  // rq:["../../../reqlan rq/distribution/landers.rq".landers]
  // rq:["../../../reqlan rq/site/site.rq".copy]
  // rq:["../../../reqlan rq/site/site.rq".hero_section]
  // rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]
  // rq:["../../../reqlan rq/site/site.rq".motivation_section]
  // rq:["../../../reqlan rq/site/site.rq".syntax_section]
  // rq:["../../../reqlan rq/site/site.rq".example_section]
  // rq:["../../../reqlan rq/site/site.rq".roadmap_section]
  // rq:["../../../reqlan rq/site/site.rq".nav_graph]
  return (
    <SiteShell>
      <main className={styles.home}>
        <div className={styles.column}>
          <Hero />
          <ElevatorPitch />
          <Motivation />
          <Syntax />
          <Example />
          <Roadmap />
          <Contact />
        </div>
        <NavGraph />
      </main>
    </SiteShell>
  );
}
