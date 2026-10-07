import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "valigia-perfetta-theme";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function getSystemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children, defaultTheme, switchable = false }: ThemeProviderProps) {
  const [manualTheme, setManualTheme] = useState(() => typeof window !== "undefined" && Boolean(window.localStorage.getItem(THEME_STORAGE_KEY)));
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme ?? "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    return stored === "dark" || stored === "light" ? stored : defaultTheme ?? getSystemTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    if (switchable && manualTheme) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, switchable, manualTheme]);

  useEffect(() => {
    if (!switchable || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, [switchable]);

  const toggleTheme = switchable ? () => { setManualTheme(true); setTheme((previous) => previous === "light" ? "dark" : "light"); } : undefined;
  return <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
