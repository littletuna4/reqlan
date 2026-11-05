// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".founder_note_section]
import { getPhonebookLink } from "@/lib/phonebook";

const github = getPhonebookLink("github");
const email = getPhonebookLink("email");

export const founderNote = {
  title: "A note from the maker",
  photo: {
    src: "/people/tony-cerqui.webp",
    alt: "Tony Cerqui, smiling, with shoulder-length curly brown hair",
  },
  quote: [
    "Hi, I'm Tony. Code got cheap to write and hard to hold in your head, so I started writing down the ideas that actually matter - named, and linked to the code and tests that prove them. reqlan grew out of that, and it's built using itself.",
    "Honest status: it's mostly one person and a fair few AI agents, some of it is still pretty vibe coded, and the roadmap above is the real one. If something breaks or doesn't make sense, I'd genuinely like to hear about it.",
  ],
  name: "Tony Cerqui",
  role: "Process engineer & software developer · Brisbane, Australia",
  links: [
    { id: "issues", label: "Open an issue", href: `${github.href}/issues` },
    { id: "email", label: "Email me", href: email.href },
    { id: "site", label: "tony.is-a.dev", href: "https://tony.is-a.dev/" },
  ],
} as const;
