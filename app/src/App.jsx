import { createContext, useContext, useEffect, useState } from "react";
import { AdminRouter, AuthContext, ReloadProvider, Light, Dark } from "./index";
import { ThemeProvider } from "styled-components";
import { HelmetProvider } from "react-helmet-async";

export const ThemeContext = createContext(null);

export function App() {
  const { user } = useContext(AuthContext);
  const [theme, setTheme] = useState("light");
  const themeStyle = theme === "light" ? Light : Dark;

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
        <ThemeProvider theme={themeStyle}>
          <ReloadProvider>
            <AdminRouter />
          </ReloadProvider>
        </ThemeProvider>
      </ThemeContext.Provider>
    </HelmetProvider>
  );
}
