/** Phonebook icon registry — see site/reqs/icons.rq icon_registry */
import emailOutline from "@iconify-icons/mdi/email-outline";
import github from "@iconify-icons/simple-icons/github";
import visualstudiocode from "@iconify-icons/simple-icons/visualstudiocode";
import vscodium from "@iconify-icons/simple-icons/vscodium";
import type { IconifyIcon } from "@iconify/react";

import {
  formatPhonebookIconKey,
  phonebookLinks,
  type PhonebookIconRef,
} from "../../../scripts/phonebook.ts";

const registry: Record<string, IconifyIcon> = {
  "simple-icons:github": github,
  "simple-icons:visualstudiocode": visualstudiocode,
  "simple-icons:vscodium": vscodium,
  "mdi:email-outline": emailOutline,
};

export function resolvePhonebookIcon(
  icon: PhonebookIconRef,
): IconifyIcon | undefined {
  return registry[formatPhonebookIconKey(icon)];
}

for (const link of phonebookLinks) {
  if (!resolvePhonebookIcon(link.icon)) {
    throw new Error(
      `Missing phonebook icon registry entry for ${link.id}: ${formatPhonebookIconKey(link.icon)}`,
    );
  }
}
