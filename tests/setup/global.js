/**
 * Global Test Setup
 * 
 * This file is run once before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Increase test timeout for slower operations
beforeAll(() => {
  // Set default timeout
  if (typeof jasmine !== 'undefined') {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
  }
});

// Global cleanup
afterAll(() => {
  // Ensure all handles are closed
  if (global.__TEARDOWN_CALLBACKS__) {
    global.__TEARDOWN_CALLBACKS__.forEach(cb => cb());
  }
});

// Helper to register cleanup callbacks
global.registerCleanup = (callback) => {
  if (!global.__TEARDOWN_CALLBACKS__) {
    global.__TEARDOWN_CALLBACKS__ = [];
  }
  global.__TEARDOWN_CALLBACKS__.push(callback);
};