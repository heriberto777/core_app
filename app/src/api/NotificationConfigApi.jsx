import { ENV } from "../utils/index";

export class NotificationConfigApi {
  constructor() {
    this.baseApi = ENV.BASE_API;
    this.url = `${this.baseApi}/${ENV.API_ROUTERS.NOTIFICATION_CONFIG}`;
  }

  async #handle(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || `Error HTTP ${response.status}`);
    }
    return result.data !== undefined ? result.data : result;
  }

  async getConfig(accessToken) {
    const response = await fetch(this.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return this.#handle(response);
  }

  async updateConfig(accessToken, configData) {
    const response = await fetch(this.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(configData),
    });
    return this.#handle(response);
  }

  async testWebhook(accessToken, webhookUrl) {
    const response = await fetch(`${this.url}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ webhookUrl }),
    });
    return this.#handle(response);
  }
}
