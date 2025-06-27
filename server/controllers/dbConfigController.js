const DBConfig = require("../models/dbConfigModel");
const ConnectionCentralService = require("../services/ConnectionCentralService"); // Import unificado

/**
 * 📌 Obtener todas las configuraciones de base de datos
 */
const getDBConfigs = async (req, res) => {
  try {
    const configs = await DBConfig.find();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener configuraciones" });
  }
};

/**
 * 📌 Crear o actualizar una configuración de base de datos en MongoDB
 */
const upsertDBConfig = async (req, res) => {
  try {
    const {
      serverName,
      type,
      user,
      password,
      host,
      port,
      database,
      instance,
      options,
    } = req.body;

    console.log("📝 Datos recibidos:", {
      serverName,
      type,
      host,
      port,
      database,
      instance,
    });

    // Verificar si ya existe para decidir entre crear o actualizar
    const existingConfig = await DBConfig.findOne({ serverName });

    if (existingConfig) {
      // Actualizar configuración existente
      const updatedConfig = await DBConfig.findOneAndUpdate(
        { serverName },
        {
          type,
          user,
          password,
          host,
          port,
          database,
          instance,
          options,
        },
        { new: true }
      );

      console.log("✅ Configuración actualizada:", serverName);

      // IMPORTANTE: Reinicializar pool después de actualizar configuración
      try {
        console.log(
          `🔄 Reinicializando pool para ${serverName} después de actualizar configuración...`
        );
        await ConnectionCentralService.closePool(serverName);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2 segundos
        await ConnectionCentralService.initPool(serverName);
        console.log(`✅ Pool reinicializado para ${serverName}`);
      } catch (poolError) {
        console.warn(
          `⚠️ Error al reinicializar pool para ${serverName}:`,
          poolError.message
        );
        // No fallar la actualización por esto, solo log de advertencia
      }

      return res.status(200).json({
        message: "Configuración actualizada con éxito",
        data: updatedConfig,
      });
    } else {
      // Crear nueva configuración
      const newConfig = new DBConfig({
        serverName,
        type,
        user,
        password,
        host,
        port,
        database,
        instance,
        options,
      });

      await newConfig.save();
      console.log("✅ Nueva configuración creada:", serverName);

      // IMPORTANTE: Inicializar pool para nueva configuración
      try {
        console.log(
          `🔄 Inicializando pool para nueva configuración ${serverName}...`
        );
        await ConnectionCentralService.initPool(serverName);
        console.log(`✅ Pool inicializado para ${serverName}`);
      } catch (poolError) {
        console.warn(
          `⚠️ Error al inicializar pool para ${serverName}:`,
          poolError.message
        );
        // No fallar la creación por esto, solo log de advertencia
      }

      return res.status(201).json({
        message: "Configuración creada con éxito",
        data: newConfig,
      });
    }
  } catch (error) {
    console.error("❌ Error guardando configuración:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message,
    });
  }
};

/**
 * 📌 Eliminar una configuración de base de datos
 */
const deleteDBConfig = async (req, res) => {
  try {
    const { serverName } = req.params;

    if (!serverName) {
      return res
        .status(400)
        .json({ error: "Debe proporcionar un nombre de servidor" });
    }

    // Cerrar pool antes de eliminar configuración
    try {
      console.log(
        `🔄 Cerrando pool para ${serverName} antes de eliminar configuración...`
      );
      await ConnectionCentralService.closePool(serverName);
      console.log(`✅ Pool cerrado para ${serverName}`);
    } catch (poolError) {
      console.warn(
        `⚠️ Error al cerrar pool para ${serverName}:`,
        poolError.message
      );
      // Continuar con la eliminación aunque falle el cierre del pool
    }

    await DBConfig.findOneAndDelete({ serverName });
    console.log(`✅ Configuración eliminada para ${serverName}`);

    res.json({ message: "Configuración eliminada con éxito" });
  } catch (error) {
    console.error("❌ Error eliminando configuración:", error);
    res
      .status(500)
      .json({ error: "Error eliminando configuración de la base de datos" });
  }
};

/**
 * 📌 Probar conexión a base de datos - VERSIÓN CORREGIDA CON DIAGNÓSTICO REAL
 */
