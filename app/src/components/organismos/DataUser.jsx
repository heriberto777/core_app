import styled from "styled-components";
import {
  useAuth,
  BotonCircular,
  ListaMenuDesplegable
} from "../../index";
import { v } from "../../styles/index";
import { ENV, DesplegableUser } from "../../utils/index";
import { useNavigate } from "react-router-dom";
import { memo, useCallback } from "react";
import { FaUser } from "react-icons/fa";

// 🔹 Función para obtener el Avatar según el rol
const getAvatarByRole = (role) => {
  const avatars = {
    almacen: v.imgDogUser,
    facturacion: v.imgFacturacion,
    admin: v.imgHackerUser,
    ventas: v.imgVentas,
    contabilidad: v.imgContabilidad,
    despacho: v.imgDespacho,
    devolucion: v.imgDespacho,
  };

  return avatars[role] || v.imgUsuarios;
};

export const DataUser = memo(({ stateConfig }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAction = useCallback(
    (action) => {
      if (action === "cerrarsesion") {
        logout();
        navigate("/");
      } else if (action === "perfil") {
        // ✅ Agregar navegación al perfil
        navigate("/perfil");
        stateConfig.setOpenState(false); // Cerrar el menú
      }
    },
    [logout, navigate, stateConfig]
  );

  return (
    <Container onClick={stateConfig?.setOpenState}>
      <div className="imgContainer">
        {user.avatar ? (
          <img src={`${ENV.BASE_PATH}/${user.avatar}`} alt="Avatar" />
        ) : (
          <FaUser />
        )}
      </div>

      {user?.role?.includes("admin") && (
        <BotonCircular
          icono={<v.iconocorona />}
          width="15px"
          height="15px"
          bgcolor="#f7cf4d"
          textColor="#f15309"
          fontsize="11px"
          translateX="-50px"
          translateY="-12px"
        />
      )}

      <span className="nombre">
        {user?.name} {user?.lastname}
      </span>

      {stateConfig?.openstate && (
        <ListaMenuDesplegable
          data={DesplegableUser}
          top="55px"
          funcion={handleAction}
        />
      )}
    </Container>
  );
});

const Container = styled.div`
  position: relative;
  top: 0;
  right: 0;
  width: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  border-radius: 50px;
  margin: 15px;
  background-color: ${({ theme }) => theme.bg};
  cursor: pointer;

  .imgContainer {
    height: 40px;
    width: 40px;
    min-height: 40px;
    min-width: 40px;
    border-radius: 50%;
    overflow: hidden;
    margin-right: 22px;
    display: flex;
    justify-content: center;
    align-items: center;

    img {
      width: 100%;
      object-fit: cover;
    }

    svg {
      width: 100%;
    }
  }

  &:hover {
    background-color: ${({ theme }) => theme.bg3};
  }

  .nombre {
    width: 100%;
    font-weight: 500;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    word-wrap: break-word;
  }

  @media (max-width: 480px) {
    width: 160px; /* Reducir ancho en móviles muy pequeños */
    margin: 10px;

    .nombre {
      font-size: 0.85rem; /* Texto más pequeño */
      max-width: 80px; /* Limitar ancho del texto */
    }

    .imgContainer {
      margin-right: 10px; /* Menos espacio entre imagen y texto */
    }
  }
`;
