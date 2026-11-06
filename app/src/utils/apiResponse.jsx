// Si el proxy (nginx) corta el request antes de que llegue a Express (ej.
// 502/503/504 de gateway, 413 por tamaño de body), la respuesta es HTML, no
// JSON -- response.json() tira un SyntaxError que no dice nada del problema
// real, y mostrarle ese HTML crudo al usuario es peor todavía. Se intenta
// JSON primero (caso normal) y si falla se arma un mensaje legible según el
// status, sin exponer el cuerpo de la respuesta.
const GATEWAY_ERROR_MESSAGES = {
  502: "El servidor no respondió correctamente. Intentá de nuevo en unos segundos.",
  503: "El servicio no está disponible en este momento. Intentá de nuevo en unos segundos.",
  504: "El servidor tardó demasiado en responder. Intentá de nuevo en unos segundos.",
  413: "Los datos enviados son demasiado grandes para el servidor.",
};

export async function parseApiResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const friendly = GATEWAY_ERROR_MESSAGES[response.status];
    throw new Error(
      friendly || `Error de conexión con el servidor (status ${response.status}). Intentá de nuevo.`
    );
  }
}
