import { CloudProvider, CloudProviderError } from "./cloud-provider.js";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const DEFAULT_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

function ensureChromeIdentityApi() {
  if (!globalThis.chrome?.identity?.getAuthToken) {
    throw new CloudProviderError(
      "PROVIDER_ERROR",
      "当前环境不支持 chrome.identity API，无法使用 Google Drive 云备份"
    );
  }
}

function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        reject(
          new CloudProviderError(
            interactive ? "AUTH_REQUIRED" : "NOT_AUTHED",
            runtimeError.message || "获取 Google 登录令牌失败"
          )
        );
        return;
      }

      if (!token) {
        reject(new CloudProviderError("NOT_AUTHED", "未获取到有效 Google 登录令牌"));
        return;
      }

      resolve(token);
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    if (!token) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => {
      resolve();
    });
  });
}

function mapHttpError(status, message) {
  if (status === 401 || status === 403) {
    return new CloudProviderError("AUTH_REQUIRED", message || "Google Drive 认证已失效，请重新连接");
  }
  if (status === 429) {
    return new CloudProviderError("QUOTA_EXCEEDED", message || "Google Drive 请求频率受限");
  }
  if (status >= 500) {
    return new CloudProviderError("NETWORK_ERROR", message || "Google Drive 服务暂时不可用");
  }
  return new CloudProviderError("PROVIDER_ERROR", message || `Google Drive 请求失败（${status}）`);
}

export class GoogleDriveProvider extends CloudProvider {
  constructor(config = {}) {
    super(config);
    this.scope = config.scope || DEFAULT_SCOPE;
    this.cachedToken = null;
  }

  getMetadata() {
    return {
      providerId: "google-drive",
      name: "Google Drive",
      version: "1.0.0",
      supportedFeatures: ["upload", "download", "list", "delete", "quota"]
    };
  }

  async initialize() {
    ensureChromeIdentityApi();
    this.isInitialized = true;

    try {
      this.cachedToken = await getAuthToken(false);
      this.authState = "AUTHED";
    } catch {
      this.cachedToken = null;
      this.authState = "NEEDS_AUTH";
    }
  }

  async getAuthState() {
    ensureChromeIdentityApi();
    if (!this.cachedToken) {
      try {
        this.cachedToken = await getAuthToken(false);
        this.authState = "AUTHED";
      } catch {
        this.authState = "NEEDS_AUTH";
        return { authed: false };
      }
    }

    return {
      authed: true,
      user: "Google Account",
      scope: this.scope
    };
  }

  async requestAuth() {
    ensureChromeIdentityApi();
    this.cachedToken = await getAuthToken(true);
    this.authState = "AUTHED";

    return {
      authed: true,
      user: "Google Account",
      scope: this.scope
    };
  }

  async clearAuth() {
    ensureChromeIdentityApi();
    await removeCachedToken(this.cachedToken);
    this.cachedToken = null;
    this.authState = "NEEDS_AUTH";
  }

  async authorizedFetch(url, options = {}) {
    if (!this.cachedToken) {
      this.cachedToken = await getAuthToken(false);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.cachedToken}`,
        ...(options.headers || {})
      }
    });

    if (response.status === 401 || response.status === 403) {
      await removeCachedToken(this.cachedToken);
      this.cachedToken = null;
      this.authState = "NEEDS_AUTH";
    }

    return response;
  }

  async uploadBackup(snapshot, metadata = {}) {
    const fileName = metadata.fileName || `xyfy-txt-reader-backup-${Date.now()}.json`;
    const bodyContent = JSON.stringify(snapshot);

    const boundary = `xyfy_boundary_${Date.now()}`;
    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({
        name: fileName,
        parents: ["appDataFolder"],
        appProperties: {
          app: "xyfy-txt-reader",
          schemaVersion: String(snapshot?.schemaVersion || "1")
        }
      }),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      bodyContent,
      `--${boundary}--`
    ].join("\r\n");

    const response = await this.authorizedFetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!response.ok) {
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }

    const data = await response.json();
    return {
      fileId: data.id,
      fileName,
      uploadedAt: new Date().toISOString(),
      size: bodyContent.length
    };
  }

  async listBackups(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
    const query = encodeURIComponent("'appDataFolder' in parents and trashed = false and appProperties has { key='app' and value='xyfy-txt-reader' }");
    const fields = encodeURIComponent("files(id,name,modifiedTime,size),nextPageToken");
    const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime desc&pageSize=${limit}&fields=${fields}`;

    const response = await this.authorizedFetch(url, { method: "GET" });
    if (!response.ok) {
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }

    const data = await response.json();
    return (data.files || []).map((file) => ({
      fileId: file.id,
      fileName: file.name,
      uploadedAt: file.modifiedTime,
      size: Number(file.size || 0)
    }));
  }

  async downloadBackup(fileId) {
    if (!fileId) {
      throw new CloudProviderError("PROVIDER_ERROR", "缺少云端备份文件 ID");
    }

    const response = await this.authorizedFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
      method: "GET"
    });

    if (!response.ok) {
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }

    return await response.json();
  }

  async deleteBackup(fileId) {
    if (!fileId) {
      throw new CloudProviderError("PROVIDER_ERROR", "缺少云端备份文件 ID");
    }

    const response = await this.authorizedFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }
  }

  async getQuota() {
    const fields = encodeURIComponent("storageQuota(limit,usage)");
    const response = await this.authorizedFetch(`${DRIVE_API_BASE}/about?fields=${fields}`, {
      method: "GET"
    });

    if (!response.ok) {
      if (response.status === 403) {
        // Some tenants may deny quota endpoint under restricted scopes.
        return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
      }
      const message = await response.text();
      throw mapHttpError(response.status, message);
    }

    const data = await response.json();
    const totalBytes = Number(data.storageQuota?.limit || 0);
    const usedBytes = Number(data.storageQuota?.usage || 0);
    return {
      totalBytes,
      usedBytes,
      availableBytes: Math.max(0, totalBytes - usedBytes)
    };
  }
}
