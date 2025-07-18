#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function dedupeAlerts() {
    const alertsDir = path.join(__dirname, 'data/alerts');
    
    console.log('🔍 Removing duplicate alerts...\n');
    
    const files = fs.readdirSync(alertsDir)
        .filter(f => f.endsWith('.json'))
        .sort();
    
    let totalDupes = 0;
    
    files.forEach(file => {
        const filepath = path.join(alertsDir, file);
        const alerts = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        // Use a Map to keep only unique alerts by ID
        const uniqueAlerts = new Map();
        let dupeCount = 0;
        
        alerts.forEach(alert => {
            if (alert.id) {
                if (!uniqueAlerts.has(alert.id)) {
                    uniqueAlerts.set(alert.id, alert);
                } else {
                    dupeCount++;
                }
            }
        });
        
        if (dupeCount > 0) {
            // Convert map values back to array and save
            const deduped = Array.from(uniqueAlerts.values());
            // Sort by timestamp to maintain order
            deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            fs.writeFileSync(filepath, JSON.stringify(deduped, null, 2));
            console.log(`✅ ${file}: Removed ${dupeCount} duplicates (${deduped.length} unique alerts remain)`);
            totalDupes += dupeCount;
        } else {
            console.log(`✓  ${file}: No duplicates found (${alerts.length} alerts)`);
        }
    });
    
    console.log(`\n✅ Total removed: ${totalDupes} duplicate alerts`);
}

// Run the deduplication
dedupeAlerts();