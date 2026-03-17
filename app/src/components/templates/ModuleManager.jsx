import React, { useState } from "react";
import styled from "styled-components";
import {
    Header,
    useAuth,
    useModules,
    usePermissions,
    ModuleFormModal,
    ModulesTable,
    Button
} from "../../index";
import { Container } from "../index";
import { FaPlus, FaSearch, FaCogs, FaSync, FaDownload, FaTools } from "react-icons/fa";
import Swal from "sweetalert2";

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
`;

const SearchBox = styled.div`
  position: relative;
  width: 100%;
  max-width: 400px;

  svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
  }

  input {
    width: 100%;
    padding: 12px 12px 12px 42px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: #3b82f6;
    }
  }
`;

const ActionsGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

export function ModuleManager() {
    const [openstate, setOpenState] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedModule, setSelectedModule] = useState(null);

    const { accessToken, reloadModuleConfig } = useAuth();
    const { hasPermission, isAdmin } = usePermissions();

    const {
        modules,
        loading,
        categories,
        availableActions,
        searchTerm,
        setSearchTerm,
        actions
    } = useModules(accessToken, reloadModuleConfig);

    const canCreate = hasPermission("modules", "create");

    const handleEdit = (module) => {
        setSelectedModule(module);
        setModalOpen(true);
    };

    const handleAdd = () => {
        setSelectedModule(null);
        setModalOpen(true);
    };

    const handleSave = async (data) => {
        try {
            await actions.saveModule(selectedModule?._id, data);
            setModalOpen(false);
            Swal.fire({
                icon: 'success',
                title: selectedModule ? 'Configuración actualizada' : 'Módulo registrado',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        } catch (e) {
            Swal.fire("Error", e.message || "Error al procesar el módulo", "error");
        }
    };

    const handleDelete = async (module) => {
        const result = await Swal.fire({
            title: '¿Extirpar módulo del sistema?',
            text: `Esta acción es crítica. Escribe "${module.name}" para confirmar la eliminación de "${module.displayName}".`,
            icon: 'warning',
            input: 'text',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Eliminar permanentemente',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (value !== module.name) {
                    return 'El nombre no coincide.';
                }
            }
        });

        if (result.isConfirmed) {
            try {
                await actions.deleteModule(module._id);
                Swal.fire('Extirpado', 'El servicio ha sido removido del ecosistema.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
            }
        }
    };

    const handleToggleStatus = async (module) => {
        try {
            await actions.toggleModuleStatus(module._id);
        } catch (e) {
            Swal.fire("Error", "No se pudo cambiar el estado del servicio", "error");
        }
    };

    const handleDuplicate = async (module) => {
        const { value: newNames } = await Swal.fire({
            title: 'Clonar Esquema de Módulo',
            html: `
        <div style="text-align: left;">
          <label style="font-size: 12px; color: #64748b;">NUEVO NOMBRE TÉCNICO</label>
          <input id="newName" class="swal2-input" value="${module.name}_copy">
          <label style="font-size: 12px; color: #64748b; margin-top: 10px; display: block;">NUEVO NOMBRE VISUAL</label>
          <input id="newDisp" class="swal2-input" value="${module.displayName} (Copia)">
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: 'Confirmar Clonación',
            preConfirm: () => ({
                newName: document.getElementById('newName').value,
                newDisplayName: document.getElementById('newDisp').value
            })
        });

        if (newNames) {
            try {
                await actions.duplicateModule(module._id, newNames);
                Swal.fire('Clonado', 'El esquema ha sido duplicado con éxito.', 'success');
            } catch (e) {
                Swal.fire('Error', e.message || 'Error al clonar', 'error');
            }
        }
    };

    const handleInvalidateCache = async () => {
        const result = await Swal.fire({
            title: '¿Invalidar caché global?',
            text: 'Esto forzará a todos los usuarios a recargar la configuración del sistema.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, sincronizar ahora',
            confirmButtonColor: '#3b82f6'
        });

        if (result.isConfirmed) {
            try {
                await actions.invalidateCache();
                Swal.fire('Sincronizado', 'El caché del sistema ha sido invalidado.', 'success');
            } catch (e) {
                Swal.fire('Error', 'No se pudo sincronizar', 'error');
            }
        }
    };

    const handleInitialize = async () => {
        try {
            await actions.initializeSystemModules();
            Swal.fire('Éxito', 'Módulos base inicializados correctamente.', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudieron inicializar los módulos', 'error');
        }
    };

    return (
        <Container>
            <main style={{ padding: '40px 20px' }}>
                <Layout>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '8px', color: 'inherit' }}>Arquitectura Modular</h1>
                            <p style={{ opacity: 0.7 }}>Supervisa y configura los micro-servicios y capacidades del ecosistema.</p>
                        </div>
                        {isAdmin && (
                            <ActionsGroup>
                                <Button variant="ghost" onClick={handleInvalidateCache} title="Sincronizar Caché">
                                    <FaSync />
                                </Button>
                                <Button variant="ghost" onClick={() => actions.exportModules()} title="Exportar Esquema JSON">
                                    <FaDownload />
                                </Button>
                                <Button variant="ghost" onClick={handleInitialize} title="Reparar Módulos Base">
                                    <FaTools />
                                </Button>
                            </ActionsGroup>
                        )}
                    </div>

                    <Toolbar>
                        <SearchBox>
                            <FaSearch />
                            <input
                                placeholder="Buscar por servicio, categoría o slug..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </SearchBox>
                        {canCreate && (
                            <Button variant="primary" onClick={handleAdd}>
                                <FaPlus /> Registrar Nuevo Componente
                            </Button>
                        )}
                    </Toolbar>

                    {loading && modules.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '100px', opacity: 0.7 }}>
                            <FaCogs size={48} style={{ opacity: 0.3, marginBottom: '20px' }} />
                            <p>Escaneando infraestructura modular...</p>
                        </div>
                    ) : (
                        <ModulesTable
                            data={modules}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            onToggleStatus={handleToggleStatus}
                        />
                    )}

                    <ModuleFormModal
                        isOpen={modalOpen}
                        onClose={() => setModalOpen(false)}
                        onSave={handleSave}
                        initialData={selectedModule}
                        categories={categories}
                        availableActions={availableActions}
                    />
                </Layout>
            </main>
        </Container>
    );
}
