import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ShowcaseListPage } from "@/pages/ShowcaseListPage";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ShowcaseListPage />
    </StrictMode>,
  );
}
