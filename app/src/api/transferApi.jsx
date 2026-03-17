
import { TransferTaskApi } from "./TransferTaskApi";
import { LogisticsApi } from "./LogisticsApi";
import { MappingApi } from "./MappingApi";
import { ConsecutiveApi } from "./ConsecutiveApi";
import { AuditStatsApi } from "./AuditStatsApi";

/**
 * TransferApi - Consolidador de Compatibilidad (Fase 17)
 * 
 * Esta clase actúa como un puente (Bridge) para mantener la compatibilidad 
 * con el código existente mientras se delega la lógica a las nuevas APIs segmentadas.
 */
export class TransferApi {
  constructor() {
    this.tasks = new TransferTaskApi();
    this.logistics = new LogisticsApi();
    this.mapping = new MappingApi();
    this.consecutives = new ConsecutiveApi();
    this.audit = new AuditStatsApi();

    // Alias para baseApi si es necesario en algún hook antiguo
    this.baseApi = this.tasks.baseApi;
  }

  // --- MÉTODOS DE TRANSFER TASK API ---
  getTasks(token) { return this.tasks.getTasks(token); }
  upsertTransferTask(token, d) { return this.tasks.upsertTransferTask(token, d); }
  deleteTask(token, n) { return this.tasks.deleteTask(token, n); }
  executeTask(token, id) { return this.tasks.executeTask(token, id); }
  addTimeTransfer(token, d) { return this.tasks.addTimeTransfer(token, d); }
  getSchuledTime(token) { return this.tasks.getSchuledTime(token); }
  getTaskStatus(token) { return this.tasks.getTaskStatus(token); }
  cancelTask(token, id, o) { return this.tasks.cancelTask(token, id, o); }
  getCancellationStatus(token, id) { return this.tasks.getCancellationStatus(token, id); }
  getActiveCancelableTasks(token) { return this.tasks.getActiveCancelableTasks(token); }
  cancelAllTasks(token, o) { return this.tasks.cancelAllTasks(token, o); }
  getTaskLinkingInfo(token, id) { return this.tasks.getTaskLinkingInfo(token, id); }
  executeLinkedGroup(token, id) { return this.tasks.executeLinkedGroup(token, id); }
  getLinkedGroups(token) { return this.tasks.getLinkedGroups(token); }
  getGroupDetails(token, name) { return this.tasks.getGroupDetails(token, name); }
  deleteLinkedGroup(token, name) { return this.tasks.deleteLinkedGroup(token, name); }
  removeTaskFromGroup(token, id) { return this.tasks.removeTaskFromGroup(token, id); }
  reorderGroupTasks(token, name, ord) { return this.tasks.reorderGroupTasks(token, name, ord); }
  cleanup() { return this.tasks.cleanup(); }

  // --- MÉTODOS DE LOGISTICS API ---
  executeLoadTask(token, f, v, id) { return this.logistics.executeLoadTask(token, f, v, id); }
  executeInsertOrders(token, d) { return this.logistics.executeInsertOrders(token, d); }
  executeInsertLoads(token, r, l, d, b) { return this.logistics.executeInsertLoads(token, r, l, d, b); }
  executeInsertTrapaso(token, r, l, d, b) { return this.logistics.executeInsertTrapaso(token, r, l, d, b); }
  getLoadConsecutivo(token) { return this.logistics.getLoadConsecutivo(token); }
  getVendedores(token) { return this.logistics.getVendedores(token); }
  getOrders(token, f) { return this.logistics.getOrders(token, f); }
  getOrderDetails(token, id) { return this.logistics.getOrderDetails(token, id); }
  processOrders(token, d) { return this.logistics.processOrders(token, d); }
  getWarehouses(token) { return this.logistics.getWarehouses(token); }
  exportOrders(token, d) { return this.logistics.exportOrders(token, d); }
  getCustomerData(token, f) { return this.logistics.getCustomerData(token, f); }
  updateCustomerData(token, d) { return this.logistics.updateCustomerData(token, d); }
  getDocumentDetailsWithPromotions(t, m, d) { return this.logistics.getDocumentDetailsWithPromotions(t, m, d); }
  processDocumentsWithPromotions(t, m, d) { return this.logistics.processDocumentsWithPromotions(t, m, d); }
  validatePromotionConfig(t, m) { return this.logistics.validatePromotionConfig(t, m); }

