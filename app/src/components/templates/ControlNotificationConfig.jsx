import React, { useState, useEffect } from "react";
import { FaBell, FaPaperPlane, FaSave } from "react-icons/fa";
import {
  useAuth,
  usePermissions,
  useNotificationConfig,
  useNotification,
  Button,
  Input,
  LoadingSpinner,
} from "../../index";

export function ControlNotificationConfig() {
  const { accessToken } = useAuth();
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = hasPermission("settings", "manage") || isAdmin;

  const { config, loading, actions } = useNotificationConfig(accessToken);
  const { showSuccess, showError } = useNotification();

  const [formData, setFormData] = useState({
    webhookUrl: "",
    webhookEnabled: false,
    notifyOnAutomatic: true,
    notifyOnManual: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        webhookUrl: config.webhookUrl || "",
        webhookEnabled: !!config.webhookEnabled,
        notifyOnAutomatic: config.notifyOnAutomatic !== false,
        notifyOnManual: config.notifyOnManual !== false,
      });
    }
  }, [config]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await actions.updateConfig(formData);
      showSuccess("Configuración de notificaciones guardada correctamente");
    } catch (err) {
      showError(err.message || "Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!formData.webhookUrl) {
      showError("Ingresa una URL de webhook antes de probar");
      return;
    }
    setTesting(true);
    try {
      await actions.testWebhook(formData.webhookUrl);
      showSuccess("Webhook de prueba enviado correctamente");
    } catch (err) {
      showError(err.message || "No se pudo conectar con el webhook");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-2xl p-5 flex gap-4 items-start">
        <FaBell className="text-blue-500 text-xl mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-600 dark:text-slate-300 m-0">
          Además del correo (que siempre se envía), puedes conectar un webhook externo
          — por ejemplo un flujo de <strong>n8n</strong> que reenvíe el resumen a
          Telegram o WhatsApp — para recibir notificaciones cuando una tarea automática
          termina (con el resumen del lote) o cuando ejecutas una tarea manual (éxito o error).
        </p>
      </div>

      <div className="flex flex-col gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.webhookEnabled}
            onChange={(e) => handleChange("webhookEnabled", e.target.checked)}
            disabled={!canManage}
            className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500"
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Habilitar notificaciones por Webhook
          </span>
        </label>

        <Input
          label="URL del Webhook (ej. flujo de n8n)"
          value={formData.webhookUrl}
          onChange={(e) => handleChange("webhookUrl", e.target.value)}
          placeholder="https://tu-n8n.com/webhook/notificaciones"
          disabled={!canManage}
        />

        <div className="flex flex-col gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.notifyOnAutomatic}
              onChange={(e) => handleChange("notifyOnAutomatic", e.target.checked)}
              disabled={!canManage}
              className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Notificar resumen de ejecuciones automáticas (cron)
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.notifyOnManual}
              onChange={(e) => handleChange("notifyOnManual", e.target.checked)}
              disabled={!canManage}
              className="w-5 h-5 rounded-lg text-primary-600 border-slate-300 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Notificar resumen de ejecuciones manuales (individuales)
            </span>
          </label>
        </div>

        {canManage && (
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" icon={<FaPaperPlane />} onClick={handleTest} loading={testing}>
              Probar Webhook
            </Button>
            <Button variant="primary" icon={<FaSave />} onClick={handleSave} loading={saving}>
              Guardar Cambios
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlNotificationConfig;
