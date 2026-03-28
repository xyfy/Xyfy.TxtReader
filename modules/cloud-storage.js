/**
 * Cloud Storage Module
 * 
 * Manages cloud backup operations with error recovery and local fallback support.
 * Ensures local backup remains fully operational regardless of cloud provider state.
 */

import { CloudProviderError, NoOpCloudProvider } from './cloud-provider.js';

/**
 * Cloud storage operation options with retry and timeout settings
 */
const DEFAULT_OPTIONS = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000, // 30 second timeout for cloud operations
  fallbackToLocal: true // Always fall back to local backup on cloud failure
};

/**
 * Result wrapper for cloud operations with metadata
 */
class CloudOperationResult {
  constructor(success, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = {
      timestamp: new Date().toISOString(),
      provider: metadata.provider || 'unknown',
      duration: metadata.duration || 0,
      ...metadata
    };
  }

  /**
   * Check if result contains a recoverable error
   */
  isRecoverable() {
    return this.error && this.error.isRecoverable?.();
  }

  /**
   * Check if result requires user action (like re-auth)
   */
  requiresUserAction() {
    return this.error && this.error.requiresReAuth?.();
  }
}

export class CloudStorage {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.provider = options.provider || new NoOpCloudProvider();
    this.operationLog = []; // Track recent operations for debugging
    this.lastError = null;
  }

  /**
   * Set the active cloud provider
   * @param {CloudProvider} provider - Cloud provider instance
   */
  setProvider(provider) {
    this.provider = provider || new NoOpCloudProvider();
  }

  /**
   * Initialize cloud storage (init provider, check auth)
   * @returns {Promise<CloudOperationResult>}
   */
  async initialize() {
    const startTime = Date.now();
    try {
      if (!this.provider.isInitialized) {
        await this.provider.initialize();
      }
      return new CloudOperationResult(true, { ready: true }, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('initialize', false, error);
      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Backup snapshot to cloud with retry logic
   * @param {Object} snapshot - Backup snapshot object
   * @param {Object} metadata - Upload metadata {fileName, tags}
   * @returns {Promise<CloudOperationResult>}
   */
  async backupToCloud(snapshot, metadata = {}) {
    const startTime = Date.now();
    let lastError = null;

    // Attempt upload with retries
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const uploadPromise = this.provider.uploadBackup(snapshot, metadata);
        const result = await this.raceWithTimeout(uploadPromise);

        this.logOperation('backupToCloud', true, null, {
          attempt,
          fileName: metadata.fileName,
          size: JSON.stringify(snapshot).length
        });

        return new CloudOperationResult(true, result, null, {
          provider: this.provider.getMetadata().providerId,
          duration: Date.now() - startTime,
          attempts: attempt
        });
      } catch (error) {
        lastError = error;
        this.logOperation('backupToCloud', false, error, {
          attempt,
          fileName: metadata.fileName
        });

        // Don't retry if not recoverable or final attempt
        if (!error.isRecoverable?.() || attempt === this.options.maxRetries) {
          break;
        }

        // Wait before retry (exponential backoff)
        const delayMs = this.options.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    this.lastError = lastError;
    return new CloudOperationResult(false, null, lastError, {
      provider: this.provider.getMetadata().providerId,
      duration: Date.now() - startTime,
      attempts: this.options.maxRetries
    });
  }

  /**
   * Restore backup from cloud
   * @param {string} fileId - Cloud file ID
   * @returns {Promise<CloudOperationResult>}
   */
  async restoreFromCloud(fileId) {
    const startTime = Date.now();
    try {
      const downloadPromise = this.provider.downloadBackup(fileId);
      const snapshot = await this.raceWithTimeout(downloadPromise);

      this.logOperation('restoreFromCloud', true, null, { fileId });

      return new CloudOperationResult(true, snapshot, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('restoreFromCloud', false, error, { fileId });

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * List backups in cloud storage
   * @param {Object} options - List options
   * @returns {Promise<CloudOperationResult>}
   */
  async listCloudBackups(options = {}) {
    const startTime = Date.now();
    try {
      const listPromise = this.provider.listBackups(options);
      const backups = await this.raceWithTimeout(listPromise);

      this.logOperation('listCloudBackups', true, null, {
        count: backups.length
      });

      return new CloudOperationResult(true, backups, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('listCloudBackups', false, error);

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Delete a backup from cloud
   * @param {string} fileId - Cloud file ID
   * @returns {Promise<CloudOperationResult>}
   */
  async deleteCloudBackup(fileId) {
    const startTime = Date.now();
    try {
      const deletePromise = this.provider.deleteBackup(fileId);
      await this.raceWithTimeout(deletePromise);

      this.logOperation('deleteCloudBackup', true, null, { fileId });

      return new CloudOperationResult(true, { deleted: true }, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('deleteCloudBackup', false, error, { fileId });

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Get cloud storage quota
   * @returns {Promise<CloudOperationResult>}
   */
  async getCloudQuota() {
    const startTime = Date.now();
    try {
      const quotaPromise = this.provider.getQuota();
      const quota = await this.raceWithTimeout(quotaPromise);

      return new CloudOperationResult(true, quota, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Check if cloud provider is ready
   * @returns {Promise<boolean>}
   */
  async isReady() {
    try {
      return await this.provider.isReady();
    } catch {
      return false;
    }
  }

  /**
   * Request cloud provider authentication
   * @param {Object} options - Provider-specific auth options
   * @returns {Promise<CloudOperationResult>}
   */
  async requestCloudAuth(options = {}) {
    const startTime = Date.now();
    try {
      const authResult = await this.provider.requestAuth(options);
      this.logOperation('requestCloudAuth', true, null);

      return new CloudOperationResult(true, authResult, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('requestCloudAuth', false, error);

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Clear cloud provider authorization
   * @returns {Promise<CloudOperationResult>}
   */
  async clearCloudAuth() {
    const startTime = Date.now();
    try {
      await this.provider.clearAuth();
      this.logOperation('clearCloudAuth', true, null);

      return new CloudOperationResult(true, { authed: false }, null, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.lastError = error;
      this.logOperation('clearCloudAuth', false, error);

      return new CloudOperationResult(false, null, error, {
        provider: this.provider.getMetadata().providerId,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Get cloud provider metadata
   * @returns {Object}
   */
  getProviderMetadata() {
    return this.provider.getMetadata();
  }

  /**
   * Get operation history (for debugging)
   * @param {number} limit - Max number of operations to return
   * @returns {Array<Object>}
   */
  getOperationLog(limit = 20) {
    return this.operationLog.slice(-limit);
  }

  /**
   * Clear operation history
   */
  clearOperationLog() {
    this.operationLog = [];
  }

  /**
   * Log an operation for debugging and monitoring
   * @private
   */
  logOperation(operation, success, error, metadata = {}) {
    this.operationLog.push({
      operation,
      success,
      error: error ? {
        code: error.code,
        message: error.message
      } : null,
      timestamp: new Date().toISOString(),
      ...metadata
    });

    // Keep only last 100 operations in memory
    if (this.operationLog.length > 100) {
      this.operationLog = this.operationLog.slice(-100);
    }
  }

  /**
   * Race promise against timeout
   * @private
   */
  raceWithTimeout(promise, timeoutMs = this.options.timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => {
          const error = new CloudProviderError(
            'TIMEOUT',
            `Cloud operation timed out after ${timeoutMs}ms`,
            { timeoutMs }
          );
          reject(error);
        }, timeoutMs)
      )
    ]);
  }
}

export { CloudOperationResult, CloudProviderError };
