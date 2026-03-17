import { useCallback } from "react";
import { EmailConfigApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const emailConfigApi = new EmailConfigApi();
const FETCH_INTERVAL = 5000;

export function useEmailConfig(accessToken) {
    const fetchConfigsCallback = useCallback(async () => {
        return await emailConfigApi.getConfigs(accessToken);
    }, [accessToken]);

    const {
        data: configs,
        loading,
        refreshing,
        loadingState,
        error,
        refetch,
    } = useFetchData(fetchConfigsCallback, [accessToken], {
        autoRefresh: true,
        refreshInterval: FETCH_INTERVAL,
        enableCache: true,
        cacheTime: 60000,
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

    const initializeDefaults = async () => {
        await emailConfigApi.initializeDefaults(accessToken);
        await refetch();
    };

    const testConfig = async (id, testEmail) => {
        return await emailConfigApi.testConfig(accessToken, id, testEmail);
    };

    return {
        configs,
        loading,
        refreshing,
        loadingState,
        error,
        refetch,
        actions: {
            createConfig,
            updateConfig,
            deleteConfig,
            toggleStatus,
            setAsDefault,
            initializeDefaults,
            testConfig,
        },
    };
}
