// validate-import-paths.js
const fs = require("fs");
const path = require("path");

function validateImportPaths() {
  console.log("🔍 Validando rutas de import...\n");

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

        // Buscar imports problemáticos
        const problematicPatterns = [
          {
            pattern: /require\(["']\.\/DatabaseServiceAdapter["']\)/,
            issue: "Usa ./DatabaseServiceAdapter",
          },
          {
            pattern: /require\(["']\.\.\/DatabaseServiceAdapter["']\)/,
            issue: "Usa ../DatabaseServiceAdapter",
          },
          {
            pattern: /require\(["']\.\/services\/DatabaseServiceAdapter["']\)/,
            issue: "Usa ./services/DatabaseServiceAdapter",
          },
        ];

        const problems = [];
        problematicPatterns.forEach(({ pattern, issue }) => {
          if (content.match(pattern)) {
            problems.push(issue);
          }
        });

        if (problems.length > 0) {
          issues.push({ file: fileName, problems });
        }
      }
    });
  }

  checkFiles(serverDir);

  if (issues.length === 0) {
    console.log("✅ TODAS LAS RUTAS DE IMPORT CORREGIDAS");
    console.log("✅ Sistema listo para funcionamiento");
    return true;
  } else {
    console.log("⚠️ RUTAS DE IMPORT PROBLEMÁTICAS:\n");
    issues.forEach((issue) => {
      console.log(`${issue.file}:`);
      issue.problems.forEach((problem) => console.log(`  - ${problem}`));
    });
    return false;
  }
}

validateImportPaths();
