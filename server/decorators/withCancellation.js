const UnifiedCancellationService = require("../services/UnifiedCancellationService");
const logger = require("../services/logger");

/**
 * Decorador para manejar cancelación automáticamente (versión compatible)
 */
function withCancellation(options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      // Buscar el taskId en los argumentos
      const taskId =
        args.find(
          (arg) => typeof arg === "string" && arg.match(/^[0-9a-fA-F]{24}$/)
        ) ||
        options.taskIdExtractor?.(args) ||
        Date.now().toString();

      // Crear controlador de cancelación
      const controller = new AbortController();

      // Registrar la tarea
      UnifiedCancellationService.registerTask(taskId, controller, {
        type: options.type || "transfer",
        component: target.constructor ? target.constructor.name : "Unknown",
        method: propertyKey,
        metadata: options.metadata ? options.metadata(args) : {},
      });

      try {
        // Insertar la señal de cancelación
        const signalIndex = args.findIndex((arg) => !arg);
        if (signalIndex === -1) {
          args.push(controller.signal);
        } else {
          args[signalIndex] = controller.signal;
        }

        // Ejecutar el método original
        const result = await originalMethod.apply(this, args);

        // Confirmar completado
        UnifiedCancellationService.confirmCancellation(taskId, {
          success: true,
          result,
        });

        return result;
      } catch (error) {
        // Manejar cancelación
        if (controller.signal.aborted || error.message?.includes("cancel")) {
          UnifiedCancellationService.confirmCancellation(taskId, {
            success: false,
            cancelled: true,
            error: error.message,
          });

          throw new Error("Operation cancelled by user");
        }

        // Confirmar fallido
        UnifiedCancellationService.confirmCancellation(taskId, {
          success: false,
          error: error.message,
        });

        throw error;
      }
    };

    return descriptor;
  };
}

module.exports = withCancellation;
