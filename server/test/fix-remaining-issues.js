// fix-remaining-issues-corrected.js
const fs = require("fs");
const path = require("path");

class RemainingIssuesFixer {
  constructor() {
    // CORREGIDO: Detectar la ruta correctamente
    this.projectRoot = process.cwd();
    this.serverDir = path.join(this.projectRoot, "server");

    console.log(`Directorio actual: ${process.cwd()}`);
    console.log(`Directorio server calculado: ${this.serverDir}`);
    console.log(`¿Existe server?: ${fs.existsSync(this.serverDir)}`);

    this.excludedFiles = [
      "ConnectionCentralService.js",
      "ConnectionManager.js",
      "DatabaseService.js",
      "DatabaseServiceAdapter.js",
    ];
  }

  fixImports() {
    console.log("\nCorrigiendo imports faltantes...\n");

    if (!fs.existsSync(this.serverDir)) {
      console.error(`Error: Directorio ${this.serverDir} no existe`);
      return;
    }

    const files = this.getAllJSFiles(this.serverDir);
    console.log(`Archivos encontrados: ${files.length}`);

    let fixedCount = 0;

    files.forEach((filePath) => {
      const fileName = path.basename(filePath);

      if (this.excludedFiles.includes(fileName)) {
        return;
      }

      let content = fs.readFileSync(filePath, "utf8");

      // Verificar si usa DatabaseServiceAdapter pero no lo importa
      const usesDatabaseAdapter = content.includes("DatabaseServiceAdapter.");
      const hasImport =
        content.includes('require("../services/DatabaseServiceAdapter")') ||
        content.includes("require("../services/DatabaseServiceAdapter")");

      if (usesDatabaseAdapter && !hasImport) {
        console.log(`Agregando import a: ${fileName}`);

        // Crear backup
        const backupPath = filePath + ".import-backup";
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(filePath, backupPath);
        }

        // Buscar donde insertar el import
        const lines = content.split("\n");
        let insertIndex = -1;

        // Buscar la última línea de require
        for (let i = 0; i < lines.length; i++) {
          if (
            lines[i].trim().startsWith("const ") &&
            lines[i].includes("require(") &&
            !lines[i].includes("DatabaseServiceAdapter")
          ) {
            insertIndex = i;
          }
        }

        if (insertIndex !== -1) {
          lines.splice(
            insertIndex + 1,
            0,
            'const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");'
          );
        } else {
          // Insertar al principio si no hay otros requires
          lines.unshift(
            'const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");',
            ""
          );
        }

        content = lines.join("\n");
        fs.writeFileSync(filePath, content);
        fixedCount++;
        console.log(`  ✅ Import agregado a ${fileName}`);
      }
    });

    console.log(`\nImports corregidos: ${fixedCount} archivos\n`);
  }

  cleanRemainingReferences() {
    console.log("Limpiando referencias restantes...\n");

    const files = this.getAllJSFiles(this.serverDir);
    let cleanedCount = 0;

    files.forEach((filePath) => {
      const fileName = path.basename(filePath);

      if (this.excludedFiles.includes(fileName)) {
        return;
      }

      let content = fs.readFileSync(filePath, "utf8");
      let changed = false;

      // Crear backup si hay cambios
      let backupCreated = false;

      const cleanups = [
        {
          from: /const ConnectionCentralService = require\([^)]+\);?\s*\n?/g,
          to: "// const ConnectionCentralService = require(...); // REMOVED\n",
          description: "ConnectionCentralService import",
        },
        {
          from: /ConnectionCentralService\./g,
          to: "DatabaseServiceAdapter.",
          description: "ConnectionCentralService references",
        },
        {
          from: /SqlService\.query\(/g,
          to: "DatabaseServiceAdapter.query(",
          description: "SqlService.query calls",
        },
      ];

      cleanups.forEach((cleanup) => {
        const beforeCount = (content.match(cleanup.from) || []).length;
        if (beforeCount > 0) {
          if (!backupCreated) {
            const backupPath = filePath + ".clean-backup";
            if (!fs.existsSync(backupPath)) {
              fs.copyFileSync(filePath, backupPath);
              backupCreated = true;
            }
          }

          content = content.replace(cleanup.from, cleanup.to);
          changed = true;
          console.log(
            `  ✅ ${fileName}: Limpiado ${cleanup.description} (${beforeCount} referencias)`
          );
        }
      });

      if (changed) {
        fs.writeFileSync(filePath, content);
        cleanedCount++;
      }
    });

    console.log(`\nArchivos modificados: ${cleanedCount}\n`);
  }

  getAllJSFiles(dir) {
    let files = [];

    try {
      const items = fs.readdirSync(dir);

      items.forEach((item) => {
        const itemPath = path.join(dir, item);

        try {
          const stats = fs.statSync(itemPath);

          if (
            stats.isDirectory() &&
            item !== "node_modules" &&
            item !== "test"
          ) {
            files = files.concat(this.getAllJSFiles(itemPath));
          } else if (item.endsWith(".js") && !item.includes(".backup")) {
            files.push(itemPath);
          }
        } catch (statError) {
          console.warn(`Advertencia: No se puede acceder a ${itemPath}`);
        }
      });
    } catch (readdirError) {
      console.error(`Error leyendo directorio ${dir}: ${readdirError.message}`);
    }

    return files;
  }

  run() {
    console.log("🔧 Corrigiendo problemas restantes...\n");

    this.fixImports();
    this.cleanRemainingReferences();

    console.log("🎉 Corrección completada");
    console.log(
      "💾 Backups creados con extensiones .import-backup y .clean-backup"
    );
    console.log("\n📋 Próximo paso: Ejecutar validación nuevamente");
  }
}

const fixer = new RemainingIssuesFixer();
fixer.run();
