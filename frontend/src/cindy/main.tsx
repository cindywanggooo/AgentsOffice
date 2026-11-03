import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CindyOffice } from "./CindyOffice";
import "./cindy.css";

const root = document.getElementById("cindy-root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CindyOffice />
    </StrictMode>,
  );
}
