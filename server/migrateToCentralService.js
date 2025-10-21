// migration-script.js
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// Configuración de la migración
const CONFIG = {
  sourcePath: "./services", // Ruta donde están tus archivos de servicio
  backupPath: "./services_backup", // Ruta para crear copias de seguridad
  fileExtensions: [".js"], // Extensiones de archivos a procesar
  excludeDirectories: ["node_modules", ".git"], // Directorios a excluir
  excludeFiles: ["DatabaseServiceAdapter.js"], // Archivos a excluir
  replacements: [
    {
      from: /const\s+ConnectionManager\s*=\s*require\s*\(\s*['"]\.\/ConnectionManager['"]\s*\)/g,
      to: '// const ConnectionService = require("./ConnectionCentralService"); // REMOVED
const DatabaseServiceAdapter = require("./services/DatabaseServiceAdapter");
',
    },
    {
      from: /ConnectionManager\.enhancedRobustConnect/g,
      to: "DatabaseServiceAdapter.enhancedRobustConnect",
    },
    {
      from: /ConnectionManager\.getConnection/g,
      to: "DatabaseServiceAdapter.getConnection",
    },
    {
      from: /ConnectionManager\.releaseConnection/g,
      to: "DatabaseServiceAdapter.releaseConnection",
    },
    {
      from: /ConnectionManager\.verifyAndRenewConnection/g,
      to: "DatabaseServiceAdapter.verifyAndRenewConnection",
    },
    {
      from: /ConnectionManager\.shouldRenewConnection/g,
      to: "DatabaseServiceAdapter.verifyAndRenewConnection",
    },
    {
      from: /ConnectionManager\.incrementOperationCount/g,
      to: "DatabaseServiceAdapter.incrementOperationCount",
    },
    {
      from: /ConnectionManager\.getPoolsStatus/g,
      to: "DatabaseServiceAdapter.getPoolsStatus",
    },
    {
      from: /ConnectionManager\.closePools/g,
      to: "DatabaseServiceAdapter.closePools",
    },
    {
      from: /ConnectionManager\.closePool/g,
      to: "DatabaseServiceAdapter.closePool",
    },
    {
      from: /withConnection\s*\(\s*(['"])(\w+)(['"])\s*,\s*async\s*\(\s*connection\s*\)\s*=>\s*\{/g,
      to: (match, q1, serverKey, q3) =>
        `// Reemplazado por conexión directa\nlet connection = null;\ntry {\n  connection = await DatabaseServiceAdapter.getConnection(${q1}${serverKey}${q3});\n`,
    },
    {
      from: /\}\s*\)\s*;(\s*)\/\/\s*fin de withConnection/g,
      to: (match, spaces) =>
        `${spaces}  return result;\n} finally {\n  if (connection) {\n    await DatabaseServiceAdapter.releaseConnection(connection);\n  }\n}${spaces}// fin de manejo de conexión`,
    },
  ],
};

// Función para crear copias de seguridad de los archivos
async function createBackup(filePath, backupPath) {
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const content = await readFileAsync(filePath, "utf8");
  await writeFileAsync(backupPath, content, "utf8");
  console.log(`✅ Backup creado: ${backupPath}`);
}

// Función para modificar un archivo según las reglas definidas
async function processFile(filePath) {
  const fileName = path.basename(filePath);

  // Verificar si el archivo debe ser excluido
  if (CONFIG.excludeFiles.includes(fileName)) {
    console.log(`⏭️ Archivo excluido: ${filePath}`);
    return;
  }

  // Leer el contenido del archivo
  let content = await readFileAsync(filePath, "utf8");
  let originalContent = content;

  // Crear ruta del backup
  const relativePath = path.relative(CONFIG.sourcePath, filePath);
  const backupFilePath = path.join(CONFIG.backupPath, relativePath);

  // Crear backup
  await createBackup(filePath, backupFilePath);

  // Aplicar todas las reglas de reemplazo
  let changed = false;
  for (const replacement of CONFIG.replacements) {
    const newContent = content.replace(replacement.from, replacement.to);
    if (newContent !== content) {
      changed = true;
      content = newContent;
    }
  }

  // Si hubo cambios, sobrescribir el archivo
  if (changed) {
    await writeFileAsync(filePath, content, "utf8");
    console.log(`🔄 Archivo modificado: ${filePath}`);

    // Contar cambios específicos
    let changes = [];
    for (const replacement of CONFIG.replacements) {
      const count = (originalContent.match(replacement.from) || []).length;
      if (count > 0) {
        changes.push(
          `${count}x ${replacement.from.toString().slice(1, 30)}...`
        );
      }
    }

    if (changes.length > 0) {
      console.log(`   Cambios: ${changes.join(", ")}`);
    }
  } else {
    console.log(`⏩ Sin cambios: ${filePath}`);
  }
}

// Función recursiva para procesar todos los archivos en un directorio
async function processDirectory(dirPath) {
  // Leer contenido del directorio
  const items = await readdirAsync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);

    // Verificar si es un directorio
    const stats = await statAsync(itemPath);

    if (stats.isDirectory()) {
      // Si es un directorio, verificar si debe ser excluido
      if (CONFIG.excludeDirectories.includes(item)) {
        console.log(`⏭️ Directorio excluido: ${itemPath}`);
        continue;
      }

      // Procesar el directorio recursivamente
      await processDirectory(itemPath);
    } else if (stats.isFile()) {
      // Si es un archivo, verificar la extensión
      const ext = path.extname(itemPath);
      if (CONFIG.fileExtensions.includes(ext)) {
        await processFile(itemPath);
      }
    }
  }
}

// Función principal
async function main() {
  try {
    console.log(
      `🚀 Iniciando migración de ConnectionManager a DatabaseServiceAdapter...`
    );

    // Crear directorio de backup si no existe
    if (!fs.existsSync(CONFIG.backupPath)) {
      fs.mkdirSync(CONFIG.backupPath, { recursive: true });
      console.log(`📁 Directorio de backup creado: ${CONFIG.backupPath}`);
    }

    // Procesar todos los archivos
    await processDirectory(CONFIG.sourcePath);

    console.log(`\n✅ Migración completada con éxito!`);
    console.log(
      `   - Se han creado copias de seguridad en: ${CONFIG.backupPath}`
    );
    console.log(
      `   - Verifica los cambios y ejecuta tus pruebas antes de hacer commit.`
    );
  } catch (error) {
    console.error(`❌ Error durante la migración:`, error);
    process.exit(1);
  }
}

// Ejecutar la función principal
main();
