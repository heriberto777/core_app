import { ENV } from "../utils/index";

export class TransferSummaryApi {
  baseApi = ENV.BASE_API;

  /**
   * Get all transfer summaries with pagination and filters
   */
  async getSummaries(accessToken, filters = {}) {
    try {
      // Build query string from filters
      const queryParams = new URLSearchParams();

      if (filters.page) queryParams.append("page", filters.page);
      if (filters.limit) queryParams.append("limit", filters.limit);
      if (filters.loadId) queryParams.append("loadId", filters.loadId);
      if (filters.route) queryParams.append("route", filters.route);
      if (filters.dateFrom) queryParams.append("dateFrom", filters.dateFrom);
      if (filters.dateTo) queryParams.append("dateTo", filters.dateTo);
      if (filters.status) queryParams.append("status", filters.status);

      const queryString = queryParams.toString();
      const url = `${this.baseApi}/${ENV.API_ROUTERS.SUMMARIES}/get/${
        queryString ? `?${queryString}` : ""
      }`;

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error("Error fetching transfer summaries:", error);
      throw error;
    }
  }

  /**
   * Get a single transfer summary by ID
   */
  async getSummaryById(accessToken, summaryId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.SUMMARIES}/get/${summaryId}`;

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error(
        `Error fetching transfer summary by ID ${summaryId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a transfer summary by loadId
   */
  async getSummaryByLoadId(accessToken, loadId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.SUMMARIES}/load/${loadId}`;

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error(
        `Error fetching transfer summary by loadId ${loadId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check inventory levels for possible returns
   */
  async checkInventoryForReturns(accessToken, summaryId) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.SUMMARIES}/inventory-check/${summaryId}`;

      const params = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error(`Error checking inventory for returns:`, error);
      throw error;
    }
  }

  /**
   * Process a product return for a transfer
   */
  async processTransferReturn(accessToken, returnData) {
    try {
      const url = `${this.baseApi}/${ENV.API_ROUTERS.SUMMARIES}/reverse/return`;

      const params = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(returnData),
      };

      const response = await fetch(url, params);
      const result = await response.json();

      if (response.status !== 200) throw result;

      return result;
    } catch (error) {
      console.error(`Error processing transfer return:`, error);
      throw error;
    }
  }
}

export default TransferSummaryApi;
