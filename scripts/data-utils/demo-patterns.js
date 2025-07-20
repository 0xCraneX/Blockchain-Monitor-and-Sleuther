#!/usr/bin/env node

const PatternAnalysisEngine = require('./src/analysis/PatternAnalysisEngine');
const fs = require('fs');
const path = require('path');
const { monitorLogger } = require('./src/utils/simple-logger');

async function demonstratePatternAnalysis() {
    monitorLogger.section('🔍 Pattern Analysis Demonstration');
    
    const engine = new PatternAnalysisEngine();
    
    // Load today's alerts
    const today = new Date().toISOString().split('T')[0];
    const alertsPath = path.join('./data/alerts', today + '.json');
    
    if (!fs.existsSync(alertsPath)) {
        monitorLogger.warn('No alerts found for today');
        return;
    }
    
    const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
    monitorLogger.info(`Loaded ${alerts.length} alerts from today`);
    
    // Group alerts by address
    const alertsByAddress = {};
    alerts.forEach(alert => {
        if (!alert.address) return;
        if (!alertsByAddress[alert.address]) {
            alertsByAddress[alert.address] = [];
        }
        alertsByAddress[alert.address].push(alert);
    });
    
    monitorLogger.section('Analyzing Patterns for Active Addresses');
    
    let totalPatterns = 0;
    const patternTypes = {};
    
    // Analyze patterns for each address
    for (const [address, addressAlerts] of Object.entries(alertsByAddress)) {
        if (addressAlerts.length < 2) continue; // Need multiple alerts for patterns
        
        const patterns = engine.analyzeAddress(address, addressAlerts);
        
        if (patterns.length > 0) {
            monitorLogger.info(`Found ${patterns.length} patterns for ${address.slice(0,8)}...`);
            patterns.forEach(pattern => {
                totalPatterns++;
                patternTypes[pattern.type] = (patternTypes[pattern.type] || 0) + 1;
                
                if (pattern.confidence > 0.7) {
                    monitorLogger.success(`  High confidence ${pattern.type} pattern detected`, {
                        confidence: `${(pattern.confidence * 100).toFixed(0)}%`,
                        details: pattern.details
                    });
                }
            });
        }
    }
    
    monitorLogger.section('Pattern Analysis Summary');
    monitorLogger.info(`Total patterns detected: ${totalPatterns}`);
    monitorLogger.info('Pattern type breakdown:');
    Object.entries(patternTypes).forEach(([type, count]) => {
        monitorLogger.info(`  ${type}: ${count}`);
    });
    
    // Test temporal pattern detection
    monitorLogger.section('Testing Temporal Pattern Detection');
    
    // Find addresses with multiple alerts to analyze
    const activeAddresses = Object.entries(alertsByAddress)
        .filter(([addr, alerts]) => alerts.length >= 3)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5);
    
    activeAddresses.forEach(([address, addressAlerts]) => {
        monitorLogger.info(`\nAnalyzing ${address.slice(0,8)}... (${addressAlerts.length} alerts)`);
        
        // Extract timestamps
        const timestamps = addressAlerts.map(a => new Date(a.timestamp).getTime());
        const hourlyPattern = engine.temporalAnalyzer.analyzeHourlyPattern(timestamps);
        const dailyPattern = engine.temporalAnalyzer.analyzeDailyPattern(timestamps);
        
        if (hourlyPattern.isPattern) {
            monitorLogger.success('  Hourly pattern detected!', {
                peakHours: hourlyPattern.peakHours,
                consistency: `${(hourlyPattern.consistency * 100).toFixed(0)}%`
            });
        }
        
        if (dailyPattern.isPattern) {
            monitorLogger.success('  Daily pattern detected!', {
                peakDays: dailyPattern.peakDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]),
                consistency: `${(dailyPattern.consistency * 100).toFixed(0)}%`
            });
        }
    });
    
    // Test burst detection
    monitorLogger.section('Testing Burst Activity Detection');
    
    activeAddresses.forEach(([address, addressAlerts]) => {
        const alerts = addressAlerts.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );
        
        // Check for bursts
        let bursts = 0;
        for (let i = 1; i < alerts.length; i++) {
            const timeDiff = new Date(alerts[i].timestamp) - new Date(alerts[i-1].timestamp);
            if (timeDiff < 3600000) { // Less than 1 hour
                bursts++;
            }
        }
        
        if (bursts > 0) {
            monitorLogger.warn(`  ${address.slice(0,8)}... has ${bursts} burst activities`);
        }
    });
}

// Run the demonstration
demonstratePatternAnalysis().catch(console.error);