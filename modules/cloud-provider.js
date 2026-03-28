/**
 * Cloud Provider Abstraction Layer
 * 
 * Defines the base interface and error handling for cloud backup providers.
 * Supports future implementations of Google Drive, OneDrive, etc.
 * 
 * Local backup operations remain fully independent of cloud provider state.
 */

/**
 * Cloud provider error types for consistent error boundary handling
 */
export class CloudProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CloudProviderError';
    this.code = code; // 'AUTH_REQUIRED', 'NOT_AUTHED', 'QUOTA_EXCEEDED', 'NETWORK_ERROR', 'PROVIDER_ERROR'
    this.details = details;
  }

  /**
   * Check if error requires re-authentication
   */
  requiresReAuth() {
    return ['AUTH_REQUIRED', 'NOT_AUTHED', 'TOKEN_EXPIRED'].includes(this.code);
  }

  /**
   * Check if error is recoverable without user action
   */
  isRecoverable() {
    return this.code === 'NETWORK_ERROR';
  }
}

/**
 * Base abstract Cloud Provider class
 * 
 * All cloud providers must extend this and implement required methods.
 */
export class CloudProvider {
  constructor(config = {}) {
    this.config = config;
    this.isInitialized = false;
    this.authState = 'UNKNOWN'; // 'UNKNOWN', 'AUTHED', 'NEEDS_AUTH', 'ERROR'
  }

  /**
   * Initialize the provider (load existing credentials, check auth state)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Get current authentication state
   * @returns {Promise<{authed: boolean, user?: string, expiresAt?: number}>}
   */
  async getAuthState() {
    throw new Error('getAuthState() must be implemented by subclass');
  }

  /**
   * Request user authorization
   * @param {Object} options - Authorization options
   * @returns {Promise<{authed: boolean, user: string}>}
   */
  async requestAuth(options = {}) {
    throw new Error('requestAuth() must be implemented by subclass');
  }

  /**
   * Clear stored authorization credentials
   * @returns {Promise<void>}
   */
  async clearAuth() {
    throw new Error('clearAuth() must be implemented by subclass');
  }

  /**
   * Upload a backup snapshot to cloud storage
   * @param {Object} snapshot - Backup snapshot object with {schemaVersion, exportedAt, app, settings, books, progress, bookmarks}
   * @param {Object} metadata - Upload metadata {fileName, mimeType, tags}
   * @returns {Promise<{fileId: string, fileName: string, uploadedAt: string, size: number}>}
   */
  async uploadBackup(snapshot, metadata = {}) {
    throw new Error('uploadBackup() must be implemented by subclass');
  }

  /**
   * List all backups available in cloud storage
   * @param {Object} options - List options {limit, offset, sortBy: 'date'|'name'}
   * @returns {Promise<Array<{fileId: string, fileName: string, uploadedAt: string, size: number}>>}
   */
  async listBackups(options = {}) {
    throw new Error('listBackups() must be implemented by subclass');
  }

  /**
   * Download a specific backup from cloud storage
   * @param {string} fileId - Cloud storage file ID
   * @returns {Promise<Object>} - Backup snapshot object
   */
  async downloadBackup(fileId) {
    throw new Error('downloadBackup() must be implemented by subclass');
  }

  /**
   * Delete a backup from cloud storage
   * @param {string} fileId - Cloud storage file ID
   * @returns {Promise<void>}
   */
  async deleteBackup(fileId) {
    throw new Error('deleteBackup() must be implemented by subclass');
  }

  /**
   * Get storage quota information
   * @returns {Promise<{totalBytes: number, usedBytes: number, availableBytes: number}>}
   */
  async getQuota() {
    throw new Error('getQuota() must be implemented by subclass');
  }

  /**
   * Check if provider is ready for operations (authed + initialized)
   * @returns {Promise<boolean>}
   */
  async isReady() {
    if (!this.isInitialized) return false;
    const state = await this.getAuthState();
    return state.authed === true;
  }

  /**
   * Get provider metadata
   * @returns {Object} - {providerId, name, version, supportedFeatures}
   */
  getMetadata() {
    return {
      providerId: this.constructor.name,
      name: 'Unknown Provider',
      version: '0.0.0',
      supportedFeatures: []
    };
  }
}

/**
 * Factory for creating and registering cloud providers
 */
export class CloudProviderFactory {
  static providers = new Map();

  /**
   * Register a provider implementation
   * @param {string} providerId - Unique provider identifier
   * @param {typeof CloudProvider} ProviderClass - Provider class extending CloudProvider
   */
  static register(providerId, ProviderClass) {
    if (!(ProviderClass.prototype instanceof CloudProvider)) {
      throw new Error(`${ProviderClass.name} must extend CloudProvider`);
    }
    this.providers.set(providerId, ProviderClass);
  }

  /**
   * Create an instance of a registered provider
   * @param {string} providerId - Provider identifier
   * @param {Object} config - Provider configuration
   * @returns {CloudProvider} - Provider instance
   */
  static create(providerId, config = {}) {
    const ProviderClass = this.providers.get(providerId);
    if (!ProviderClass) {
      throw new CloudProviderError(
        'PROVIDER_NOT_FOUND',
        `Provider '${providerId}' is not registered`,
        { providerId }
      );
    }
    return new ProviderClass(config);
  }

  /**
   * Get list of registered providers
   * @returns {Array<{providerId: string, metadata: Object}>}
   */
  static listProviders() {
    return Array.from(this.providers.entries()).map(([providerId, ProviderClass]) => ({
      providerId,
      metadata: new ProviderClass().getMetadata()
    }));
  }

  /**
   * Unregister a provider
   * @param {string} providerId - Provider identifier
   */
  static unregister(providerId) {
    this.providers.delete(providerId);
  }
}

/**
 * No-op implementation for when no cloud provider is active
 * Prevents errors when trying to use cloud features without provider
 */
export class NoOpCloudProvider extends CloudProvider {
  getMetadata() {
    return {
      providerId: 'noop',
      name: 'No Cloud Provider',
      version: '0.0.0',
      supportedFeatures: []
    };
  }

  async initialize() {
    this.isInitialized = true;
    this.authState = 'NEEDS_AUTH';
  }

  async getAuthState() {
    return { authed: false };
  }

  async requestAuth() {
    throw new CloudProviderError(
      'NOT_AUTHED',
      'No cloud provider is active'
    );
  }

  async clearAuth() {
    // No-op
  }

  async uploadBackup() {
    throw new CloudProviderError(
      'NOT_AUTHED',
      'No cloud provider is active'
    );
  }

  async listBackups() {
    return [];
  }

  async downloadBackup() {
    throw new CloudProviderError(
      'NOT_AUTHED',
      'No cloud provider is active'
    );
  }

  async deleteBackup() {
    throw new CloudProviderError(
      'NOT_AUTHED',
      'No cloud provider is active'
    );
  }

  async getQuota() {
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
  }

  async isReady() {
    return false;
  }
}
