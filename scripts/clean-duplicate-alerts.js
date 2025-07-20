#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function cleanAlerts() {
  const alertsDir = path.join(process.cwd(), 'data/alerts');
  
  // Process each alert file
  const files = fs.readdirSync(alertsDir).filter(f => f.endsWith('.json'));
  
  files.forEach(file => {
    const filePath = path.join(alertsDir, file);
    const alerts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Remove duplicates based on transaction hash
    const seen = new Set();
    const uniqueAlerts = [];
    
    alerts.forEach(alert => {
      // Create a unique key based on hash or amount+timestamp
      let key;
      if (alert.metadata?.hash) {
        key = alert.metadata.hash;
      } else if (alert.hash) {
        key = alert.hash;
      } else {
        // Fallback: use amount + timestamp + address
        key = `${alert.amount}_${alert.timestamp}_${alert.address}`;
      }
      
      if (!seen.has(key)) {
        seen.add(key);
        
        // Update formatting
        if (alert.amount) {
          alert.amount = Math.floor(alert.amount);
        }
        
        // Update description to remove decimals
        if (alert.description && alert.description.includes(' DOT')) {
          alert.description = alert.description.replace(/[\d,]+\.?\d*\s+DOT/, (match) => {
            const amount = parseFloat(match.replace(/[^\d.]/g, ''));
            return `${Math.floor(amount).toLocaleString()} DOT`;
          });
        }
        
        uniqueAlerts.push(alert);
      }
    });
    
    // Write back if changes were made
    if (alerts.length !== uniqueAlerts.length) {
      fs.writeFileSync(filePath, JSON.stringify(uniqueAlerts, null, 2));
      console.log(`✅ ${file}: Removed ${alerts.length - uniqueAlerts.length} duplicates`);
    } else {
      console.log(`✓ ${file}: No duplicates found`);
    }
  });
}

cleanAlerts();
console.log('\n✅ Alert cleanup complete!');