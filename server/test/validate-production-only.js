// validate-production-only.js
const fs = require("fs");
const path = require("path");

class ProductionValidator {
  constructor() {
    this.serverDir = path.join(process.cwd(), "server");

    // Archivos que DEBEMOS ignorar
    this.ignoredFiles = [
      // Archivos obsoletos (mantener como referencia)
      "ConnectionCentralService.js",
      "ConnectionManager.js",

      // Scripts de migración/utilidad
      "cleanup-script.js",
      "fix-connection-manager-pattern.js",
      "fix-critical-files.js",
      "fix-remaining-issues.js",
      "validate-cleanup.js",
      "validate-manager-pattern.js",

      // Tests
      "test-final-migration.js",
      "test-migration.js",
      "test-transactions.js",
      "test-get-documents.js",

      // Auto-referencias normales
      "DatabaseService.js",
      "DatabaseServiceAdapter.js",
    ];

    // Archivos CRÍTICOS que deben estar limpios
    this.criticalFiles = [
      "DynamicTransferService.js",
      "mappingController.js",
      "transferTaskController.js",
      "ordersController.js",
      "loadsController.js",
      "transferSummaryController.js",
      "SqlService.js",
      "transferService.js",
      "traspasoService.js",
      "loadsService.js",
      "healthMonitorService.js",
    ];
  }

  validateProductionCode() {
    console.log("Validando SOLO código de producción crítico...\n");

    const issues = [];
    const checkedFiles = [];

    this.getAllJSFiles(this.serverDir).forEach((filePath) => {
      const fileName = path.basename(filePath);

      // Solo validar archivos críticos
      if (!this.criticalFiles.includes(fileName)) {
        return;
      }

      checkedFiles.push(fileName);
      const content = fs.readFileSync(filePath, "utf8");
      const problems = [];

      // Verificar problemas críticos
      if (
        content.includes("ConnectionCentralService") &&
        !content.includes("// REMOVED") &&
        !content.includes("// const ConnectionCentralService")
      ) {
        problems.push("Aún usa ConnectionCentralService activo");
      }

      if (content.includes("SqlService.query(")) {
        problems.push(
          "Aún usa SqlService.query en lugar de DatabaseServiceAdapter.query"
        );
      }

      if (
        content.includes("DatabaseServiceAdapter.") &&
        !content.includes('require("../services/DatabaseServiceAdapter")') &&
        !content.includes('require("../services/DatabaseServiceAdapter")')
      ) {
        problems.push("Usa DatabaseServiceAdapter sin importarlo");
      }

      if (problems.length > 0) {
        issues.push({ file: fileName, problems });
      }
    });

    console.log(`Archivos críticos verificados: ${checkedFiles.length}`);
    checkedFiles.forEach((file) => console.log(`  ✓ ${file}`));

    if (issues.length === 0) {
      console.log("\n✅ CÓDIGO DE PRODUCCIÓN VALIDADO");
      console.log("✅ Sistema listo para testing de funcionalidad");
      console.log("✅ Archivos críticos migrados correctamente");

      console.log("\n📋 ARCHIVOS IGNORADOS (correcto):");
      this.ignoredFiles.forEach((file) => console.log(`  - ${file}`));

      return true;
    } else {
      console.log("\n❌ PROBLEMAS EN CÓDIGO CRÍTICO:\n");
      issues.forEach((issue) => {
        console.log(`${issue.file}:`);
        issue.problems.forEach((problem) => console.log(`  - ${problem}`));
      });
      return false;
    }
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
          // Ignorar archivos inaccesibles
        }
      });
    } catch (readdirError) {
      console.error(`Error leyendo directorio ${dir}: ${readdirError.message}`);
    }

    return files;
  }
}

const validator = new ProductionValidator();
validator.validateProductionCode();
