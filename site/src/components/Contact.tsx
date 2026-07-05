import { siteContent } from "@/content/site";

export function Contact() {
  const { contact } = siteContent;

  return (
    <section id="contact" className="content-section" aria-labelledby="contact-title">
      <h2 id="contact-title" className="section-title">
        {contact.title}
      </h2>
      <p className="section-intro">{contact.intro}</p>

      <ul className="contact-links">
        {contact.links.map((link) => {
          const isExternal = link.href.startsWith("http");

          return (
            <li key={link.href}>
              <a
                href={link.href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
              <span className="contact-label">{link.label}</span>
              {link.description ? (
                <span className="contact-description">{link.description}</span>
              ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
