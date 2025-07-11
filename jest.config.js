/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Exclude patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/Hydration-sdk-master/',
    '<rootDir>/followthedot-main/'
  ],
  
  // Transform configuration for ES modules
  transform: {
    '^.+\\.js$': ['babel-jest', {
      configFile: './babel.config.js'
    }]
  },
  
  // Experimental ES modules support
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },
  
  // ES modules support - removed extensionsToTreatAsEsm as .js is automatically inferred from package.json type: "module"
  
  // Transform ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(p-queue|p-limit|got|node-fetch|d3|d3-.*|@polkadot/.*|socket\\.io.*|engine\\.io.*|chalk|ora)/)'
  ],
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'node'],
  
  // Haste configuration to avoid naming collisions
  haste: {
    throwOnModuleCollision: false
  },
  
  // Additional module paths to ignore
  modulePathIgnorePatterns: [
    '<rootDir>/Hydration-sdk-master/',
    '<rootDir>/followthedot-main/'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!**/node_modules/**',
    '!Hydration-sdk-master/**',
    '!followthedot-main/**',
    '!public/**',
    '!migrations/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup files
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Sequential execution for database tests
  maxWorkers: 1,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Watch options
  watchPathIgnorePatterns: [
    'node_modules',
    'coverage',
    'Hydration-sdk-master',
    'followthedot-main'
  ]
};