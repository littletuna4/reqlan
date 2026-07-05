import { siteContent } from "@/content/site";

export function Contact() {
  const { contact } = siteContent;

  return (
    <section id="contact" className="content-section" aria-labelledby="contact-title">
      <h2 id="contact-title" className="section-title">
        Links
      </h2>

      <ul className="link-row">
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
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
