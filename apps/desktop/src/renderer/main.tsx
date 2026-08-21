import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { createPreviewApi } from "./preview-api";
import { I18nProvider } from "./lib/i18n";
import "./styles.css";

if (!window.devinAgent && import.meta.env.DEV) {
  window.devinAgent = createPreviewApi();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider><App /></I18nProvider>
  </StrictMode>,
);
