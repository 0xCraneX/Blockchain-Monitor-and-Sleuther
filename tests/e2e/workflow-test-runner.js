#!/usr/bin/env node

/**
 * Comprehensive Workflow Test Runner
 * 
 * Executes all user workflow tests and generates detailed reports
 * about success rates, performance metrics, and user experience issues.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');

const execAsync = promisify(exec);

// Test configuration
const TEST_CONFIG = {
  browsers: ['chromium', 'firefox', 'webkit'],
  retries: 2,
  timeout: 300000, // 5 minutes total timeout
  outputDir: path.join(__dirname, '../../test-results'),
  reportDir: path.join(__dirname, '../../test-reports')
};

// Workflow categories
const WORKFLOWS = {
  investigation: {
    name: 'Investigation Workflow',
    tests: [
      'should complete full investigation workflow',
      'should detect patterns in relationships'
    ],
    metrics: ['search_time', 'graph_load_time', 'export_time']
  },
  analysis: {
    name: 'Analysis Workflow',
    tests: [
      'should import known addresses and analyze'
    ],
    metrics: ['import_time', 'analysis_time', 'report_generation_time']
  },
  monitoring: {
    name: 'Real-time Monitoring',
    tests: [
      'should handle real-time address monitoring',
      'should display live graph updates'
    ],
    metrics: ['websocket_latency', 'update_frequency', 'reconnection_time']
  },
  dataManagement: {
    name: 'Data Management',
    tests: [
      'should handle bulk import of addresses',
      'should export large datasets',
      'should backup and restore investigations',
      'should clean up old data'
    ],
    metrics: ['bulk_import_rate', 'export_size', 'backup_time']
  },
  errorRecovery: {
    name: 'Error Recovery',
    tests: [
      'should recover from server restart',
      'should handle database connection loss',
      'should handle blockchain RPC failures',
      'should validate and handle invalid data'
    ],
    metrics: ['recovery_time', 'error_rate', 'retry_success_rate']
  },
  performance: {
    name: 'Performance Under Load',
    tests: [
      'should handle multiple concurrent operations',
      'should handle large graph visualizations'
    ],
    metrics: ['concurrent_ops_time', 'large_graph_render_time', 'memory_usage']
  }
};

class WorkflowTestRunner {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      workflows: {},
      browserResults: {},
      performance: {},
      userExperience: {
        issues: [],
        recommendations: []
      }
    };
  }

  async run() {
    console.log('🚀 Starting Comprehensive Workflow Tests...\n');
    
    const startTime = Date.now();
    
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Run tests for each browser
      for (const browser of TEST_CONFIG.browsers) {
        await this.runBrowserTests(browser);
      }
      
      // Analyze results
      await this.analyzeResults();
      
      // Generate comprehensive report
      await this.generateReport();
      
      this.results.summary.duration = Date.now() - startTime;
      
      console.log('\n✅ All workflow tests completed!');
      console.log(`📊 Total duration: ${this.formatDuration(this.results.summary.duration)}`);
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      this.results.error = error.message;
    }
    
    // Save final results
    await this.saveResults();
  }

  async ensureDirectories() {
    await fs.mkdir(TEST_CONFIG.outputDir, { recursive: true });
    await fs.mkdir(TEST_CONFIG.reportDir, { recursive: true });
  }

  async runBrowserTests(browser) {
    console.log(`\n🌐 Running tests on ${browser}...`);
    
    const browserStartTime = Date.now();
    const command = `npx playwright test tests/e2e/complete-workflow-test.spec.js --project=${browser} --reporter=json`;
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: `${browser}-results.json` }
      });
      
      // Parse test results
      const resultsPath = path.join(TEST_CONFIG.outputDir, `${browser}-results.json`);
      const results = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
      
      this.results.browserResults[browser] = {
        duration: Date.now() - browserStartTime,
        stats: results.stats,
        tests: this.parseTestResults(results)
      };
      
      console.log(`✅ ${browser} tests completed in ${this.formatDuration(Date.now() - browserStartTime)}`);
      
    } catch (error) {
      console.error(`❌ ${browser} tests failed:`, error.message);
      this.results.browserResults[browser] = {
        error: error.message,
        duration: Date.now() - browserStartTime
      };
    }
  }

  parseTestResults(playwrightResults) {
    const testMap = {};
    
    if (playwrightResults.suites) {
      this.extractTests(playwrightResults.suites, testMap);
    }
    
    return testMap;
  }

  extractTests(suites, testMap, parentTitle = '') {
    for (const suite of suites) {
      const suiteTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
      
      if (suite.specs) {
        for (const spec of suite.specs) {
          testMap[spec.title] = {
            title: spec.title,
            suite: suiteTitle,
            status: spec.tests?.[0]?.status || 'unknown',
            duration: spec.tests?.[0]?.duration || 0,
            error: spec.tests?.[0]?.error
          };
        }
      }
      
      if (suite.suites) {
        this.extractTests(suite.suites, testMap, suiteTitle);
      }
    }
  }

  async analyzeResults() {
    console.log('\n📊 Analyzing test results...');
    
    // Aggregate results across browsers
    for (const [workflowKey, workflow] of Object.entries(WORKFLOWS)) {
      const workflowResults = {
        name: workflow.name,
        tests: {},
        metrics: {},
        issues: [],
        successRate: 0
      };
      
      // Check each test in the workflow
      for (const testName of workflow.tests) {
        const testResults = {
          browsers: {},
          overallStatus: 'passed'
        };
        
        for (const [browser, browserResult] of Object.entries(this.results.browserResults)) {
          if (browserResult.tests && browserResult.tests[testName]) {
            testResults.browsers[browser] = browserResult.tests[testName];
            
            if (browserResult.tests[testName].status !== 'passed') {
              testResults.overallStatus = 'failed';
              workflowResults.issues.push({
                test: testName,
                browser: browser,
                error: browserResult.tests[testName].error
              });
            }
          }
        }
        
        workflowResults.tests[testName] = testResults;
      }
      
      // Calculate success rate
      const totalTests = workflow.tests.length * TEST_CONFIG.browsers.length;
      const passedTests = Object.values(workflowResults.tests)
        .reduce((count, test) => {
          return count + Object.values(test.browsers)
            .filter(b => b.status === 'passed').length;
        }, 0);
      
      workflowResults.successRate = (passedTests / totalTests * 100).toFixed(2);
      
      this.results.workflows[workflowKey] = workflowResults;
    }
    
    // Analyze performance metrics
    await this.analyzePerformance();
    
    // Identify UX issues
    this.identifyUXIssues();
  }

  async analyzePerformance() {
    // Extract performance metrics from test logs
    const metricsPath = path.join(TEST_CONFIG.outputDir, 'performance-metrics.json');
    
    try {
      const metrics = JSON.parse(await fs.readFile(metricsPath, 'utf8').catch(() => '{}'));
      
      this.results.performance = {
        averageSearchTime: metrics.searchTime || 'N/A',
        averageGraphLoadTime: metrics.graphLoadTime || 'N/A',
        websocketLatency: metrics.websocketLatency || 'N/A',
        memoryUsage: metrics.memoryUsage || 'N/A',
        recommendations: []
      };
      
      // Add performance recommendations
      if (metrics.searchTime > 2000) {
        this.results.performance.recommendations.push(
          'Search performance is slow (>2s). Consider implementing caching or optimizing database queries.'
        );
      }
      
      if (metrics.graphLoadTime > 5000) {
        this.results.performance.recommendations.push(
          'Graph loading is slow (>5s). Consider implementing progressive loading or data pagination.'
        );
      }
      
    } catch (error) {
      console.warn('⚠️  Could not load performance metrics:', error.message);
    }
  }

  identifyUXIssues() {
    const issues = [];
    const recommendations = [];
    
    // Check for consistent failures across browsers
    for (const [workflowKey, workflow] of Object.entries(this.results.workflows)) {
      if (workflow.successRate < 90) {
        issues.push(`${workflow.name} has low success rate: ${workflow.successRate}%`);
        
        // Specific recommendations based on workflow
        if (workflowKey === 'errorRecovery') {
          recommendations.push('Improve error handling and user feedback mechanisms');
        } else if (workflowKey === 'monitoring') {
          recommendations.push('Enhance WebSocket connection stability and reconnection logic');
        }
      }
      
      // Check for browser-specific issues
      const browserIssues = {};
      for (const issue of workflow.issues) {
        browserIssues[issue.browser] = (browserIssues[issue.browser] || 0) + 1;
      }
      
      for (const [browser, count] of Object.entries(browserIssues)) {
        if (count > 2) {
          issues.push(`Multiple failures in ${browser} for ${workflow.name}`);
          recommendations.push(`Test and optimize ${workflow.name} specifically for ${browser}`);
        }
      }
    }
    
    // General UX recommendations
    if (this.results.performance.averageSearchTime > 1000) {
      recommendations.push('Add loading indicators for search operations');
    }
    
    if (this.results.workflows.dataManagement?.issues.length > 0) {
      recommendations.push('Improve feedback for bulk operations and provide progress indicators');
    }
    
    this.results.userExperience = { issues, recommendations };
  }

  async generateReport() {
    console.log('\n📝 Generating comprehensive test report...');
    
    const reportContent = this.generateMarkdownReport();
    const reportPath = path.join(TEST_CONFIG.reportDir, `workflow-test-report-${Date.now()}.md`);
    
    await fs.writeFile(reportPath, reportContent);
    console.log(`✅ Report saved to: ${reportPath}`);
    
    // Also generate HTML report
    const htmlReport = this.generateHTMLReport();
    const htmlPath = path.join(TEST_CONFIG.reportDir, `workflow-test-report-${Date.now()}.html`);
    
    await fs.writeFile(htmlPath, htmlReport);
    console.log(`✅ HTML report saved to: ${htmlPath}`);
  }

  generateMarkdownReport() {
    let report = `# Polkadot Analysis Tool - Comprehensive Workflow Test Report

**Generated:** ${this.results.timestamp}
**Platform:** ${this.results.environment.platform} (${this.results.environment.arch})
**Node Version:** ${this.results.environment.node}

## Executive Summary

Total Tests Run: ${this.results.summary.totalTests || 'N/A'}
Overall Success Rate: ${this.calculateOverallSuccessRate()}%
Total Duration: ${this.formatDuration(this.results.summary.duration)}

## Workflow Test Results

`;

    // Add workflow results
    for (const [key, workflow] of Object.entries(this.results.workflows)) {
      report += `### ${workflow.name}

**Success Rate:** ${workflow.successRate}%
**Issues Found:** ${workflow.issues.length}

#### Test Results:
`;

      for (const [testName, testResult] of Object.entries(workflow.tests)) {
        report += `- **${testName}**: ${testResult.overallStatus === 'passed' ? '✅ Passed' : '❌ Failed'}\n`;
        
        if (testResult.overallStatus !== 'passed') {
          for (const [browser, result] of Object.entries(testResult.browsers)) {
            if (result.status !== 'passed') {
              report += `  - ${browser}: ${result.error || 'Unknown error'}\n`;
            }
          }
        }
      }
      
      if (workflow.issues.length > 0) {
        report += `\n#### Issues:\n`;
        workflow.issues.forEach(issue => {
          report += `- ${issue.test} failed in ${issue.browser}\n`;
        });
      }
      
      report += '\n';
    }

    // Add performance section
    report += `## Performance Metrics

- Average Search Time: ${this.results.performance.averageSearchTime}
- Average Graph Load Time: ${this.results.performance.averageGraphLoadTime}
- WebSocket Latency: ${this.results.performance.websocketLatency}
- Memory Usage: ${this.results.performance.memoryUsage}

`;

    // Add UX issues and recommendations
    report += `## User Experience Analysis

### Issues Identified:
`;
    
    if (this.results.userExperience.issues.length > 0) {
      this.results.userExperience.issues.forEach(issue => {
        report += `- ${issue}\n`;
      });
    } else {
      report += '- No significant UX issues identified\n';
    }

    report += `\n### Recommendations:
`;
    
    if (this.results.userExperience.recommendations.length > 0) {
      this.results.userExperience.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
    } else {
      report += '- No specific recommendations at this time\n';
    }

    // Add browser compatibility
    report += `\n## Browser Compatibility

`;
    
    for (const [browser, result] of Object.entries(this.results.browserResults)) {
      if (result.error) {
        report += `- **${browser}**: ❌ Failed to run tests (${result.error})\n`;
      } else if (result.stats) {
        const passRate = (result.stats.expected / result.stats.total * 100).toFixed(2);
        report += `- **${browser}**: ${passRate}% pass rate (${result.stats.expected}/${result.stats.total} tests)\n`;
      }
    }

    return report;
  }

  generateHTMLReport() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Test Report - Polkadot Analysis Tool</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #e91e63; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 30px; }
        h3 { color: #666; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .success { color: #4caf50; }
        .failure { color: #f44336; }
        .warning { color: #ff9800; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .workflow { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .test-result { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 3px; }
        .passed { border-left: 4px solid #4caf50; }
        .failed { border-left: 4px solid #f44336; }
        .issues { background: #ffebee; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .recommendations { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .progress-bar { width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: #4caf50; transition: width 0.3s ease; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Polkadot Analysis Tool - Workflow Test Report</h1>
        
        <div class="summary">
            <h2>Executive Summary</h2>
            <div class="metric"><strong>Generated:</strong> ${this.results.timestamp}</div>
            <div class="metric"><strong>Platform:</strong> ${this.results.environment.platform}</div>
            <div class="metric"><strong>Success Rate:</strong> <span class="${this.calculateOverallSuccessRate() > 90 ? 'success' : 'failure'}">${this.calculateOverallSuccessRate()}%</span></div>
            <div class="metric"><strong>Duration:</strong> ${this.formatDuration(this.results.summary.duration)}</div>
        </div>

        <h2>Workflow Test Results</h2>
        ${this.generateHTMLWorkflowResults()}

        <h2>Browser Compatibility</h2>
        ${this.generateHTMLBrowserResults()}

        <h2>Performance Metrics</h2>
        ${this.generateHTMLPerformanceMetrics()}

        <h2>User Experience Analysis</h2>
        ${this.generateHTMLUXAnalysis()}
    </div>
</body>
</html>`;
  }

  generateHTMLWorkflowResults() {
    let html = '';
    
    for (const [key, workflow] of Object.entries(this.results.workflows)) {
      const successClass = workflow.successRate > 90 ? 'success' : workflow.successRate > 70 ? 'warning' : 'failure';
      
      html += `
        <div class="workflow">
            <h3>${workflow.name}</h3>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${workflow.successRate}%"></div>
            </div>
            <p>Success Rate: <span class="${successClass}">${workflow.successRate}%</span></p>
            
            <h4>Test Results:</h4>
            ${Object.entries(workflow.tests).map(([testName, result]) => `
                <div class="test-result ${result.overallStatus}">
                    <strong>${testName}</strong>: ${result.overallStatus === 'passed' ? '✅ Passed' : '❌ Failed'}
                </div>
            `).join('')}
            
            ${workflow.issues.length > 0 ? `
                <div class="issues">
                    <h4>Issues Found:</h4>
                    <ul>
                        ${workflow.issues.map(issue => `<li>${issue.test} failed in ${issue.browser}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
      `;
    }
    
    return html;
  }

  generateHTMLBrowserResults() {
    return `
        <table>
            <thead>
                <tr>
                    <th>Browser</th>
                    <th>Status</th>
                    <th>Pass Rate</th>
                    <th>Duration</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(this.results.browserResults).map(([browser, result]) => `
                    <tr>
                        <td>${browser}</td>
                        <td>${result.error ? '❌ Failed' : '✅ Success'}</td>
                        <td>${result.stats ? `${(result.stats.expected / result.stats.total * 100).toFixed(2)}%` : 'N/A'}</td>
                        <td>${this.formatDuration(result.duration)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
  }

  generateHTMLPerformanceMetrics() {
    const perf = this.results.performance;
    return `
        <table>
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Average Search Time</td>
                    <td>${perf.averageSearchTime}</td>
                    <td>${perf.averageSearchTime < 2000 ? '✅' : '⚠️'}</td>
                </tr>
                <tr>
                    <td>Average Graph Load Time</td>
                    <td>${perf.averageGraphLoadTime}</td>
                    <td>${perf.averageGraphLoadTime < 5000 ? '✅' : '⚠️'}</td>
                </tr>
                <tr>
                    <td>WebSocket Latency</td>
                    <td>${perf.websocketLatency}</td>
                    <td>${perf.websocketLatency < 100 ? '✅' : '⚠️'}</td>
                </tr>
                <tr>
                    <td>Memory Usage</td>
                    <td>${perf.memoryUsage}</td>
                    <td>-</td>
                </tr>
            </tbody>
        </table>
    `;
  }

  generateHTMLUXAnalysis() {
    const ux = this.results.userExperience;
    return `
        ${ux.issues.length > 0 ? `
            <div class="issues">
                <h3>Issues Identified:</h3>
                <ul>
                    ${ux.issues.map(issue => `<li>${issue}</li>`).join('')}
                </ul>
            </div>
        ` : '<p class="success">✅ No significant UX issues identified</p>'}
        
        ${ux.recommendations.length > 0 ? `
            <div class="recommendations">
                <h3>Recommendations:</h3>
                <ul>
                    ${ux.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
    `;
  }

  calculateOverallSuccessRate() {
    const totalTests = Object.values(this.results.workflows)
      .reduce((sum, w) => sum + Object.keys(w.tests).length, 0) * TEST_CONFIG.browsers.length;
    
    const passedTests = Object.values(this.results.workflows)
      .reduce((sum, w) => {
        return sum + Object.values(w.tests)
          .reduce((testSum, test) => {
            return testSum + Object.values(test.browsers || {})
              .filter(b => b.status === 'passed').length;
          }, 0);
      }, 0);
    
    return totalTests > 0 ? (passedTests / totalTests * 100).toFixed(2) : 0;
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  async saveResults() {
    const resultsPath = path.join(TEST_CONFIG.reportDir, 'workflow-test-results.json');
    await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📁 Full results saved to: ${resultsPath}`);
  }
}

// Run the test runner
if (require.main === module) {
  const runner = new WorkflowTestRunner();
  runner.run().catch(console.error);
}

module.exports = WorkflowTestRunner;