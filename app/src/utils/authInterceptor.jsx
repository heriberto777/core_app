import axios from "axios";
import { ENV } from "./constants";
import { hasExpiredToken } from "./token";

// Único punto de la app que renueva el accessToken. Se instala una vez desde
// main.jsx y cubre TODAS las llamadas HTTP (fetch nativo, usado por casi
// todas las clases de app/src/api, y axios, usado solo por TelemetryApi).
// Sin esto, un accessToken expirado (24h, ver server/services/jwt.js) nunca
// se renueva salvo en el mount inicial de AuthContext, y cualquier polling
// (ej. LiveHealthCard cada 5s) queda repitiendo 401 indefinidamente.

const originalFetch = window.fetch.bind(window);
let refreshPromise = null;

function getRefreshToken() {
  return localStorage.getItem(ENV.JWT.REFRESH);
}

function storeAccessToken(accessToken) {
  localStorage.setItem(ENV.JWT.ACCESS, accessToken);
}

function clearTokensAndNotify() {
  localStorage.removeItem(ENV.JWT.ACCESS);
  localStorage.removeItem(ENV.JWT.REFRESH);
  window.dispatchEvent(new CustomEvent("auth:session-expired"));
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken || hasExpiredToken(refreshToken)) {
      clearTokensAndNotify();
      return null;
    }

    try {
      const response = await originalFetch(
        `${ENV.BASE_API}/${ENV.API_ROUTERS.REFRESH_ACCESS_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: refreshToken }),
        }
      );

      if (!response.ok) {
        clearTokensAndNotify();
        return null;
      }

      const result = await response.json();
      const newAccessToken = result?.data?.accessToken || result?.accessToken;
      if (!newAccessToken) {
        clearTokensAndNotify();
        return null;
      }

      storeAccessToken(newAccessToken);
      return newAccessToken;
    } catch {
      clearTokensAndNotify();
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function withAuthHeader(init, token) {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

window.fetch = async function patchedFetch(input, init = {}) {
  const headers = new Headers(init?.headers || {});
  const authHeader = headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken && hasExpiredToken(bearerToken)) {
    const newToken = await refreshAccessToken();
    if (newToken) init = withAuthHeader(init, newToken);
  }

  let response = await originalFetch(input, init);

  if (response.status === 401 && bearerToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await originalFetch(input, withAuthHeader(init, newToken));
    }
  }

  return response;
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retriedAfterRefresh) {
      originalRequest._retriedAfterRefresh = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axios(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);
