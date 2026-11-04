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
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}>({ preference: DEFAULT_THEME, setPreference: () => {} });
export function useTheme() {
  return useContext(ThemeContext);
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(
    subscribe,
    preference,
    () => DEFAULT_THEME,
  );
  useEffect(() => {
    // Read current storage: the hydration snapshot can still be the SSR default.
    const current = preference();
    if (current !== value) return;
    document.documentElement.dataset.theme = value;
    try {
      if (localStorage.getItem(THEME_KEY) !== current)
        localStorage.setItem(THEME_KEY, current);
    } catch {
      /* Appearance also works without persistent storage. */
    }
  }, [value]);
  const setPreference = (next: ThemePreference) => {
    fallback = next;
    try {
      localStorage.setItem(THEME_KEY, next);
      volatile = undefined;
    } catch {
      volatile = next;
      /* Appearance stays usable when browser storage is blocked. */
    }
    document.documentElement.dataset.theme = next;
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
        <option value="norway">Norway</option>
        <option value="light">Classic Light</option>
      </select>
    </label>
  );
}
