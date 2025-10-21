// validate-manager-pattern.js
const fs = require("fs");
const path = require("path");

function validateManagerPattern() {
  console.log("🔍 Validando patrón ConnectionManager...\n");

  const serverDir = path.join(process.cwd(), "server");
  const issues = [];

  function checkFiles(dir) {
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory() && item !== "node_modules" && item !== "test") {
        checkFiles(itemPath);
      } else if (item.endsWith(".js") && !item.includes(".backup")) {
        const content = fs.readFileSync(itemPath, "utf8");
        const fileName = path.basename(itemPath);
        const problems = [];

        // Verificar patrón problemático
        if (
          content.includes("ConnectionManager = require") &&
          content.includes("ConnectionCentralService")
        ) {
          problems.push(
            "Aún usa patrón ConnectionManager = require(ConnectionCentralService)"
          );
        }

        if (
          content.includes("ConnectionManager.getConnection") ||
          content.includes("ConnectionManager.releaseConnection")
        ) {
          problems.push(
            "Aún usa ConnectionManager.getConnection/releaseConnection"
          );
        }

        if (problems.length > 0) {
          issues.push({ file: fileName, problems });
        }
      }
    });
  }

  checkFiles(serverDir);

  if (issues.length === 0) {
    console.log("✅ PATRÓN CONNECTIONMANAGER CORREGIDO");
    console.log("✅ No se encontraron referencias problemáticas");
    return true;
  } else {
    console.log("⚠️ PROBLEMAS CON PATRÓN CONNECTIONMANAGER:\n");
    issues.forEach((issue) => {
      console.log(`${issue.file}:`);
      issue.problems.forEach((problem) => console.log(`  - ${problem}`));
    });
    return false;
  }
}

validateManagerPattern();
