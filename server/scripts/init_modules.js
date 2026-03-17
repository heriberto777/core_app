const mongoose = require('mongoose');
require('dotenv').config({path: './.env'}); 
const ModuleConfig = require('./models/moduleConfigModel');

const initialModules = [
  {
    name: "users",
    displayName: "Gestión de Usuarios",
    description: "Administración integral de cuentas de usuario, asignación de roles y estados del sistema.",
    resource: "users",
    actions: [
      { name: "read", displayName: "Ver Usuarios", description: "Ver listado y perfiles", isDefault: true },
      { name: "create", displayName: "Crear Usuario", description: "Registrar nuevos usuarios" },
      { name: "update", displayName: "Editar Usuario", description: "Modificar datos y accesos" },
      { name: "delete", displayName: "Eliminar Usuario", description: "Borrado permanente" }
    ],
    uiConfig: {
      icon: "FaUsers",
      category: "administracion",
      order: 10,
      showInMenu: true,
      showInDashboard: true
    },
    isSystem: true,
    isActive: true
  },
  {
    name: "roles",
    displayName: "Gestión de Roles",
    description: "Configuración de perfiles de seguridad, niveles de acceso y matriz de permisos atómicos.",
    resource: "roles",
    actions: [
      { name: "read", displayName: "Ver Roles", description: "Consultar matriz de permisos", isDefault: true },
      { name: "create", displayName: "Crear Rol", description: "Definir nuevo perfil" },
      { name: "update", displayName: "Editar Rol", description: "Ajustar permisos de un perfil" },
      { name: "delete", displayName: "Eliminar Rol", description: "Borrar perfil de seguridad" }
    ],
    uiConfig: {
      icon: "FaShieldAlt",
      category: "administracion",
      order: 20,
      showInMenu: true,
      showInDashboard: true
    },
    restrictions: { requireAdmin: true },
    isSystem: true,
    isActive: true
  },
  {
    name: "modules",
    displayName: "Gestión de Módulos",
    description: "Arquitectura dinámica del sistema. Control de servicios, vistas y endpoints habilitados.",
    resource: "modules",
    actions: [
      { name: "read", displayName: "Ver Módulos", description: "Inspeccionar arquitectura", isDefault: true },
      { name: "create", displayName: "Registrar Módulo", description: "Añadir nuevo servicio" },
      { name: "update", displayName: "Configurar Módulo", description: "Editar UI, rutas y estado" },
      { name: "delete", displayName: "Extirpar Módulo", description: "Remover servicio permanentemente" },
      { name: "manage", displayName: "Sincronizar", description: "Invalidar caché global" }
    ],
    uiConfig: {
      icon: "FaCubes",
      category: "configuracion",
      order: 10,
      showInMenu: true,
      showInDashboard: false
    },
    restrictions: { requireAdmin: true },
    isSystem: true,
    isActive: true
  }
];

async function seed() {
  try {
    console.log("Conectando a MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado.");

    console.log("Limpiando módulos existentes...");
    await ModuleConfig.deleteMany({});

    console.log("Insertando módulos base...");
    const result = await ModuleConfig.insertMany(initialModules);
    
    console.log(`¡Éxito! Base de datos inicializada con ${result.length} módulos.`);
  } catch (error) {
    console.error("Error inicializando BD:", error);
  } finally {
    mongoose.disconnect();
    console.log("Desconectado.");
  }
}

seed();
