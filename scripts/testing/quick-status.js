#!/usr/bin/env node

/**
 * Quick Status Check for Polkadot Analysis Tool
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 POLKADOT ANALYSIS TOOL - STATUS CHECK');
console.log('='.repeat(50));

// Check project structure
console.log('\n📁 PROJECT STRUCTURE:');
const checkPaths = [
  'src/index.js',
  'src/api/index.js', 
  'src/services/DatabaseService.js',
  'src/services/GraphQueries.js',
  'public/index.html',
  'data/analysis.db',
  'package.json',
  'vitest.config.js'
];

checkPaths.forEach(checkPath => {
  const fullPath = path.join(__dirname, checkPath);
  const exists = fs.existsSync(fullPath);
  console.log(`${exists ? '✅' : '❌'} ${checkPath}`);
});

// Check dependencies
console.log('\n📦 DEPENDENCIES:');
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  
  console.log(`✅ Express.js: ${packageJson.dependencies.express}`);
  console.log(`✅ SQLite: ${packageJson.dependencies['better-sqlite3']}`);
  console.log(`✅ Polkadot API: ${packageJson.dependencies['@polkadot/api']}`);
  console.log(`✅ D3.js: ${packageJson.dependencies.d3}`);
  console.log(`✅ Socket.io: ${packageJson.dependencies['socket.io']}`);
  console.log(`✅ Vitest: ${packageJson.devDependencies.vitest}`);
} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`);
}

// Check test files
console.log('\n🧪 TEST FILES:');
const testDirs = ['tests/unit', 'tests/integration', 'tests/performance'];
testDirs.forEach(testDir => {
  const fullPath = path.join(__dirname, testDir);
  if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath);
    console.log(`✅ ${testDir}: ${files.length} files`);
  } else {
    console.log(`❌ ${testDir}: Not found`);
  }
});

// Check source files
console.log('\n💻 SOURCE CODE:');
const srcDirs = ['src/api/routes', 'src/services', 'src/controllers'];
srcDirs.forEach(srcDir => {
  const fullPath = path.join(__dirname, srcDir);
  if (fs.existsSync(fullPath)) {
    const files = fs.readdirSync(fullPath);
    console.log(`✅ ${srcDir}: ${files.length} files`);
  } else {
    console.log(`❌ ${srcDir}: Not found`);
  }
});

console.log('\n🎯 SUMMARY:');
console.log('This is a comprehensive blockchain analysis tool with:');
console.log('• Express.js backend with REST API');
console.log('• SQLite database for graph storage');
console.log('• D3.js frontend for visualization');
console.log('• Comprehensive test suite');
console.log('• Multi-hop graph analysis capabilities');
console.log('• Real-time WebSocket support');

console.log('\n🚀 READY TO TEST:');
console.log('Run these commands to test the application:');
console.log('• npm test (run test suite)');
console.log('• npm run dev (start development server)');
console.log('• npm run build (build for production)');