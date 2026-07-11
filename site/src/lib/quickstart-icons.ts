import cursorDefaultClick from "@iconify-icons/mdi/cursor-default-click";
import packageDown from "@iconify-icons/mdi/package-down";
import type { IconifyIcon } from "@iconify/react";

import github from "@iconify-icons/simple-icons/github";
import visualstudiocode from "@iconify-icons/simple-icons/visualstudiocode";
import vscodium from "@iconify-icons/simple-icons/vscodium";

import { formatPhonebookIconKey, type PhonebookIconRef } from "../../../scripts/phonebook.ts";
import type { QuickstartIconRef } from "@/content/quickstart";

const registry: Record<string, IconifyIcon> = {
  "mdi:cursor-default-click": cursorDefaultClick,
  "mdi:package-down": packageDown,
  "simple-icons:github": github,
  "simple-icons:visualstudiocode": visualstudiocode,
  "simple-icons:vscodium": vscodium,
};

function iconKey(icon: QuickstartIconRef | PhonebookIconRef): string {
  return `${icon.set}:${icon.name}`;
}

export function resolveQuickstartIcon(
  icon: QuickstartIconRef | PhonebookIconRef,
): IconifyIcon | undefined {
  return registry[iconKey(icon)] ?? registry[formatPhonebookIconKey(icon)];
}
