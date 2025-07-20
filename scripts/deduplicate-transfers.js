#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function deduplicateAlerts() {
  console.log('🔍 Scanning for duplicate transfers across all alert files...\n');
  
  const alertsDir = path.join(process.cwd(), 'data/alerts');
  const allAlerts = [];
  const fileMap = new Map();
  
  // Load all alerts from all files
  const files = fs.readdirSync(alertsDir).filter(f => f.endsWith('.json')).sort();
  
  files.forEach(file => {
    const filePath = path.join(alertsDir, file);
    const alerts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    alerts.forEach((alert, index) => {
      allAlerts.push({ ...alert, _file: file, _index: index });
      
      if (!fileMap.has(file)) {
        fileMap.set(file, alerts);
      }
    });
  });
  
  // Find duplicates based on transaction hash
  const hashMap = new Map();
  const duplicates = [];
  
  allAlerts.forEach(alert => {
    let hash = alert.metadata?.hash || alert.hash;
    
    if (hash) {
      if (hashMap.has(hash)) {
        duplicates.push({ 
          original: hashMap.get(hash), 
          duplicate: alert 
        });
      } else {
        hashMap.set(hash, alert);
      }
    }
  });
  
  console.log(`Found ${duplicates.length} duplicate transfers\n`);
  
  // Show duplicates
  duplicates.forEach(({ original, duplicate }) => {
    console.log(`Duplicate found:`);
    console.log(`  Original: ${original._file} - ${original.description || original.message}`);
    console.log(`  Duplicate: ${duplicate._file} - ${duplicate.description || duplicate.message}`);
    console.log(`  Hash: ${original.metadata?.hash || original.hash}`);
    console.log('');
  });
  
  // Remove duplicates (keep the better formatted one)
  const filesToUpdate = new Set();
  
  duplicates.forEach(({ original, duplicate }) => {
    // Prefer the one with more complete data
    const originalScore = (original.id ? 1 : 0) + 
                         (original.description ? 1 : 0) + 
                         (original.metadata ? 1 : 0) +
                         (original.severity === 'CRITICAL' ? 1 : 0);
    
    const duplicateScore = (duplicate.id ? 1 : 0) + 
                          (duplicate.description ? 1 : 0) + 
                          (duplicate.metadata ? 1 : 0) +
                          (duplicate.severity === 'CRITICAL' ? 1 : 0);
    
    const toRemove = originalScore >= duplicateScore ? duplicate : original;
    
    // Mark for removal
    const fileAlerts = fileMap.get(toRemove._file);
    fileAlerts[toRemove._index] = null; // Mark for removal
    filesToUpdate.add(toRemove._file);
  });
  
  // Update files
  filesToUpdate.forEach(file => {
    const alerts = fileMap.get(file).filter(a => a !== null);
    
    // Also clean up formatting while we're at it
    alerts.forEach(alert => {
      if (alert.amount) {
        alert.amount = Math.floor(alert.amount);
      }
      if (alert.description && alert.description.includes(' DOT')) {
        alert.description = alert.description.replace(/[\d,]+\.?\d*\s+DOT/, (match) => {
          const amount = parseFloat(match.replace(/[^\d.]/g, ''));
          return `${Math.floor(amount).toLocaleString()} DOT`;
        });
      }
    });
    
    const filePath = path.join(alertsDir, file);
    fs.writeFileSync(filePath, JSON.stringify(alerts, null, 2));
    console.log(`✅ Updated ${file}`);
  });
  
  console.log('\n✅ Deduplication complete!');
}

deduplicateAlerts();