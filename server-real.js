const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3003;

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend-real')));

// API endpoint to get current monitoring data (REAL DATA)
app.get('/api/current', (req, res) => {
    try {
        // Try to read the current snapshot from monitoring tool
        const snapshotPath = path.join(__dirname, 'data/snapshots/current.json');
        
        if (fs.existsSync(snapshotPath)) {
            const rawData = fs.readFileSync(snapshotPath, 'utf8');
            const data = JSON.parse(rawData);
            
            // Process real monitoring data
            const processedData = {
                accountsMonitored: data.accounts ? data.accounts.length : 0,
                activePatterns: countActivePatterns(data),
                alertsToday: getTodaysAlerts(),
                totalVolume: calculateTotalVolume(data),
                topAccounts: getTopMovers(data),
                timestamp: data.timestamp || new Date().toISOString(),
                lastUpdate: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'Never'
            };
            
            res.json({
                success: true,
                data: processedData,
                source: 'real_monitoring_data'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'No monitoring data available. Make sure the monitoring tool is running.',
                suggestion: 'Run: npm start (in blockchain-monitoring-tool directory)'
            });
        }
    } catch (error) {
        console.error('Error reading monitoring data:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            suggestion: 'Check if monitoring tool data files are accessible'
        });
    }
});

// API endpoint to get real alerts
app.get('/api/alerts', (req, res) => {
    try {
        // Get days parameter from query (default 30 days for a month)
        const days = parseInt(req.query.days) || 30;
        const allAlerts = [];
        
        // Load alerts for multiple days
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const alertsPath = path.join(__dirname, `data/alerts/${dateStr}.json`);
            
            if (fs.existsSync(alertsPath)) {
                const rawAlerts = fs.readFileSync(alertsPath, 'utf8');
                const dayAlerts = JSON.parse(rawAlerts);
                allAlerts.push(...dayAlerts);
            }
        }
        
        // Sort by timestamp (newest first)
        allAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Process and format alerts for frontend
        const formattedAlerts = allAlerts.map(alert => {
            const alertType = alert.type || alert.pattern || 'unknown';
            const title = formatAlertTitle(alert) || 'Blockchain Activity';
            const severity = determineSeverity(alert) || 'low';
            
            return {
                id: alert.id || Math.random().toString(36),
                severity: severity,
                title: title,
                description: alert.description || alert.message || 'Unknown activity detected',
                timestamp: alert.timestamp,
                address: alert.address,
                amount: alert.amount,
                type: alertType,
                timeAgo: getTimeAgo(alert.timestamp) || 'Unknown',
                metadata: alert.metadata // Preserve metadata for stats calculation
            };
        });
        
        res.json({
            success: true,
            alerts: formattedAlerts,
            count: formattedAlerts.length,
            daysLoaded: days,
            source: 'real_alert_data'
        });
    } catch (error) {
        console.error('Error reading alerts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to get monitoring status
// API endpoint for monitoring statistics
app.get('/api/monitoring-stats', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 1;
        
        // Load alerts for the specified period
        const allAlerts = [];
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const alertsPath = path.join(__dirname, `data/alerts/${dateStr}.json`);
            
            if (fs.existsSync(alertsPath)) {
                const dayAlerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
                allAlerts.push(...dayAlerts);
            }
        }
        
        // Calculate statistics
        const stats = {
            alertsToday: getTodaysAlerts().length,
            activePatterns: countUniquePatterns(allAlerts),
            dotMovement: calculateTotalMovement(allAlerts),
            topMovers: getTopMovers(allAlerts),
            severityBreakdown: getSeverityBreakdown(allAlerts),
            typeBreakdown: getTypeBreakdown(allAlerts)
        };
        
        res.json({
            success: true,
            stats,
            period: `${days} day${days > 1 ? 's' : ''}`
        });
        
    } catch (error) {
        console.error('Error calculating stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function countUniquePatterns(alerts) {
    const patterns = new Set();
    alerts.forEach(alert => {
        if (alert.type || alert.pattern) {
            patterns.add(alert.type || alert.pattern);
        }
    });
    return patterns.size;
}

function calculateTotalMovement(alerts) {
    return alerts.reduce((total, alert) => {
        return total + (parseFloat(alert.amount) || 0);
    }, 0);
}

function getTopMovers(alerts) {
    // Group by address and calculate net movement
    const movements = {};
    
    alerts.forEach(alert => {
        if (!alert.address || !alert.amount) return;
        
        if (!movements[alert.address]) {
            movements[alert.address] = {
                address: alert.address,
                in: 0,
                out: 0,
                net: 0,
                type: alert.metadata?.identity || 'Unknown'
            };
        }
        
        // Determine if it's incoming or outgoing based on metadata
        if (alert.metadata && alert.metadata.to === alert.address) {
            movements[alert.address].in += parseFloat(alert.amount);
        } else {
            movements[alert.address].out += parseFloat(alert.amount);
        }
    });
    
    // Calculate net movement and sort
    const movers = Object.values(movements).map(m => {
        m.net = m.in - m.out;
        return m;
    });
    
    // Get top gainers and losers
    const sorted = movers.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const topGainers = sorted.filter(m => m.net > 0).slice(0, 3);
    const topLosers = sorted.filter(m => m.net < 0).slice(0, 3);
    
    return { gainers: topGainers, losers: topLosers };
}

function getSeverityBreakdown(alerts) {
    const breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach(alert => {
        const severity = determineSeverity(alert);
        breakdown[severity]++;
    });
    return breakdown;
}

function getTypeBreakdown(alerts) {
    const breakdown = {};
    alerts.forEach(alert => {
        const type = alert.type || alert.pattern || 'unknown';
        breakdown[type] = (breakdown[type] || 0) + 1;
    });
    return breakdown;
}

app.get('/api/status', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');
        const snapshotsDir = path.join(dataDir, 'snapshots');
        const alertsDir = path.join(dataDir, 'alerts');
        
        const status = {
            dataDirectory: fs.existsSync(dataDir),
            snapshotsDirectory: fs.existsSync(snapshotsDir),
            alertsDirectory: fs.existsSync(alertsDir),
            currentSnapshot: fs.existsSync(path.join(snapshotsDir, 'current.json')),
            previousSnapshot: fs.existsSync(path.join(snapshotsDir, 'previous.json')),
            todaysAlerts: fs.existsSync(path.join(alertsDir, `${new Date().toISOString().split('T')[0]}.json`)),
            lastUpdate: getLastUpdateTime(),
            monitoringActive: isMonitoringActive()
        };
        
        res.json({
            success: true,
            status,
            recommendations: generateRecommendations(status)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper Functions
function countActivePatterns(data) {
    if (!data || !data.accounts) return 0;
    
    let patterns = 0;
    data.accounts.forEach(account => {
        if (account.patterns && account.patterns.length > 0) {
            patterns += account.patterns.length;
        }
    });
    return patterns;
}

function getTodaysAlerts() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const alertsPath = path.join(__dirname, `data/alerts/${today}.json`);
        
        if (fs.existsSync(alertsPath)) {
            const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
            return alerts.length;
        }
    } catch (error) {
        console.error('Error counting alerts:', error);
    }
    return 0;
}

function calculateTotalVolume(data) {
    if (!data || !data.accounts) return 0;
    
    let totalVolume = 0;
    data.accounts.forEach(account => {
        // Handle both old format (balance.free) and new format (balanceFloat)
        if (account.balanceFloat) {
            totalVolume += account.balanceFloat;
        } else if (account.balance && account.balance.free) {
            // Convert DOT balance to number
            const balance = parseFloat(account.balance.free.replace(/,/g, ''));
            if (!isNaN(balance)) {
                totalVolume += balance;
            }
        }
    });
    
    return Math.round(totalVolume);
}

function getTopMovers(data) {
    if (!data || !data.accounts) return [];
    
    // Sort accounts by balance (top holders)
    return data.accounts
        .filter(account => account.address && (account.balanceFloat || account.balance))
        .sort((a, b) => {
            const balanceA = a.balanceFloat || (a.balance && parseFloat(a.balance.free?.replace(/,/g, ''))) || 0;
            const balanceB = b.balanceFloat || (b.balance && parseFloat(b.balance.free?.replace(/,/g, ''))) || 0;
            return balanceB - balanceA;
        })
        .slice(0, 10)
        .map(account => ({
            address: account.address,
            balance: account.balanceFloat || account.balance,
            identity: account.identity,
            accountType: account.accountType || determineAccountType(account),
            isActive: account.isActive,
            transferCount: account.transferCount
        }));
}

function determineSeverity(alert) {
    const type = (alert.type || alert.pattern || '').toLowerCase();
    const amount = parseFloat(alert.amount) || 0;
    
    // Critical severity for dormant awakenings and very large transfers
    if (type === 'dormant_awakening' || amount > 500000) {
        return 'critical';
    }
    
    // High severity for large transfers and new whales
    if (type === 'large_transfer' || type === 'new_whale' || amount > 100000) {
        return 'high';
    }
    
    // Medium severity for whale movements and coordinated patterns
    if (type === 'whale_movement' || type === 'coordinated_movement' || amount > 50000) {
        return 'medium';
    }
    
    // Default to low for exchange activity and smaller amounts
    return 'low';
}

function formatAlertTitle(alert) {
    const type = alert.type || alert.pattern || '';
    
    switch (type.toLowerCase()) {
        case 'dormant_awakening':
            return 'Dormant Whale Awakening';
        case 'large_transfer':
            return 'Large Transfer Detected';
        case 'coordinated_movement':
            return 'Coordinated Movement Pattern';
        case 'exchange_activity':
            return 'Exchange Activity';
        case 'whale_movement':
            return 'Whale Movement';
        case 'new_whale':
            return 'New Whale Detected';
        case 'large_movement':
            return 'Large Movement';
        case '':
        case 'unknown':
            return 'Blockchain Activity';
        default:
            // Try to format the type into a readable title
            return alert.title || type.split('_').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
    }
}

function determineAccountType(account) {
    if (account.identity && account.identity.display) {
        const identity = account.identity.display.toLowerCase();
        if (identity.includes('exchange') || identity.includes('kraken') || identity.includes('binance')) {
            return 'Exchange';
        }
        if (identity.includes('validator')) {
            return 'Validator';
        }
        if (identity.includes('pool')) {
            return 'Pool';
        }
    }
    return 'Unknown';
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function getLastUpdateTime() {
    try {
        const snapshotPath = path.join(__dirname, 'data/snapshots/current.json');
        if (fs.existsSync(snapshotPath)) {
            const stats = fs.statSync(snapshotPath);
            return stats.mtime.toISOString();
        }
    } catch (error) {
        console.error('Error getting last update time:', error);
    }
    return null;
}

function isMonitoringActive() {
    try {
        const snapshotPath = path.join(__dirname, 'data/snapshots/current.json');
        if (fs.existsSync(snapshotPath)) {
            const stats = fs.statSync(snapshotPath);
            const ageInMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
            return ageInMinutes < 120; // Active if updated within last 2 hours
        }
    } catch (error) {
        console.error('Error checking monitoring status:', error);
    }
    return false;
}

function generateRecommendations(status) {
    const recommendations = [];
    
    if (!status.dataDirectory) {
        recommendations.push("Data directory missing. Run the monitoring tool first: npm start");
    }
    if (!status.currentSnapshot) {
        recommendations.push("No current snapshot found. The monitoring tool may not be running.");
    }
    if (!status.monitoringActive) {
        recommendations.push("Monitoring appears inactive. Check if the tool is running and collecting data.");
    }
    if (!status.todaysAlerts) {
        recommendations.push("No alerts today. This could mean no whale activity or monitoring just started.");
    }
    
    return recommendations;
}

// Serve the real data frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend-real', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🐋 Polkadot Whale Monitor - REAL DATA VERSION`);
    console.log(`📊 Dashboard running at: http://localhost:${PORT}`);
    console.log(`📈 Using real monitoring data from: ./data/`);
    console.log(`\n⚠️  Make sure the monitoring tool is running for live data!`);
    console.log(`   Run: npm start (in the blockchain-monitoring-tool directory)\n`);
    
    // Check initial status
    checkInitialStatus();
});

function checkInitialStatus() {
    const dataDir = path.join(__dirname, 'data');
    const currentSnapshot = path.join(dataDir, 'snapshots/current.json');
    
    if (!fs.existsSync(dataDir)) {
        console.log(`❌ Data directory not found. Run monitoring tool first.`);
    } else if (!fs.existsSync(currentSnapshot)) {
        console.log(`⚠️  No current snapshot found. Start monitoring to see data.`);
    } else {
        try {
            const stats = fs.statSync(currentSnapshot);
            const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
            console.log(`✅ Found snapshot data (${Math.round(ageMinutes)} minutes old)`);
        } catch (error) {
            console.log(`⚠️  Error reading snapshot: ${error.message}`);
        }
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down real data server...');
    process.exit(0);
});