import { useEffect, useRef } from "react";
import { ContentHeader, DataUser } from "../../index";
export function Header({ stateConfig }) {
  const headerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Solo cerrar si el menú está abierto
      if (
        stateConfig.openstate &&
        headerRef.current &&
        !headerRef.current.contains(event.target)
      ) {
        stateConfig.setOpenState(false);
      }
    };

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [stateConfig.openstate]); // Dependencia: solo ejecutar cuando openstate cambia

  return (
    <ContentHeader ref={headerRef}>
      <div
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <DataUser stateConfig={stateConfig} />
      </div>
    </ContentHeader>
  );
}
