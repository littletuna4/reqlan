import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QuickstartPage } from "@/pages/QuickstartPage";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QuickstartPage />
    </StrictMode>,
  );
}
