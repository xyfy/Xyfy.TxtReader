import { CloudProvider, CloudProviderError } from "./cloud-provider.js";

const GITHUB_API_BASE = "https://api.github.com";
const BACKUP_FILE_NAME = "xyfy-txt-reader-backup.json";

function mapHttpError(status, message) {
  if (status === 401 || status === 403) {
    return new CloudProviderError("AUTH_REQUIRED", message || "Gist 鉴权失败，请检查 Token 权限");
  }
  if (status === 404) {
    return new CloudProviderError("PROVIDER_ERROR", message || "未找到对应 Gist，请检查 Gist ID");
  }
  if (status === 429) {
    return new CloudProviderError("QUOTA_EXCEEDED", message || "GitHub API 频率受限");
  }
  if (status >= 500) {
    return new CloudProviderError("NETWORK_ERROR", message || "GitHub 服务暂时不可用");
  }
  return new CloudProviderError("PROVIDER_ERROR", message || `Gist 请求失败（${status}）`);
}

export class GistProvider extends CloudProvider {
  constructor(config = {}) {
    super(config);
    this.gistId = config.gistId || "";
    this.token = config.token || "";
  }

  getMetadata() {
    return {
      providerId: "gist",
      name: "GitHub Gist",
      version: "1.0.0",
      supportedFeatures: ["upload", "download", "list", "quota"]
    };
  }

  updateConfig(config = {}) {
    if (typeof config.gistId === "string") {
      this.gistId = config.gistId.trim();
    }
    if (typeof config.token === "string") {
      this.token = config.token.trim();
    }
  }

  async initialize() {
    this.isInitialized = true;
    this.authState = this.gistId && this.token ? "AUTHED" : "NEEDS_AUTH";
  }

  async getAuthState() {
    if (!this.gistId || !this.token) {
      return { authed: false };
    }

    return { authed: true, user: "GitHub Token" };
  }

  async requestAuth(options = {}) {
    this.updateConfig(options);

    if (!this.gistId || !this.token) {
      throw new CloudProviderError("AUTH_REQUIRED", "请填写 Gist ID 与 Token");
    }

    await this.fetchGist();
    this.authState = "AUTHED";

    return { authed: true, user: "GitHub Token" };
  }

  async clearAuth() {
    this.gistId = "";
    this.token = "";
    this.authState = "NEEDS_AUTH";
  }

  async authorizedFetch(url, options = {}) {
    if (!this.gistId || !this.token) {
      throw new CloudProviderError("AUTH_REQUIRED", "请先连接 Gist");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }

    return response;
  }

  async fetchGist() {
    const response = await this.authorizedFetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(this.gistId)}`, {
      method: "GET"
    });
    return response.json();
  }

  async uploadBackup(snapshot, metadata = {}) {
    const bodyContent = JSON.stringify(snapshot, null, 2);
    const fileName = metadata.fileName || BACKUP_FILE_NAME;

    const response = await this.authorizedFetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(this.gistId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [BACKUP_FILE_NAME]: {
            filename: fileName,
            content: bodyContent
          }
        }
      })
    });

    const data = await response.json();
    return {
      fileId: data.id,
      fileName,
      uploadedAt: data.updated_at || new Date().toISOString(),
      size: bodyContent.length
    };
  }

  async listBackups() {
    const gist = await this.fetchGist();
    const file = gist.files?.[BACKUP_FILE_NAME] || Object.values(gist.files || {})[0];

    if (!file) {
      return [];
    }

    return [
      {
        fileId: gist.id,
        fileName: file.filename || BACKUP_FILE_NAME,
        uploadedAt: gist.updated_at || gist.created_at || new Date().toISOString(),
        size: Number(file.size || 0)
      }
    ];
  }

  async downloadBackup() {
    const gist = await this.fetchGist();
    const file = gist.files?.[BACKUP_FILE_NAME] || Object.values(gist.files || {})[0];

    if (!file?.raw_url) {
      throw new CloudProviderError("PROVIDER_ERROR", "Gist 中未找到备份文件");
    }

    const response = await this.authorizedFetch(file.raw_url, { method: "GET" });
    return response.json();
  }

  async deleteBackup() {
    throw new CloudProviderError("PROVIDER_ERROR", "Gist 模式下不支持删除，请在 GitHub 网页端操作");
  }

  async getQuota() {
    return {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0
    };
  }
}
