// rq:["../../../reqlan rq/site/site.rq".copy]
// rq:["../../../reqlan rq/site/site.rq".quiz_sticker_tab]
import { assessments } from "./assessment";
import { assessmentsEntryPath } from "../lib/certs-paths";
import type { PhonebookLinkId } from "../lib/phonebook";

export const quizStickerTab = {
  label: "Quiz · sticker",
  heading: "Earn a sticker",
  body: "Pass the reqlan quiz. Claim a certificate and a sticker.",
  cta: "Start quiz",
  close: "Collapse",
  iconLinkId: "sticker-form" satisfies PhonebookLinkId,
  href: assessmentsEntryPath(assessments),
} as const;
