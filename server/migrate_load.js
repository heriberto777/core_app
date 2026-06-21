const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });

async function migrateLoadConsecutive() {
    try {
        const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/core_app";
        await mongoose.connect(mongoUri);
        console.log("Conectado a MongoDB");

        const db = mongoose.connection.db;

        // 1. Obtener el valor actual de 'consecutivos'
        const legacyColl = db.collection("consecutivos");
        const loadLegacy = await legacyColl.findOne({ nombre: "LOAD" });

        if (!loadLegacy) {
            console.log("No se encontró el consecutivo 'LOAD' en la colección legacy.");
            process.exit(0);
        }

        console.log(`Valor legacy encontrado: ${loadLegacy.valor}`);

        // 2. Insertar o actualizar en 'consecutives'
        const modernColl = db.collection("consecutives");

        // El formato en 'consecutives' usa 'name' como clave única
        // y 'currentValue' como el número secuencial actual.
        // El 'valor' legacy suele ser algo como 'LC0000005' o similar si se guardó la cadena completa,
        // o solo el número si se guardó como número antes del cambio a string.

        let numericValue = 0;
        if (typeof loadLegacy.valor === "string") {
            const match = loadLegacy.valor.match(/\d+/);
            if (match) numericValue = parseInt(match[0], 10);
        } else if (typeof loadLegacy.valor === "number") {
            numericValue = loadLegacy.valor;
        }

        console.log(`Valor numérico extraído: ${numericValue}`);

        const existingModern = await modernColl.findOne({ name: "LOAD" });
        if (existingModern) {
            console.log(`Ya existe 'LOAD' en 'consecutives'. Valor actual: ${existingModern.currentValue}`);
            if (numericValue > existingModern.currentValue) {
                await modernColl.updateOne({ name: "LOAD" }, { $set: { currentValue: numericValue } });
                console.log("Actualizado valor moderno al legacy más alto.");
            }
        } else {
            await modernColl.insertOne({
                name: "LOAD",
                description: "Consecutivo de Cargas (Migrado)",
                prefix: "LC",
                suffix: "",
                currentValue: numericValue,
                padding: 7,
                isActive: true,
                pattern: "{PREFIX}{VALUE}",
                resetConfig: { isEnabled: false },
                segmentation: { isEnabled: false },
                history: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log("Insertada nueva entrada 'LOAD' en 'consecutives'.");
        }

        console.log("Migración completada.");
        process.exit(0);
    } catch (error) {
        console.error("Error en migración:", error);
        process.exit(1);
    }
}

migrateLoadConsecutive();
