import React, { useState } from "react";
import {
  useAuth,
  useDBConnections,
  DBConnectionModal,
  Button,
  StatusBadge,
  LoadingUI
} from "../../index";
import { FaPlus, FaDatabase, FaServer, FaPlug, FaTrash, FaEdit } from "react-icons/fa";
import Swal from "sweetalert2";

/**
 * DatabaseConnections (Tailwind Edition)
 * Gestión de la infraestructura de datos con diseño corporativo suave.
 */
export function DatabaseConnections() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);

  const { accessToken } = useAuth();
  const {
    connections,
    loading,
    actions
  } = useDBConnections(accessToken);

  const handleEdit = (conn) => {
    setSelectedConnection(conn);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedConnection(null);
    setModalOpen(true);
  };

  const handleDelete = async (serverName) => {
    const result = await Swal.fire({
      title: '¿Eliminar conexión?',
      text: "Esta acción no se puede deshacer y puede afectar los mapeos activos.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await actions.deleteConnection(serverName);
        Swal.fire('Eliminado', 'La conexión ha sido removida.', 'success');
      } catch (e) {
        Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
      }
    }
  };

  const handleSave = async (data) => {
    try {
      await actions.saveConnection(data);
      setModalOpen(false);
      Swal.fire('Guardado', 'Configuración actualizada correctamente.', 'success');
    } catch (e) {
      Swal.fire('Error', e.message || 'Error al guardar', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1440px] mx-auto p-6 lg:p-10 animate-fadeIn">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Infraestructura de Datos</h1>
          <p className="text-slate-500 mt-2 font-medium">Gestión de conexiones y servidores de bases de datos del ecosistema.</p>
        </div>
        <Button variant="primary" onClick={handleAdd}>
          <FaPlus /> Nueva Conexión
        </Button>
      </header>

      {/* CONTENT */}
      {loading ? (
        <LoadingUI message="Escaneando infraestructura de datos..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {connections.map((conn) => (
            <div 
              key={conn.serverName} 
              className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-soft hover:shadow-lg transition-all duration-300 group hover:-translate-y-1 flex flex-col gap-6"
            >
              {/* CARD HEADER */}
              <div className="flex justify-between items-start">
                <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-300">
                  <FaDatabase />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleEdit(conn)}
                    className="p-2.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    <FaEdit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(conn.serverName)}
                    className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <FaTrash size={16} />
                  </button>
                </div>
              </div>

              {/* INFO */}
              <div className="space-y-3">
                <h3 className="text-lg font-extrabold text-slate-800 tracking-tight truncate" title={conn.serverName}>
                  {conn.serverName}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                    <FaServer className="text-slate-300" />
                    <span className="truncate" title={conn.host}>{conn.host}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
                    <FaPlug className="text-slate-300" />
                    <span>Puerto: {conn.port}</span>
                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div className="mt-auto pt-5 border-t border-slate-50 flex items-center justify-between">
                <StatusBadge status="ACTIVE">{conn.type?.toUpperCase() || 'MSSQL'}</StatusBadge>
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Servidor Activo</div>
              </div>
            </div>
          ))}

          {/* EMPTY STATE OR ADD CARD */}
          {connections.length === 0 && (
            <div className="md:col-span-2 lg:col-span-3 xl:col-span-4 p-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/50">
               <FaDatabase className="text-slate-200 mb-6" size={64} />
               <p className="text-xl font-extrabold text-slate-400">No hay servidores configurados</p>
               <p className="text-sm text-slate-400 mt-2">Comienza agregando tu primera conexión a base de datos.</p>
               <Button variant="primary" onClick={handleAdd} className="mt-8">
                  <FaPlus /> Configurar Servidor
               </Button>
            </div>
          )}
        </div>
      )}

      <DBConnectionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onTest={actions.testConnection}
        initialData={selectedConnection}
      />
    </div>
  );
}
