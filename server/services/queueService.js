const Queue = require("bull");
const logger = require("./logger");

const transferQueue = new Queue("transferQueue", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
  },
});

transferQueue.process(5, async (job) => {
  logger.info(`Iniciando tarea: ${job.data.taskName}`);
  const { executeTask } = job.data;

  try {
    const result = await executeTask();
    logger.info(`Tarea completada: ${job.data.taskName}`);
    return result;
  } catch (error) {
    logger.error(`Error en la tarea ${job.data.taskName}:`, error);
    throw error;
  }
});

const addTransferTask = async (taskName, executeTask) => {
  await transferQueue.add({ taskName, executeTask });
};

module.exports = { addTransferTask };
