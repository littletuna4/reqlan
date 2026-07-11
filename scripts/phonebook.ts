import phonebookData from "../reqlan rq/phonebook.json";

export const phonebook = phonebookData;

export type PhonebookIconSetId = keyof typeof phonebook.icons;

export type PhonebookIconRef = {
  set: PhonebookIconSetId | string;
  name: string;
};

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

/** Iconify id, e.g. `simple-icons:github`. */
export function formatPhonebookIconKey(icon: PhonebookIconRef): string {
  const setMeta = phonebook.icons[icon.set as PhonebookIconSetId];
  if (!setMeta) {
    throw new Error(`Unknown phonebook icon set: ${icon.set}`);
  }
  return `${setMeta.iconifyPrefix}:${icon.name}`;
}

/** Catalog search URL for the icon set backing a link icon. */
export function getPhonebookIconSearchUrl(icon: PhonebookIconRef): string {
  const setMeta = phonebook.icons[icon.set as PhonebookIconSetId];
  if (!setMeta) {
    throw new Error(`Unknown phonebook icon set: ${icon.set}`);
  }
  return setMeta.search;
}
