import type { Metadata } from "next";

import { siteContent } from "@/content/site";
import { sitePath } from "@/lib/paths";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: siteContent.meta.title,
  description: siteContent.meta.description,
  manifest: sitePath("/site.webmanifest"),
  icons: {
    icon: [
      { url: sitePath("/favicon.ico"), sizes: "any" },
      { url: sitePath("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: sitePath("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
    ],
    apple: sitePath("/apple-touch-icon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
