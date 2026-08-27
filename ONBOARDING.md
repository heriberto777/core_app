# Catelli Core App — Guía de Onboarding

## ¿Qué hace la aplicación?

**Catelli core_app** es un middleware de logística/ERP que se ubica entre el **ERP Catelli** (un sistema de negocio basado en SQL Server) y varios consumidores externos. Son dos proyectos Node.js independientes, desplegados como imágenes Docker separadas:

- **`server/`** — API REST en Express. Usa MongoDB para el estado de la aplicación (usuarios, roles, tareas, logs, tracking) y dos conexiones SQL Server independientes ("server1" y "server2") para los datos reales del negocio.
- **`app/`** — SPA en React + Vite, usada por el personal de logística/bodega/administración.

### Los tres flujos principales

1. **Cargas** — arma los pedidos/cargas de los repartidores (`LoadsManagement`).
2. **Traspasos** — la consecuencia contable-de-inventario de una Carga: escribe documentos reales en `CATELLI.DOCUMENTO_INV`/`LINEA_DOC_INV` en el ERP, generando un consecutivo real (`TRA######`).
3. **Tareas de Transferencia / ETL** (a veces llamado "Gestión de Tareas" o "Gestor Universal") — tareas genéricas de SELECT-desde-origen/INSERT-hacia-destino, configurables como mapeos, con ejecución manual o programada (cron diario configurable).

### Otras áreas de la app

- **Dashboard** — panel general con métricas, salud de servidores, próxima ejecución programada y últimas actividades.
- **Analítica y Auditoría** — estadísticas del sistema y una bitácora centralizada de eventos/transferencias.
- **Administración** — gestión de usuarios, roles (con matriz de permisos por recurso/acción) y módulos habilitados.
- **Configuración** — conexiones a bases de datos, configuración de email (SMTP), consecutivos, destinatarios, notificaciones por webhook (ej. n8n) y la Programación Automática (hora + zona horaria del cron diario).

## Arquitectura básica

- **Backend**: Express + MongoDB (estado de la app) + SQL Server ×2 (datos del ERP). Autenticación JWT (`accessToken`/`refreshToken`). Los logs se guardan en archivo y en Mongo (colección `Log`), que alimenta la "Central de Auditoría" del frontend.
- **Frontend**: React + Vite + Tailwind CSS. Diseño atómico (`atomos` → `meleculas` → `organismos` → `templates`). Rutas protegidas por permiso vía `checkPermission(recurso, acción)`.
- **Sin monorepo**: cada carpeta (`server/`, `app/`) tiene su propio `package.json` — los comandos de instalación/build se corren dentro de cada una, no desde la raíz.

## Cómo levantarla en desarrollo local (Docker)

```bash
# Backend
docker build -t core_app-backend:dev -f server/Dockerfile server
docker run -d --name backend --network core_app_default \
  --env-file server/.env.docker \
  -e MONGO_URI="mongodb://host.docker.internal:27017/core_app" \
  core_app-backend:dev

# Frontend
docker build -t core_app-frontend:dev -f app/Dockerfile app
docker run -d --name frontend --network core_app_default -p 5173:80 core_app-frontend:dev
```

La app queda disponible en **http://localhost:5173**. Requiere una instancia local de MongoDB corriendo (el backend se conecta vía `host.docker.internal`).

Alternativa sin Docker: `npm run dev` dentro de `server/` (nodemon) y dentro de `app/` (Vite) por separado — `app/vite.config.js` ya tiene un proxy de `/api` hacia `http://localhost:3979`.

## Usuario y contraseña (solo entorno local de pruebas)

Para el entorno de desarrollo local (Docker o `npm run dev`, conectado a un Mongo local, **no** a producción):

- **Email**: `admin@sistema.com`
- **Contraseña**: `admin123`
- Rol: Administrador completo (todos los permisos en `manage`).

> ⚠️ Estas son credenciales de un usuario semilla de **desarrollo local únicamente**. No son las credenciales del entorno real de producción (`core.ciguadev.com`) — esas las gestiona cada quien tenga acceso a ese servidor directamente.

## Variables de entorno relevantes

- `server/.env` — configuración real/local nativa (nodemon).
- `server/.env.docker` — configuración usada al correr el backend en Docker localmente.
- `MONGO_URI` — cadena de conexión a MongoDB (puede sobreescribirse al correr el contenedor).
- Las conexiones a SQL Server (server1/server2) se configuran vía la UI ("Configuración de Nodo") y se guardan en Mongo, no solo por variables de entorno.
