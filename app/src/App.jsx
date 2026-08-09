import { createContext, useContext, useEffect, useState } from "react";
import { AdminRouter } from "./routers/AdminRouter";
import { AuthContext } from "./contexts/AuthContexts";
import { ReloadProvider } from "./contexts/ReloadProvider";
import { HelmetProvider } from "react-helmet-async";

export const ThemeContext = createContext(null);

export function App() {
  const { user } = useContext(AuthContext);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (user && user?.theme) {
      setTheme(user?.theme);
    }
  }, [user]);

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
