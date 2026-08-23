import cursorDefaultClick from "@iconify-icons/mdi/cursor-default-click";
import consoleIcon from "@iconify-icons/mdi/console";
import packageDown from "@iconify-icons/mdi/package-down";
import type { IconifyIcon } from "@iconify/react";

import bun from "@iconify-icons/simple-icons/bun";
import github from "@iconify-icons/simple-icons/github";
import npm from "@iconify-icons/simple-icons/npm";
import pnpm from "@iconify-icons/simple-icons/pnpm";
import visualstudiocode from "@iconify-icons/simple-icons/visualstudiocode";
import vscodium from "@iconify-icons/simple-icons/vscodium";
import yarn from "@iconify-icons/simple-icons/yarn";

import { formatPhonebookIconKey, type PhonebookIconRef } from "@/lib/phonebook";
import type { QuickstartIconRef } from "@/content/quickstart";

const registry: Record<string, IconifyIcon> = {
  "mdi:console": consoleIcon,
  "mdi:cursor-default-click": cursorDefaultClick,
  "mdi:package-down": packageDown,
  "simple-icons:bun": bun,
  "simple-icons:github": github,
  "simple-icons:npm": npm,
  "simple-icons:pnpm": pnpm,
  "simple-icons:visualstudiocode": visualstudiocode,
  "simple-icons:vscodium": vscodium,
  "simple-icons:yarn": yarn,
};

function iconKey(icon: QuickstartIconRef | PhonebookIconRef): string {
  return `${icon.set}:${icon.name}`;
}

export function resolveQuickstartIcon(
  icon: QuickstartIconRef | PhonebookIconRef,
): IconifyIcon | undefined {
  return registry[iconKey(icon)] ?? registry[formatPhonebookIconKey(icon)];
}
