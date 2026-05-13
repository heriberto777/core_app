// components/Navigation/DynamicSidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { usePermissions } from "../../index";
import {
  FaUsers,
  FaShieldAlt,
  FaCog,
  FaTasks,
  FaTruck,
  FaChartBar,
  FaChartLine,
  FaTachometerAlt,
  FaUser,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";

// Mapa de iconos
const iconMap = {
  FaUsers,
  FaShieldAlt,
  FaCog,
  FaTasks,
  FaTruck,
  FaChartBar,
  FaChartLine,
  FaTachometerAlt,
  FaUser,
};

export function DynamicSidebar() {
  const { getRoutesByCategory } = usePermissions();
  const [expandedCategories, setExpandedCategories] = React.useState(
    new Set(["General", "Operaciones"])
  );

  const toggleCategory = (category) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const routesByCategory = getRoutesByCategory;

  if (Object.keys(routesByCategory).length === 0) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-4 opacity-50 italic">
        <FaShieldAlt className="text-3xl" />
        <p className="text-xs font-black uppercase tracking-widest leading-relaxed">No tienes acceso a ninguna sección del sistema</p>
      </div>
    );
  }

  return (
    <nav className="flex flex-col p-6 h-full space-y-8 animate-in fade-in duration-700">
      {Object.entries(routesByCategory).map(([category, routes]) => (
        <div key={category} className="space-y-3">
          <div
            onClick={() => toggleCategory(category)}
            className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-xl hover:bg-slate-50 transition-all group select-none"
          >
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-slate-600 transition-colors">
              {category}
            </h3>
            <div className="text-[10px] text-slate-300 group-hover:text-slate-500 transition-colors">
              {expandedCategories.has(category) ? (
                <FaChevronDown />
              ) : (
                <FaChevronRight />
              )}
            </div>
          </div>

          <div className={`overflow-hidden transition-all duration-500 ease-in-out ${
            expandedCategories.has(category) ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          }`}>
            <div className="space-y-1 pl-2">
              {routes.map((route) => {
                const IconComponent = iconMap[route.icon] || FaTachometerAlt;

                return (
                  <NavLink 
                    key={route.path} 
                    to={route.path}
                    className={({ isActive }) => `
                      flex items-center gap-3 p-3 rounded-2xl no-underline transition-all duration-300 group
                      ${isActive 
                        ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" 
                        : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600 hover:translate-x-1"}
                    `}
                  >
                    <div className="text-lg min-w-[20px] flex items-center justify-center">
                      <IconComponent className="transition-transform group-hover:scale-110 duration-300" />
                    </div>
                    <span className="font-black text-[11px] uppercase tracking-wider">{route.name}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </nav>
  );
}

export default DynamicSidebar;
