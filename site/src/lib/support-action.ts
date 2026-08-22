import type {
  SupportAction,
  SupportLinkAction,
  SupportShareAction,
} from "@/content/support";
import { sitePath } from "@/lib/paths";

export function supportLinkHref(action: SupportLinkAction): string {
  if (action.href.startsWith("http") || action.href.startsWith("mailto:")) {
    return action.href;
  }
  return sitePath(`${action.href}/`);
}

export function isHttpSupportHref(href: string): boolean {
  return href.startsWith("http");
}

export async function copySupportText(text: string): Promise<boolean> {
  await navigator.clipboard.writeText(text);
  return true;
}

export async function runSupportShare(
  action: SupportShareAction,
): Promise<"shared" | "copied" | "aborted"> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({
        title: action.shareTitle,
        text: action.shareTitle,
        url: action.url,
      });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "aborted";
    }
  }
  await copySupportText(action.url);
  return "copied";
}

export function supportActionPayload(action: SupportAction): string {
  if (action.kind === "copy") {
    return action.text;
  }
  if (action.kind === "share") {
    return action.url;
  }
  return supportLinkHref(action);
}
