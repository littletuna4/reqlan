import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getShowcase } from "@/content/showcases";
import { ShowcaseDetailPage } from "@/pages/ShowcaseDetailPage";
import "@/styles/globals.css";

const slug = document.body.dataset.showcaseSlug;
const showcase = slug ? getShowcase(slug) : undefined;
const root = document.getElementById("root");

if (root && showcase) {
  createRoot(root).render(
    <StrictMode>
      <ShowcaseDetailPage showcase={showcase} />
    </StrictMode>,
  );
} else if (root) {
  root.innerHTML = "<main><p>Showcase not found.</p></main>";
}
