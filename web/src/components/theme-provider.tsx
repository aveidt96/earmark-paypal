"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  parseTheme,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from "../lib/theme";
let fallback: ThemePreference = DEFAULT_THEME;
let volatile: ThemePreference | undefined;
function preference() {
  if (volatile) return volatile;
  try {
    return parseTheme(localStorage.getItem(THEME_KEY) ?? fallback);
  } catch {
    return fallback;
  }
}
function subscribe(callback: () => void) {
  const change = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", change);
  window.addEventListener("earmark-theme-change", callback);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener("earmark-theme-change", callback);
  };
}
function subscribeSystem(callback: () => void) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}>({ preference: DEFAULT_THEME, setPreference: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(
    subscribe,
    preference,
    () => DEFAULT_THEME,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(value, systemDark);
  }, [value, systemDark]);
  const setPreference = (next: ThemePreference) => {
    fallback = next;
    try {
      localStorage.setItem(THEME_KEY, next);
      volatile = undefined;
    } catch {
      volatile = next;
      /* Appearance stays usable when browser storage is blocked. */
    }
    document.documentElement.dataset.theme = resolveTheme(next, systemDark);
    window.dispatchEvent(new Event("earmark-theme-change"));
  };
  return (
    <ThemeContext.Provider value={{ preference: value, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeSelector() {
  const theme = useContext(ThemeContext);
  return (
    <label className="theme-selector">
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        value={theme.preference}
        onChange={(e) => theme.setPreference(parseTheme(e.target.value))}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
