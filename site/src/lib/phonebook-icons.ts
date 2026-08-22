/** Phonebook icon registry — see reqlan rq/development/core.rq iconify_stack; site.rq icon_registry */
import emailOutline from "@iconify-icons/mdi/email-outline";
import stickerEmoji from "@iconify-icons/mdi/sticker-emoji";
import web from "@iconify-icons/mdi/web";
import discord from "@iconify-icons/simple-icons/discord";
import github from "@iconify-icons/simple-icons/github";
import githubsponsors from "@iconify-icons/simple-icons/githubsponsors";
import npm from "@iconify-icons/simple-icons/npm";
import visualstudiocode from "@iconify-icons/simple-icons/visualstudiocode";
import vscodium from "@iconify-icons/simple-icons/vscodium";
import type { IconifyIcon } from "@iconify/react";

import {
  formatPhonebookIconKey,
  phonebookLinks,
  phonebookPackages,
  type PhonebookIconRef,
} from "./phonebook";

const registry: Record<string, IconifyIcon> = {
  "simple-icons:discord": discord,
  "simple-icons:github": github,
  "simple-icons:githubsponsors": githubsponsors,
  "simple-icons:npm": npm,
  "simple-icons:visualstudiocode": visualstudiocode,
  "simple-icons:vscodium": vscodium,
  "mdi:email-outline": emailOutline,
  "mdi:sticker-emoji": stickerEmoji,
  "mdi:web": web,
};

export function resolvePhonebookIcon(
  icon: PhonebookIconRef | undefined,
): IconifyIcon | undefined {
  if (!icon) {
    return undefined;
  }
  return registry[formatPhonebookIconKey(icon)];
}

export function assertPhonebookIconsRegistered(
  entries: readonly { id: string; icon?: PhonebookIconRef }[],
): void {
  for (const entry of entries) {
    if (!entry.icon) {
      continue;
    }
    if (!resolvePhonebookIcon(entry.icon)) {
      throw new Error(
        `Missing phonebook icon registry entry for ${entry.id}: ${formatPhonebookIconKey(entry.icon)}`,
      );
    }
  }
}

assertPhonebookIconsRegistered([...phonebookLinks, ...phonebookPackages]);
