const fs = require('fs');
const path = require('path');

// Carpetas a excluir
const EXCLUDE_DIRS = ['test', 'node_modules', 'services_backup', 'logs', 'uploads', 'scripts', '.git'];

// Obtener todos los archivos .js y .ts
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Verificar si es carpeta a excluir
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Obtener todos los requires en todos los archivos
function getAllImports(dir) {
  const allFiles = getAllFiles(dir);
  const importedFiles = new Set();
  
  allFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Buscar requires
      const requireRegex = /require\s*\(\s*['"`](.*?)['"`]\s*\)/g;
      let match;
      
      while ((match = requireRegex.exec(content)) !== null) {
        let imported = match[1];
        
        // Ignorar módulos de node_modules
        if (!imported.startsWith('.') && !imported.includes('/')) {
          continue;
        }
        
        // Normalizar rutas
        if (imported.startsWith('.')) {
          // Resolver ruta relativa
          const resolvedPath = path.resolve(path.dirname(file), imported);
          
          // Intentar encontrar el archivo (puede no tener extensión)
          if (fs.existsSync(resolvedPath + '.js')) {
            importedFiles.add(resolvedPath + '.js');
          } else if (fs.existsSync(resolvedPath + '.ts')) {
            importedFiles.add(resolvedPath + '.ts');
          } else if (fs.existsSync(resolvedPath)) {
            importedFiles.add(resolvedPath);
          } else if (fs.existsSync(resolvedPath + '/index.js')) {
            importedFiles.add(resolvedPath + '/index.js');
          }
        }
      }
      
      // Buscar imports ES6
      const importRegex = /import\s+(?:.*\s+)?from\s+['"`](.*?)['"`]/g;
      
      while ((match = importRegex.exec(content)) !== null) {
        let imported = match[1];
        
        if (!imported.startsWith('.') || imported.includes('/')) {
          continue;
        }
        
        const resolvedPath = path.resolve(path.dirname(file), imported);
        
        if (fs.existsSync(resolvedPath + '.js')) {
          importedFiles.add(resolvedPath + '.js');
        } else if (fs.existsSync(resolvedPath + '.ts')) {
          importedFiles.add(resolvedPath + '.ts');
        } else if (fs.existsSync(resolvedPath)) {
          importedFiles.add(resolvedPath);
        } else if (fs.existsSync(resolvedPath + '/index.js')) {
          importedFiles.add(resolvedPath + '/index.js');
        }
      }
    } catch (err) {
      console.error(`Error leyendo ${file}:`, err.message);
    }
  });
  
  return importedFiles;
}

// Principal
const serverDir = 'D:\\proyectos\\app\\core_app\\server';
const allFiles = getAllFiles(serverDir);
const importedFiles = getAllImports(serverDir);

console.log('\n==== ARCHIVOS NO IMPORTADOS ====\n');

const unusedFiles = allFiles.filter(file => !importedFiles.has(file));

if (unusedFiles.length === 0) {
  console.log('✅ Todos los archivos tienen imports');
} else {
  console.log(`❌ ${unusedFiles.length} archivos sin imports:\n`);
  unusedFiles.forEach(file => {
    const relative = path.relative(serverDir, file);
    console.log(`  - ${relative}`);
  });
}

console.log('\n==== ESTADÍSTICAS ====\n');
console.log(`Total archivos analizados: ${allFiles.length}`);
console.log(`Archivos importados: ${importedFiles.size}`);
console.log(`Archivos NO importados: ${unusedFiles.length}`);
