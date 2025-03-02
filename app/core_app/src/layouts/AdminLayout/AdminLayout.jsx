import React, { useState } from "react";
import styled from "styled-components";
import { Sidebar } from "../../index";
import { Device } from "../../styles/breakpoints";

export function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <Container className={sidebarOpen ? "active" : ""}>
      <div className="ContentSidebar">
        <Sidebar
          state={sidebarOpen}
          setState={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>
      <div className="ContentMenuambur">{/* Menu Ambur */}</div>
      <Containerbody>{children}</Containerbody>
    </Container>
  );
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  background: ${({ theme }) => theme.bgtotal};
  transition: all 0.2s ease-in-out;

  .ContentSidebar {
    display: none;
  }

  .ContentMenuambur {
    display: block;
    position: absolute;
    left: 20px;
  }

  /* Cambios para mobile */
  @media ${Device.mobile} {
    .ContentSidebar {
      display: none;
    }

    .ContentMenuambur {
      display: block;
    }
  }

  /* Cambios para tablet en adelante */
  @media ${Device.tablet} {
    grid-template-columns: 65px 1fr;

    &.active {
      grid-template-columns: 220px 1fr;
    }

    .ContentSidebar {
      display: initial;
    }

    .ContentMenuambur {
      display: none;
    }
  }

  /* Para laptops más grandes o escritorio */
  @media ${Device.laptop} {
    grid-template-columns: 0px 1fr;
  }

  @media ${Device.desktop} {
    grid-template-columns: 55px 1fr;
  }
`;

const Containerbody = styled.div`
  grid-column: 1;
  width: 100%;

  @media ${Device.tablet} {
    grid-column: 2;
    padding: 0px;
  }

  @media ${Device.laptop} {
    padding: 0px;
  }

  @media ${Device.desktop} {
    padding: 0px;
  }
`;
