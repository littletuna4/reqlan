import { activityBarShot, chatSearchShot } from "./activity-bar.ts";
import { fileLinkShot } from "./file-link.ts";
import { montageIdeShot } from "./montage-ide.ts";
import type { DocsShot } from "./types.ts";

/** Catalog of presentation asset keys produced from production webviews. */
export const DOCS_IMAGE_SHOTS: readonly DocsShot[] = [
  activityBarShot,
  chatSearchShot,
  montageIdeShot,
  fileLinkShot,
];
