/*
Seccion para definir las rutas para las apis
*/

const SERVER_IP = `${window.location.hostname}:3979`; // Direccion del servidor de las APIS
const PROTOCOL = window.location.protocol; //Detecta el protocolo actual http:/ o https:/

export const ENV = {
  BASE_PATH: `${PROTOCOL}//${SERVER_IP}`,
  BASE_API: `${PROTOCOL}//${SERVER_IP}/api/v1`,
  API_ROUTERS: {
    REGISTER: "auth/register",
    LOGIN: "auth/login",
    REFRESH_ACCESS_TOKEN: "auth/refresh_access_token",
    USER_ME: "user/me",
    USER: "user",
    USERS: "users",
    TRANSFERS: "tasks",
    TRANSFER: "task",
    LOAD: "load",
    CONFIG_TASK: "config",
    EMAIL_RECIPIENTS: "email-recipients",
  },
  JWT: {
    ACCESS: "access",
    REFRESH: "refresh",
  },
};
