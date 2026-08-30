import { useState, useCallback, useEffect } from "react";
import { ClusterBaseApi } from "../api/index";
import Swal from "sweetalert2";

const clusterBaseApi = new ClusterBaseApi();

export function useClusterBase(accessToken) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadClusterBase = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await clusterBaseApi.getClusterBase(accessToken);
      setRows(data);
    } catch (error) {
      console.error("Error cargando objetivos base:", error);
      Swal.fire("Error", "No se pudieron cargar los objetivos base", "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadClusterBase();
  }, [loadClusterBase]);

  const saveClusterBase = async (organization, values) => {
    setSaving(true);
    try {
      const resp = organization
        ? await clusterBaseApi.updateClusterBase(accessToken, organization, values)
        : await clusterBaseApi.createClusterBase(accessToken, values);
      await loadClusterBase();
      return resp;
    } finally {
      setSaving(false);
    }
  };

  const deleteClusterBase = async (organization) => {
    await clusterBaseApi.deleteClusterBase(accessToken, organization);
    await loadClusterBase();
  };

  return {
    rows,
    loading,
    saving,
    actions: {
      loadClusterBase,
      saveClusterBase,
      deleteClusterBase,
    },
  };
}
