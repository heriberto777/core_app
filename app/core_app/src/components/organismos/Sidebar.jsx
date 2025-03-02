import React, { useContext } from "react";
import styled from "styled-components";
import SwitchMode from "react-switch";
import {
  v,
  LinkArray,
  ThemeContext,
  SecondarylinksArray,
  useAuth,
} from "../../index";
import { NavLink } from "react-router-dom";
import { Device } from "../../styles/breakpoints";
import { FaMoon, FaSun } from "react-icons/fa";

export function Sidebar({ state, setState }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { logout, user } = useAuth();

  const hasRole = (roles) => roles?.some((role) => user.role?.includes(role));
  const filteredLinkArray = LinkArray?.filter(({ roles }) => hasRole(roles));
  const filteredSecondarylinksArray = SecondarylinksArray?.filter(({ roles }) =>
    hasRole(roles)
  );

  return (
    <Main $isOpen={state}>
      <span className="Sidebarbutton" onClick={() => setState(!state)}>
        {<v.iconoflechaderecha />}
      </span>
      <Container $isOpen={state} className={state ? "active" : ""}>
        <div className="Logocontent">
          <div className="imgcontent">
            <img src={v.logoLetra} alt="Logo" />
          </div>
        </div>
        {filteredLinkArray.map(({ icon, label, to }) => (
          <div
            key={label}
            className={state ? "LinkContainer active" : "LinkContainer"}
          >
            <NavLink
              to={`${to}`}
              className={({ isActive }) => `Links${isActive ? ` active` : ``}`}
            >
              <div className="linkicon">{icon}</div>
              <span className={state ? "label_ver" : "label_oculto"}>
                {label}
              </span>
            </NavLink>
          </div>
        ))}
        <Divider />
        {filteredSecondarylinksArray.map(({ icon, label, to }) => (
          <div
            key={label}
            className={state ? "LinkContainer active" : "LinkContainer"}
          >
            {to ? (
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `Links${isActive ? ` active` : ``}`
                }
              >
                <div className="linkicon">{icon}</div>
                <span className={state ? "label_ver" : "label_oculto"}>
                  {label}
                </span>
              </NavLink>
            ) : (
              <button className="Links" onClick={logout}>
                <div className="linkicon">{icon}</div>
                <span className={state ? "label_ver" : "label_oculto"}>
                  {label}
                </span>
              </button>
            )}
          </div>
        ))}
        <div className="controles">
          <SwitchMode
            onChange={toggleTheme}
            checked={theme === "dark"}
            uncheckedIcon={<FaMoon style={customIconStyles} />}
            checkedIcon={<FaSun style={customIconStyles} />}
            height={24}
            width={48}
            handleDiameter={20}
          />
        </div>
      </Container>
    </Main>
  );
}

const Container = styled.div`
  color: ${(props) => props.theme.text};
  background: ${(props) => props.theme.bg};
  position: fixed;
  padding-top: 20px;
  z-index: 1;
  height: 100%;
  width: 65px;
  transition: 0.1s ease-in-out;
  overflow-y: auto;
  overflow-x: hidden;
  &::-webkit-scrollbar {
    width: 6px;
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: ${(props) => props.theme.colorScroll};
    border-radius: 10px;
  }
  &.active {
    width: 220px;
  }
  .Logocontent {
    display: flex;
    justify-content: center;
    align-items: center;
    padding-bottom: 60px;
    .imgcontent {
      display: flex;
      justify-content: center;
      align-items: center;
      width: ${({ $isOpen }) => ($isOpen ? `100%` : `30px`)};
      cursor: pointer;
      transition: 0.3s ease;
      transform: ${({ $isOpen }) => ($isOpen ? `scale(0.7)` : `scale(1.5)`)}
        rotate(${({ theme }) => theme.logorotate});
      img {
        width: 100%;
        animation: flotar 1.7s ease-in-out infinite alternate;
      }
    }
    h2 {
      display: ${({ $isOpen }) => ($isOpen ? `block` : `none`)};
    }
    @keyframes flotar {
      0% {
        transform: translate(0, 0px);
      }
      50% {
        transform: translate(0, 4px);
      }
      100% {
        transform: translate(0, -0px);
      }
    }
  }
  .LinkContainer {
    margin: 5px 0;
    transition: all 0.3s ease-in-out;
    padding: 0 5%;
    position: relative;
    &:hover {
      background: ${(props) => props.theme.bgAlpha};
    }
    .Links {
      display: flex;
      align-items: center;
      text-decoration: none;
      padding: calc(${() => v.smSpacing} - 2px) 0;
      color: ${(props) => props.theme.text};
      height: 60px;
      .linkicon {
        padding: ${() => v.smSpacing} ${() => v.mdSpacing};
        display: flex;
        svg {
          font-size: 25px;
        }
      }
      .label_ver {
        transition: 0.3s ease-in-out;
        opacity: 1;
      }
      .label_oculto {
        opacity: 0;
      }
      &.active {
        color: ${(props) => props.theme.bg5};
        font-weight: 600;
        &::before {
          content: "";
          position: absolute;
          height: 100%;
          background: ${(props) => props.theme.bg5};
          width: 4px;
          border-radius: 10px;
          left: 0;
        }
      }
    }
    &.active {
      padding: 0;
    }
  }
  .controles {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    ${(props) => props.theme.text};
    @media ${Device.tablet} {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px;
      margin-bottom: 10px;
      gap: 10px;
      color: ${(props) => props.theme.text};
    }
  }
`;

const Main = styled.div`
  .Sidebarbutton {
    position: fixed;
    top: 70px;
    left: 42px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: ${(props) => props.theme.bgtgderecha};
    box-shadow: 0 0 4px ${(props) => props.theme.bg3},
      0 0 7px ${(props) => props.theme.bg};
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 2;
    transform: ${({ $isOpen }) =>
      $isOpen ? `translateX(162px) rotate(3.142rad)` : `initial`};
    color: ${(props) => props.theme.text};
  }
`;

const Divider = styled.div`
  height: 1px;
  width: 100%;
  background: ${(props) => props.theme.bg4};
  margin: ${() => v.lgSpacing} 0;
`;

// const customIconStyles = {
//   display: "flex",
//   justifyContent: "center",
//   align-items: "center",
//   height: "100%",
//   width: "100%",
//   fontSize: "1.5rem",
// };

const customIconStyles = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  width: "100%",
  fontSize: "1.5rem", // Ajusta el tamaño del icono aquí
};
