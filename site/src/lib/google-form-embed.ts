/**
 * Convert a Google Forms href into an iframe embed src.
 * Phonebook may store a forms.gle short link or a docs.google.com viewform URL.
 */
// rq:["../../../reqlan rq/site/certs.rq".sticker_form_embed]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]

const FORMS_GLE_VIEWFORM: Record<string, string> = {
  TA4pF8iNxPub7Juu6:
    "https://docs.google.com/forms/d/e/1FAIpQLSeku06TWWmKPQ8F6npWxOf7LhwRgQ5cz2hmlFRbcn-UVzB0-w/viewform",
};

function isViewformPath(pathname: string): boolean {
  return /\/forms\/d\/e\/[^/]+\/viewform$/.test(pathname);
}

export function googleFormEmbedSrc(href: string): string {
  const url = new URL(href);

  if (url.hostname === "forms.gle") {
    const slug = url.pathname.replace(/^\/+|\/+$/g, "");
    const viewform = FORMS_GLE_VIEWFORM[slug];
    if (!viewform) {
      throw new Error(`Unknown Google Form short link: ${href}`);
    }
    return googleFormEmbedSrc(viewform);
  }

  if (url.hostname === "docs.google.com" && isViewformPath(url.pathname)) {
    url.searchParams.set("embedded", "true");
    url.searchParams.delete("usp");
    return url.toString();
  }

  throw new Error(`Not a Google Form viewform URL: ${href}`);
}
