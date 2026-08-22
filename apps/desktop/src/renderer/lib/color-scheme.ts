import type { ColorSchemePreference } from "../../shared/types";

export function applyColorScheme(
  preference: ColorSchemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference === "system") {
    delete root.dataset.colorScheme;
    return;
  }
  root.dataset.colorScheme = preference;
}
