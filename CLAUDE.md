# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repository ("Catelli core_app") is a logistics/ERP middleware sitting between the **Catelli ERP** (a SQL Server-based business system) and downstream consumers. It is two independent Node.js projects deployed as separate Docker images — there is no root workspace/monorepo tooling, so install/build/lint commands must be run from inside each subproject:

- `server/` — Express REST API, MongoDB for app state, two separate SQL Server connections for the actual business data.
- `app/` — React + Vite SPA consumed by end users (logistics/warehouse/admin staff).

## Common commands

Backend (`cd server`):
- `npm run dev` — nodemon against `index.js` (dev entrypoint, not bundled).
- `npm run build` — bundles `index.js` into `dist/index.js` with esbuild (`bcrypt`, `mssql`, `tedious`, `puppeteer`, `ioredis` stay external, not bundled). `npm start` runs this bundle — this is what the Docker image runs.
- `npm run lint` — eslint.
- `npm test` — jest is configured but **there are no real test files** in the repo (`test/` contains one-off migration/diagnostic scripts, not a jest suite). Don't assume test coverage exists.
- One-off admin/setup scripts under `scripts/` (e.g. `npm run convert-admin`, `npm run init-module`, `npm run setup-roles`) — these mutate the Mongo database directly; treat as operational tools, not part of the normal dev loop.

Frontend (`cd app`):
- `npm run dev` — Vite dev server.
- `npm run build` — Vite build.
- `npm run lint` — eslint.

Docker (from repo root): `server/Dockerfile` and `app/Dockerfile` build independently; `docker-compose.prod.yml` runs both prebuilt images from GHCR (`ghcr.io/heriberto777/core_app-{backend,frontend}`) behind no reverse proxy config of its own. There is no local dev compose file — local verification is typically done with individual `docker build`/`docker run` commands against a shared `core_app_default` network.

## Backend architecture

### Two SQL Server connections with very different roles

The backend talks to MongoDB (app state: tasks, users, roles, logs, tracking) **and** two independently-configured SQL Server connections, referred to throughout the code as `"server1"` and `"server2"`:

