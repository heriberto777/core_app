// Crear un archivo test-connection.js
require("dotenv").config();
const mongoose = require("mongoose");
const { connectToMongoDB, testEnvBasedConnection } = require("./services/dbService");

async function runTest() {
  try {
    await connectToMongoDB();
    console.log("MongoDB conectado correctamente.");
    
    await testEnvBasedConnection();
    
    console.log("Test completado.");
    process.exit(0);
  } catch (error) {
    console.error("Error en test:", error);
    process.exit(1);
  }
}

runTest();