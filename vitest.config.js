import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: [
      'node_modules/**',
      'Hydration-sdk-master/**',
      'followthedot-main/**',
      '**/node_modules/**'
    ],
    // Transform ES modules from node_modules
    server: {
      deps: {
        inline: [
          // Add packages that need to be transformed here
          // Common ES module packages that might cause issues
          'p-queue',
          'p-limit',
          'got',
          'node-fetch',
          'chalk',
          'd3',
          'socket.io',
          '@polkadot/api',
          '@polkadot/util-crypto'
        ]
      }
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        'public/',
        'migrations/',
        'Hydration-sdk-master/',
        'followthedot-main/'
      ]
    },
    setupFiles: ['./tests/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Ensure tests run in sequence to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // Isolate integration tests
    sequence: {
      shuffle: false
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
});