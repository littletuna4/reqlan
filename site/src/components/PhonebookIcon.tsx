/** Renders a phonebook link icon — see site/reqs/icons.rq phonebook_icon_component */
import { Icon } from "@iconify/react/dist/offline";

import { resolvePhonebookIcon } from "@/lib/phonebook-icons";
import type { PhonebookIconRef } from "@/lib/phonebook";

type PhonebookIconProps = {
  icon: PhonebookIconRef;
  className?: string;
};

export function PhonebookIcon({
  icon,
  className = "phonebook-icon",
}: PhonebookIconProps) {
  const data = resolvePhonebookIcon(icon);
  if (!data) {
    return null;
  }

  return <Icon icon={data} className={className} aria-hidden />;
}
