// rq:["../../../reqlan rq/site/site.rq".meta_tags]
// rq:["../../../reqlan rq/phonebook.rq".phonebook]
import type { Metadata } from "next";

import { meta } from "@/content/meta";
import { sitePath } from "@/lib/paths";
import { getPhonebookLink } from "@/lib/phonebook";

export function siteMetadataBase(): URL {
  return new URL(getPhonebookLink("site").href);
}

export function canonicalPath(path: string): string {
  if (path === "/") {
    return "/";
  }

  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataInput): Metadata {
  const url = canonicalPath(path);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
    },
    twitter: {
      title,
      description,
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export function rootMetadata(): Metadata {
  const image = {
    url: meta.ogImage.path,
    width: meta.ogImage.width,
    height: meta.ogImage.height,
    alt: meta.ogImage.alt,
  };

  return {
    metadataBase: siteMetadataBase(),
    title: {
      default: meta.title,
      template: `%s · ${meta.title}`,
    },
    description: meta.description,
    applicationName: meta.title,
    manifest: sitePath("/site.webmanifest"),
    icons: {
      icon: [
        { url: sitePath("/favicon.ico"), sizes: "any" },
        {
          url: sitePath("/favicon-32x32.png"),
          sizes: "32x32",
          type: "image/png",
        },
        {
          url: sitePath("/favicon-16x16.png"),
          sizes: "16x16",
          type: "image/png",
        },
      ],
      apple: sitePath("/apple-touch-icon.png"),
    },
    themeColor: meta.themeColor,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: meta.locale,
      siteName: meta.title,
      url: "/",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      images: [image.url],
    },
    robots: { index: true, follow: true },
  };
}
