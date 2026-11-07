import {
  useAuth,
  usePermissions,
  BotonCircular,
  ListaMenuDesplegable
} from "../../index";
import { v } from "../../styles/index";
import { ENV, DesplegableUser } from "../../utils/index";
import { useNavigate } from "react-router-dom";
import { memo, useCallback } from "react";
import { FaUser, FaSignOutAlt } from "react-icons/fa";

/**
 * Corporate DataUser (Tailwind Edition)
 *
 * `mobile`: el menú desplegable (ListaMenuDesplegable) se posiciona
 * `absolute` respecto a este componente, algo que funciona bien en el
 * header de escritorio pero no dentro del panel móvil (una lista larga con
 * scroll) — ahí el menú quedaba flotando fuera de lugar, superpuesto con
 * el contenido de abajo. En mobile, "Mi perfil"/"Cerrar sesión" se
 * muestran siempre visibles en línea, sin necesidad de abrir un submenú.
 */
export const DataUser = memo(({ stateConfig, mobile = false }) => {
  const { user, logout } = useAuth();
  const { isAdmin } = usePermissions();
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

  if (mobile) {
    return (
      <div className="flex flex-col gap-1 pt-3 mt-1 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center border-2 border-white dark:border-slate-700 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700 shrink-0">
            {user.avatar ? (
              <img src={`${ENV.BASE_PATH}/${user.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <FaUser className="text-primary-600" size={18} />
            )}
            {isAdmin && (
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
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{user?.name} {user?.lastname}</span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {isAdmin ? "Administrador" : "Usuario"}
            </span>
          </div>
        </div>
        <button
          onClick={() => handleAction("perfil")}
          className="flex items-center gap-3 px-2 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-left"
        >
          <FaUser size={14} /> Mi perfil
        </button>
        <button
          onClick={() => handleAction("cerrarsesion")}
          className="flex items-center gap-3 px-2 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
        >
          <FaSignOutAlt size={14} /> Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div 
      onClick={() => stateConfig?.setOpenState(!stateConfig?.openstate)}
      className="relative flex items-center gap-3 p-1.5 pr-4 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-soft hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer group"
    >
      {/* AVATAR CONTAINER */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center border-2 border-white dark:border-slate-700 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700 group-hover:ring-primary-100 dark:group-hover:ring-primary-800 transition-all">
        {user.avatar ? (
          <img src={`${ENV.BASE_PATH}/${user.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <FaUser className="text-primary-600" size={18} />
        )}
      </div>

      {/* ADMIN CORONA */}
      {isAdmin && (
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
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px] md:max-w-[150px]">
          {user?.name} {user?.lastname}
        </span>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          {isAdmin ? "Administrador" : "Usuario"}
        </span>
      </div>

      {/* DROPDOWN */}
      {stateConfig?.openstate && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 animate-slideUp">
          <ListaMenuDesplegable
            data={DesplegableUser}
            funcion={handleAction}
          />
        </div>
      )}
    </div>
  );
});

export default DataUser;
