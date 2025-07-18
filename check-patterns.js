#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load today's alerts
const today = new Date().toISOString().split('T')[0];
const alertsPath = path.join('./data/alerts', today + '.json');

if (fs.existsSync(alertsPath)) {
    const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
    console.log('Total alerts today:', alerts.length);
    
    // Count pattern types
    const patterns = {};
    alerts.forEach(alert => {
        const type = alert.type || alert.pattern || 'unknown';
        patterns[type] = (patterns[type] || 0) + 1;
    });
    
    console.log('\nPattern breakdown:');
    Object.entries(patterns).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });
    
    // Show example alerts with patterns
    console.log('\nExample alerts with patterns:');
    alerts
        .filter(a => a.type && a.type !== 'unknown')
        .slice(0, 10)
        .forEach(alert => {
            console.log(`  - ${alert.type}: ${alert.address?.slice(0,8)}... (${alert.amount} DOT) - ${alert.title || alert.type}`);
        });
        
    // Check for temporal patterns
    console.log('\nChecking temporal patterns:');
    const patternAlerts = alerts.filter(a => a.metadata && a.metadata.pattern);
    console.log(`  Alerts with pattern metadata: ${patternAlerts.length}`);
    
    if (patternAlerts.length > 0) {
        console.log('\nPattern metadata examples:');
        patternAlerts.slice(0, 3).forEach(alert => {
            console.log(`  - ${alert.address?.slice(0,8)}...`);
            console.log(`    Pattern: ${alert.metadata.pattern.type}`);
            console.log(`    Confidence: ${alert.metadata.pattern.confidence}`);
            if (alert.metadata.pattern.details) {
                console.log(`    Details: ${JSON.stringify(alert.metadata.pattern.details)}`);
            }
        });
    }
} else {
    console.log('No alerts for today found');
}