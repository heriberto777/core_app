import { useEffect, useRef, useContext } from "react";
import { DataUser } from "../../index";
import { v } from "../../styles/index";
import { FaBars, FaTimes } from "react-icons/fa";
import { LayoutContext } from "../../layouts/AdminLayout/AdminLayout";

/**
 * Corporate Header (Tailwind Edition)
 */
export function Header({ stateConfig, sidebarConfig }) {
  const headerRef = useRef(null);
  const layoutContext = useContext(LayoutContext);

  const toggleSidebar = layoutContext?.toggleSidebar || sidebarConfig?.toggleSidebar;
  const isOpen = layoutContext?.sidebarOpen || sidebarConfig?.isOpen;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        stateConfig.openstate &&
        headerRef.current &&
        !headerRef.current.contains(event.target)
      ) {
        stateConfig.setOpenState(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [stateConfig?.openstate]);

  return (
    <div ref={headerRef} className="flex justify-between items-center w-full h-full px-6">
      <div className="flex items-center gap-6">
        {/* SIDEBAR TOGGLE */}
        <button 
          onClick={toggleSidebar}
          className="p-2.5 rounded-xl text-primary-600 hover:bg-primary-50 transition-all sidebar-toggle shadow-sm active:scale-95"
        >
          {isOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
        </button>

        {/* LOGO */}
        <div className="flex items-center h-[50px]">
          <img 
            src={v.logoLetra} 
            alt="Logo" 
            className="h-8 md:h-10 object-contain transition-transform duration-300 hover:scale-105"
          />
        </div>
      </div>

      {/* USER SECTION */}
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <DataUser stateConfig={stateConfig} />
      </div>
    </div>
  );
}

export default Header;
