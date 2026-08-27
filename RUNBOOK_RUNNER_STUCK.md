# Runbook: GitHub Actions runner "pegado" (self-hosted)

## Síntoma

En la pestaña Actions del repo, el job `build-and-deploy` (workflow `.github/workflows/deploy.yml`, `runs-on: self-hosted`) se queda dando vueltas entre:

```
Job is about to start running on the runner: prod-app-core
Waiting for a runner to pick up this job...
Waiting for a runner to pick up this job...
```

sin avanzar, durante varios minutos (en este caso, ~15 min).

## Qué significa ese patrón

El runner (`Runner.Listener`) sí está conectado y recibe el job, pero el subproceso `Runner.Worker` (el que realmente ejecuta los steps) no logra levantarse — así que GitHub lo devuelve a la cola y lo reintenta. El runner aparece "activo" en todo momento; el problema no es de red ni de GitHub, es local al servidor.

## Diagnóstico (server de producción, vía SSH)

```bash
# 1. Ver todos los runners instalados en el servidor y su estado
systemctl list-units --type=service | grep -i actions.runner

# 2. Ver el estado y las últimas líneas de log del runner específico de este proyecto
sudo systemctl status actions.runner.heriberto777-core_app.prod-app-core.service
sudo journalctl -u actions.runner.heriberto777-core_app.prod-app-core.service -n 100 --no-pager

# 3. Confirmar que no es un problema de disco (causa más común de que el Worker no arranque)
df -h

# 4. Buscar un proceso Runner.Worker de core_app colgado/zombie
ps aux | grep -i "Runner.Worker" | grep -i core_app

# 5. Confirmar si el deploy anterior sí quedó corriendo (para saber si el problema es solo del run actual)
docker ps
```

En este incidente: disco con 230G libres (31% uso) — descartado. No había ningún `Runner.Worker` de core_app corriendo (el `Runner.Listener` seguía vivo, PID estable desde hacía semanas). Los contenedores `core_app-frontend`/`core_app-backend` seguían corriendo con la imagen `:latest` del deploy anterior, sin verse afectados por el job atascado.

## Fix

Reiniciar únicamente el servicio del runner de este proyecto — **no afecta los contenedores ya desplegados**, solo el agente de CI:

```bash
sudo systemctl restart actions.runner.heriberto777-core_app.prod-app-core.service

# Confirmar que reconecta limpio
sudo systemctl status actions.runner.heriberto777-core_app.prod-app-core.service

# Ver en vivo que reconecta y recoge el job en cola
sudo journalctl -u actions.runner.heriberto777-core_app.prod-app-core.service -f
```

Nota sobre el prompt de contraseña: `systemctl restart` sin `sudo` (o con polkit) pide la **contraseña del usuario de Linux** (`heriberto777` en este servidor) — no es ningún token de GitHub ni de la app.

Tras el reinicio, el `Runner.Listener` se reconectó y el job en cola arrancó normalmente, completando el build y el `docker compose up -d` sin más intervención.

## Nombres a tener presentes

- Carpeta local del runner: `actions-runner-core_app` (bajo `/home/heriberto777/`).
- Nombre registrado en GitHub / nombre del servicio systemd: `prod-app-core`.
- Son el **mismo runner** — el nombre de la carpeta y el nombre de registro en GitHub no tienen que coincidir, y en este servidor no coinciden para ninguno de los runners instalados (hay varios proyectos corriendo cada uno su propio runner en la misma máquina: `bonif-prod`, `prod-app-ecf`, `prod-app-catelliweb2`, `prod-app`, `prod-app-ciguainv`, `prod-app-core`, `prod-app-gestionapp`, `prop-app-kpi`).

## Si vuelve a pasar

Si este patrón se repite seguido, vale la pena investigar la causa raíz en vez de solo reiniciar cada vez — por ejemplo, revisar si el runner necesita una actualización de versión (`Runner update in progress` aparece en el historial de este mismo log, el 23 de julio) o si hay contención de recursos por los otros ~8 runners corriendo en el mismo servidor.
