/**
 * Obtiene el mayor consecutivo (almacenado como string, ej. "LOADC0000002"),
 * parsea la parte numérica y retorna el siguiente valor (por ej. "LOADC0000003").
 *
 * @param {Object} opciones
 * @param {mongoose.Model} opciones.modelo - El modelo Mongoose (ej: Consecutivo)
 * @param {String} opciones.campoFiltro - Campo para filtrar (ej. "nombre")
 * @param {String} opciones.valorFiltro - Valor de ese campo (ej. "LOAD")
 * @param {String} opciones.campoConsecutivo - Campo string donde se almacena la cadena (ej. "valor")
 * @param {String} [opciones.prefijoBase="LOADC"] - Prefijo en la cadena (ej. "LOADC")
 * @param {Number} [opciones.longitudConsecutivo=7] - Dígitos para la parte numérica
 * @param {String} [opciones.valorInicial=""] - Valor inicial si no hay documentos
 * @returns {Promise<String>} Ej: "LOADC0000003"
 *
 * @example
 *   const loadId = await obtenerConsecutivo({
 *     modelo: Consecutivo,
 *     campoFiltro: "nombre",
 *     valorFiltro: "LOAD",
 *     campoConsecutivo: "valor",
 *     prefijoBase: "LOADC",
 *     longitudConsecutivo: 7,
 *     valorInicial: "LOADC0000000"
 *   });
 */
async function obtenerConsecutivo({
  modelo,
  campoFiltro,
  valorFiltro,
  campoConsecutivo,
  prefijoBase = "LOADC",
  longitudConsecutivo = 7,
  valorInicial = "",
}) {
  try {
    // 1) Construir el filtro, p.ej. { nombre: "LOAD" }
    const filtro =
      campoFiltro && valorFiltro ? { [campoFiltro]: valorFiltro } : {};

    // 2) Usar un pipeline para:
    //    - Filtrar (match)
    //    - Agregar un campo numericPart: la subcadena de 'valor' desde prefijoBase.length hasta el final, convertida a int
    //    - Ordenar desc por numericPart
    //    - Limitar a 1
    const pipeline = [
      { $match: filtro },
      {
        $addFields: {
          numericPart: {
            $toInt: {
              $substr: [
                `$${campoConsecutivo}`, // Ej: "$valor"
                { $strLenCP: prefijoBase }, // desde la longitud del prefijo
                -1, // hasta el final
              ],
            },
          },
        },
      },
      { $sort: { numericPart: -1 } },
      { $limit: 1 },
    ];

    const resultado = await modelo.aggregate(pipeline);

    console.log("resultado:", resultado);

    // 3) Determinar el valor actual. Si no hay docs, usar valorInicial
    let numeroActual = 0;
    if (resultado.length > 0 && typeof resultado[0].numericPart === "number") {
      numeroActual = resultado[0].numericPart;
    } else {
      // Si no hay documentos o numericPart no es número,
      // parseamos valorInicial (si viene en formato "LOADC0000000" lo parseamos)
      if (valorInicial.startsWith(prefijoBase)) {
        const parteNum = valorInicial.slice(prefijoBase.length); // "0000000"
        numeroActual = parseInt(parteNum, longitudConsecutivo) || 0;
      } else if (valorInicial) {
        // Si valorInicial no empieza con prefijo, intentamos parsear directo
        numeroActual = parseInt(valorInicial, longitudConsecutivo) || 0;
      }
    }

    // 4) Incrementar en memoria
    const nuevoNumero = numeroActual + 1;

    // 5) Formar la cadena final: p.ej. "LOADC" + "0000003"
    const nuevoConsecutivo = `${prefijoBase}${String(nuevoNumero).padStart(
      longitudConsecutivo,
      "0"
    )}`;

    return nuevoConsecutivo;
  } catch (error) {
    throw new Error(`Error al obtener el consecutivo: ${error.message}`);
  }
}

module.exports = obtenerConsecutivo;
