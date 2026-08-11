# Scripts archivados

Scripts de diagnóstico puntuales (marzo-abril 2026) contra las conexiones `server1`/`server2`, movidos acá desde la raíz del repo durante una limpieza general — no son parte del flujo de desarrollo activo (ver `server/scripts/` para las herramientas operativas vigentes, y `server/test/` para los scripts de migración/diagnóstico ya documentados en `CLAUDE.md`).

**Antes de reutilizar cualquiera de estos:** fueron escritos para correr desde la **raíz del repo**, no desde `scripts/archive/` — usan rutas relativas como `require('./server/services/...')` que ya no apuntan a donde corresponde desde esta carpeta. Ajustá el `require` (o copiá el script a la raíz temporalmente) antes de ejecutarlo.
