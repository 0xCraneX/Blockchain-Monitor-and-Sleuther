#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fixAlertStructure() {
    const alertsDir = path.join(__dirname, 'data/alerts');
    
    console.log('🔧 Fixing alert file structures...\n');
    
    const files = fs.readdirSync(alertsDir)
        .filter(f => f.endsWith('.json'))
        .sort();
    
    let totalFixed = 0;
    let totalAlerts = 0;
    
    files.forEach(file => {
        const filepath = path.join(alertsDir, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        if (!Array.isArray(data)) {
            console.log(`❌ ${file}: Not an array, skipping`);
            return;
        }
        
        let fixed = false;
        const cleanedAlerts = [];
        
        data.forEach(item => {
            // Check if it's a nested structure
            if (item && typeof item === 'object' && !item.id && !item.type) {
                // This is a nested object, extract the actual alerts
                Object.values(item).forEach(alert => {
                    if (alert && alert.id) {
                        cleanedAlerts.push(alert);
                        fixed = true;
                    }
                });
            } else if (item && item.id) {
                // This is already a proper alert
                cleanedAlerts.push(item);
            }
        });
        
        if (fixed) {
            // Save the cleaned alerts
            fs.writeFileSync(filepath, JSON.stringify(cleanedAlerts, null, 2));
            console.log(`✅ ${file}: Fixed ${cleanedAlerts.length} alerts`);
            totalFixed++;
        } else {
            console.log(`✓  ${file}: Already clean (${cleanedAlerts.length} alerts)`);
        }
        
        totalAlerts += cleanedAlerts.length;
    });
    
    console.log(`\n✅ Fixed ${totalFixed} files, total ${totalAlerts} alerts`);
}

// Run the fix
fixAlertStructure();