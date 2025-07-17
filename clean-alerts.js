#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the alerts file
const alertsPath = path.join(__dirname, 'data/alerts/2025-07-17.json');
const alertsData = fs.readFileSync(alertsPath, 'utf8');
const alerts = JSON.parse(alertsData);

// Filter for real alerts (those with transaction hashes)
const realAlerts = [];

alerts.forEach(alert => {
  // Check if it's a nested object with numbered keys (from real transfer fetcher)
  if (typeof alert === 'object' && !Array.isArray(alert) && !alert.type) {
    // This is the nested real alerts object
    Object.values(alert).forEach(realAlert => {
      if (realAlert.metadata && realAlert.metadata.hash) {
        realAlerts.push(realAlert);
      }
    });
  } else if (alert.metadata && alert.metadata.hash) {
    // This is already a real alert
    realAlerts.push(alert);
  }
  // Skip fictional alerts (those without transaction hashes)
});

console.log(`Found ${realAlerts.length} real blockchain alerts`);
console.log('\nSample real alerts:');
realAlerts.slice(0, 3).forEach(alert => {
  console.log(`- ${alert.description} (hash: ${alert.metadata.hash.substring(0, 10)}...)`);
});

// Save cleaned alerts
fs.writeFileSync(alertsPath, JSON.stringify(realAlerts, null, 2));
console.log(`\nSaved ${realAlerts.length} real alerts to ${alertsPath}`);