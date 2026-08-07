# Notificaciones de Core App → Telegram y WhatsApp (workflow de n8n)

Este workflow recibe el webhook que `core_app` ya envía (ver
`server/services/notificationDispatcher.js` y `webhookNotificationService.js`)
y reenvía un mensaje formateado a Telegram y, opcionalmente, a WhatsApp vía
Twilio.

```
Webhook → Formatear mensaje (Code) → Enviar a Telegram
                                    → Enviar a WhatsApp (Twilio)  [desactivado hasta que lo actives]
```

Ambos canales de salida cuelgan del mismo nodo "Formatear mensaje" — un solo
mensaje formateado se reenvía en paralelo a los dos, sin duplicar lógica.

## Requisitos previos

**Telegram**
- Un bot creado con [@BotFather](https://t.me/BotFather) y su token.
- El `chat_id` del destino (tu chat personal, un grupo o un canal). Formas
  rápidas de obtenerlo:
  - Envía cualquier mensaje al bot y visita
    `https://api.telegram.org/bot<TOKEN>/getUpdates` — verás `"chat":{"id": ...}`.
  - Para grupos/canales, agrega el bot al grupo y repite el paso anterior.

**WhatsApp (Twilio)** — solo cuando decidas activarlo
- Cuenta de Twilio con el canal de WhatsApp habilitado (el Sandbox de pruebas
  de Twilio ya trae el número `whatsapp:+14155238886` listo para probar sin
  aprobación de Meta; para producción real necesitas tu propio número
  verificado en Twilio).
- El número de destino en formato `whatsapp:+<código de país><número>`
  (ej. `whatsapp:+18091234567`).
- Credencial de Twilio en n8n (Account SID + Auth Token, desde el dashboard
  de Twilio).

## Instalación

1. En n8n: **Workflows → Import from File** y selecciona
   `notificaciones-telegram.workflow.json`.
2. **Telegram**: en el nodo **Enviar a Telegram**, crea/selecciona la
   credencial *Telegram API* con el token del bot, y reemplaza `chatId`
   (`"REEMPLAZA_CON_TU_CHAT_ID"`) por el `chat_id` real.
3. Activa el workflow (toggle **Active** arriba a la derecha).
4. Copia la URL de producción del nodo **Webhook** (botón "Test URL"/"Production
   URL" al abrir el nodo) — algo como
   `https://tu-n8n.com/webhook/core-app-notificaciones`.

## Conectarlo con Core App

1. En Core App: **Configuraciones → Notificaciones (Webhook)**.
2. Pega la URL de producción del paso anterior en "URL del Webhook".
3. Marca "Habilitar notificaciones por Webhook" y elige si quieres avisos de
   corridas automáticas, manuales, o ambas.
4. Guarda, y usa el botón **"Probar Webhook"** — deberías recibir en Telegram:
   `✅ Prueba de conexión — Core App`.

## Activar WhatsApp más adelante

El nodo **Enviar a WhatsApp (Twilio)** ya está en el workflow pero
**desactivado** (aparece atenuado/gris) para que no falle mientras no lo
configures. Cuando quieras prenderlo:

1. Abre el nodo y completa:
   - `from`: tu número de Twilio habilitado para WhatsApp, con el prefijo
     `whatsapp:` (ej. `whatsapp:+14155238886` para el Sandbox de pruebas).
   - `to`: el número destino, también con el prefijo `whatsapp:`.
   - Credencial: crea/selecciona la credencial *Twilio API* (Account SID +
     Auth Token).
2. Actívalo: clic derecho sobre el nodo → **Activate node** (o el ícono de
   encendido en la esquina del nodo).
3. Guarda el workflow. No hace falta tocar nada más — recibirá el mismo texto
   que ya arma el nodo "Formatear mensaje" para Telegram.

Si usas el Sandbox de Twilio, recuerda que cada número destino debe "unirse"
primero enviando el código de confirmación que Twilio te da (`join <palabra>`)
al número del Sandbox — restricción propia de Twilio, no de este workflow.

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
tocar el resto del workflow, y el mensaje resultante llega a ambos canales
automáticamente.

## Notas

- El nodo **Webhook** responde de inmediato (`responseMode: onReceived`) antes
  de intentar enviar a Telegram/WhatsApp, para no arriesgarse al timeout de
  10s que Core App aplica del lado del cliente (`WEBHOOK_TIMEOUT_MS` en
  `webhookNotificationService.js`). Si un canal falla, Core App nunca se
  entera — son canales "best effort", igual que ya lo es hoy (el correo es el
  canal garantizado).
- Si tu versión de n8n rechaza algún parámetro del nodo Webhook al importar,
  el único ajuste manual necesario es: abrir el nodo → "Respond" → elegir
  **Immediately**.
- El texto usa formato `*negrita*` estilo Markdown — Telegram lo interpreta
  vía `parse_mode: Markdown` y WhatsApp lo interpreta de forma nativa, así que
  el mismo texto sirve para los dos sin cambios. Evita usar `_`, `` ` `` sin
  escapar si agregas campos nuevos al mensaje (Telegram es estricto con su
  parser de Markdown y puede rechazar el mensaje completo si queda mal
  formado).
