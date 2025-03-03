require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const https = require("https");
const http = require("http");
const {
  connectToMongoDB,
  loadConfigurations,
  connectToDB,
  testEnvBasedConnection,
  testDirectConnection,
} = require("./services/dbService");
const { Connection } = require("tedious");
const { startCronJob } = require("./services/cronService");
const Config = require("./models/configModel");
const { API_VERSION } = require("./config");

// Puerto para el servidor - usar el mismo que tu otra aplicación para mantener consistencia
const port = process.env.PORT || 3979;

// Determinar si estamos en desarrollo o producción
const isDev = process.env.NODE_ENV !== 'production';

// Variable para guardar el servidor (HTTP o HTTPS)
let server;

// Función para verificar si el puerto está en uso
const isPortInUse = async (port) => {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

// Función para conectar a SQL Server con timeout
const connectWithTimeout = async (serverKey, timeoutMs = 10000) => {
  return new Promise(async (resolve) => {
    // Flag para controlar si ya se resolvió la promesa
    let resolved = false;
    
    // Timer para el timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        console.warn(`⚠️ Timeout al conectar a ${serverKey} después de ${timeoutMs}ms`);
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
    
    try {
      const connection = await connectToDB(serverKey);
      // Si llegamos aquí, la conexión fue exitosa
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        console.log(`✅ Conexión a ${serverKey} establecida correctamente`);
        resolve(connection);
      }
    } catch (error) {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        console.warn(`⚠️ Error conectando a ${serverKey}:`, error.message);
        resolve(null);
      }
    }
  });
};

