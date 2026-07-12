import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { HomePage } from "@/pages/HomePage";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HomePage />
    </StrictMode>,
  );
}
