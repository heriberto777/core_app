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

/**
 * Corporate DataUser (Tailwind Edition)
 */
export const DataUser = memo(({ stateConfig }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAction = useCallback(
    (action) => {
      if (action === "cerrarsesion") {
        logout();
        navigate("/");
      } else if (action === "perfil") {
        navigate("/perfil");
        stateConfig.setOpenState(false);
      }
    },
    [logout, navigate, stateConfig]
  );

  return (
    <div 
      onClick={() => stateConfig?.setOpenState(!stateConfig?.openstate)}
      className="relative flex items-center gap-3 p-1.5 pr-4 rounded-full bg-white border border-slate-200 shadow-soft hover:bg-slate-50 transition-all cursor-pointer group"
    >
      {/* AVATAR CONTAINER */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:ring-primary-100 transition-all">
        {user.avatar ? (
          <img src={`${ENV.BASE_PATH}/${user.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <FaUser className="text-primary-600" size={18} />
        )}
      </div>

      {/* ADMIN CORONA */}
      {user?.role?.includes("admin") && (
        <div className="absolute -top-1 -left-1">
          <BotonCircular
            icono={<v.iconocorona />}
            width="16px"
            height="16px"
            bgcolor="#f7cf4d"
            textColor="#f15309"
            fontsize="10px"
          />
        </div>
      )}

      {/* NAME */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-bold text-slate-700 truncate max-w-[120px] md:max-w-[150px]">
          {user?.name} {user?.lastname}
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {user?.role?.includes("admin") ? "Administrador" : "Usuario"}
        </span>
      </div>

      {/* DROPDOWN */}
      {stateConfig?.openstate && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 animate-slideUp">
          <ListaMenuDesplegable
            data={DesplegableUser}
            top="0"
            funcion={handleAction}
          />
        </div>
      )}
    </div>
  );
});

export default DataUser;
