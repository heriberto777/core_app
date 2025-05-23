// services/LinkedTasksService.js
const TransferTask = require("../models/transferTaks");
const logger = require("./logger");
const { SqlService } = require("./SqlService");
const ConnectionService = require("./ConnectionCentralService");
const { sendProgress } = require("./progressSse");
const TaskTracker = require("./TaskTracker");
const { Request } = require("tedious");

class LinkedTasksService {
  constructor() {
    this.executionCoordinator = new Map(); // Para coordinar ejecuciones de grupos
    this.groupExecutions = new Map(); // Para trackear ejecuciones activas de grupos
  }

  /**
   * Verifica si una tarea tiene tareas vinculadas
   * @param {string} taskId - ID de la tarea
   * @returns {Promise<Object>} - Información de vinculación
   */
  async getTaskLinkingInfo(taskId) {
    try {
      const task = await TransferTask.findById(taskId).populate("linkedTasks");

      if (!task) {
        return null;
      }

      let linkedTasks = [];
      let hasLinkedTasks = false;
      let linkedTasksCount = 0;

      // Si tiene grupo vinculado, buscar todas las tareas del grupo
      if (task.linkedGroup && task.linkedGroup.trim() !== "") {
        const groupTasks = await TransferTask.find({
          linkedGroup: task.linkedGroup,
          active: true,
        }).sort({ linkedExecutionOrder: 1 });

        linkedTasks = groupTasks.map((t) => ({
          _id: t._id,
          name: t.name,
          order: t.linkedExecutionOrder || 0,
          isCoordinator: !!t.postUpdateQuery,
          hasPostUpdate: !!t.postUpdateQuery,
        }));

        hasLinkedTasks = groupTasks.length > 1;
        linkedTasksCount = groupTasks.length;
      }
      // Si tiene tareas vinculadas directamente
      else if (task.linkedTasks && task.linkedTasks.length > 0) {
        linkedTasks = task.linkedTasks.map((t) => ({
          _id: t._id,
          name: t.name,
          order: 0,
          isCoordinator: false,
          hasPostUpdate: !!t.postUpdateQuery,
        }));

        hasLinkedTasks = true;
        linkedTasksCount = task.linkedTasks.length + 1; // +1 por la tarea actual
      }

      return {
        taskId: task._id,
        taskName: task.name,
        hasLinkedTasks,
        linkedGroup: task.linkedGroup,
        linkedTasks,
        linkedTasksCount,
        isCoordinator: !!task.postUpdateQuery,
        executionOrder: task.linkedExecutionOrder || 0,
        coordinationConfig: task.coordinationConfig || {},
      };
    } catch (error) {
      logger.error(
        `Error al obtener información de vinculación: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Ejecuta un grupo de tareas vinculadas
   * @param {string} triggeredTaskId - ID de la tarea que disparó la ejecución
   * @param {string} executionType - 'manual' | 'auto'
   * @returns {Promise<Object>} - Resultado de la ejecución
   */
  async executeLinkedGroup(triggeredTaskId, executionType = "manual") {
    const groupExecutionId = `group_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logger.info(
        `🔗 Iniciando ejecución de grupo vinculado desde tarea ${triggeredTaskId} (${executionType})`
      );

      // Obtener información de vinculación
      const linkingInfo = await this.getTaskLinkingInfo(triggeredTaskId);

      if (!linkingInfo || !linkingInfo.hasLinkedTasks) {
        logger.info(
          `Tarea ${triggeredTaskId} no tiene vinculaciones, ejecutando individualmente`
        );

        // Ejecutar solo esta tarea usando transferService
        const transferService = require("./transferService");
        const result = await transferService.executeTransferWithRetry(
          triggeredTaskId
        );

        return {
          success: result.success,
          message: result.message,
          isLinkedGroup: false,
          triggeredBy: linkingInfo?.taskName || "desconocida",
          totalTasks: 1,
          successfulTasks: result.success ? 1 : 0,
          mainTask: linkingInfo?.taskName || "desconocida",
          result,
        };
      }

      // Registrar ejecución de grupo
      this.groupExecutions.set(groupExecutionId, {
        triggeredTaskId,
        executionType,
        startTime: Date.now(),
        status: "running",
      });

      // Obtener todas las tareas del grupo
      let tasksToExecute = [];

      if (linkingInfo.linkedGroup) {
        // Buscar por grupo
        tasksToExecute = await TransferTask.find({
          linkedGroup: linkingInfo.linkedGroup,
          active: true,
        }).sort({ linkedExecutionOrder: 1 });
      } else {
        // Buscar tareas vinculadas directamente
        const triggeredTask = await TransferTask.findById(triggeredTaskId);
        const linkedTaskIds = triggeredTask.linkedTasks || [];

        tasksToExecute = await TransferTask.find({
          _id: { $in: [triggeredTaskId, ...linkedTaskIds] },
          active: true,
        });
      }

      if (tasksToExecute.length === 0) {
        throw new Error("No se encontraron tareas activas para ejecutar");
      }

      logger.info(
        `🔗 Ejecutando ${
          tasksToExecute.length
        } tareas vinculadas en grupo: ${tasksToExecute
          .map((t) => t.name)
          .join(", ")}`
      );

      // Identificar tarea coordinadora (la que tiene postUpdateQuery)
      const coordinatorTask = tasksToExecute.find(
        (task) => task.postUpdateQuery && task.postUpdateQuery.trim() !== ""
      );

      if (!coordinatorTask) {
        logger.warn(
          "⚠️ No se encontró tarea coordinadora con postUpdateQuery en el grupo"
        );
      } else {
        logger.info(
          `📌 Tarea coordinadora identificada: ${coordinatorTask.name}`
        );
      }

      // Ejecutar todas las tareas del grupo (excepto post-updates)
      const results = [];
      const transferService = require("./transferService");
      let allAffectedRecords = [];

      for (const task of tasksToExecute) {
        try {
          logger.info(`🔄 Ejecutando tarea del grupo: ${task.name}`);

          // Temporal: deshabilitar post-update para todas las tareas durante la ejecución del grupo
          const originalPostUpdateQuery = task.postUpdateQuery;
          task.postUpdateQuery = null;

          const result = await transferService.executeTransferWithRetry(
            task._id.toString()
          );

          // Restaurar post-update query
          task.postUpdateQuery = originalPostUpdateQuery;

          results.push({
            taskId: task._id.toString(),
            taskName: task.name,
            success: result.success,
            message: result.message,
            inserted: result.inserted || 0,
            updated: result.updated || 0,
            duplicates: result.duplicates || 0,
            rows: result.rows || 0,
            affectedRecords: result.affectedRecords || [],
            error: result.success ? null : result.errorDetail,
          });

          // Recopilar registros afectados para post-update coordinado
          if (result.affectedRecords && result.affectedRecords.length > 0) {
            allAffectedRecords = allAffectedRecords.concat(
              result.affectedRecords
            );
          }

          logger.info(
            `✅ Tarea ${task.name} completada: ${
              result.success ? "Éxito" : "Error"
            }`
          );
        } catch (taskError) {
          logger.error(
            `❌ Error ejecutando tarea ${task.name}: ${taskError.message}`
          );

          results.push({
            taskId: task._id.toString(),
            taskName: task.name,
            success: false,
            message: "Error en la ejecución",
            error: taskError.message,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            rows: 0,
            affectedRecords: [],
          });
        }
      }

      // Ejecutar post-update coordinado si hay tarea coordinadora y registros afectados
      let postUpdateResult = null;
      if (coordinatorTask && allAffectedRecords.length > 0) {
        try {
          logger.info(
            `🔄 Ejecutando post-update coordinado con ${allAffectedRecords.length} registros afectados`
          );

          postUpdateResult = await this.executeCoordinatedPostUpdate(
            coordinatorTask,
            allAffectedRecords
          );

          logger.info(
            `✅ Post-update coordinado completado: ${
              postUpdateResult.success ? "Éxito" : "Error"
            }`
          );
        } catch (postError) {
          logger.error(
            `❌ Error en post-update coordinado: ${postError.message}`
          );
          postUpdateResult = {
            success: false,
            message: postError.message,
            updated: 0,
          };
        }
      }

      // Calcular resultados finales
      const successfulTasks = results.filter((r) => r.success).length;
      const totalTasks = results.length;
      const overallSuccess = successfulTasks === totalTasks;

      // Actualizar metadatos de vinculación para todas las tareas del grupo
      const now = new Date();
      await TransferTask.updateMany(
        { _id: { $in: tasksToExecute.map((t) => t._id) } },
        {
          $set: {
            "linkingMetadata.lastGroupExecution": now,
            "linkingMetadata.lastGroupExecutionId": groupExecutionId,
          },
        }
      );

      // Limpiar registro de ejecución
      this.groupExecutions.delete(groupExecutionId);

      const finalResult = {
        success: overallSuccess,
        message: `Grupo ejecutado: ${successfulTasks}/${totalTasks} tareas exitosas`,
        isLinkedGroup: true,
        triggeredBy: linkingInfo.taskName,
        groupExecutionId,
        totalTasks,
        successfulTasks,
        mainTask: linkingInfo.taskName,
        linkedTasksResults: results,
        postUpdateResult,
        allAffectedRecords: allAffectedRecords.length,
        executionType,
      };

      logger.info(
        `🔗 Ejecución de grupo completada: ${JSON.stringify({
          success: overallSuccess,
          totalTasks,
          successfulTasks,
          postUpdateExecuted: !!postUpdateResult,
          affectedRecords: allAffectedRecords.length,
        })}`
      );

      return finalResult;
    } catch (error) {
      logger.error(`❌ Error crítico en ejecución de grupo: ${error.message}`);

      // Limpiar registro de ejecución
      this.groupExecutions.delete(groupExecutionId);

      return {
        success: false,
        message: `Error crítico en ejecución de grupo: ${error.message}`,
        isLinkedGroup: true,
        triggeredBy: "desconocida",
        totalTasks: 0,
        successfulTasks: 0,
        error: error.message,
      };
    }
  }

  /**
   * Ejecuta el post-update coordinado con todos los registros afectados
   * @param {Object} coordinatorTask - Tarea coordinadora
   * @param {Array} allAffectedRecords - Todos los registros afectados
   * @returns {Promise<Object>} - Resultado del post-update
   */
  async executeCoordinatedPostUpdate(coordinatorTask, allAffectedRecords) {
    let connection = null;

    try {
      if (!coordinatorTask.postUpdateQuery || allAffectedRecords.length === 0) {
        return {
          success: true,
          message: "No hay post-update o registros para procesar",
          updated: 0,
        };
      }

      logger.info(
        `🔄 Iniciando post-update coordinado para ${allAffectedRecords.length} registros`
      );

      // Obtener conexión (siempre a server1 para post-updates)
      const connectionResult = await ConnectionService.enhancedRobustConnect(
        "server1"
      );
      if (!connectionResult.success) {
        throw new Error(
          `No se pudo establecer conexión: ${
            connectionResult.error?.message || "Error de conexión"
          }`
        );
      }
      connection = connectionResult.connection;

      // Procesar registros en lotes para evitar consultas muy grandes
      const batchSize = 500;
      let totalUpdated = 0;

      for (let i = 0; i < allAffectedRecords.length; i += batchSize) {
        const batch = allAffectedRecords.slice(i, i + batchSize);

        // Procesar claves - quitar prefijo CN si es necesario
        const processedKeys = batch.map((key) =>
          typeof key === "string" && key.startsWith("CN")
            ? key.replace(/^CN/, "")
            : key
        );

        // Construir parámetros para la consulta
        const params = {};
        processedKeys.forEach((key, index) => {
          params[`key${index}`] = key;
        });

        // Determinar clave primaria para consulta WHERE
        const primaryKeyField =
          coordinatorTask.postUpdateMapping?.tableKey ||
          coordinatorTask.validationRules?.existenceCheck?.key ||
          "ID";

        // Crear lista de parámetros
        const keyParams = processedKeys
          .map((_, index) => `@key${index}`)
          .join(", ");

        // Construir consulta dinámica
        const dynamicUpdateQuery = `${coordinatorTask.postUpdateQuery} WHERE ${primaryKeyField} IN (${keyParams})`;

        try {
          // Ejecutar la actualización
          const sanitizedParams = SqlService.sanitizeParams(params);
          const updateResult = await SqlService.query(
            connection,
            dynamicUpdateQuery,
            sanitizedParams
          );

          const batchUpdated = updateResult.rowsAffected || 0;
          totalUpdated += batchUpdated;

          logger.info(
            `Post-update lote ${
              Math.floor(i / batchSize) + 1
            }: ${batchUpdated} registros actualizados`
          );
        } catch (queryError) {
          logger.error(`Error en lote de post-update: ${queryError.message}`);
          // Continuar con el siguiente lote en lugar de fallar todo
          continue;
        }
      }

      logger.info(
        `✅ Post-update coordinado completado: ${totalUpdated} registros actualizados en total`
      );

      return {
        success: true,
        message: `Post-update coordinado completado: ${totalUpdated} registros actualizados`,
        updated: totalUpdated,
      };
    } catch (error) {
      logger.error(`❌ Error en post-update coordinado: ${error.message}`);
      return {
        success: false,
        message: `Error en post-update coordinado: ${error.message}`,
        updated: 0,
      };
    } finally {
      if (connection) {
        try {
          await ConnectionService.releaseConnection(connection);
        } catch (e) {
          logger.warn(`Error al liberar conexión: ${e.message}`);
        }
      }
    }
  }

  /**
   * Verifica si una tarea está siendo ejecutada como parte de un grupo
   * @param {string} taskId - ID de la tarea
   * @returns {boolean} - true si está siendo ejecutada en grupo
   */
  isTaskInGroupExecution(taskId) {
    for (const [groupId, execution] of this.groupExecutions.entries()) {
      if (
        execution.triggeredTaskId === taskId ||
        execution.status === "running"
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Verifica si una tarea debe ejecutarse individualmente o como parte de un grupo
   * @param {string} taskId - ID de la tarea
   * @returns {Promise<Object>} - Información sobre cómo debe ejecutarse
   */
  async shouldExecuteAsGroup(taskId) {
    try {
      const linkingInfo = await this.getTaskLinkingInfo(taskId);

      if (!linkingInfo || !linkingInfo.hasLinkedTasks) {
        return {
          executeAsGroup: false,
          executeIndividually: true,
          reason: "No tiene tareas vinculadas",
        };
      }

      return {
        executeAsGroup: true,
        executeIndividually: false,
        reason: linkingInfo.linkedGroup
          ? `Parte del grupo: ${linkingInfo.linkedGroup}`
          : "Tiene tareas vinculadas directamente",
        linkingInfo,
      };
    } catch (error) {
      logger.error(`Error verificando ejecución de grupo: ${error.message}`);
      return {
        executeAsGroup: false,
        executeIndividually: true,
        reason: "Error al verificar vinculaciones",
      };
    }
  }

  /**
   * Limpia ejecuciones de grupo que han quedado colgadas
   */
  cleanupStaleGroupExecutions() {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 horas

    for (const [groupId, execution] of this.groupExecutions.entries()) {
      if (now - execution.startTime > maxAge) {
        logger.warn(`Limpiando ejecución de grupo obsoleta: ${groupId}`);
        this.groupExecutions.delete(groupId);
      }
    }
  }

  /**
   * Obtiene estadísticas de ejecuciones de grupos
   * @returns {Object} - Estadísticas
   */
  getGroupExecutionStats() {
    return {
      activeGroupExecutions: this.groupExecutions.size,
      executionsDetails: Array.from(this.groupExecutions.entries()).map(
        ([id, exec]) => ({
          groupId: id,
          triggeredTaskId: exec.triggeredTaskId,
          executionType: exec.executionType,
          startTime: new Date(exec.startTime).toISOString(),
          status: exec.status,
          duration: Date.now() - exec.startTime,
        })
      ),
    };
  }
}

// Exportar instancia singleton
module.exports = new LinkedTasksService();
