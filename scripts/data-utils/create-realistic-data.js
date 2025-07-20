#!/usr/bin/env node

// Script to create realistic monitoring data with 100 top accounts

const fs = require('fs');
const path = require('path');

// Generate realistic Polkadot addresses
function generateAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '1';
    for (let i = 0; i < 47; i++) {
        address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
}

// Generate realistic identities
const identities = [
    'Kraken.com', 'Binance', 'OKX', 'Coinbase', 'KuCoin', 'Gate.io', 'Huobi',
    'Validator Node 1', 'Validator Node 2', 'Validator Node 3', 'Polkadot Validator',
    'Staking Pool Alpha', 'Staking Pool Beta', 'DOT Pool', 'Millennium Pool',
    'Treasury', 'Council Member', 'Technical Committee', 'Democracy Proxy',
    'Parachain Crowdloan', 'Polkadot Foundation', 'Web3 Foundation',
    'DeFi Protocol', 'Liquid Staking', 'Cross-chain Bridge', 'DEX Liquidity',
    'Institutional Investor', 'Whale Trader', 'HODLer', 'Early Adopter'
];

// Generate account types
const accountTypes = ['exchange', 'validator', 'pool', 'treasury', 'whale', 'regular'];

// Generate 100 realistic whale accounts
function generateTopAccounts(count = 100) {
    const accounts = [];
    
    for (let i = 0; i < count; i++) {
        const balanceFloat = Math.floor(Math.random() * 5000000) + 100000; // 100K to 5M DOT
        const balance = (balanceFloat * 10000000000).toString(); // Convert to smallest unit
        
        const account = {
            address: generateAddress(),
            balance: balance,
            balanceFloat: balanceFloat,
            identity: i < identities.length ? identities[i] : `Whale ${i + 1}`,
            accountType: accountTypes[Math.floor(Math.random() * accountTypes.length)],
            lastActive: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Random in last 30 days
            nonce: Math.floor(Math.random() * 1000),
            isActive: Math.random() > 0.1, // 90% active
            riskScore: Math.floor(Math.random() * 100),
            transferCount: Math.floor(Math.random() * 500) + 10,
            patterns: []
        };
        
        // Add some patterns for variety
        if (Math.random() > 0.8) {
            account.patterns.push({
                type: 'large_movement',
                detected: new Date().toISOString(),
                severity: 'medium'
            });
        }
        
        if (Math.random() > 0.95) {
            account.patterns.push({
                type: 'dormant_awakening',
                detected: new Date().toISOString(),
                severity: 'critical',
                dormantDays: Math.floor(Math.random() * 365) + 30
            });
        }
        
        accounts.push(account);
    }
    
    // Sort by balance (descending)
    accounts.sort((a, b) => b.balanceFloat - a.balanceFloat);
    
    return accounts;
}

// Generate alerts for today
function generateTodaysAlerts() {
    const alerts = [];
    const alertTypes = [
        {
            type: 'dormant_awakening',
            title: 'Dormant Whale Awakening',
            severity: 'critical',
            description: 'Account dormant for {days} days moved {amount} DOT'
        },
        {
            type: 'large_transfer',
            title: 'Large Transfer Detected', 
            severity: 'high',
            description: '{amount} DOT transferred between whale accounts'
        },
        {
            type: 'coordinated_movement',
            title: 'Coordinated Movement Pattern',
            severity: 'medium',
            description: '{count} whales moved funds within {window} minutes'
        },
        {
            type: 'exchange_activity',
            title: 'Exchange Deposit',
            severity: 'low',
            description: '{amount} DOT deposited to {exchange}'
        }
    ];
    
    // Generate 15-25 alerts for today
    const alertCount = Math.floor(Math.random() * 10) + 15;
    
    for (let i = 0; i < alertCount; i++) {
        const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
        const amount = Math.floor(Math.random() * 500000) + 10000;
        const days = Math.floor(Math.random() * 500) + 30;
        const count = Math.floor(Math.random() * 8) + 3;
        const window = Math.floor(Math.random() * 30) + 5;
        const exchanges = ['Kraken.com', 'Binance', 'Coinbase', 'OKX'];
        
        const alert = {
            id: `alert_${Date.now()}_${i}`,
            type: alertType.type,
            title: alertType.title,
            severity: alertType.severity,
            description: alertType.description
                .replace('{amount}', amount.toLocaleString())
                .replace('{days}', days)
                .replace('{count}', count)
                .replace('{window}', window)
                .replace('{exchange}', exchanges[Math.floor(Math.random() * exchanges.length)]),
            timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
            address: generateAddress(),
            amount: amount
        };
        
        alerts.push(alert);
    }
    
    // Sort by timestamp (newest first)
    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return alerts;
}

// Create the data
function createRealisticData() {
    console.log('🐋 Creating realistic whale monitoring data...');
    
    // Ensure data directories exist
    const dataDir = path.join(__dirname, 'data');
    const snapshotsDir = path.join(dataDir, 'snapshots');
    const alertsDir = path.join(dataDir, 'alerts');
    
    [dataDir, snapshotsDir, alertsDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    // Generate accounts
    const accounts = generateTopAccounts(100);
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balanceFloat, 0);
    
    // Create current snapshot
    const snapshot = {
        timestamp: new Date().toISOString(),
        count: accounts.length,
        totalBalance: totalBalance,
        averageBalance: Math.floor(totalBalance / accounts.length),
        accounts: accounts,
        source: 'realistic_mock_data',
        patterns: accounts.filter(acc => acc.patterns.length > 0).length,
        activeAccounts: accounts.filter(acc => acc.isActive).length
    };
    
    // Save current snapshot
    fs.writeFileSync(
        path.join(snapshotsDir, 'current.json'),
        JSON.stringify(snapshot, null, 2)
    );
    
    // Save previous snapshot (slightly different)
    const previousSnapshot = { ...snapshot };
    previousSnapshot.timestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    previousSnapshot.accounts = accounts.map(acc => ({
        ...acc,
        balanceFloat: acc.balanceFloat + (Math.random() - 0.5) * 10000 // Small changes
    }));
    
    fs.writeFileSync(
        path.join(snapshotsDir, 'previous.json'),
        JSON.stringify(previousSnapshot, null, 2)
    );
    
    // Generate and save alerts
    const alerts = generateTodaysAlerts();
    const today = new Date().toISOString().split('T')[0];
    
    fs.writeFileSync(
        path.join(alertsDir, `${today}.json`),
        JSON.stringify(alerts, null, 2)
    );
    
    console.log(`✅ Created realistic data:`);
    console.log(`   📊 ${accounts.length} whale accounts`);
    console.log(`   💰 ${totalBalance.toLocaleString()} total DOT`);
    console.log(`   🚨 ${alerts.length} alerts for today`);
    console.log(`   📁 Saved to: ${dataDir}`);
    console.log('\n🔄 Refresh your dashboard to see the new data!');
}

// Run the script
if (require.main === module) {
    createRealisticData();
}

module.exports = { createRealisticData };