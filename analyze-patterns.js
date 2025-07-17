#!/usr/bin/env node

const PatternAnalysisEngine = require('./src/analysis/PatternAnalysisEngine');
const { monitorLogger } = require('./src/utils/simple-logger');

async function main() {
  monitorLogger.section('🧠 Blockchain Pattern Analysis');
  
  try {
    // Initialize pattern analysis engine
    const engine = new PatternAnalysisEngine({
      dataPath: './data',
      lookbackDays: 7,
      minSignificanceThreshold: 0.2
    });
    
    // Run comprehensive pattern analysis
    const results = await engine.analyzePatterns();
    
    // Display results
    console.log('\n📊 Pattern Analysis Results\n');
    console.log('='.repeat(50));
    
    // Temporal Patterns
    if (results.patterns.temporal.hourly) {
      console.log('\n⏰ Temporal Patterns:');
      console.log(`  Peak Hours: ${results.patterns.temporal.peaks.hourly.map(p => `${p.hour}:00 (${p.count} alerts)`).join(', ')}`);
      console.log(`  Quiet Hours: ${results.patterns.temporal.quietPeriods.hourly.join(', ')}`);
      
      if (results.patterns.temporal.peaks.daily.length > 0) {
        console.log(`  Peak Days: ${results.patterns.temporal.peaks.daily.map(p => `${p.day} (${p.count} alerts)`).join(', ')}`);
      }
    }
    
    // Behavioral Patterns
    if (results.patterns.behavioral.topActive) {
      console.log('\n👥 Account Behavior Patterns:');
      console.log(`  Total Accounts Analyzed: ${results.patterns.behavioral.accountProfiles}`);
      
      console.log('\n  Top Active Accounts:');
      results.patterns.behavioral.topActive.slice(0, 5).forEach((account, idx) => {
        console.log(`    ${idx + 1}. ${account.address}: ${account.frequency} alerts, ${account.totalVolume.toLocaleString()} DOT`);
      });
      
      console.log('\n  Behavior Types:');
      Object.entries(results.patterns.behavioral.behaviorTypes).forEach(([type, accounts]) => {
        console.log(`    ${type}: ${accounts.length} accounts`);
      });
      
      if (results.patterns.behavioral.suspiciousPatterns.length > 0) {
        console.log('\n  🚨 Suspicious Patterns:');
        results.patterns.behavioral.suspiciousPatterns.forEach(pattern => {
          console.log(`    ${pattern.address}: ${pattern.reason}`);
        });
      }
    }
    
    // Baseline Metrics
    if (results.patterns.baseline.volume) {
      console.log('\n📈 Activity Baselines:');
      const vol = results.patterns.baseline.volume;
      console.log(`  Average Volume: ${Math.round(vol.average).toLocaleString()} DOT`);
      console.log(`  Median Volume: ${Math.round(vol.median).toLocaleString()} DOT`);
      console.log(`  95th Percentile: ${Math.round(vol.p95).toLocaleString()} DOT`);
      console.log(`  99th Percentile: ${Math.round(vol.p99).toLocaleString()} DOT`);
      
      const freq = results.patterns.baseline.frequency;
      console.log(`  Total Alerts: ${freq.totalAlerts}`);
      console.log(`  Average per Day: ${Math.round(freq.avgPerDay * 100) / 100}`);
      
      console.log('\n  Alert Type Distribution:');
      Object.entries(results.patterns.baseline.types).forEach(([type, data]) => {
        console.log(`    ${type}: ${data.count} alerts (${data.percentage}%)`);
      });
    }
    
    // Insights
    if (results.insights.length > 0) {
      console.log('\n🔍 Key Insights:');
      results.insights.forEach((insight, idx) => {
        const emoji = insight.significance === 'high' ? '🚨' : insight.significance === 'medium' ? '⚠️' : 'ℹ️';
        console.log(`  ${emoji} ${insight.message}`);
      });
    }
    
    // Anomaly Thresholds
    if (results.patterns.baseline.anomalyThresholds) {
      console.log('\n🎯 Anomaly Detection Thresholds:');
      const thresholds = results.patterns.baseline.anomalyThresholds;
      console.log(`  High Volume Alert: >${Math.round(thresholds.volume.high).toLocaleString()} DOT`);
      console.log(`  Extreme Volume Alert: >${Math.round(thresholds.volume.extreme).toLocaleString()} DOT`);
      
      if (thresholds.frequency.rapidFire) {
        console.log(`  Rapid-fire Activity: <${Math.round(thresholds.frequency.rapidFire)} minutes between alerts`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Analysis completed on ${results.summary.keyFindings.length} key findings`);
    
    // Test alert evaluation
    console.log('\n🧪 Testing Alert Evaluation:');
    
    // Create test alerts to see how they're classified
    const testAlerts = [
      { amount: 50000, timestamp: new Date().toISOString(), type: 'whale_movement' },
      { amount: 500000, timestamp: new Date().toISOString(), type: 'large_transfer' },
      { amount: 15000, timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), type: 'exchange_activity' } // 6 hours ago
    ];
    
    testAlerts.forEach((alert, idx) => {
      const evaluation = engine.evaluateAlert(alert);
      console.log(`  Test Alert ${idx + 1}: ${alert.amount.toLocaleString()} DOT`);
      console.log(`    Anomalous: ${evaluation.isAnomalous ? '🚨 YES' : '✅ NO'}`);
      console.log(`    Reason: ${evaluation.reasons}`);
    });
    
  } catch (error) {
    monitorLogger.error('Pattern analysis failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };