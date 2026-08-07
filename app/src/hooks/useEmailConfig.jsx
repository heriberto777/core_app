import { useCallback } from "react";
import { EmailConfigApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const emailConfigApi = new EmailConfigApi();

export function useEmailConfig(accessToken) {
    const fetchConfigsCallback = useCallback(async () => {
        return await emailConfigApi.getConfigs(accessToken);
    }, [accessToken]);

    // useFetchData solo expone {data, loading, error, refreshing, handleRefresh,
    // setData, fetchData} — no "refetch"/"loadingState"/"autoRefresh". Llamar a
    // un "refetch" inexistente lanzaba TypeError tras cada mutación exitosa,
    // haciendo que toda creación/edición/borrado pareciera fallar en la UI.
    const {
        data: configs,
        loading,
        refreshing,
        error,
        fetchData: refetch,
    } = useFetchData(fetchConfigsCallback, [accessToken], {
        initialData: [],
    });

    const createConfig = async (data) => {
        await emailConfigApi.createConfig(accessToken, data);
        await refetch();
    };

    const updateConfig = async (id, data) => {
        await emailConfigApi.updateConfig(accessToken, id, data);
        await refetch();
    };

    const deleteConfig = async (id) => {
        await emailConfigApi.deleteConfig(accessToken, id);
        await refetch();
    };

    const toggleStatus = async (id) => {
        await emailConfigApi.toggleStatus(accessToken, id);
        await refetch();
    };

    const setAsDefault = async (id) => {
        await emailConfigApi.setAsDefault(accessToken, id);
        await refetch();
    };

    const testConfig = async (id, testEmail) => {
        return await emailConfigApi.testConfig(accessToken, id, testEmail);
    };

    return {
        configs,
        loading,
        refreshing,
        error,
        refetch,
        actions: {
            createConfig,
            updateConfig,
            deleteConfig,
            toggleStatus,
            setAsDefault,
            testConfig,
        },
    };
}
