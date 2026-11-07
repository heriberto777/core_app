import { createContext, useContext, useEffect, useState } from "react";
import { AdminRouter } from "./routers/AdminRouter";
import { AuthContext } from "./contexts/AuthContexts";
import { ReloadProvider } from "./contexts/ReloadProvider";
import { HelmetProvider } from "react-helmet-async";

export const ThemeContext = createContext(null);

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage no disponible (modo privado, etc.) — seguir con el resto de la deteccion
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
};

export function App() {
  const { user } = useContext(AuthContext);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (user?.theme && (user.theme === "light" || user.theme === "dark")) {
      setTheme(user.theme);
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignorar si localStorage no esta disponible
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((curr) => (curr === "light" ? "dark" : "light"));
  };
  return (
    <HelmetProvider>
      <ThemeContext.Provider value={{ toggleTheme, theme }}>
        <ReloadProvider>
          <AdminRouter />
        </ReloadProvider>
      </ThemeContext.Provider>
    </HelmetProvider>
  );
}
