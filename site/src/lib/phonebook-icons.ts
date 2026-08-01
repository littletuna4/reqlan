/** Phonebook icon registry — see site/reqs/icons.rq icon_registry */
import emailOutline from "@iconify-icons/mdi/email-outline";
import web from "@iconify-icons/mdi/web";
import github from "@iconify-icons/simple-icons/github";
import npm from "@iconify-icons/simple-icons/npm";
import visualstudiocode from "@iconify-icons/simple-icons/visualstudiocode";
import vscodium from "@iconify-icons/simple-icons/vscodium";
import type { IconifyIcon } from "@iconify/react";

import {
  formatPhonebookIconKey,
  phonebookLinks,
  phonebookPackages,
  type PhonebookIconRef,
} from "@/lib/phonebook";

const registry: Record<string, IconifyIcon> = {
  "simple-icons:github": github,
  "simple-icons:npm": npm,
  "simple-icons:visualstudiocode": visualstudiocode,
  "simple-icons:vscodium": vscodium,
  "mdi:email-outline": emailOutline,
  "mdi:web": web,
};

export function resolvePhonebookIcon(
  icon: PhonebookIconRef,
): IconifyIcon | undefined {
  return registry[formatPhonebookIconKey(icon)];
}

for (const link of [...phonebookLinks, ...phonebookPackages]) {
  if (!resolvePhonebookIcon(link.icon)) {
    throw new Error(
      `Missing phonebook icon registry entry for ${link.id}: ${formatPhonebookIconKey(link.icon)}`,
    );
  }
}
