#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function cleanOldAlerts() {
    const alertsDir = path.join(__dirname, 'data/alerts');
    
    console.log('🧹 Removing old sample alerts without timestamps...\n');
    
    const files = fs.readdirSync(alertsDir)
        .filter(f => f.endsWith('.json'))
        .sort();
    
    let totalRemoved = 0;
    
    files.forEach(file => {
        const filepath = path.join(alertsDir, file);
        const alerts = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        // Filter out alerts without proper timestamps or with uppercase types
        const cleanedAlerts = alerts.filter(alert => {
            // Keep if it has a valid timestamp
            if (!alert.timestamp) return false;
            
            // Keep if it has a transaction hash (real alert)
            if (alert.metadata && alert.metadata.hash) return true;
            
            // Remove if it has uppercase type (old sample data)
            if (alert.type && alert.type === alert.type.toUpperCase()) {
                totalRemoved++;
                return false;
            }
            
            return true;
        });
        
        if (cleanedAlerts.length !== alerts.length) {
            fs.writeFileSync(filepath, JSON.stringify(cleanedAlerts, null, 2));
            console.log(`✅ ${file}: Removed ${alerts.length - cleanedAlerts.length} old alerts`);
        }
    });
    
    console.log(`\n✅ Total removed: ${totalRemoved} old sample alerts`);
}

// Run the cleanup
cleanOldAlerts();