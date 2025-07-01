// scripts/findLegacyReferences.js

const fs = require("fs");
const path = require("path");

/**
 * 🔍 BUSCADOR COMPLETO DE REFERENCIAS LEGACY
 *
 * Este script encuentra TODAS las referencias al sistema original
 * de bonificaciones en tu código base
 */

class LegacyFinder {
  constructor() {
    this.results = [];
    this.legacyPatterns = [
      // Campo principal legacy
      "hasBonificationProcessing",
      "bonificationConfig",

      // Métodos legacy específicos
      "processBonifications(",
      "getSourceDataWithBonifications",
      "processOrdersBonifications",
      "validateBonificationConfig",

      // Acceso a campos legacy
      "mapping.bonificationConfig",
      "bonifConfig.sourceTable",
      "config.sourceTable",
      "config.orderField",
      "config.bonificationIndicatorField",

      // Validaciones legacy
      "handleBonificationToggle",
      "handleBonificationConfigChange",

      // Campos calculados legacy
      "CALCULATED_PEDIDO_LINEA",
      "CALCULATED_PEDIDO_LINEA_BONIF",
      "CALCULATED_",

      // Referencias en UI
      "Sistema original",
      "bonificaciones originales",
      "método original",

      // Validaciones específicas
      "bonifConfig.sourceTable",
      "bonifConfig.bonificationIndicatorField",
      "bonifConfig.orderField",
    ];

    this.fileExtensions = [".js", ".jsx", ".ts", ".tsx"];
    this.excludeDirs = ["node_modules", ".git", "dist", "build"];
  }

  /**
   * 🎯 EJECUTAR BÚSQUEDA COMPLETA
   */
  async findAllLegacyReferences(rootDir = "./") {
    console.log("🔍 BUSCANDO REFERENCIAS AL SISTEMA LEGACY");
    console.log("=".repeat(60));

    await this.scanDirectory(rootDir);
    this.generateReport();

    return this.results;
  }

  /**
   * 📁 ESCANEAR DIRECTORIO RECURSIVAMENTE
   */
  async scanDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !this.excludeDirs.includes(item)) {
          await this.scanDirectory(fullPath);
        } else if (stat.isFile() && this.shouldScanFile(item)) {
          await this.scanFile(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error escaneando ${dirPath}: ${error.message}`);
    }
  }

  /**
   * 📄 ESCANEAR ARCHIVO INDIVIDUAL
   */
  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, lineNumber) => {
        this.legacyPatterns.forEach((pattern) => {
          if (line.includes(pattern)) {
            this.results.push({
              file: filePath,
              line: lineNumber + 1,
              pattern: pattern,
              code: line.trim(),
              type: this.categorizePattern(pattern),
            });
          }
        });
      });
    } catch (error) {
      console.warn(`⚠️ Error leyendo ${filePath}: ${error.message}`);
    }
  }

  /**
   * 🏷️ CATEGORIZAR TIPO DE PATRÓN
   */
  categorizePattern(pattern) {
    if (
      pattern.includes("hasBonification") ||
      pattern.includes("bonificationConfig")
    ) {
      return "CAMPO_LEGACY";
    }
    if (pattern.includes("process") || pattern.includes("validate")) {
      return "MÉTODO_LEGACY";
    }
    if (pattern.includes("handle") || pattern.includes("Toggle")) {
      return "UI_LEGACY";
    }
    if (pattern.includes("CALCULATED_")) {
      return "CAMPO_CALCULADO";
    }
    return "REFERENCIA_GENERAL";
  }

  /**
   * ✅ VERIFICAR SI DEBE ESCANEAR ARCHIVO
   */
  shouldScanFile(filename) {
    return this.fileExtensions.some((ext) => filename.endsWith(ext));
  }

  /**
   * 📊 GENERAR REPORTE COMPLETO
   */
  generateReport() {
    console.log(`📊 REPORTE DE REFERENCIAS LEGACY`);
    console.log("=".repeat(60));
    console.log(`Total de referencias encontradas: ${this.results.length}`);

    // Agrupar por archivo
    const byFile = {};
    this.results.forEach((result) => {
      if (!byFile[result.file]) byFile[result.file] = [];
      byFile[result.file].push(result);
    });

    // Agrupar por tipo
    const byType = {};
    this.results.forEach((result) => {
      if (!byType[result.type]) byType[result.type] = [];
      byType[result.type].push(result);
    });

    console.log("\n📁 ARCHIVOS CON REFERENCIAS LEGACY:");
    console.log("-".repeat(40));
    Object.entries(byFile).forEach(([file, refs]) => {
      console.log(`${file}: ${refs.length} referencias`);
    });

    console.log("\n🏷️ TIPOS DE REFERENCIAS:");
    console.log("-".repeat(40));
    Object.entries(byType).forEach(([type, refs]) => {
      console.log(`${type}: ${refs.length} referencias`);
    });

    console.log("\n🔍 DETALLES POR ARCHIVO:");
    console.log("=".repeat(60));

    Object.entries(byFile).forEach(([file, refs]) => {
      console.log(`\n📄 ${file}`);
      console.log("-".repeat(file.length + 4));

      refs.forEach((ref) => {
        console.log(`  ⚠️ Línea ${ref.line}: ${ref.pattern}`);
        console.log(`     ${ref.code}`);
      });
    });

    // Archivos más problemáticos
    console.log("\n🚨 ARCHIVOS QUE REQUIEREN MÁS ATENCIÓN:");
    console.log("-".repeat(40));

    const sortedFiles = Object.entries(byFile)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 5);

    sortedFiles.forEach(([file, refs], index) => {
      console.log(`${index + 1}. ${file}: ${refs.length} referencias`);
    });

    console.log("\n💡 RECOMENDACIONES:");
    console.log("-".repeat(20));
    console.log("1. Comenzar por los archivos con más referencias");
    console.log("2. Eliminar primero campos CAMPO_LEGACY");
    console.log("3. Luego quitar métodos MÉTODO_LEGACY");
    console.log("4. Actualizar UI_LEGACY al final");
    console.log("5. Verificar que CAMPO_CALCULADO no rompa nada");
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  const finder = new LegacyFinder();
  finder.findAllLegacyReferences().then(() => {
    console.log("\n✅ Búsqueda completada!");
  });
}

module.exports = LegacyFinder;
