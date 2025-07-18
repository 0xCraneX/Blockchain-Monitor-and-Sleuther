#!/usr/bin/env node

const fetch = require('node-fetch');

async function debugRefresh() {
    console.log('🔍 Testing Refresh Button Functionality\n');
    
    const baseUrl = 'http://localhost:3003';
    
    // Test 1: Check /api/current
    console.log('1. Testing /api/current endpoint:');
    try {
        const response = await fetch(`${baseUrl}/api/current`);
        const data = await response.json();
        console.log('✅ Success:', data.success);
        console.log('   Accounts monitored:', data.data?.accountsMonitored || 0);
        console.log('   Alerts today:', data.data?.alertsToday || 0);
        console.log('   Last update:', data.data?.lastUpdate || 'Never');
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
    
    // Test 2: Check /api/alerts
    console.log('\n2. Testing /api/alerts endpoint:');
    try {
        const response = await fetch(`${baseUrl}/api/alerts`);
        const data = await response.json();
        console.log('✅ Success:', data.success);
        console.log('   Total alerts:', data.alerts?.length || 0);
        
        // Show latest 3 alerts
        if (data.alerts && data.alerts.length > 0) {
            console.log('\n   Latest alerts:');
            data.alerts.slice(0, 3).forEach(alert => {
                console.log(`   - ${alert.title} (${alert.timeAgo})`);
            });
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }
    
    // Test 3: Check for data changes
    console.log('\n3. Checking for data freshness:');
    const fs = require('fs');
    const path = require('path');
    
    // Check snapshot timestamp
    const snapshotPath = path.join(__dirname, 'data/snapshots/current.json');
    if (fs.existsSync(snapshotPath)) {
        const stats = fs.statSync(snapshotPath);
        const ageMinutes = Math.floor((Date.now() - stats.mtime) / 60000);
        console.log(`   Current snapshot age: ${ageMinutes} minutes`);
    }
    
    // Check today's alerts
    const today = new Date().toISOString().split('T')[0];
    const alertsPath = path.join(__dirname, `data/alerts/${today}.json`);
    if (fs.existsSync(alertsPath)) {
        const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
        const stats = fs.statSync(alertsPath);
        const lastModified = new Date(stats.mtime).toLocaleTimeString();
        console.log(`   Today's alerts: ${alerts.length} (last updated: ${lastModified})`);
    }
    
    console.log('\n✅ Refresh button should work if all endpoints are responding.');
    console.log('💡 To test: Open http://localhost:3003 and click the refresh button');
    console.log('   The alert count and stats should update immediately.');
}

debugRefresh().catch(console.error);