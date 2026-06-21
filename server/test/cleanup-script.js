// cleanup-script.js - VERSIÓN MODIFICADA
const fs = require("fs");
const path = require("path");

class CodeCleanup {
  constructor() {
    this.backupSuffix = ".pre-cleanup-backup";
    this.changes = [];
    this.excludedDirs = ["node_modules", "test", "tests"]; // Excluir carpeta test
  }

  // Buscar archivos que necesitan limpieza (excluyendo tests)
  findFilesToClean() {
    const serverDir = "./server";
    const filesToCheck = this.getAllJSFiles(serverDir);
    const filesToClean = [];

    filesToCheck.forEach((filePath) => {
      // Saltar archivos en carpetas excluidas
      if (this.isExcludedPath(filePath)) {
        console.log(`ℹ️ Saltando archivo de test: ${filePath}`);
        return;
      }

      const content = fs.readFileSync(filePath, "utf8");

      const hasOldReferences =
        content.includes("ConnectionCentralService") ||
        content.includes("ConnectionManager") ||
        content.includes("SqlService.query(");

      if (hasOldReferences && !filePath.includes("DatabaseService")) {
        filesToClean.push({
          path: filePath,
          hasConnectionCentral: content.includes("ConnectionCentralService"),
          hasConnectionManager: content.includes("ConnectionManager"),
          hasSqlServiceQuery: content.includes("SqlService.query("),
          hasBackup: fs.existsSync(filePath + this.backupSuffix),
        });
      }
    });

    return filesToClean;
  }

  isExcludedPath(filePath) {
    return this.excludedDirs.some(
      (excludedDir) =>
        filePath.includes(`/${excludedDir}/`) ||
        filePath.includes(`\\${excludedDir}\\`)
    );
  }

  getAllJSFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory() && !this.excludedDirs.includes(item)) {
        files = files.concat(this.getAllJSFiles(itemPath));
      } else if (item.endsWith(".js") && !item.includes(".backup")) {
        files.push(itemPath);
      }
    });

    return files;
  }

  // Resto de métodos igual...
  createBackup(filePath) {
    const backupPath = filePath + this.backupSuffix;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
      console.log(`Backup creado: ${backupPath}`);
      return true;
    }
    console.log(`Backup ya existe: ${backupPath}`);
    return false;
  }

  cleanFile(filePath) {
    let content = fs.readFileSync(filePath, "utf8");
    let changesMade = 0;
    const fileName = path.basename(filePath);

    this.createBackup(filePath);

    const replacements = [
      {
        from: /const ConnectionCentralService = require\([^)]+\);?\n?/g,
        to: "// const ConnectionCentralService = require(...); // REMOVED - using DatabaseServiceAdapter\n",
        description: "Comentar import ConnectionCentralService",
      },
      {
        from: /const ConnectionService = require\(["']\.\/ConnectionCentralService["']\);?\n?/g,
        to: '// const ConnectionService = require("./ConnectionCentralService"); // REMOVED\nconst DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");\n',
        description: "Reemplazar ConnectionService por DatabaseServiceAdapter",
      },
      {
        from: /ConnectionCentralService\./g,
        to: "DatabaseServiceAdapter.",
        description: "Reemplazar referencias ConnectionCentralService",
      },
      {
        from: /ConnectionService\./g,
        to: "DatabaseServiceAdapter.",
        description: "Reemplazar referencias ConnectionService",
      },
      {
        from: /SqlService\.query\(/g,
        to: "DatabaseServiceAdapter.query(",
        description: "Reemplazar SqlService.query",
      },
    ];

    replacements.forEach((replacement) => {
      const beforeCount = (content.match(replacement.from) || []).length;
      content = content.replace(replacement.from, replacement.to);
      const afterCount = (content.match(replacement.from) || []).length;
      const changes = beforeCount - afterCount;

      if (changes > 0) {
        changesMade += changes;
        console.log(`  ${replacement.description}: ${changes} cambios`);
        this.changes.push({
          file: fileName,
          change: replacement.description,
          count: changes,
        });
      }
    });

    if (
      content.includes("DatabaseServiceAdapter.") &&
      !content.includes('require("../services/DatabaseServiceAdapter")') &&
      !content.includes("require("../services/DatabaseServiceAdapter")")
    ) {
      const requireLines = content.match(/const .+ = require\([^)]+\);?\n/g);
      if (requireLines && requireLines.length > 0) {
        const lastRequireLine = requireLines[requireLines.length - 1];
        const newImport =
          'const DatabaseServiceAdapter = require("../services/DatabaseServiceAdapter");\n';
        content = content.replace(lastRequireLine, lastRequireLine + newImport);
        changesMade++;
        console.log(`  Agregado import DatabaseServiceAdapter`);
      }
    }

    if (changesMade > 0) {
      fs.writeFileSync(filePath, content);
      console.log(`${fileName}: ${changesMade} cambios aplicados`);
    } else {
      console.log(`${fileName}: Sin cambios necesarios`);
    }

    return changesMade;
  }

  runCleanup() {
    console.log("Iniciando limpieza de código (excluyendo carpeta test)...\n");

    const filesToClean = this.findFilesToClean();

    if (filesToClean.length === 0) {
      console.log("No se encontraron archivos que requieran limpieza");
      return;
    }

    console.log(
      `Archivos encontrados que requieren limpieza: ${filesToClean.length}\n`
    );

    filesToClean.forEach((fileInfo) => {
      console.log(`Limpiando: ${fileInfo.path}`);

      const issues = [];
      if (fileInfo.hasConnectionCentral)
        issues.push("ConnectionCentralService");
      if (fileInfo.hasConnectionManager) issues.push("ConnectionManager");
      if (fileInfo.hasSqlServiceQuery) issues.push("SqlService.query");

      console.log(`  Problemas: ${issues.join(", ")}`);

      this.cleanFile(fileInfo.path);
      console.log("");
    });

    this.showSummary();
  }

  showSummary() {
    console.log("\nRESUMEN DE LIMPIEZA:");
    console.log(`Total de cambios: ${this.changes.length}`);

    const fileGroups = {};
    this.changes.forEach((change) => {
      if (!fileGroups[change.file]) {
        fileGroups[change.file] = [];
      }
      fileGroups[change.file].push(`${change.change} (${change.count})`);
    });

    Object.entries(fileGroups).forEach(([file, changes]) => {
      console.log(`\n${file}:`);
      changes.forEach((change) => console.log(`  - ${change}`));
    });

    console.log("\nLimpieza completada");
    console.log("Backups guardados con extensión .pre-cleanup-backup");
    console.log("Carpeta /test preservada sin cambios");
  }
}

const cleanup = new CodeCleanup();
cleanup.runCleanup();
