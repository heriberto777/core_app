const sizes = {
  mobile: "576px",
  tablet: "768px",
  laptop: "992px",
  desktop: "1200px",
  largeDesktop: "1600px",
};
export const Device = {
  // Min-width (desde este tamaño en adelante)
  mobile: `(min-width: ${sizes.mobile})`,
  tablet: `(min-width: ${sizes.tablet})`,
  laptop: `(min-width: ${sizes.laptop})`,
  desktop: `(min-width: ${sizes.desktop})`,
  desktop4k: `(min-width: ${sizes.largeDesktop})`,

  // Max-width (hasta este tamaño)
  smallMobile: `(max-width: ${sizes.mobile})`,
  belowTablet: `(max-width: ${sizes.tablet})`,
  belowLaptop: `(max-width: ${sizes.laptop})`,
  belowDesktop: `(max-width: ${sizes.desktop})`,

  // Rangos específicos
  onlyMobile: `(min-width: ${sizes.mobile}) and (max-width: ${sizes.tablet})`,
  onlyTablet: `(min-width: ${sizes.tablet}) and (max-width: ${sizes.laptop})`,
  onlyLaptop: `(min-width: ${sizes.laptop}) and (max-width: ${sizes.desktop})`,
};