  // --- MÉTODOS DE MAPPING API ---
  getMappings(token) { return this.mapping.getMappings(token); }
  getMappingById(token, id) { return this.mapping.getMappingById(token, id); }
  createMapping(token, d) { return this.mapping.createMapping(token, d); }
  updateMapping(token, id, d) { return this.mapping.updateMapping(token, id, d); }
  deleteMapping(token, id) { return this.mapping.deleteMapping(token, id); }
  getDocumentsByMapping(token, id, f) { return this.mapping.getDocumentsByMapping(token, id, f); }
  getDocumentDetailsByMapping(token, mid, did) { return this.mapping.getDocumentDetailsByMapping(token, mid, did); }
  validateBonificationConfig(token, id) { return this.mapping.validateBonificationConfig(token, id); }
  processDocumentsByMapping(token, id, ids) { return this.mapping.processDocumentsByMapping(token, id, ids); }
  getSourceDataByMapping(token, mid, did) { return this.mapping.getSourceDataByMapping(token, mid, did); }
  updateConsecutiveConfig(token, id, c) { return this.mapping.updateConsecutiveConfig(token, id, c); }
  updateEntityData(token, d) { return this.mapping.updateEntityData(token, d); }
  queryDynamicFieldValue(t, id, c, d) { return this.mapping.queryDynamicFieldValue(t, id, c, d); }

  // --- MÉTODOS DE CONSECUTIVE API ---
  getConsecutives(token, f) { return this.consecutives.getConsecutives(token, f); }
  getConsecutiveById(token, id) { return this.consecutives.getConsecutiveById(token, id); }
  createConsecutive(token, d) { return this.consecutives.createConsecutive(token, d); }
  updateConsecutive(token, id, d) { return this.consecutives.updateConsecutive(token, id, d); }
  deleteConsecutive(token, id) { return this.consecutives.deleteConsecutive(token, id); }
  getNextConsecutiveValue(token, id, o) { return this.consecutives.getNextConsecutiveValue(token, id, o); }
  resetConsecutive(token, id, v, s) { return this.consecutives.resetConsecutive(token, id, v, s); }
  assignConsecutive(token, id, a) { return this.consecutives.assignConsecutive(token, id, a); }
  getConsecutivesByEntity(token, t, id) { return this.consecutives.getConsecutivesByEntity(token, t, id); }
  reserveConsecutiveValues(token, id, q, o) { return this.consecutives.reserveConsecutiveValues(token, id, q, o); }
  commitConsecutiveReservation(token, id, rid, v) { return this.consecutives.commitConsecutiveReservation(token, id, rid, v); }
  cancelConsecutiveReservation(token, id, rid) { return this.consecutives.cancelConsecutiveReservation(token, id, rid); }
  cleanupExpiredReservations(token) { return this.consecutives.cleanupExpiredReservations(token); }
  getConsecutiveDashboard(token) { return this.consecutives.getConsecutiveDashboard(token); }
  getConsecutiveMetrics(token, id, r) { return this.consecutives.getConsecutiveMetrics(token, id, r); }

  // --- MÉTODOS DE AUDIT & STATS API ---
  getTaskHistory(token, id) { return this.audit.getTaskHistory(token, id); }
  getTransferHistory(token, f) { return this.audit.getTransferHistory(token, f); }
  checkServerStatus(token) { return this.audit.checkServerStatus(token); }
  getTransferStats(token, f) { return this.audit.getTransferStats(token, f); }
  getLogs(token, f) { return this.audit.getLogs(token, f); }
  getLogsSummary(token) { return this.audit.getLogsSummary(token); }
  getLogDetail(token, id) { return this.audit.getLogDetail(token, id); }
  cleanOldLogs(token, o) { return this.audit.cleanOldLogs(token, o); }
  getLogSources(token) { return this.audit.getLogSources(token); }
}

export default TransferApi;
