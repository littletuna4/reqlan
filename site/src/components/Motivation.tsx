import { siteContent } from "@/content/site";

export function Motivation() {
  const { motivation } = siteContent;

  return (
    <section id="motivation" className="content-section" aria-labelledby="motivation-title">
      <h2 id="motivation-title" className="section-title">
        {motivation.title}
      </h2>
      <p className="section-intro">{motivation.intro}</p>

      <ul className="principle-grid">
        {motivation.principles.map((principle) => (
          <li key={principle.title} className="principle-card">
            <h3>{principle.title}</h3>
            <p>{principle.description}</p>
          </li>
        ))}
      </ul>

      <p className="section-note">{motivation.inspiration}</p>
    </section>
  );
}
