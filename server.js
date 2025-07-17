const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// API endpoint to get current monitoring data
app.get('/api/current', (req, res) => {
    try {
        // Try to read the current snapshot
        const snapshotPath = path.join(__dirname, 'data/snapshots/current.json');
        if (fs.existsSync(snapshotPath)) {
            const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
            res.json({
                success: true,
                data: data,
                timestamp: new Date().toISOString()
            });
        } else {
            // Return mock data if no snapshot exists
            res.json({
                success: true,
                data: {
                    accountsMonitored: 1000,
                    activePatterns: 7,
                    alertsToday: 24,
                    totalVolume: 2400000,
                    topAccounts: []
                },
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to get alerts
app.get('/api/alerts', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const alertsPath = path.join(__dirname, `data/alerts/${today}.json`);
        
        if (fs.existsSync(alertsPath)) {
            const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
            res.json({
                success: true,
                alerts: alerts,
                count: alerts.length
            });
        } else {
            // Return empty array if no alerts
            res.json({
                success: true,
                alerts: [],
                count: 0
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to get historical data
app.get('/api/historical/:address', (req, res) => {
    try {
        const { address } = req.params;
        const historicalPath = path.join(__dirname, `data/historical/${address}.json`);
        
        if (fs.existsSync(historicalPath)) {
            const history = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
            res.json({
                success: true,
                address: address,
                history: history
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Address history not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🐋 Polkadot Whale Monitor Frontend`);
    console.log(`📊 Dashboard running at: http://localhost:${PORT}`);
    console.log(`\nMake sure the monitoring tool is running to see real data!`);
    console.log(`Run: npm start (in the blockchain-monitoring-tool directory)\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down frontend server...');
    process.exit(0);
});