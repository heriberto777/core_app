import React, { useState } from "react";
import styled from "styled-components";
import {
  Header,
  useAuth,
  useDBConnections,
  DBConnectionModal,
  Button,
  StatusBadge
} from "../../index";
import { Container } from "../index";
import { FaPlus, FaDatabase, FaServer, FaPlug, FaTrash } from "react-icons/fa";
import Swal from "sweetalert2";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 24px;
  width: 100%;
`;

const ConnectionCard = styled.div`
  background: ${({ theme }) => theme.cardBg};
  backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 24px;
  padding: 24px;
  box-shadow: ${({ theme }) => theme.shadows.soft};
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: ${({ theme }) => theme.text};

  &:hover {
    transform: translateY(-8px);
    box-shadow: ${({ theme }) => theme.shadows.medium};
    border-color: ${({ theme }) => theme.primary}50;
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const DBIcon = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: ${({ theme }) => theme.primary}15;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.primary};
  font-size: 22px;
  box-shadow: 0 4px 12px ${({ theme }) => theme.primary}10;
`;

const Info = styled.div`
  h3 {
    font-size: 1.1rem;
    font-weight: 800;
    margin-bottom: 6px;
    color: ${({ theme }) => theme.titleColor};
  }
  p {
    font-size: 13px;
    color: ${({ theme }) => theme.textSecondary};
    opacity: 0.8;
  }
`;

export function DatabaseConnections() {
  const [openstate, setOpenState] = useState(false);
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
      text: "Esta acción no se puede deshacer.",
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
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '4px', color: 'inherit' }}>Conexiones a Bases de Datos</h1>
          <p style={{ opacity: 0.7, color: 'inherit', fontSize: '14px' }}>Gestión de la infraestructura de datos del sistema.</p>
        </div>
        <Button variant="primary" onClick={handleAdd}>
          <FaPlus /> Nueva Conexión
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px', opacity: 0.7 }}>Cargando infraestructura...</div>
      ) : (
        <Grid>
          {connections.map((conn) => (
            <ConnectionCard key={conn.serverName}>
              <CardHeader>
                <DBIcon>
                  <FaDatabase />
                </DBIcon>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="ghost" size="small" onClick={() => handleEdit(conn)}>Editar</Button>
                  <Button variant="ghost" size="small" onClick={() => handleDelete(conn.serverName)} color="#ef4444">
                    <FaTrash />
                  </Button>
                </div>
              </CardHeader>
              <Info>
                <h3>{conn.serverName}</h3>
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FaServer size={12} /> {conn.host}
                </p>
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <FaPlug size={12} /> Puerto: {conn.port}
                </p>
              </Info>
              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: `1px solid ${props => props.theme?.border || '#ddd'}40` }}>
                <StatusBadge variant="info">{conn.type?.toUpperCase() || 'MSSQL'}</StatusBadge>
              </div>
            </ConnectionCard>
          ))}
        </Grid>
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
