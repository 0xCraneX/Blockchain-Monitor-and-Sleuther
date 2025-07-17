#!/usr/bin/env node

const SubscanClient = require('./src/api/SubscanClient');
const RealTransferFetcher = require('./src/alerts/RealTransferFetcher');
const AlertManager = require('./src/alerts/AlertManager');
const FileStorage = require('./src/storage/FileStorage');
const { monitorLogger } = require('./src/utils/simple-logger');

require('dotenv').config();

async function backfillAlerts() {
    monitorLogger.section('📚 Backfilling Historical Alerts (30 days)');
    
    try {
        // Initialize components
        const api = new SubscanClient(process.env.SUBSCAN_API_KEY);
        const storage = new FileStorage('./data');
        const alertManager = new AlertManager(storage);
        
        const transferFetcher = new RealTransferFetcher({
            subscanApiKey: process.env.SUBSCAN_API_KEY,
            dataPath: './data',
            lookbackHours: 720, // 30 days
            minTransferAmount: 10000
        });
        
        // Fetch top accounts
        monitorLogger.info('Fetching top 100 accounts...');
        const accounts = await api.getAllTopAccounts(100);
        monitorLogger.success(`Loaded ${accounts.length} accounts`);
        
        // Initialize transfer fetcher
        await transferFetcher.loadProcessedTransfers();
        
        // Fetch transfers for 30 days
        monitorLogger.info('Fetching 30 days of transfer history...');
        const alerts = await transferFetcher.fetchRecentTransfers(accounts);
        
        monitorLogger.success(`Found ${alerts.length} alerts to process`);
        
        // Group alerts by date
        const alertsByDate = {};
        alerts.forEach(alert => {
            const date = new Date(alert.timestamp).toISOString().split('T')[0];
            if (!alertsByDate[date]) {
                alertsByDate[date] = [];
            }
            alertsByDate[date].push(alert);
        });
        
        // Save alerts by date
        monitorLogger.info('Saving alerts by date...');
        for (const [date, dateAlerts] of Object.entries(alertsByDate)) {
            const filepath = `./data/alerts/${date}.json`;
            const fs = require('fs');
            
            // Load existing alerts if any
            let existingAlerts = [];
            if (fs.existsSync(filepath)) {
                existingAlerts = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            }
            
            // Merge with new alerts (avoid duplicates)
            const existingIds = new Set(existingAlerts.map(a => a.id));
            const newAlerts = dateAlerts.filter(a => !existingIds.has(a.id));
            
            if (newAlerts.length > 0) {
                const mergedAlerts = [...existingAlerts, ...newAlerts];
                fs.writeFileSync(filepath, JSON.stringify(mergedAlerts, null, 2));
                monitorLogger.info(`Saved ${newAlerts.length} new alerts for ${date}`);
            }
        }
        
        // Save processed transfers
        await transferFetcher.saveProcessedTransfers();
        
        // Summary
        const dates = Object.keys(alertsByDate).sort();
        monitorLogger.success('Backfill complete!', {
            totalAlerts: alerts.length,
            daysWithData: dates.length,
            dateRange: `${dates[0]} to ${dates[dates.length - 1]}`
        });
        
    } catch (error) {
        monitorLogger.error('Backfill failed', error);
        process.exit(1);
    }
}

if (require.main === module) {
    backfillAlerts().catch(console.error);
}

module.exports = { backfillAlerts };