const startServer = async () => {
  try {
    console.log("Iniciando servidor...");
    
    // Verificar si el puerto está en uso
    const portInUse = await isPortInUse(port);
    if (portInUse) {
      console.error(`⚠️ El puerto ${port} ya está en uso. Por favor cierre otras aplicaciones o use otro puerto.`);
      process.exit(1);
    }

    console.log("Conectando a MongoDB...");
    await connectToMongoDB();
    console.log("✅ Conexión a MongoDB establecida.");

    console.log("Cargando configuraciones...");
    await loadConfigurations();
    console.log("✅ Configuraciones cargadas.");

    console.log("Intentando conexiones a SQL Server con timeout...");
    try {
      // Ejecutando diagnóstico de conexión directa con tedious
      console.log("Ejecutando diagnóstico de conexión directa con tedious...");
      try {
        const directTestResult = await testDirectConnection('server2');
        console.log(`✅ Prueba directa exitosa. Servidor: ${directTestResult.server}`);
        console.log(`Versión SQL: ${directTestResult.version.substring(0, 50)}...`);
      } catch (directErr) {
        console.error(`❌ Prueba directa fallida: ${directErr.message}`);
        // Intentar con fallback explícito sin instanceName
        try {
          console.log("Intentando conexión de fallback sin instanceName...");
          const fallbackConfig = {
            server: process.env.SERVER2_HOST,
            authentication: {
              type: "default",
              options: {
                userName: process.env.SERVER2_USER,
                password: process.env.SERVER2_PASS,
              },
            },
            options: {
              database: process.env.SERVER2_DB,
              trustServerCertificate: true,
              rowCollectionOnRequestCompletion: true,
            }
          };
          
          const connection = new Connection(fallbackConfig);
          
          // Probar conexión
          await new Promise((resolve, reject) => {
            connection.on("connect", (err) => {
              if (err) {
                console.error("Fallback también falló:", err.message);
                reject(err);
              } else {
                console.log("✅ Conexión de fallback exitosa");
                connection.close();
                resolve();
              }
            });
            
            connection.connect();
          });
        } catch (fallbackErr) {
          console.error("Fallback también falló:", fallbackErr.message);
        }
      }

      // Usar Promise.all pero con timeouts para evitar bloqueos
      const connections = await Promise.all([
        connectWithTimeout("server1", 15000),
        connectWithTimeout("server2", 15000)
      ]);
      
      // Verificar resultados de conexiones
      if (connections[0]) {
        console.log("✅ Conexión a server1 exitosa");
        // Cerrar conexión para no mantenerla abierta innecesariamente
        try {
          await connections[0].close();
        } catch (err) {
          console.warn("No se pudo cerrar la conexión a server1:", err.message);
        }
      } else {
        console.warn("⚠️ No se pudo conectar a server1, pero continuamos");
      }
      
      if (connections[1]) {
        console.log("✅ Conexión a server2 exitosa");
        // Cerrar conexión
        try {
          await connections[1].close();
        } catch (err) {
          console.warn("No se pudo cerrar la conexión a server2:", err.message);
        }
      } else {
        console.warn("⚠️ No se pudo conectar a server2, pero continuamos");
      }
      
      console.log("✅ Pruebas de conexión a SQL Server completadas (con o sin éxito)");
    } catch (error) {
      console.error("❌ Error inesperado con las conexiones SQL:", error);
      console.log("Continuando con la inicialización del servidor de todas formas...");
    }

    console.log("Configurando cronjob...");
    let executionHour = "03:00"; // Valor por defecto
    try {
      const config = await Config.findOne();
      if (config && config.hour) {
        executionHour = config.hour;
      }
    } catch (configError) {
      console.warn("⚠️ Error al obtener configuración, usando hora por defecto:", configError.message);
    }
    
    console.log(`⏰ Transferencias programadas a las: ${executionHour}`);

    try {
      startCronJob(executionHour);
      console.log("✅ Cronjob configurado.");
    } catch (cronError) {
      console.error("❌ Error al configurar cronjob:", cronError);
      console.log("Continuando con la inicialización del servidor de todas formas...");
    }

    // Iniciar el servidor (HTTPS o HTTP)
    console.log(`Iniciando servidor en modo: ${isDev ? 'desarrollo' : 'producción'}`);
    
    if (isDev) {
      // En desarrollo, podemos usar HTTP para simplificar
      console.log("Iniciando servidor HTTP para desarrollo...");
      server = http.createServer(app);
      
      server.on('error', (err) => {
        console.error("❌ Error en servidor HTTP:", err);
        if (err.code === 'EADDRINUSE') {
          console.error(`El puerto ${port} está en uso. Abortando...`);
          process.exit(1);
        }
      });
      
      console.log("Llamando a server.listen() para HTTP...");
      server.listen(port, () => {
        console.log("******************************");
        console.log("****** API REST CATELLI ******");
        console.log("******************************");
        console.log(
          `🚀 Servidor HTTP iniciado en modo desarrollo: http://localhost:${port}/api/${API_VERSION}/`
        );
      });
      console.log(`Esperando que el servidor HTTP inicie en puerto ${port}...`);
    } else {
      // En producción, intentamos HTTPS con certificados
      try {
        console.log("Cargando certificados SSL para producción...");
        // Cargar certificados SSL
        const privateKey = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/privkey.pem",
          "utf8"
        );
        const certificate = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/fullchain.pem",
          "utf8"
        );
        const ca = fs.readFileSync(
          "/etc/letsencrypt/live/catelli.ddns.net/chain.pem",
          "utf8"
        );

        const credentials = {
          key: privateKey,
          cert: certificate,
          ca: ca,
        };
        
        console.log("✅ Certificados SSL cargados correctamente");
        
        console.log("Paso 1: Creando servidor HTTPS...");
        server = https.createServer(credentials, app);
        console.log("Paso 2: Servidor HTTPS creado correctamente");
        
        // Configurar manejadores de eventos ANTES de listen()
        console.log("Paso 3: Configurando event handlers...");
        server.on('error', (err) => {
          console.error("❌ Error en servidor HTTPS:", err);
          if (err.code === 'EADDRINUSE') {
            console.error(`El puerto ${port} está en uso. Abortando...`);
            process.exit(1);
          }
        });

        // Agregar un timeout para capturar errores silenciosos
        setTimeout(() => {
          if (server && !server.listening) {
            console.error('⚠️ El servidor no pudo iniciar después de 5 segundos, verificando estado...');
          }
        }, 5000);
        
        console.log("Paso 4: Llamando a server.listen() para HTTPS...");
        server.listen(port, () => {
          console.log("Paso 5: Callback de listen() ejecutado correctamente");
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `🔒 Servidor HTTPS iniciado en: https://localhost:${port}/api/${API_VERSION}/`
          );
        });
        console.log("Paso 6: Llamada a server.listen() completada, esperando callback...");
      } catch (error) {
        console.error("❌ Error crítico al configurar HTTPS:", error);
        
        // Si falla HTTPS, intentamos HTTP como fallback
        console.log("⚠️ Fallback a HTTP debido a error en certificados...");
        
        server = http.createServer(app);
        
        server.on('error', (err) => {
          console.error("❌ Error en servidor HTTP (fallback):", err);
          if (err.code === 'EADDRINUSE') {
            console.error(`El puerto ${port} está en uso. Abortando...`);
            process.exit(1);
          }
        });
        
        server.listen(port, () => {
          console.log("******************************");
          console.log("****** API REST CATELLI ******");
          console.log("******************************");
          console.log(
            `⚠️ Servidor HTTP (fallback) iniciado en: http://localhost:${port}/api/${API_VERSION}/`
          );
        });
      }
    }

    // Registrar cuando el servidor está escuchando (backup)
    if (server) {
      server.on('listening', () => {
        console.log(`✓ El servidor está escuchando en el puerto ${port}`);
      });
    }
  } catch (err) {
    console.error("❌ Error al iniciar el servidor:", err);
    process.exit(1);
  }
};

// Manejar errores no capturados
process.on("uncaughtException", (error) => {
  console.error("❌ Error no capturado:", error);
  // En producción, posiblemente quieras reiniciar el servidor
  if (!isDev && server) {
    console.log("Intentando cerrar el servidor gracefully después de un error no capturado...");
    server.close(() => {
      console.log("Servidor cerrado. Saliendo...");
      process.exit(1);
    });
    
    // Por si server.close() nunca termina
    setTimeout(() => {
      console.log("Forzando salida después de error no capturado");
      process.exit(1);
    }, 5000);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Rechazo de promesa no manejado:", reason);
});

// Manejo de señales para cierre graceful
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM. Cerrando servidor gracefully...');
  if (server) {
    server.close(() => {
      console.log('Servidor cerrado. Proceso terminando...');
      process.exit(0);
    });
    
    // Salir después de un timeout si server.close() no completa
    setTimeout(() => {
      console.log('Forzando salida después de timeout en server.close()');
      process.exit(0);
    }, 10000);
  } else {
    process.exit(0);
  }
});

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT (Ctrl+C). Cerrando servidor...');
  if (server) {
    server.close(() => {
      console.log('Servidor cerrado. Saliendo...');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.log('Forzando salida después de Ctrl+C');
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
});

console.log("Llamando a startServer()...");
startServer();