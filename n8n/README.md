# Notificaciones de Core App → Telegram (workflow de n8n)

Este workflow recibe el webhook que `core_app` ya envía (ver
`server/services/notificationDispatcher.js` y `webhookNotificationService.js`)
y reenvía un mensaje formateado a un chat/canal de Telegram.

## Requisitos previos

- Una instancia de n8n corriendo (ya la tienes).
- Un bot de Telegram creado con [@BotFather](https://t.me/BotFather) y su token.
- El `chat_id` del destino (tu chat personal, un grupo o un canal). Formas rápidas
  de obtenerlo:
  - Envía cualquier mensaje al bot y visita
    `https://api.telegram.org/bot<TOKEN>/getUpdates` — verás `"chat":{"id": ...}`.
  - Para grupos/canales, agrega el bot al grupo y repite el paso anterior.

## Instalación

1. En n8n: **Workflows → Import from File** y selecciona
   `notificaciones-telegram.workflow.json`.
2. Si no tienes credenciales de Telegram aún: en el nodo **Enviar a Telegram**,
   crea una credencial nueva (tipo *Telegram API*) pegando el token del bot.
3. En el mismo nodo, reemplaza `chatId` (actualmente
   `"REEMPLAZA_CON_TU_CHAT_ID"`) por el `chat_id` real.
4. Activa el workflow (toggle **Active** arriba a la derecha).
5. Copia la URL de producción del nodo **Webhook** (botón "Test URL"/"Production
   URL" al abrir el nodo) — algo como
   `https://tu-n8n.com/webhook/core-app-notificaciones`.

## Conectarlo con Core App

1. En Core App: **Configuraciones → Notificaciones (Webhook)**.
2. Pega la URL de producción del paso anterior en "URL del Webhook".
3. Marca "Habilitar notificaciones por Webhook" y elige si quieres avisos de
   corridas automáticas, manuales, o ambas.
4. Guarda, y usa el botón **"Probar Webhook"** — deberías recibir en Telegram:
   `✅ Prueba de conexión — Core App`.

## Qué mensajes llegan

El nodo **Formatear mensaje** interpreta 3 tipos de evento que Core App puede
enviar (ver `notificationDispatcher.js` para la forma exacta de cada payload):

- `test` — el mensaje de prueba del botón "Probar Webhook".
- `transfer_results` — resumen de una corrida de tareas (automática o manual):
  cuenta de éxitos/fallos, hora de inicio/fin, duración, y el detalle de
  errores si los hubo.
- `critical_error` — un error crítico fuera del flujo normal de tareas.

Si en el futuro Core App agrega un nuevo tipo de evento, solo hay que sumar un
`else if` más en el nodo **Formatear mensaje** (Code node) — no hace falta
tocar el resto del workflow.

## Notas

- El nodo **Webhook** responde de inmediato (`responseMode: onReceived`) antes
  de intentar enviar a Telegram, para no arriesgarse al timeout de 10s que
  Core App aplica del lado del cliente (`WEBHOOK_TIMEOUT_MS` en
  `webhookNotificationService.js`). Si Telegram falla, Core App nunca se entera
  — es un canal "best effort", igual que ya lo es hoy (el correo es el canal
  garantizado).
- Si tu versión de n8n rechaza algún parámetro del nodo Webhook al importar,
  el único ajuste manual necesario es: abrir el nodo → "Respond" → elegir
  **Immediately**.
- El texto usa formato Markdown de Telegram (`parse_mode: Markdown`) — evita
  usar `_`, `*`, `` ` `` sin escapar si agregas campos nuevos al mensaje.
