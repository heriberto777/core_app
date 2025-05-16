// progressSse.js - Versión mejorada

// Almacenaremos las conexiones SSE en memoria, asociando taskId -> response
const sseConnections = {};

/**
 * Middleware SSE para suscribirse a los eventos de progreso de una tarea.
 * @route GET /api/transfer/progress/:taskId
 */
function progressSseHandler(req, res) {
  const { taskId } = req.params;

  // Encabezados para Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Aseguramos que Express envíe los datos a medida que se generan
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  // Añadir un keepalive para mantener la conexión abierta
  const keepAliveInterval = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000); // Cada 30 segundos

  // Guardamos la conexión en memoria junto con su intervalo de keepalive
  sseConnections[taskId] = {
    res,
    keepAliveInterval,
  };

  // Cuando el cliente cierra la conexión, la removemos y limpiamos el intervalo
  req.on("close", () => {
    if (sseConnections[taskId]) {
      clearInterval(sseConnections[taskId].keepAliveInterval);
      delete sseConnections[taskId];
    }
  });

  // Enviar evento inicial para confirmar la conexión
  sendEvent(taskId, "connected", {
    message: "Conexión establecida correctamente",
  });
}

/**
 * Envía un valor de progreso (0..100) a la conexión SSE correspondiente a taskId.
 * @param {String} taskId - ID de la tarea
 * @param {Number} progress - Valor del progreso (0-100)
 * @param {String} status - Estado de la tarea (opcional)
 */
function sendProgress(taskId, progress, status = null) {
  // Si el progreso es 100, asegurar que el estado sea "completed"
  if (progress === 100 && !status) {
    status = "completed";
  }
  // Si el progreso es -1, asegurar que el estado sea "cancelled"
  else if (progress === -1 && !status) {
    status = "cancelled";
  }

  // Enviar un evento de tipo "progress"
  sendEvent(taskId, "progress", {
    progress,
    status,
    timestamp: Date.now(),
  });
}

/**
 * Envía un evento con datos en formato JSON a un cliente SSE
 * @param {String} taskId - ID de la tarea/cliente
 * @param {String} eventType - Tipo de evento
 * @param {Object} data - Datos a enviar
 */
function sendEvent(taskId, eventType, data) {
  const connection = sseConnections[taskId];
  if (connection && connection.res) {
    try {
      // Formato SSE con tipo de evento y datos JSON
      connection.res.write(`event: ${eventType}\n`);
      connection.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`Error al enviar evento SSE a ${taskId}:`, error);

      // Limpiar recursos en caso de error
      if (connection.keepAliveInterval) {
        clearInterval(connection.keepAliveInterval);
      }
      delete sseConnections[taskId];
    }
  }
}

/**
 * Envía una actualización de estado a todos los clientes SSE o a uno específico
 * @param {String} status - Estado a enviar
 * @param {String} message - Mensaje descriptivo
 * @param {String} specificTaskId - ID de tarea específica (opcional)
 */
function broadcastStatus(status, message, specificTaskId = null) {
  const targets = specificTaskId
    ? [specificTaskId]
    : Object.keys(sseConnections);

  for (const taskId of targets) {
    sendEvent(taskId, "status", {
      status,
      message,
      timestamp: Date.now(),
    });
  }
}

/**
 * Cierra todas las conexiones SSE al apagar el servidor
 */
function closeAllConnections() {
  for (const taskId in sseConnections) {
    if (sseConnections[taskId].keepAliveInterval) {
      clearInterval(sseConnections[taskId].keepAliveInterval);
    }

    try {
      sseConnections[taskId].res.end();
    } catch (error) {
      console.error(`Error al cerrar conexión SSE ${taskId}:`, error);
    }
  }
}

module.exports = {
  progressSseHandler,
  sendProgress,
  sendEvent,
  broadcastStatus,
  closeAllConnections,
};
