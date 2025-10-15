// components/Navigation/DynamicSidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
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
      <EmptyNavigation>
        <p>No tienes acceso a ninguna sección del sistema</p>
      </EmptyNavigation>
    );
  }

  return (
    <NavigationContainer>
      {Object.entries(routesByCategory).map(([category, routes]) => (
        <CategorySection key={category}>
          <CategoryHeader
            onClick={() => toggleCategory(category)}
            isExpanded={expandedCategories.has(category)}
          >
            <CategoryTitle>{category}</CategoryTitle>
            <CategoryIcon>
              {expandedCategories.has(category) ? (
                <FaChevronDown />
              ) : (
                <FaChevronRight />
              )}
            </CategoryIcon>
          </CategoryHeader>

          {expandedCategories.has(category) && (
            <RoutesList>
              {routes.map((route) => {
                const IconComponent = iconMap[route.icon] || FaTachometerAlt;

                return (
                  <NavItem key={route.path} to={route.path}>
                    <RouteIcon>
                      <IconComponent />
                    </RouteIcon>
                    <RouteName>{route.name}</RouteName>
                  </NavItem>
                );
              })}
            </RoutesList>
          )}
        </CategorySection>
      ))}
    </NavigationContainer>
  );
}

// ⭐ STYLED COMPONENTS ⭐
const NavigationContainer = styled.nav`
  display: flex;
  flex-direction: column;
  padding: 16px;
  height: 100%;
`;

const EmptyNavigation = styled.div`
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-style: italic;

  p {
    margin: 0;
    font-size: 14px;
  }
`;

const CategorySection = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const CategoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;

  &:hover {
    background: #f3f4f6;
  }
`;

const CategoryTitle = styled.h3`
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
`;

const CategoryIcon = styled.div`
  color: #9ca3af;
  font-size: 12px;
`;

const RoutesList = styled.div`
  margin-top: 8px;
  margin-left: 8px;
  border-left: 2px solid #e5e7eb;
  padding-left: 8px;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  text-decoration: none;
  color: #6b7280;
  transition: all 0.2s ease;
  margin-bottom: 4px;

  &:hover {
    background: #f3f4f6;
    color: #3b82f6;
    transform: translateX(4px);
  }

  &.active {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }
`;

const RouteIcon = styled.div`
  display: flex;
  align-items: center;
  font-size: 16px;
  min-width: 16px;
`;

const RouteName = styled.span`
  font-weight: 500;
  font-size: 14px;
`;

export default DynamicSidebar;
