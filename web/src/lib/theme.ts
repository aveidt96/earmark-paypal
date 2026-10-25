export type ThemePreference = "light" | "dark" | "system";
export const DEFAULT_THEME: ThemePreference = "dark";
export const THEME_KEY = "earmark-theme";
export function parseTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_THEME;
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
// Static first-paint script: no request data, credentials or interpolated input.
export const themeBootstrap = `(()=>{let t="dark";try{const s=localStorage.getItem("earmark-theme");if(s==="light"||s==="dark"||s==="system")t=s;}catch{}document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;})();`;
