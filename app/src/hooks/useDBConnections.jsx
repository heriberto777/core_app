import { useState, useCallback } from "react";
import { DBConfigApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const dbConfigApi = new DBConfigApi();

export const useDBConnections = (accessToken) => {
    const fetchConnectionsCallback = useCallback(async () => {
        if (!accessToken) return [];
        return await dbConfigApi.getDBConfigs(accessToken);
    }, [accessToken]);

    const {
        data: connections,
        loading,
        refreshing,
        error,
        fetchData: refreshConnections,
    } = useFetchData(fetchConnectionsCallback, [accessToken], {
        initialData: [],
    });

    const saveConnection = async (configData) => {
        const result = await dbConfigApi.createDBConfig(accessToken, configData);
        await refreshConnections();
        return result;
    };

    const deleteConnection = async (serverName) => {
        const result = await dbConfigApi.deleteDBConfig(accessToken, serverName);
        await refreshConnections();
        return result;
    };

    const testConnection = async (configData) => {
        return await dbConfigApi.testConnection(accessToken, configData);
    };

    return {
        connections,
        loading,
        refreshing,
        error,
        actions: {
            refreshConnections,
            saveConnection,
            deleteConnection,
            testConnection
        }
    };
};
