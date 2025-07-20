#!/usr/bin/env node

const NoiseFilter = require('./src/analysis/NoiseFilter');
const { monitorLogger } = require('./src/utils/simple-logger');
const fs = require('fs').promises;
const path = require('path');

async function loadTestAlerts() {
  try {
    const alertsPath = path.join('./data/alerts/2025-07-17.json');
    const data = await fs.readFile(alertsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    monitorLogger.error('Failed to load test alerts', error);
    return [];
  }
}

async function main() {
  monitorLogger.section('🧹 Noise Filter Testing');
  
  try {
    // Initialize noise filter
    const filter = new NoiseFilter({
      dataPath: './data',
      noiseThreshold: 0.3, // Start with 30% threshold
      exchangeActivityWeight: 0.7,
      temporalWeight: 0.2,
      volumeWeight: 0.1
    });
    
    await filter.initialize();
    
    // Load test alerts
    const testAlerts = await loadTestAlerts();
    
    if (testAlerts.length === 0) {
      console.log('❌ No test alerts found');
      return;
    }
    
    console.log(`\n📊 Testing with ${testAlerts.length} alerts\n`);
    console.log('='.repeat(60));
    
    // Test with different threshold levels
    const thresholds = [0.1, 0.3, 0.5, 0.7];
    
    for (const threshold of thresholds) {
      console.log(`\n🎯 Testing with threshold: ${threshold}`);
      filter.adjustSensitivity(threshold);
      
      const results = await filter.filterAlerts(testAlerts);
      
      console.log(`  Signal alerts: ${results.signal.length}`);
      console.log(`  Noise alerts: ${results.noise.length}`);
      console.log(`  Signal ratio: ${results.stats.signalPercentage}%`);
      
      // Show top signal alerts
      if (results.signal.length > 0) {
        console.log(`\n  📈 Top Signal Alerts:`);
        results.signal
          .sort((a, b) => (a.noiseScore || 1) - (b.noiseScore || 1))
          .slice(0, 3)
          .forEach((alert, idx) => {
            console.log(`    ${idx + 1}. ${alert.amount?.toLocaleString() || 'N/A'} DOT - ${alert.type} (noise: ${Math.round((alert.noiseScore || 0) * 100)}%)`);
            console.log(`       Reason: ${alert.filterReason}`);
          });
      }
      
      // Show noise breakdown
      if (results.noise.length > 0) {
        console.log(`\n  🗑️  Noise Breakdown:`);
        const noiseByReason = {};
        results.noise.forEach(alert => {
          const reason = alert.filterReason.split(',')[0].trim();
          noiseByReason[reason] = (noiseByReason[reason] || 0) + 1;
        });
        
        Object.entries(noiseByReason)
          .sort((a, b) => b[1] - a[1])
          .forEach(([reason, count]) => {
            console.log(`    ${reason}: ${count} alerts`);
          });
      }
    }
    
    // Reset to recommended threshold
    console.log('\n' + '='.repeat(60));
    console.log('\n🤖 Analyzing Optimal Threshold');
    
    filter.adjustSensitivity(0.3); // Reset to default
    const results = await filter.filterAlerts(testAlerts);
    const recommendation = filter.getRecommendedThreshold();
    
    console.log(`Current threshold: 0.3`);
    console.log(`Recommended threshold: ${recommendation.threshold}`);
    console.log(`Reason: ${recommendation.reason}`);
    
    // Test with recommended threshold
    if (recommendation.threshold !== 0.3) {
      console.log(`\n🎯 Testing with recommended threshold: ${recommendation.threshold}`);
      filter.adjustSensitivity(recommendation.threshold);
      const optimalResults = await filter.filterAlerts(testAlerts);
      
      console.log(`  Signal alerts: ${optimalResults.signal.length}`);
      console.log(`  Noise alerts: ${optimalResults.noise.length}`);
      console.log(`  Signal ratio: ${optimalResults.stats.signalPercentage}%`);
    }
    
    // Show detailed analysis for a few example alerts
    console.log('\n📋 Detailed Analysis Examples:');
    
    const examples = testAlerts.slice(0, 5);
    for (let i = 0; i < examples.length; i++) {
      const alert = examples[i];
      const filtered = await filter.filterAlerts([alert]);
      const classification = filtered.signal.length > 0 ? filtered.signal[0] : filtered.noise[0];
      
      console.log(`\n  Alert ${i + 1}: ${alert.amount?.toLocaleString() || 'N/A'} DOT`);
      console.log(`    Type: ${alert.type}`);
      console.log(`    Time: ${new Date(alert.timestamp).toLocaleTimeString()} UTC`);
      console.log(`    Classification: ${filtered.signal.length > 0 ? '📈 SIGNAL' : '🗑️  NOISE'}`);
      console.log(`    Noise Score: ${Math.round((classification.noiseScore || 0) * 100)}%`);
      console.log(`    Reason: ${classification.filterReason}`);
      
      if (classification.anomalyDetails) {
        console.log(`    Anomaly Score: ${classification.anomalyDetails.anomalyScore}`);
        console.log(`    Anomaly Reasons: ${classification.anomalyDetails.reasons}`);
      }
    }
    
    // Export analysis
    const analysis = filter.exportAnalysis();
    console.log('\n📊 Filter Analysis Summary:');
    console.log(`  Baseline last updated: ${analysis.baseline?.lastUpdate || 'Never'}`);
    console.log(`  Total processed: ${analysis.stats.totalProcessed}`);
    console.log(`  Signal percentage: ${analysis.stats.signalPercentage}%`);
    console.log(`  Recommended threshold: ${analysis.recommendation.threshold} (${analysis.recommendation.reason})`);
    
    console.log('\n✅ Noise filter testing completed');
    
  } catch (error) {
    monitorLogger.error('Noise filter testing failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };