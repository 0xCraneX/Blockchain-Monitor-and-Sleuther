import 'dotenv/config';
import { SubscanHistoricalCollector } from './src/collectors/subscan-historical-collector.js';

// Set lower limits for testing
const collector = new SubscanHistoricalCollector({
  maxAddresses: 5,  // Only collect 5 addresses to test
  maxPagesPerAddress: 2,  // Only 2 pages per address
  maxTransfersPerAddress: 200  // Max 200 transfers
});

// Run the collector
console.log('Starting collection with real addresses...');
collector.run().catch(error => {
  console.error('Collection failed:', error);
  process.exit(1);
});