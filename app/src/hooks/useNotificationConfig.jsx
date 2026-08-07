import { useCallback } from "react";
import { NotificationConfigApi } from "../api/index";
import { useFetchData } from "./useFetchData";

const notificationConfigApi = new NotificationConfigApi();

export function useNotificationConfig(accessToken) {
    const fetchConfigCallback = useCallback(async () => {
        return await notificationConfigApi.getConfig(accessToken);
    }, [accessToken]);

    const {
        data: config,
        loading,
        error,
        fetchData: refetch,
    } = useFetchData(fetchConfigCallback, [accessToken], {
        initialData: { webhookUrl: "", webhookEnabled: false, notifyOnAutomatic: true, notifyOnManual: true },
    });

    const updateConfig = async (data) => {
        await notificationConfigApi.updateConfig(accessToken, data);
        await refetch();
    };

    const testWebhook = async (webhookUrl) => {
        return await notificationConfigApi.testWebhook(accessToken, webhookUrl);
    };

    return {
        config,
        loading,
        error,
        refetch,
        actions: {
            updateConfig,
            testWebhook,
        },
    };
}
