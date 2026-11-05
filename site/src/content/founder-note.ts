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
    "Hi, I'm Tony. These days code's easy to write but hard to keep in your head, especially with AI agents doing half the typing. reqlan started as my way of writing down the ideas that actually matter and tying them to the code that proves them. It's mostly just me (plus a few agents), and it's built using itself. In a sea of agents, I'm a real, friendly human on the other end, so if it helps you, breaks on you, or you just need a hand, let me know.",
  ],
  name: "Tony Cerqui",
  role: "Process engineer & software developer · Brisbane, Australia",
  links: [
    { id: "issues", label: "Open an issue", href: `${github.href}/issues` },
    { id: "email", label: "Email me", href: email.href },
    { id: "site", label: "tony.is-a.dev", href: "https://tony.is-a.dev/" },
  ],
} as const;
