// En utils/taskTracker.js
const activeTasksMap = new Map();

// Registrar una tarea en ejecución
function registerTask(taskId, abortController) {
  activeTasksMap.set(taskId, {
    abortController,
    startTime: new Date(),
    status: "running",
  });
}

// Cancelar una tarea
function cancelTask(taskId) {
  const taskInfo = activeTasksMap.get(taskId);
  if (taskInfo && taskInfo.abortController) {
    taskInfo.abortController.abort();
    taskInfo.status = "cancelled";
    return true;
  }
  return false;
}

// Verificar si una tarea está activa
function isTaskActive(taskId) {
  return (
    activeTasksMap.has(taskId) &&
    activeTasksMap.get(taskId).status === "running"
  );
}

// Finalizar una tarea (eliminarla del mapa)
function completeTask(taskId, status = "completed") {
  const taskInfo = activeTasksMap.get(taskId);
  if (taskInfo) {
    taskInfo.status = status;
    setTimeout(() => {
      activeTasksMap.delete(taskId);
    }, 5000); // Mantenerla brevemente para consultas antes de eliminarla
  }
}

module.exports = {
  registerTask,
  cancelTask,
  isTaskActive,
  completeTask,
};
