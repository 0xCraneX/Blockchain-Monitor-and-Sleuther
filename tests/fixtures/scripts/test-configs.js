#!/usr/bin/env node

console.log('Testing configuration files...\n');

// Test webpack config
try {
  const webpackConfig = require('./webpack.config.js');
  const config = webpackConfig({ mode: 'development' }, { mode: 'development' });
  console.log('✓ webpack.config.js - syntax valid');
  console.log(`  Entry points: ${Object.keys(config.entry).join(', ')}`);
  console.log(`  Target: ${config.target}`);
  console.log(`  Mode: ${config.mode}`);
} catch (error) {
  console.log('✗ webpack.config.js - ERROR:', error.message);
}

// Test eslint config
try {
  const eslintConfig = require('./.eslintrc.js');
  console.log('✓ .eslintrc.js - syntax valid');
  console.log(`  Environment: ${Object.keys(eslintConfig.env).join(', ')}`);
  console.log(`  Parser: ECMAScript ${eslintConfig.parserOptions.ecmaVersion}`);
} catch (error) {
  console.log('✗ .eslintrc.js - ERROR:', error.message);
}

// Test babel config
try {
  const babelConfig = require('./babel.config.js');
  console.log('✓ babel.config.js - syntax valid');
  console.log(`  Presets: ${babelConfig.presets.length} configured`);
} catch (error) {
  console.log('✗ babel.config.js - ERROR:', error.message);
}

// Test vitest config
try {
  const vitestConfig = require('./vitest.config.js');
  console.log('✓ vitest.config.js - syntax valid');
  console.log(`  Test environment: ${vitestConfig.default.test.environment}`);
  console.log(`  Global mode: ${vitestConfig.default.test.globals}`);
} catch (error) {
  console.log('✗ vitest.config.js - ERROR:', error.message);
}

// Test jest config
try {
  const jestConfig = require('./jest.config.js');
  console.log('✓ jest.config.js - syntax valid');
  console.log(`  Test environment: ${jestConfig.default.testEnvironment}`);
  console.log(`  Preset: ${jestConfig.default.preset}`);
} catch (error) {
  console.log('✗ jest.config.js - ERROR:', error.message);
}

console.log('\nConfiguration file tests complete.');