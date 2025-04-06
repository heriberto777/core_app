import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { TransferApi, useAuth } from "../../index";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaEye } from "react-icons/fa";
import Swal from "sweetalert2";

const api = new TransferApi();

export function MappingsList({
  onSelectMapping,
  onEditMapping,
  onCreateMapping,
}) {
  const { accessToken } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    try {
      setLoading(true);
      const data = await api.getMappings(accessToken);
      setMappings(data);
      setLoading(false);
    } catch (error) {
      console.error("Error al cargar configuraciones:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar las configuraciones",
      });
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar configuración?",
        text: `¿Está seguro de eliminar la configuración "${name}"?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        await api.deleteMapping(accessToken, id);
        Swal.fire("Eliminado", "La configuración ha sido eliminada", "success");
        loadMappings();
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo eliminar la configuración",
      });
    }
  };

  const filteredMappings = mappings.filter(
    (mapping) =>
      mapping.name.toLowerCase().includes(search.toLowerCase()) ||
      mapping.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Container>
      <HeaderSection>
        <h2>Configuraciones de Mapeo</h2>
        <ActionsBar>
          <SearchContainer>
            <SearchInput
              type="text"
              placeholder="Buscar configuración..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SearchIcon>
              <FaSearch />
            </SearchIcon>
          </SearchContainer>
          <Button onClick={onCreateMapping}>
            <FaPlus /> Nueva Configuración
          </Button>
        </ActionsBar>
      </HeaderSection>

      {loading ? (
        <LoadingMessage>Cargando configuraciones...</LoadingMessage>
      ) : (
        <>
          {filteredMappings.length === 0 ? (
            <EmptyMessage>
              No se encontraron configuraciones de mapeo.
            </EmptyMessage>
          ) : (
            <TableContainer>
              <Table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Servidor Origen</th>
                    <th>Servidor Destino</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappings.map((mapping) => (
                    <tr key={mapping._id}>
                      <td>{mapping.name}</td>
                      <td>{mapping.description || "-"}</td>
                      <td>{mapping.transferType}</td>
                      <td>{mapping.sourceServer}</td>
                      <td>{mapping.targetServer}</td>
                      <td>
                        <StatusBadge $active={mapping.active}>
                          {mapping.active ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </td>
                      <td>
                        <ActionButtons>
                          <ActionButton
                            title="Ver documentos"
                            onClick={() => onSelectMapping(mapping._id)}
                          >
                            <FaEye />
                          </ActionButton>
                          <ActionButton
                            title="Editar configuración"
                            onClick={() => onEditMapping(mapping._id)}
                          >
                            <FaEdit />
                          </ActionButton>
                          <ActionButton
                            title="Eliminar configuración"
                            $danger
                            onClick={() =>
                              handleDelete(mapping._id, mapping.name)
                            }
                          >
                            <FaTrash />
                          </ActionButton>
                        </ActionButtons>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Container>
  );
}

// Estilos
const Container = styled.div`
  padding: 20px;
  background-color: ${(props) => props.theme.bg};
  color: ${(props) => props.theme.text};
`;

const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;

  h2 {
    margin: 0 0 15px 0;
    color: ${(props) => props.theme.title};
  }
`;

const ActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  flex: 1;
  max-width: 400px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 15px 10px 35px;
  border: 1px solid ${(props) => props.theme.border};
  border-radius: 4px;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.inputBg};
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${(props) => props.theme.textSecondary};
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: ${(props) => props.theme.primary};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background-color: ${(props) => props.theme.primaryHover};
  }
`;

const TableContainer = styled.div`
  overflow-x: auto;
  margin-top: 20px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid ${(props) => props.theme.border};
  }

  th {
    background-color: ${(props) => props.theme.tableHeader};
    color: ${(props) => props.theme.tableHeaderText};
    font-weight: 600;
  }

  tr:hover td {
    background-color: ${(props) => props.theme.tableHover};
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 5px;
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: ${(props) =>
    props.$danger ? props.theme.danger : props.theme.primary};
  padding: 5px;

  &:hover {
    color: ${(props) =>
      props.$danger ? props.theme.dangerHover : props.theme.primaryHover};
    transform: scale(1.1);
  }
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 12px;
  background-color: ${(props) =>
    props.$active ? props.theme.success : props.theme.secondary};
  color: white;
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: ${(props) => props.theme.textSecondary};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: 30px;
  color: ${(props) => props.theme.textSecondary};
  background-color: ${(props) => props.theme.cardBg};
  border-radius: 8px;
  margin-top: 20px;
`;
