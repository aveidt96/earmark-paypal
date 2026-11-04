export type ThemePreference = "norway" | "light";
export const DEFAULT_THEME: ThemePreference = "norway";
export const THEME_KEY = "earmark-theme";
export function parseTheme(value: unknown): ThemePreference {
  // Preserve Classic Light; migrate Airy and removed Dark/System to Norway.
  return value === "light" ? "light" : DEFAULT_THEME;
}
// Static first-paint script: no request data, credentials or interpolated input.
export const themeBootstrap = `(()=>{let t="norway";try{const s=localStorage.getItem("earmark-theme");if(s==="light")t="light";if(s!==t)localStorage.setItem("earmark-theme",t);}catch{}document.documentElement.dataset.theme=t;})();`;
