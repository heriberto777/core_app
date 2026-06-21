/**
 * styles/tokens.js
 * Sistema de diseño: variables de espaciado, tipografía, bordes y colores de marca.
 * Separado de iconos e imágenes para facilitar el tree-shaking y mantener SoC.
 *
 * Refactor de variables.jsx: las variables de diseño ahora tienen su propio módulo.
 */

export const Spacing = {
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
};

export const BorderRadius = {
    base: "6px",
};

export const Sidebar = {
    width: "300px",
    widthCollapsed: "10vw",
};

export const Typography = {
    xs: "0.75em",
    sm: "0.875em",
    md: "1em",
    base: "16px",   // pixel base del sistema
    lg: "1.25em",
    xl: "2em",
    xxl: "3em",
    xxxl: "4em",
    button: "0.875em",
};

// Breakpoints nombrados (referencia interna al proyecto)
export const Breakpoints = {
    maggie: "15em",   // ~240px — extra small
    lisa: "30em",     // ~480px — small
    bart: "48em",     // ~768px — medium
    marge: "62em",    // ~992px — large
    homer: "75em",    // ~1200px — extra large
};

// Paleta de colores de marca (complementa el sistema de temas Light/Dark)
export const Colors = {
    primary: "#151c84",
    secondary: "#c81416",
    success: "#53B257",
    successBg: "#e6ffe7",
    danger: "#F54E41",
    dangerBg: "#fbcbc9",
    // Aliases semánticos
    income: "#53B257",
    incomeBg: "#e6ffe7",
    expense: "#fe6156",
    expenseBg: "#fbcbc9",
};

// Sombras reutilizables
export const Shadows = {
    gray: "-2px 14px 20px -4px rgba(0,0,0,0.4)",
};
