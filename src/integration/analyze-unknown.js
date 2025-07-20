const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { monitorLogger } = require('../utils/logger');

class UnknownAddressAnalyzer {
  constructor() {
    this.analysisApiUrl = 'http://localhost:3001/api';
    this.discoveryQueuePath = path.join(__dirname, '../../../data/shared/discovery-queue.json');
    this.entitiesPath = path.join(__dirname, '../../../../shared-entities.json');
  }

  // Check if address is unknown
  async isUnknownAddress(address) {
    try {
      const entitiesData = await fs.readFile(this.entitiesPath, 'utf8');
      const entities = JSON.parse(entitiesData);
      
      for (const entity of Object.values(entities)) {
        if (entity.addresses && entity.addresses.includes(address)) {
          return false; // Known address
        }
      }
      return true; // Unknown address
    } catch (error) {
      monitorLogger.warn('Could not check entities:', error.message);
      return true; // Assume unknown if can't check
    }
  }

  // Analyze an unknown address
  async analyzeAddress(address, triggerReason) {
    monitorLogger.info(`🔍 Analyzing unknown address: ${address.slice(0, 8)}...${address.slice(-6)}`);
    
    try {
      // Try to get relationships from analysis tool
      const response = await axios.get(`${this.analysisApiUrl}/address/${address}/relationships`, {
        timeout: 5000
      });
      
      if (response.data && response.data.connections) {
        const connectionCount = response.data.connections.length;
        monitorLogger.info(`Found ${connectionCount} connections for address`);
        
        // Add to discovery queue for batch processing
        await this.addToDiscoveryQueue(address, {
          triggerReason,
          connectionCount,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        monitorLogger.debug('Analysis tool not running - skipping unknown address analysis');
      } else {
        monitorLogger.error('Failed to analyze address:', error.message);
      }
    }
  }

  // Add address to discovery queue
  async addToDiscoveryQueue(address, metadata) {
    try {
      let queue = [];
      
      // Load existing queue
      try {
        const data = await fs.readFile(this.discoveryQueuePath, 'utf8');
        queue = JSON.parse(data);
      } catch (error) {
        // File doesn't exist, start with empty queue
      }
      
      // Check if already in queue
      if (!queue.find(item => item.address === address)) {
        queue.push({
          address,
          ...metadata,
          addedAt: new Date().toISOString()
        });
        
        // Save updated queue
        await fs.writeFile(this.discoveryQueuePath, JSON.stringify(queue, null, 2));
        monitorLogger.success(`Added ${address.slice(0, 8)}... to discovery queue`);
      }
    } catch (error) {
      monitorLogger.error('Failed to update discovery queue:', error.message);
    }
  }

  // Process unknown addresses from alerts
  async processAlerts(alerts) {
    const unknownAddresses = new Set();
    
    for (const alert of alerts) {
      if (alert.address && await this.isUnknownAddress(alert.address)) {
        unknownAddresses.add({
          address: alert.address,
          reason: `${alert.type} - ${alert.severity}`
        });
      }
    }
    
    // Analyze each unknown address
    for (const { address, reason } of unknownAddresses) {
      await this.analyzeAddress(address, reason);
    }
    
    if (unknownAddresses.size > 0) {
      monitorLogger.info(`Queued ${unknownAddresses.size} unknown addresses for analysis`);
    }
  }
}

module.exports = UnknownAddressAnalyzer;