// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".site]
// rq:["../../../reqlan rq/site/site.rq".brand]
// rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]

export const elevator_pitch = {
  // rq:["../../../reqlan rq/constitution.rq".elevator_pitch]
  // rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]
  pitch:
    "Build high-quality, verifiable systems quickly by describing the parts that matter and how they relate",
  claims: [
    "less input tokens, better output tokens",
    "integrate your system with your actual intent",
    "demand excellence from your clanker, with the right atomic specification",
    "shorter prompts, better agentic search, less rework and more focus",
    "make your precise intent explicit, leave implicit details latent",
    "make your intent compilable",
    "core implemented in rust, so you know it's fast and reliable",
    "Integrate compliance, testing, functional requirements, non-functional requirements, and more into your system",
  ],
} as const;

export const meta = {
  title: "reqlan",
  description:
    "Markdown on steroids for requirements - Obsidian meets Dendron meets the IDE. A graph of named ideas your agents can search, link, and reuse.",
} as const;

export const brand = {
  name: "reqlan",
} as const;

export const footer = {
  copyright: "reqlan",
} as const;
