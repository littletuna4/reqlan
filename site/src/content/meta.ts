// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".site]
// rq:["../../../reqlan rq/site/site.rq".brand]
// rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]

export const elevator_pitch = {
  // rq:["../../../reqlan rq/constitution.rq".elevator_pitch]
  // rq:["../../../reqlan rq/site/site.rq".elevator_pitch_section]
  title: "Why reqlan",
  pitch:
    "Build high-quality, verifiable systems quickly by describing the parts that matter and how they relate",
  claims: [
    "less input tokens, better output tokens",
    "integrate your system with your actual intent",
    "demand excellence from your clanker, with the right atomic specification",
    "static analysis for specifications",
    "vibecode without the constant doubt",
    "tightly control the scoping of your context, with the best of a file system hierarchy and the best of a knowledge graph",
    "shorter prompts, better agentic search, less rework and more focus",
    "make your precise intent explicit, leave implicit details latent",
    "make your intent compilable",
    "core implemented in rust, so you know it's fast and reliable",
    "integrate compliance, testing, functional requirements, non-functional requirements, and more into your system",
    "build docs that resist drift, and store the things you actually care about",
  ],
} as const;

export const meta = {
  title: "reqlan",
  description:
    "A graph of named ideas your agents can search, link, and reuse. Build high-quality, verifiable systems quickly by describing the parts that matter and how they relate.",
} as const;

export const brand = {
  name: "reqlan",
} as const;

export const footer = {
  copyright: "reqlan",
} as const;