const testDBConnection = async (req, res) => {
  try {
    const {
      serverName,
      type,
      host,
      port,
      user,
      password,
      database,
      instance,
      options,
    } = req.body;

    console.log("🔍 Iniciando prueba de conexión con datos:", {
      serverName: serverName || "temporal",
      type,
      host,
      port,
      database,
      instance,
    });

    // Validar que sea SQL Server (por ahora solo soportamos MSSQL)
    if (type !== "mssql") {
      return res.status(400).json({
        success: false,
        error: `Prueba de conexión para ${type} no implementada aún. Solo se soporta MSSQL actualmente.`,
      });
    }

    // Validar campos requeridos
    if (!host || !user || !password || !database) {
      return res.status(400).json({
        success: false,
        error: "Faltan campos obligatorios: host, user, password, database",
      });
    }

    // Si es una configuración existente, usar diagnóstico directo
    if (serverName && (serverName === "server1" || serverName === "server2")) {
      console.log(`📊 Usando diagnóstico directo para ${serverName}`);

      const diagnosticResult =
        await ConnectionCentralService.diagnoseConnection(serverName);

      if (diagnosticResult.success) {
        return res.json({
          success: true,
          message: "Conexión establecida correctamente",
          serverName: serverName,
          connectionTime: "< 1000ms",
          data: diagnosticResult.data,
          timestamp: new Date().toISOString(),
        });
      } else {
        return res.status(400).json({
          success: false,
          error: diagnosticResult.error,
          phase: diagnosticResult.phase,
          code: diagnosticResult.code,
          serverName: serverName,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Para configuraciones nuevas o temporales, usar prueba directa
    console.log(
      "🧪 Realizando prueba de conexión directa para configuración temporal"
    );

    const testResult = await testDirectConnection({
      serverName: serverName || `temp_${Date.now()}`,
      type,
      host,
      port: port || null,
      user,
      password,
      database,
      instance: instance || null,
      options: {
        encrypt: options?.encrypt || false,
        trustServerCertificate: options?.trustServerCertificate !== false,
        ...options,
      },
    });

    if (testResult.success) {
      res.json({
        success: true,
        message: "Conexión establecida correctamente",
        connectionTime: testResult.connectionTime,
        serverInfo: testResult.serverInfo,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: testResult.error,
        phase: testResult.phase,
        recommendations: testResult.recommendations || [],
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ Error probando conexión:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor al probar la conexión",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * 🔧 Función auxiliar para probar conexión directa con configuración temporal
 * @param {Object} config - Configuración de la base de datos
 * @returns {Promise<Object>} - Resultado de la prueba
 */
async function testDirectConnection(config) {
  const { Connection, Request } = require("tedious");

  return new Promise((resolve) => {
    const startTime = Date.now();

    // Convertir configuración al formato Tedious
    const tediousConfig = {
      server: config.host,
      authentication: {
        type: "default",
        options: {
          userName: config.user,
          password: config.password,
        },
      },
      options: {
        database: config.database,
        encrypt: config.options?.encrypt || false,
        trustServerCertificate:
          config.options?.trustServerCertificate !== false,
        enableArithAbort: true,
        connectTimeout: 90000, // 90 segundos para instancias nombradas
        requestTimeout: 120000, // 2 minutos
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,
      },
    };

    // Manejar instancia nombrada
    if (config.instance && config.instance.trim() !== "") {
      tediousConfig.options.instanceName = config.instance.trim();
      console.log(
        `🏷️ Configurando instancia nombrada: ${tediousConfig.options.instanceName}`
      );
    } else if (config.port) {
      tediousConfig.options.port = parseInt(config.port);
      console.log(`🔌 Configurando puerto: ${tediousConfig.options.port}`);
    } else {
      tediousConfig.options.port = 1433;
    }

    const connection = new Connection(tediousConfig);
    let resolved = false;

    // Timeout de seguridad - más largo para instancias nombradas
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        connection.removeAllListeners();
        try {
          connection.close();
        } catch (e) {}

        resolve({
          success: false,
          error: "Timeout al intentar conectar (90 segundos)",
          phase: "connection_timeout",
          recommendations: [
            "Verificar que el servidor SQL esté en ejecución",
            "Comprobar conectividad de red",
            "Verificar configuración de firewall",
            config.instance
              ? "Confirmar que la instancia nombrada existe y está en ejecución"
              : "Verificar que el puerto sea correcto",
            "Las instancias nombradas pueden tardar más tiempo en conectar",
          ],
        });
      }
    }, 95000); // 95 segundos

    // Evento de conexión
    connection.on("connect", (err) => {
      if (resolved) return;

      clearTimeout(timeout);
      resolved = true;

      if (err) {
        console.error("❌ Error de conexión:", err);
        resolve({
          success: false,
          error: err.message,
          code: err.code,
          state: err.state,
          phase: "connection_error",
          recommendations: getErrorRecommendations(err),
        });
      } else {
        // Probar consulta para obtener información del servidor
        const testRequest = new Request(
          "SELECT @@SERVERNAME AS ServerName, @@VERSION AS Version, DB_NAME() AS Database",
          (queryErr, rowCount) => {
            const connectionTime = Date.now() - startTime;

            try {
              connection.close();
            } catch (e) {}

            if (queryErr) {
              resolve({
                success: false,
                error: queryErr.message,
                phase: "query_error",
                connectionTime: `${connectionTime}ms`,
              });
            } else {
              resolve({
                success: true,
                connectionTime: `${connectionTime}ms`,
                rowCount: rowCount,
              });
            }
          }
        );

        let serverInfo = {};
        testRequest.on("row", (columns) => {
          columns.forEach((column) => {
            serverInfo[column.metadata.colName] = column.value;
          });
        });

        testRequest.on("done", () => {
          const connectionTime = Date.now() - startTime;
          try {
            connection.close();
          } catch (e) {}

          resolve({
            success: true,
            connectionTime: `${connectionTime}ms`,
            serverInfo: serverInfo,
          });
        });

        connection.execSql(testRequest);
      }
    });

    // Evento de error
    connection.on("error", (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;

        console.error("❌ Error de conexión:", err);
        resolve({
          success: false,
          error: err.message,
          code: err.code,
          phase: "connection_error",
          recommendations: getErrorRecommendations(err),
        });
      }
    });

    // Iniciar conexión
    console.log("🚀 Iniciando conexión de prueba...");
    connection.connect();
  });
}

/**
 * 💡 Función auxiliar para generar recomendaciones basadas en errores
 * @param {Object} error - Error de conexión
 * @returns {Array} - Lista de recomendaciones
 */
function getErrorRecommendations(error) {
  const recommendations = [];
  const errorMsg = error.message?.toLowerCase() || "";

  if (errorMsg.includes("timeout")) {
    recommendations.push("Verificar conectividad de red");
    recommendations.push(
      "Las instancias nombradas pueden tardar más tiempo en conectar"
    );
    recommendations.push("Comprobar que el servidor SQL esté respondiendo");
    recommendations.push("Verificar configuración de firewall");
  }

  if (
    errorMsg.includes("login failed") ||
    errorMsg.includes("authentication")
  ) {
    recommendations.push("Verificar usuario y contraseña");
    recommendations.push("Confirmar que el usuario tenga permisos");
    recommendations.push(
      "Verificar que el usuario esté habilitado para esta instancia"
    );
  }

  if (errorMsg.includes("server not found") || errorMsg.includes("network")) {
    recommendations.push("Verificar nombre del servidor/host");
    recommendations.push("Comprobar conectividad de red");
    recommendations.push("Verificar que la instancia nombrada exista");
    recommendations.push("Confirmar que SQL Server Browser esté ejecutándose");
  }

  if (errorMsg.includes("database") && errorMsg.includes("does not exist")) {
    recommendations.push("Verificar que la base de datos exista");
    recommendations.push("Confirmar permisos de acceso a la base de datos");
  }

  if (recommendations.length === 0) {
    recommendations.push("Verificar configuración de conexión");
    recommendations.push("Comprobar logs del servidor SQL");
    recommendations.push("Contactar al administrador de base de datos");
  }

  return recommendations;
}

/**
 * 📊 Probar conexión a servidor configurado (server1 o server2)
 */
const testConfiguredServer = async (req, res) => {
  try {
    const { serverName } = req.params;

    if (!["server1", "server2"].includes(serverName)) {
      return res.status(400).json({
        success: false,
        error: "Servidor inválido. Use 'server1' o 'server2'",
      });
    }

    console.log(`🔍 Probando servidor configurado: ${serverName}`);

    const diagnosticResult = await ConnectionCentralService.diagnoseConnection(
      serverName
    );

    if (diagnosticResult.success) {
      res.json({
        success: true,
        message: `Conexión a ${serverName} establecida correctamente`,
        serverName: serverName,
        data: diagnosticResult.data,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(400).json({
        success: false,
        error: diagnosticResult.error,
        phase: diagnosticResult.phase,
        code: diagnosticResult.code,
        serverName: serverName,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`❌ Error probando ${req.params.serverName}:`, error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
  testDBConnection,
  testConfiguredServer,
};