- **server1** hosts the real Catelli ERP database (`CATELLI` schema — `CLIENTE`, `DOCUMENTO_INV`, `LINEA_DOC_INV`, etc.) and read-only **views** (`dbo.IMPLT_*`) that expose ERP data filtered by sync-status flags (e.g. a client is "pending sync" while `U_IS_SYNCS = '1'`; this app never sets that flag, only flips it to `'2'` after a successful transfer — the flag's "become pending" transition is owned entirely by Catelli, outside this repo).
- **server2** is a separate staging/integration SQL Server that receives mirrored data pushed by the ETL tasks.

Both connections are configured via the `DBConfig` Mongo collection (editable through the "Configuración de Nodo" UI, backed by `dbConfigController.js`), optionally seeded from `SERVER1_*`/`SERVER2_*` env vars via `scripts/sync_db_configs.js`. Connection-building lives in `services/DatabaseService.js`, `services/ConnectionCentralService.js`, and `services/connectionDiagnostic.js` — when adding a new SQL config field, all three need to agree (they don't share code today). `dbConfig.instance` matters: SQL Server named-instance mode (`SERVER\INSTANCE`) takes priority over `port` when set, so a non-empty `instance` disables the port entirely.

`DatabaseServiceAdapter` (server1/server2) and connection-pool plumbing were migrated at some point from an older pattern — `server/test/` contains leftover migration/diagnostic scripts from that effort, not a real test suite.

### Three distinct domain flows that share vocabulary but not code

- **Cargas** (`services/loadsService.js`, `LoadsSQLService.js`, frontend `LoadsManagement`) — assembling delivery-person loads/orders.
- **Traspasos** (`services/traspasoService.js`, frontend `TraspasoManagement`) — the inventory-accounting consequence of a Carga: writes real documents to `CATELLI.DOCUMENTO_INV`/`LINEA_DOC_INV` on server1 inside `realizarTraspaso()`, generating a real business consecutive (`TRA######`, via `CATELLI.CONSECUTIVO_CI`). Traceability for this flow lives in the Mongo `TraspasoTracking` collection (`models/traspasoTrackingModel.js`), not in `CATELLI.DOCUMENTO_INV` itself — this app has no visibility into whether a Traspaso it creates is later approved inside Catelli (the `APROBADO`/`USUARIO_APRO` columns exist for that but are never read/written here).
- **Tareas de Transferencia / ETL** (`services/transferService.js`, `DynamicTransferService.js`, `LinkedTasksService.js`, `cronService.js`) — generic SELECT-from-source/INSERT-to-destination tasks (`TransferTask` model), unrelated to Cargas despite similar naming. This is the system most often referred to as "Gestión de Tareas".

Do not assume a `loadId` and a `TRA######` consecutive are related — they are independently-generated identifiers from unrelated numbering systems; the only link between a Carga and its Traspaso is `metadata.loadId`/`metadata.documentId` in Mongo logs.

### Linked task groups (ETL orchestration)

A `TransferTask` can belong to a `linkedGroup` (shared name across tasks) with a `linkedExecutionOrder`. Exactly one task per group is the "coordinator" (has a non-empty `postUpdateQuery`). `LinkedTasksService.executeLinkedGroup()`:
1. Runs every task in the group sequentially (not parallel) with `skipPostUpdate: true`.
2. Collects the primary-key values of every record actually inserted, across all group members.
3. Runs the coordinator's `postUpdateQuery` **once**, scoped with a dynamically-appended `WHERE {key} IN (...)` batched in groups of 500 — never as an unscoped/global UPDATE.

Both the individual-task post-update path (`transferService.js: executePostTransferOperationsWithNewSystem`) and the group-coordinated path (`LinkedTasksService.js: executeCoordinatedPostUpdate`) build this scoped UPDATE the same way; there is no code path that executes a stored `postUpdateQuery` without appending the key filter.

`executeTransferTask` (the controller behind the manual "Ejecutar" button) always routes through `LinkedTasksService.executeLinkedGroup()` even for ungrouped tasks — it internally detects "no group" and falls back to running the single task. `cronService.js` runs a daily `node-cron` job that does the same group/individual dispatch automatically, with a concurrency limit and per-group deduplication (executes one representative task per group, not every member).

### Logging

`services/logger.js` (Winston) writes to: console (filtered, human-readable), rotating files under `server/logs/` (`combined.log`, `error.log`, `transactions.log` — **not** persisted via a Docker volume, lost on container recreation), and the Mongo `Log` collection (via `services/mongoDBTransport.js`, batched) unless `DISABLE_MONGO_LOGS=true`. The Mongo collection is the backing data for the frontend's "Centro de Auditoría"/Bitácora UI, and survives container restarts — prefer it over container log files when diagnosing anything that isn't very recent.

### SSE for live progress

`services/progressSse.js` (`sendProgress(taskId, progress, status)`) pushes live task progress over SSE; the frontend's `progressClient` (`app/src/utils`) subscribes per-task. `TransferTask.status`/`progress` fields are also updated in Mongo at the same time, so polling the task/group REST endpoints is a valid (slightly less immediate) fallback to SSE.

## Frontend architecture

Atomic design under `app/src/components`: `atomos` → `meleculas` (intentional project spelling, not "moleculas") → `organismos` → `templates`, plus `pages/`, `layouts/`, `routers/`. Almost everything is re-exported through a single barrel file `app/src/index.js` — new components/hooks/API clients should be added there too, since most files import from `"../../index"` rather than deep-importing.

Styling is Tailwind; `styled-components` is still a dependency but only used in 1-2 legacy files — treat Tailwind as the only real convention for new work (see `app/CLAUDE.md`, though its "migration in progress" framing is now mostly historical).

Auth is JWT (`accessToken`/`refreshToken`) via `useAuth`/`AuthContexts`; backend routes are protected per-resource with `checkPermission(resource, action)` middleware (e.g. `checkPermission("loads", "read")`), matched client-side by `usePermissions`.

## Working conventions specific to this repo

- Prefer editing existing services/controllers over introducing new abstractions — most domains (Cargas, Traspasos, ETL tasks) already have an established service/controller/route triplet.
- SQL Server writes here often affect the real, shared Catelli ERP (server1) — treat inserts/updates against `CATELLI.*` as production-sensitive even in local/dev runs, since server1/server2 credentials are frequently the same real servers across environments.
- Backend responses are usually `{ success, message, data }`; double-check controllers aren't re-wrapping an already-`{success,data}` service result as `data` (a recurring bug pattern in this codebase).
