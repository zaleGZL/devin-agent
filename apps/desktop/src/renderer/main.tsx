import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { createPreviewApi } from "./preview-api";
import { I18nProvider } from "./lib/i18n";
import "./styles.css";

const previewRequested = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";

if (!window.devinAgent && previewRequested) {
  window.devinAgent = createPreviewApi();
}

if (!window.devinAgent) {
  throw new Error("Devin Agent preload failed to initialize. Restart the desktop app and inspect the preload error.");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider><App /></I18nProvider>
  </StrictMode>,
);
