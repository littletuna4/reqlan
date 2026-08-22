import phonebookData from "../reqlan rq/phonebook.json";

export const phonebook = phonebookData;

export type PhonebookIconSetId = keyof typeof phonebook.icons;

export type PhonebookIconRef = {
  set: PhonebookIconSetId | string;
  name: string;
};

type PhonebookNamedHref = {
  label: string;
  href: string;
  icon?: PhonebookIconRef;
};

export type PhonebookLinkId = keyof typeof phonebook.links;

export type PhonebookLinkEntry = PhonebookNamedHref & {
  "show-in-footer"?: boolean;
};

export type PhonebookLink = PhonebookLinkEntry & {
  id: PhonebookLinkId;
};

export type PhonebookPackageId = keyof typeof phonebook.packages;

export type PhonebookPackageEntry = PhonebookNamedHref;

export type PhonebookPackage = PhonebookPackageEntry & {
  id: PhonebookPackageId;
};

export const phonebookLinks = (
  Object.entries(phonebook.links) as [PhonebookLinkId, PhonebookLinkEntry][]
).map(([id, link]) => ({
  id,
  ...link,
}));

/** Omitted `show-in-footer` means true. */
export function isShownInFooter(link: {
  "show-in-footer"?: boolean;
}): boolean {
  return link["show-in-footer"] !== false;
}

export const phonebookFooterLinks = phonebookLinks.filter(isShownInFooter);

export const phonebookPackages = (
  Object.entries(phonebook.packages) as [
    PhonebookPackageId,
    PhonebookPackageEntry,
  ][]
).map(([id, pkg]) => ({
  id,
  ...pkg,
}));

export function getPhonebookLink<const Id extends PhonebookLinkId>(
  id: Id,
): PhonebookLinkEntry & { id: Id } {
  return { id, ...phonebook.links[id] };
}

export function getPhonebookPackage<const Id extends PhonebookPackageId>(
  id: Id,
): PhonebookPackageEntry & { id: Id } {
  return { id, ...phonebook.packages[id] };
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
