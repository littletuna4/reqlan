"use client";

import { useEffect } from "react";

import { sitePath } from "@/lib/paths";

type LegacyPathRedirectProps = {
  to: string;
};

/** Client redirect that keeps query string and hash. Needed for static export. */
export function LegacyPathRedirect({ to }: LegacyPathRedirectProps) {
  useEffect(() => {
    const dest = new URL(sitePath(to), window.location.origin);
    dest.search = window.location.search;
    dest.hash = window.location.hash;
    window.location.replace(`${dest.pathname}${dest.search}${dest.hash}`);
  }, [to]);

  return <p>Redirecting…</p>;
}
