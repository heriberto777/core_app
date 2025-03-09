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

  // Guardamos la conexión en memoria
  sseConnections[taskId] = res;

  // Cuando el cliente cierra la conexión, la removemos
  req.on("close", () => {
    delete sseConnections[taskId];
  });
}

/**
 * Envía un valor de progreso (0..100) a la conexión SSE correspondiente a taskId.
 * @param {String} taskId
 * @param {Number} progress
 */
function sendProgress(taskId, progress) {
  const res = sseConnections[taskId];
  if (res) {
    // Formato SSE: data: X\n\n
    res.write(`data: ${progress}\n\n`);
  }
}

module.exports = {
  progressSseHandler,
  sendProgress,
};
