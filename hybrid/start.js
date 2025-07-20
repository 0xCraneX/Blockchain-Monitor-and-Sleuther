#!/usr/bin/env node

import { HybridWhaleMonitor } from './core/HybridMonitor.js';
import { hybridConfig } from './config/hybrid.config.js';
import fs from 'fs/promises';
import path from 'path';

class HybridMonitorRunner {
  constructor() {
    this.monitor = null;
    this.isShuttingDown = false;
    this.startTime = Date.now();
    
    this.setupProcessHandlers();
  }
  
  async start() {
    console.log('🚀 Starting Hybrid Whale Monitor...');
    console.log(`📊 Environment: ${hybridConfig.environment}`);
    console.log(`📡 RPC Endpoints: ${hybridConfig.rpc.endpoints.length}`);
    console.log(`🎯 Monitoring: ${hybridConfig.monitoring.topAccountsLimit} top accounts`);
    console.log('─'.repeat(50));
    
    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Initialize monitor
      this.monitor = new HybridWhaleMonitor(hybridConfig);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Start monitoring
      await this.monitor.start();
      
      console.log('✅ Hybrid Whale Monitor started successfully');
      console.log('📡 Monitoring for whale activity...');
      
      // Start periodic status reports
      this.startStatusReporting();
      
    } catch (error) {
      console.error('❌ Failed to start Hybrid Whale Monitor:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
  
  async ensureDirectories() {
    const directories = [
      hybridConfig.cache.l3Path,
      path.dirname(hybridConfig.logging.file),
      './hybrid/logs'
    ];
    
    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.warn(`Warning: Could not create directory ${dir}:`, error.message);
      }
    }
  }
  
  setupEventHandlers() {
    // Connection events
    this.monitor.on('started', () => {
      console.log('✅ Monitor fully initialized');
    });
    
    this.monitor.on('rpcConnected', () => {
      console.log('🔗 RPC connection established');
    });
    
    this.monitor.on('rpcDisconnected', () => {
      console.log('⚠️  RPC connection lost - attempting reconnection...');
    });
    
    // Alert events
    this.monitor.on('alert', (alert) => {
      this.handleAlert(alert);
    });
    
    this.monitor.on('enrichedAlert', (alert) => {
      this.handleEnrichedAlert(alert);
    });
    
    this.monitor.on('globalPattern', (pattern) => {
      this.handleGlobalPattern(pattern);
    });
    
    // Error events
    this.monitor.on('error', (error) => {
      console.error(`❌ ${error.source.toUpperCase()} Error:`, error.error.message);
      
      // Log to file if configured
      this.logError(error);
    });
  }
  
  handleAlert(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    const confidenceBar = this.getConfidenceBar(alert.confidence);
    
    console.log(`${emoji} ALERT: ${alert.type.toUpperCase()}`);
    console.log(`   Amount: ${alert.amount?.toLocaleString()} DOT`);
    console.log(`   From: ${this.formatAddress(alert.from)}`);
    console.log(`   To: ${this.formatAddress(alert.to)}`);
    console.log(`   Confidence: ${confidenceBar} (${(alert.confidence * 100).toFixed(1)}%)`);
    console.log(`   Source: ${alert.source} | Block: ${alert.blockNumber}`);
    
    if (alert.patterns && alert.patterns.length > 0) {
      console.log(`   Patterns: ${alert.patterns.map(p => p.type).join(', ')}`);
    }
    
    console.log('─'.repeat(50));
  }
  
  handleEnrichedAlert(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    
    console.log(`${emoji} ENRICHED ALERT: ${alert.type.toUpperCase()}`);
    console.log(`   Amount: ${alert.amount?.toLocaleString()} DOT`);
    
    if (alert.enrichment?.fromIdentity?.display) {
      console.log(`   From: ${alert.enrichment.fromIdentity.display} (${this.formatAddress(alert.from)})`);
    } else {
      console.log(`   From: ${this.formatAddress(alert.from)}`);
    }
    
    if (alert.enrichment?.toIdentity?.display) {
      console.log(`   To: ${alert.enrichment.toIdentity.display} (${this.formatAddress(alert.to)})`);
    } else {
      console.log(`   To: ${this.formatAddress(alert.to)}`);
    }
    
    console.log(`   Processing Time: ${alert.totalProcessingTime}ms`);
    console.log(`   Enrichment Sources: ${alert.enrichment?.sources?.join(', ') || 'none'}`);
    
    if (alert.enrichment?.patterns) {
      console.log(`   Activity Patterns: ${JSON.stringify(alert.enrichment.patterns)}`);
    }
    
    console.log('═'.repeat(50));
  }
  
  handleGlobalPattern(pattern) {
    console.log(`🌐 GLOBAL PATTERN DETECTED: ${pattern.type.toUpperCase()}`);
    console.log(`   Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
    console.log(`   Metadata: ${JSON.stringify(pattern.metadata, null, 2)}`);
    console.log('═'.repeat(50));
  }
  
  getSeverityEmoji(severity) {
    switch (severity) {
      case 'critical': return '🚨';
      case 'important': return '⚠️';
      case 'notable': return '📢';
      default: return 'ℹ️';
    }
  }
  
  getConfidenceBar(confidence) {
    const barLength = 10;
    const filled = Math.round(confidence * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    return bar;
  }
  
  formatAddress(address) {
    if (!address) return 'Unknown';
    if (address.length > 16) {
      return `${address.slice(0, 8)}...${address.slice(-8)}`;
    }
    return address;
  }
  
  startStatusReporting() {
    setInterval(() => {
      this.reportStatus();
    }, 300000); // Every 5 minutes
  }
  
  reportStatus() {
    if (!this.monitor) return;
    
    const metrics = this.monitor.getMetrics();
    const uptime = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('\n📊 STATUS REPORT');
    console.log('─'.repeat(30));
    console.log(`Uptime: ${this.formatUptime(uptime)}`);
    console.log(`Monitored Addresses: ${metrics.monitoredAddresses}`);
    console.log(`Total Alerts: ${metrics.totalAlerts}`);
    console.log(`RPC Status: ${metrics.rpc?.isConnected ? '🟢 Connected' : '🔴 Disconnected'}`);
    console.log(`Last Block: ${metrics.lastProcessedBlock}`);
    
    if (metrics.cache?.performance?.hitRate) {
      console.log(`Cache Hit Rate: ${metrics.cache.performance.hitRate}`);
    }
    
    console.log('─'.repeat(30));
  }
  
  formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
  
  async logError(error) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        source: error.source,
        message: error.error.message,
        stack: error.error.stack
      };
      
      const logPath = hybridConfig.logging.file;
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (logError) {
      console.error('Failed to write to log file:', logError.message);
    }
  }
  
  setupProcessHandlers() {
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.gracefulShutdown('EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('REJECTION');
    });
  }
  
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      if (this.monitor) {
        console.log('📡 Stopping monitor...');
        await this.monitor.stop();
        console.log('✅ Monitor stopped successfully');
      }
      
      console.log('👋 Hybrid Whale Monitor shutdown complete');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  }
}

// Start the runner
const runner = new HybridMonitorRunner();
runner.start().catch(error => {
  console.error('❌ Failed to start runner:', error);
  process.exit(1);
});