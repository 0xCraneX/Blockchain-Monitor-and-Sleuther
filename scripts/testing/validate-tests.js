#!/usr/bin/env node

/**
 * Test Suite Validation for Polkadot Analysis Tool
 * Manually validates test structure and identifies potential issues
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 POLKADOT ANALYSIS TOOL - TEST SUITE VALIDATION');
console.log('================================================\n');

class TestValidator {
  constructor() {
    this.testResults = {
      totalTests: 0,
      unitTests: 0,
      integrationTests: 0,
      performanceTests: 0,
      securityTests: 0,
      issues: [],
      dependencies: {
        missing: [],
        available: []
      }
    };
  }

  async run() {
    console.log('🚀 Starting test suite validation...\n');
    
    await this.analyzeTestStructure();
    await this.checkDependencies();
    await this.validateTestFiles();
    await this.checkSchemaFiles();
    await this.validateConfiguration();
    
    this.generateReport();
  }

  async analyzeTestStructure() {
    console.log('📋 Analyzing test structure...');
    
    try {
      const testDirs = [
        { path: 'tests/unit', category: 'unit' },
        { path: 'tests/integration', category: 'integration' },
        { path: 'tests/performance', category: 'performance' },
        { path: 'tests/security', category: 'security' }
      ];

      for (const dir of testDirs) {
        try {
          const files = await this.getTestFiles(dir.path);
          console.log(`   📁 ${dir.path}: ${files.length} test files`);
          
          this.testResults[`${dir.category}Tests`] = files.length;
          this.testResults.totalTests += files.length;
          
          if (files.length === 0) {
            this.testResults.issues.push(`No test files found in ${dir.path}`);
          }
        } catch (error) {
          this.testResults.issues.push(`Cannot access ${dir.path}: ${error.message}`);
        }
      }
      console.log(`   📊 Total test files: ${this.testResults.totalTests}\n`);
    } catch (error) {
      this.testResults.issues.push(`Error analyzing test structure: ${error.message}`);
    }
  }

  async getTestFiles(dirPath) {
    try {
      const fullPath = path.join(__dirname, dirPath);
      const entries = await fs.readdir(fullPath, { recursive: true });
      return entries.filter(file => file.endsWith('.test.js'));
    } catch (error) {
      return [];
    }
  }

  async checkDependencies() {
    console.log('📦 Checking dependencies...');
    
    const criticalDeps = [
      'vitest',
      'better-sqlite3',
      'express',
      'supertest',
      'uuid'
    ];

    try {
      const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
      const allDeps = { 
        ...packageJson.dependencies, 
        ...packageJson.devDependencies 
      };

      for (const dep of criticalDeps) {
        if (allDeps[dep]) {
          this.testResults.dependencies.available.push(`${dep}@${allDeps[dep]}`);
          console.log(`   ✅ ${dep}: ${allDeps[dep]}`);
        } else {
          this.testResults.dependencies.missing.push(dep);
          this.testResults.issues.push(`Missing dependency: ${dep}`);
          console.log(`   ❌ ${dep}: NOT FOUND`);
        }
      }

      // Check if node_modules exists
      try {
        await fs.access('./node_modules');
        console.log('   ✅ node_modules directory exists');
      } catch {
        this.testResults.issues.push('node_modules directory missing - run npm install');
        console.log('   ❌ node_modules directory missing');
      }
      
      console.log();
    } catch (error) {
      this.testResults.issues.push(`Error reading package.json: ${error.message}`);
    }
  }

  async validateTestFiles() {
    console.log('🧪 Validating test files...');
    
    // Sample test files to validate
    const criticalTestFiles = [
      'tests/setup.js',
      'tests/unit/utils/basic.test.js',
      'tests/unit/services/DatabaseService.test.js',
      'tests/integration/api.test.js'
    ];

    for (const testFile of criticalTestFiles) {
      try {
        const content = await fs.readFile(testFile, 'utf8');
        
        // Basic validation checks
        const hasVitest = content.includes('vitest');
        const hasDescribe = content.includes('describe(');
        const hasExpect = content.includes('expect(');
        
        if (hasVitest && hasDescribe && hasExpect) {
          console.log(`   ✅ ${testFile}: Valid structure`);
        } else {
          const issues = [];
          if (!hasVitest) issues.push('missing vitest imports');
          if (!hasDescribe) issues.push('missing describe blocks');
          if (!hasExpect) issues.push('missing expect assertions');
          
          this.testResults.issues.push(`${testFile}: ${issues.join(', ')}`);
          console.log(`   ⚠️  ${testFile}: ${issues.join(', ')}`);
        }
      } catch (error) {
        this.testResults.issues.push(`Cannot read ${testFile}: ${error.message}`);
        console.log(`   ❌ ${testFile}: Cannot read file`);
      }
    }
    console.log();
  }

  async checkSchemaFiles() {
    console.log('🗃️  Checking database schema files...');
    
    const schemaFiles = [
      'src/database/schema.sql',
      'src/database/graph-schema.sql',
      'src/database/relationship_scoring.sql'
    ];

    for (const schemaFile of schemaFiles) {
      try {
        const content = await fs.readFile(schemaFile, 'utf8');
        
        // Basic SQL validation
        const hasCreateTable = content.includes('CREATE TABLE');
        const hasIndexes = content.includes('CREATE INDEX');
        
        if (hasCreateTable) {
          console.log(`   ✅ ${schemaFile}: Valid SQL schema`);
        } else {
          this.testResults.issues.push(`${schemaFile}: Invalid SQL structure`);
          console.log(`   ❌ ${schemaFile}: Invalid SQL structure`);
        }
      } catch (error) {
        this.testResults.issues.push(`Cannot read ${schemaFile}: ${error.message}`);
        console.log(`   ❌ ${schemaFile}: File not found`);
      }
    }
    console.log();
  }

  async validateConfiguration() {
    console.log('⚙️  Validating test configuration...');
    
    try {
      // Check vitest config
      const vitestConfig = await fs.readFile('./vitest.config.js', 'utf8');
      if (vitestConfig.includes('defineConfig')) {
        console.log('   ✅ vitest.config.js: Valid configuration');
      } else {
        this.testResults.issues.push('vitest.config.js: Invalid configuration');
        console.log('   ❌ vitest.config.js: Invalid configuration');
      }
    } catch (error) {
      this.testResults.issues.push('vitest.config.js: File not found');
      console.log('   ❌ vitest.config.js: File not found');
    }

    try {
      // Check jest config (backup)
      const jestConfig = await fs.readFile('./jest.config.js', 'utf8');
      if (jestConfig.includes('testMatch')) {
        console.log('   ✅ jest.config.js: Valid configuration');
      } else {
        this.testResults.issues.push('jest.config.js: Invalid configuration');
        console.log('   ❌ jest.config.js: Invalid configuration');
      }
    } catch (error) {
      console.log('   ⚠️  jest.config.js: Not found (using vitest)');
    }
    
    console.log();
  }

  generateReport() {
    console.log('📊 TEST SUITE VALIDATION REPORT');
    console.log('================================\n');
    
    console.log('📈 TEST STATISTICS:');
    console.log(`   Total Tests Found: ${this.testResults.totalTests}`);
    console.log(`   Unit Tests: ${this.testResults.unitTests}`);
    console.log(`   Integration Tests: ${this.testResults.integrationTests}`);
    console.log(`   Performance Tests: ${this.testResults.performanceTests}`);
    console.log(`   Security Tests: ${this.testResults.securityTests}\n`);
    
    console.log('📦 DEPENDENCIES:');
    console.log(`   Available: ${this.testResults.dependencies.available.length}`);
    this.testResults.dependencies.available.forEach(dep => 
      console.log(`     ✅ ${dep}`)
    );
    
    if (this.testResults.dependencies.missing.length > 0) {
      console.log(`   Missing: ${this.testResults.dependencies.missing.length}`);
      this.testResults.dependencies.missing.forEach(dep => 
        console.log(`     ❌ ${dep}`)
      );
    }
    console.log();
    
    if (this.testResults.issues.length > 0) {
      console.log('🚨 ISSUES FOUND:');
      this.testResults.issues.forEach((issue, index) => 
        console.log(`   ${index + 1}. ${issue}`)
      );
      console.log();
    } else {
      console.log('✅ NO ISSUES FOUND!\n');
    }
    
    // Overall health assessment
    const healthScore = this.calculateHealthScore();
    console.log('🏥 OVERALL TEST SUITE HEALTH:');
    
    if (healthScore >= 90) {
      console.log(`   🟢 EXCELLENT (${healthScore}%) - Test suite is in great shape!`);
    } else if (healthScore >= 70) {
      console.log(`   🟡 GOOD (${healthScore}%) - Minor issues to address`);
    } else if (healthScore >= 50) {
      console.log(`   🟠 FAIR (${healthScore}%) - Several issues need attention`);
    } else {
      console.log(`   🔴 POOR (${healthScore}%) - Major issues prevent test execution`);
    }
    
    console.log('\n🔧 RECOMMENDED ACTIONS:');
    
    if (this.testResults.dependencies.missing.length > 0) {
      console.log('   1. Install missing dependencies: npm install');
    }
    
    if (this.testResults.totalTests === 0) {
      console.log('   2. Verify test file locations and patterns');
    }
    
    if (this.testResults.issues.some(issue => issue.includes('schema'))) {
      console.log('   3. Check database schema files for syntax errors');
    }
    
    if (this.testResults.issues.length > 5) {
      console.log('   4. Run tests individually to identify specific failures');
    }
    
    console.log('   5. Try running: npm test or npx vitest run');
    console.log('\n✨ Validation complete!');
  }

  calculateHealthScore() {
    let score = 100;
    
    // Deduct points for missing dependencies
    score -= this.testResults.dependencies.missing.length * 15;
    
    // Deduct points for other issues
    score -= Math.min(this.testResults.issues.length * 5, 40);
    
    // Deduct points if no tests found
    if (this.testResults.totalTests === 0) {
      score -= 30;
    }
    
    return Math.max(0, score);
  }
}

// Run validation
const validator = new TestValidator();
validator.run().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});