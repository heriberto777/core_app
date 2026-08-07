import { useState, useCallback } from "react";
import { EmailRecipientApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const cnnApi = new EmailRecipientApi();

export const useEmailRecipients = (accessToken) => {
    const fetchRecipientsCallback = useCallback(async () => {
        if (!accessToken) return [];
        return await cnnApi.getRecipients(accessToken);
    }, [accessToken]);

    // useFetchData no soporta autoRefresh/refreshInterval (los ignora en
    // silencio) — no hay un auto-refresh real detrás de esas opciones.
    const {
        data: recipients,
        loading,
        refreshing,
        error,
        fetchData: fetchRecipients,
    } = useFetchData(fetchRecipientsCallback, [accessToken], {
        initialData: [],
    });

    const createRecipient = async (data) => {
        const response = await cnnApi.createRecipient(accessToken, data);
        await fetchRecipients();
        return response;
    };

    const updateRecipient = async (id, data) => {
        const response = await cnnApi.updateRecipient(accessToken, id, data);
        await fetchRecipients();
        return response;
    };

    const deleteRecipient = async (id) => {
        const response = await cnnApi.deleteRecipient(accessToken, id);
        await fetchRecipients();
        return response;
    };

    const toggleStatus = async (id) => {
        const response = await cnnApi.toggleSendStatus(accessToken, id);
        await fetchRecipients();
        return response;
    };

    const initializeDefaults = async () => {
        const response = await cnnApi.initializeDefaults(accessToken);
        await fetchRecipients();
        return response;
    };

    return {
        recipients,
        loading,
        refreshing,
        error,
        actions: {
            fetchRecipients,
            createRecipient,
            updateRecipient,
            deleteRecipient,
            toggleStatus,
            initializeDefaults
        }
    };
};
