// fix-missing-dot-slash.js
const fs = require("fs");
const path = require("path");

class DotSlashFixer {
  constructor() {
    this.serverDir = path.join(process.cwd(), "server");
    this.fixedFiles = [];
  }

  analyzeAndFix() {
    console.log("🔧 Agregando ./ faltante en imports...\n");

    const allFiles = this.getAllJSFiles(this.serverDir);

    allFiles.forEach((filePath) => {
      const fileName = path.basename(filePath);

      // Saltar DatabaseServiceAdapter
      if (fileName === "DatabaseServiceAdapter.js") {
        return;
      }

      const content = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(this.serverDir, filePath);
      const fileDir = path.dirname(relativePath);

      let needsFix = false;
      let newContent = content;

      // Para archivos en /services/ - deben usar ./DatabaseServiceAdapter
      if (fileDir === "services") {
        // Buscar require("DatabaseServiceAdapter") sin ./
        const wrongPattern = /require\(["']DatabaseServiceAdapter["']\)/g;
        if (content.match(wrongPattern)) {
          newContent = content.replace(
            wrongPattern,
            'require("./DatabaseServiceAdapter")'
          );
          needsFix = true;
          console.log(
            `${fileName} (en /services/): DatabaseServiceAdapter → ./DatabaseServiceAdapter`
          );
        }
      }

      // Para archivos en raíz - deben usar ./services/DatabaseServiceAdapter
      else if (fileDir === "." || fileDir === "") {
        // Buscar require("services/DatabaseServiceAdapter") sin ./
        const wrongPattern =
          /require\(["']services\/DatabaseServiceAdapter["']\)/g;
        if (content.match(wrongPattern)) {
          newContent = content.replace(
            wrongPattern,
            'require("./services/DatabaseServiceAdapter")'
          );
          needsFix = true;
          console.log(
            `${fileName} (en raíz): services/DatabaseServiceAdapter → ./services/DatabaseServiceAdapter`
          );
        }
      }

      // Para otros directorios - deben usar ../services/DatabaseServiceAdapter (estos ya deberían estar bien)

      if (needsFix) {
        // Backup
        const backupPath = filePath + ".dotslash-backup";
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(filePath, backupPath);
        }

        fs.writeFileSync(filePath, newContent);
        this.fixedFiles.push(fileName);
        console.log(`  ✅ ${fileName} corregido`);
      }
    });

    if (this.fixedFiles.length === 0) {
      console.log("✅ Todos los imports ya tienen ./ correctamente");
    } else {
      console.log(`\n🎉 Archivos corregidos: ${this.fixedFiles.length}`);
      this.fixedFiles.forEach((file) => console.log(`  - ${file}`));
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

          if (stats.isDirectory() && item !== "node_modules") {
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

const fixer = new DotSlashFixer();
fixer.analyzeAndFix();
