// validate-cleanup.js
const fs = require("fs");
const path = require("path");

class CleanupValidator {
  validate() {
    console.log("🔍 Validando limpieza...\n");

    const serverDir = "./server";
    const jsFiles = this.getAllJSFiles(serverDir);
    const issues = [];

    jsFiles.forEach((filePath) => {
      if (filePath.includes(".backup")) return;

      const content = fs.readFileSync(filePath, "utf8");
      const fileName = path.basename(filePath);

      // Verificar problemas restantes
      const problems = [];

      if (
        content.includes("ConnectionCentralService") &&
        !content.includes("// REMOVED") &&
        !filePath.includes("DatabaseService")
      ) {
        problems.push("Aún contiene ConnectionCentralService");
      }

      if (content.includes("SqlService.query(")) {
        problems.push("Aún contiene SqlService.query");
      }

      if (
        content.includes("DatabaseServiceAdapter.") &&
        !content.includes('require("./DatabaseServiceAdapter")') &&
        !content.includes("require('./DatabaseServiceAdapter')")
      ) {
        problems.push("Usa DatabaseServiceAdapter pero no lo importa");
      }

      if (problems.length > 0) {
        issues.push({ file: fileName, problems });
      }
    });

    if (issues.length === 0) {
      console.log("✅ VALIDACIÓN EXITOSA");
      console.log("✅ Todos los archivos están limpios");
      console.log("✅ No hay referencias obsoletas");
      return true;
    } else {
      console.log("⚠️ PROBLEMAS ENCONTRADOS:\n");
      issues.forEach((issue) => {
        console.log(`${issue.file}:`);
        issue.problems.forEach((problem) => console.log(`  - ${problem}`));
        console.log("");
      });
      return false;
    }
  }

  getAllJSFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory() && item !== "node_modules") {
        files = files.concat(this.getAllJSFiles(itemPath));
      } else if (item.endsWith(".js")) {
        files.push(itemPath);
      }
    });

    return files;
  }
}

new CleanupValidator().validate();
