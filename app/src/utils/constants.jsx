/*
 * constants.jsx
 * Fuente de verdad para rutas de API, permisos y recursos.
 * Refactor: ACTIONS centralizado para evitar repetir las mismas 5 acciones en cada recurso.
 */

const isDev = import.meta.env.DEV;
const SERVER_IP = isDev ? `localhost:3979` : window.location.host;
const PROTOCOL = window.location.protocol;

export const ENV = {
  BASE_PATH: `${PROTOCOL}//${SERVER_IP}`,
  BASE_API: `${PROTOCOL}//${SERVER_IP}/api/v1`,
  API_VERSION: "v1",
  API_ROUTERS: {
    REGISTER: "auth/register",
    LOGIN: "auth/login",
    REFRESH_ACCESS_TOKEN: "auth/refresh_access_token",
    USER_ME: "users/user/me",
    USER: "users/user",
    USERS: "users",
    ROLES: "roles",
    MODULE: "modules",
    TRANSFERS: "tasks",
    TRANSFER: "task",
    TRANSFER_PROGRESS: "transfer",
    CANCELLATION: "cancellation",
    TRANSFER_STAST: "stats",
    LOAD: "loads",
    CONFIG_TASK: "config",
    EMAIL_RECIPIENTS: "email-recipients",
    EMAIL_CONFIG: "email-config",
    SUMMARIES: "summaries",
    LOGS: "logs",
  },
  JWT: {
    ACCESS: "access",
    REFRESH: "refresh",
  },
};

/**
 * ACTIONS — Conjunto centralizado de acciones CRUD estándar.
 * Úsalo en lugar de repetir los strings en cada objeto de PERMISSIONS.
 */
export const ACTIONS = {
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",
  MANAGE: "manage",
  EXECUTE: "execute",
};

/**
 * PERMISSIONS — Describe las acciones disponibles por recurso.
 * Al usar ACTIONS, si mañana renombramos una acción solo se cambia en un lugar.
 */
export const PERMISSIONS = {
  USERS: { ...ACTIONS },
  ROLES: { ...ACTIONS },
  REPORTS: { ...ACTIONS },
  MODULES: { ...ACTIONS },
  TASKS: { ...ACTIONS },
  LOADS: { ...ACTIONS },
  DOCUMENTS: { ...ACTIONS },
  SETTINGS: { ...ACTIONS },
};

/**
 * RESOURCES — Nombres de recursos del sistema tal como los entiende el backend.
 */
export const RESOURCES = {
  USERS: "users",
  ROLES: "roles",
  REPORTS: "reports",
  SYSTEM: "system",
  SETTINGS: "settings",
  PROFILE: "profile",
  MODULES: "modules",
  TASKS: "tasks",
  LOADS: "loads",
  DOCUMENTS: "documents",
  ANALYTICS: "analytics",
  HISTORY: "history",
  LOGS: "logs",
};
