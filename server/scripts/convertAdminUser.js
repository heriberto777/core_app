// scripts/convertAdminUser.js
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const Role = require("../models/roleModel");

// ⭐ IMPORTAR CONFIGURACIÓN DE BD ⭐
const { connectToDatabase } = require("../utils/database");

const convertExistingAdminUser = async (targetEmail = null) => {
  try {
    console.log("👤 Convirtiendo usuario existente a administrador...");

    // ⭐ CONFIGURAR EMAIL OBJETIVO ⭐
    const emailToConvert =
      targetEmail || process.env.ADMIN_EMAIL || "admin@sistema.com";
    console.log(`🎯 Buscando usuario: ${emailToConvert}`);

    let adminUser = await User.findOne({ email: emailToConvert });

    if (!adminUser) {
      console.log("⚠️ Usuario no encontrado. Usuarios disponibles:");

      const existingUsers = await User.find({})
        .select("email name lastname role isAdmin")
        .limit(10);

      if (existingUsers.length === 0) {
        console.log("❌ No hay usuarios en el sistema");
        return await createNewAdminUser();
      }

      existingUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. 📧 ${user.email}`);
        console.log(`      👤 ${user.name} ${user.lastname}`);
        console.log(
          `      🎭 Roles legacy: ${user.role?.join(", ") || "sin roles"}`
        );
        console.log(`      👑 Admin: ${user.isAdmin ? "Sí" : "No"}`);
        console.log("      ────────────────────");
      });

      // Intentar crear usuario admin por defecto
      return await createNewAdminUser();
    }

    console.log(
      `👤 Usuario encontrado: ${adminUser.name} ${adminUser.lastname} (${adminUser.email})`
    );

    // ⭐ ACTUALIZAR CAMPOS DEL NUEVO SISTEMA ⭐
    let updated = false;

    // 1. Marcar como administrador
    if (!adminUser.isAdmin) {
      adminUser.isAdmin = true;
      updated = true;
      console.log("✅ Marcado como administrador del sistema");
    }

    // 2. Asegurar que tenga roles legacy
    if (!adminUser.role || !adminUser.role.includes("admin")) {
      adminUser.role = adminUser.role || [];
      if (!adminUser.role.includes("admin")) {
        adminUser.role.push("admin");
        updated = true;
        console.log("✅ Agregado rol legacy 'admin'");
      }
    }

    if (!adminUser.role.includes("superadmin")) {
      adminUser.role.push("superadmin");
      updated = true;
      console.log("✅ Agregado rol legacy 'superadmin'");
    }

    // 3. Buscar roles del nuevo sistema y asignarlos
    const superAdminRole = await Role.findOne({ name: "superadmin" });
    const adminRole = await Role.findOne({ name: "admin" });

    // Inicializar array de roles si no existe
    if (!adminUser.roles) {
      adminUser.roles = [];
      updated = true;
    }

    // Asignar rol superadmin
    if (superAdminRole) {
      if (!adminUser.roles.includes(superAdminRole._id)) {
        adminUser.roles.push(superAdminRole._id);
        updated = true;
        console.log("✅ Agregado rol 'superadmin' del nuevo sistema");
      }
    } else {
      console.log("⚠️ Rol 'superadmin' del nuevo sistema no encontrado");
    }

    // Asignar rol admin
    if (adminRole) {
      if (!adminUser.roles.includes(adminRole._id)) {
        adminUser.roles.push(adminRole._id);
        updated = true;
        console.log("✅ Agregado rol 'admin' del nuevo sistema");
      }
    } else {
      console.log("⚠️ Rol 'admin' del nuevo sistema no encontrado");
    }

    // 4. Guardar cambios si hubo actualizaciones
    if (updated) {
      await adminUser.save();
      console.log("💾 Cambios guardados exitosamente");
    } else {
      console.log("ℹ️ Usuario ya está configurado correctamente");
    }

    // 5. Verificar configuración final
    const finalUser = await User.findById(adminUser._id).populate("roles");
    console.log("\n🔍 Configuración final del usuario:");
    console.log(`   📧 Email: ${finalUser.email}`);
    console.log(`   👤 Nombre: ${finalUser.name} ${finalUser.lastname}`);
    console.log(`   👑 Es Admin: ${finalUser.isAdmin ? "Sí" : "No"}`);
    console.log(
      `   🎭 Roles Legacy: ${finalUser.role?.join(", ") || "ninguno"}`
    );
    console.log(
      `   🆕 Roles Nuevos: ${
        finalUser.roles?.map((r) => r.displayName || r.name).join(", ") ||
        "ninguno"
      }`
    );

    return {
      success: true,
      user: finalUser,
      wasUpdated: updated,
      message: updated
        ? "Usuario convertido exitosamente"
        : "Usuario ya estaba configurado",
    };
  } catch (error) {
    console.error("❌ Error convirtiendo usuario administrador:", error);
    throw error;
  }
};

// ⭐ FUNCIÓN PARA CREAR NUEVO USUARIO ADMIN ⭐
const createNewAdminUser = async () => {
  try {
    console.log("\n🆕 Creando nuevo usuario administrador...");

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync("admin123", salt);

    // Buscar roles del sistema
    const superAdminRole = await Role.findOne({ name: "superadmin" });
    const adminRole = await Role.findOne({ name: "admin" });

    const adminUserData = {
      name: "Administrador",
      lastname: "Sistema",
      email: "admin@sistema.com",
      password: hashedPassword,
      telefono: "",
      activo: true,
      role: ["admin", "superadmin"], // Legacy roles
      roles: [], // Se llenará después
      permissions: [],
      isAdmin: true,
    };

    // Asignar roles del nuevo sistema
    if (superAdminRole) {
      adminUserData.roles.push(superAdminRole._id);
    }
    if (adminRole && !adminUserData.roles.includes(adminRole._id)) {
      adminUserData.roles.push(adminRole._id);
    }

    const adminUser = new User(adminUserData);
    await adminUser.save();

    console.log("✅ Usuario administrador creado exitosamente");
    console.log("📧 Email: admin@sistema.com");
    console.log("🔑 Password: admin123");
    console.log("⚠️ IMPORTANTE: Cambia la contraseña después del primer login");

    return {
      success: true,
      user: adminUser,
      wasCreated: true,
      message: "Usuario administrador creado exitosamente",
    };
  } catch (error) {
    console.error("❌ Error creando usuario administrador:", error);
    throw error;
  }
};

// ⭐ FUNCIÓN PARA LISTAR USUARIOS EXISTENTES ⭐
const listExistingUsers = async () => {
  try {
    const users = await User.find({})
      .select("email name lastname role isAdmin activo")
      .sort({ createdAt: -1 })
      .limit(20);

    console.log("\n👥 Usuarios existentes en el sistema:");
    if (users.length === 0) {
      console.log("   ❌ No hay usuarios registrados");
      return [];
    }

    users.forEach((user, index) => {
      console.log(`\n   ${index + 1}. 📧 ${user.email}`);
      console.log(`      👤 ${user.name} ${user.lastname}`);
      console.log(`      🎭 Roles: ${user.role?.join(", ") || "sin roles"}`);
      console.log(`      👑 Admin: ${user.isAdmin ? "Sí" : "No"}`);
      console.log(`      🟢 Activo: ${user.activo ? "Sí" : "No"}`);
    });

    return users;
  } catch (error) {
    console.error("❌ Error listando usuarios:", error);
    return [];
  }
};

module.exports = {
  convertExistingAdminUser,
  createNewAdminUser,
  listExistingUsers,
};
