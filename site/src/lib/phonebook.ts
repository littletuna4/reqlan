import phonebookData from "../../../reqlan rq/phonebook.json";

export const phonebook = phonebookData;

export type PhonebookLinkId = keyof typeof phonebook.links;

export type PhonebookLinkEntry = (typeof phonebook.links)[PhonebookLinkId];

export type PhonebookLink = PhonebookLinkEntry & {
  id: PhonebookLinkId;
};

export const phonebookLinks = (
  Object.entries(phonebook.links) as [PhonebookLinkId, PhonebookLinkEntry][]
).map(([id, link]) => ({
  id,
  ...link,
}));

export function getPhonebookLink<const Id extends PhonebookLinkId>(
  id: Id,
): PhonebookLinkEntry & { id: Id } {
  return { id, ...phonebook.links[id] };
}
