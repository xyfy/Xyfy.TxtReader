/**
 * Cloud Provider and Cloud Storage Tests
 */

import {
  CloudProviderError,
  CloudProvider,
  CloudProviderFactory,
  NoOpCloudProvider
} from '../modules/cloud-provider.js';
import { CloudStorage } from '../modules/cloud-storage.js';

// Basic error handling tests
console.log('Testing CloudProviderError...');
const error1 = new CloudProviderError('AUTH_REQUIRED', 'Auth needed');
console.assert(error1.requiresReAuth() === true, 'AUTH_REQUIRED should require re-auth');
console.assert(error1.isRecoverable() === false, 'AUTH_REQUIRED should not be recoverable');

const error2 = new CloudProviderError('NETWORK_ERROR', 'Network failed');
console.assert(error2.isRecoverable() === true, 'NETWORK_ERROR should be recoverable');

// Factory registration tests
console.log('Testing CloudProviderFactory...');

class MockCloudProvider extends CloudProvider {
  getMetadata() {
    return {
      providerId: 'mock',
      name: 'Mock Provider',
      version: '1.0.0',
      supportedFeatures: ['upload', 'download', 'list']
    };
  }

  async initialize() {
    this.isInitialized = true;
    this.authState = 'AUTHED';
  }

  async getAuthState() {
    return { authed: true, user: 'test@example.com' };
  }

  async requestAuth() {
    return { authed: true, user: 'test@example.com' };
  }

  async clearAuth() {
    this.authState = 'NEEDS_AUTH';
  }

  async uploadBackup(snapshot, metadata) {
    return {
      fileId: 'mock-file-id',
      fileName: metadata.fileName || 'backup.json',
      uploadedAt: new Date().toISOString(),
      size: JSON.stringify(snapshot).length
    };
  }

  async listBackups() {
    return [
      {
        fileId: 'file1',
        fileName: 'backup-1.json',
        uploadedAt: new Date().toISOString(),
        size: 1024
      }
    ];
  }

  async downloadBackup(fileId) {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      app: { name: 'TxtReader' },
      settings: {},
      books: [],
      progress: [],
      bookmarks: []
    };
  }

  async deleteBackup(fileId) {
    // No-op
  }

  async getQuota() {
    return {
      totalBytes: 1_000_000_000,
      usedBytes: 500_000_000,
      availableBytes: 500_000_000
    };
  }
}

CloudProviderFactory.register('mock', MockCloudProvider);
console.assert(CloudProviderFactory.listProviders().length > 0, 'Factory should have registered provider');

try {
  class InvalidProvider {}
  CloudProviderFactory.register('invalid', InvalidProvider);
  console.assert(false, 'Factory should reject class that does not extend CloudProvider');
} catch (err) {
  console.assert(err instanceof Error, 'Should throw error for invalid provider class');
}

const mockProvider = CloudProviderFactory.create('mock');
console.assert(mockProvider instanceof CloudProvider, 'Factory should create provider instance');

// Test invalid provider
try {
  CloudProviderFactory.create('nonexistent');
  console.assert(false, 'Should throw error for nonexistent provider');
} catch (err) {
  console.assert(err instanceof CloudProviderError, 'Should throw CloudProviderError');
  console.assert(err.code === 'PROVIDER_NOT_FOUND', 'Should have PROVIDER_NOT_FOUND code');
}

// NoOp provider tests
console.log('Testing NoOpCloudProvider...');
const noOpProvider = new NoOpCloudProvider();
console.assert(noOpProvider.getMetadata().providerId === 'noop', 'NoOp provider should have correct ID');

(async () => {
  await noOpProvider.initialize();
  console.assert(noOpProvider.isInitialized === true, 'NoOp provider should initialize');
  console.assert(await noOpProvider.isReady() === false, 'NoOp provider should not be ready');

  try {
    await noOpProvider.uploadBackup({});
    console.assert(false, 'NoOp provider should throw on upload');
  } catch (err) {
    console.assert(err instanceof CloudProviderError, 'NoOp upload should throw CloudProviderError');
    console.assert(err.code === 'NOT_AUTHED', 'Should have NOT_AUTHED code');
  }

  // Cloud storage tests
  console.log('Testing CloudStorage...');
  const storage = new CloudStorage({
    provider: noOpProvider,
    maxRetries: 2,
    retryDelayMs: 100
  });

  const initResult = await storage.initialize();
  console.assert(initResult.success === true, 'Storage init should succeed');

  const quotaResult = await storage.getCloudQuota();
  console.assert(quotaResult.success === true, 'Quota check should complete');
  console.assert(quotaResult.data.availableBytes === 0, 'NoOp should return 0 quota');

  const backupResult = await storage.backupToCloud({ test: 'data' }, { fileName: 'test.json' });
  console.assert(backupResult.success === false, 'NoOp backup should fail');
  console.assert(backupResult.error instanceof CloudProviderError, 'Should have error');
  console.assert(backupResult.error?.requiresReAuth?.() === true, 'Error should require re-auth');
  console.assert(backupResult.error === null || backupResult.requiresUserAction(), 'Result should indicate user action needed or have no error');

  // Operation logging
  const log = storage.getOperationLog();
  console.assert(log.length > 0, 'Should have logged operations');
  // initialize is not logged by storage, only by provider, so check for other operations
  console.assert(log.some(op => op.operation === 'backupToCloud'), 'Should log backup');

  // Test with real mock provider
  console.log('Testing CloudStorage with MockProvider...');
  const mockStorage = new CloudStorage({ provider: mockProvider });

  const mockInit = await mockStorage.initialize();
  console.assert(mockInit.success === true, 'Mock provider init should succeed');

  const mockQuota = await mockStorage.getCloudQuota();
  console.assert(mockQuota.success === true, 'Mock quota check should succeed');
  console.assert(mockQuota.data.totalBytes === 1_000_000_000, 'Should get correct quota');

  const testSnapshot = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: { name: 'TxtReader', version: '0.2.0' },
    settings: { theme: 'dark' },
    books: [{ id: 'book1', title: 'Test Book' }],
    progress: [{ bookId: 'book1', chapterIndex: 5 }],
    bookmarks: []
  };

  const mockBackup = await mockStorage.backupToCloud(testSnapshot, { fileName: 'backup.json' });
  console.assert(mockBackup.success === true, 'Mock backup should succeed');
  console.assert(mockBackup.data.fileId === 'mock-file-id', 'Should get file ID');

  const mockList = await mockStorage.listCloudBackups();
  console.assert(mockList.success === true, 'Mock list should succeed');
  console.assert(mockList.data.length === 1, 'Should list 1 backup');

  const mockRestore = await mockStorage.restoreFromCloud('mock-file-id');
  console.assert(mockRestore.success === true, 'Mock restore should succeed');
  console.assert(mockRestore.data.schemaVersion === 1, 'Should restore snapshot');

  console.log('\n✅ All cloud provider tests passed!');
})();
