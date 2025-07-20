/**
 * Rollout Monitoring Dashboard
 * Real-time web dashboard for hybrid system rollout monitoring
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

class RolloutDashboard {
  constructor(bridge, safetyFramework, config = {}) {
    this.bridge = bridge;
    this.safetyFramework = safetyFramework;
    this.config = {
      port: config.port || 3002, // Use 3002 for rollout dashboard, 3003 is main system
      updateInterval: config.updateInterval || 5000, // 5 seconds
      historyPoints: config.historyPoints || 100,
      ...config
    };
    
    // Express app setup
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIO(this.server);
    
    // Dashboard state
    this.dashboardState = {
      isRunning: false,
      connectedClients: 0,
      lastUpdate: null,
      updateInterval: null
    };
    
    // Data history for charts
    this.history = {
      performance: [],
      health: [],
      alerts: [],
      validation: [],
      traffic: []
    };
    
    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupEventHandlers();
    
    console.log('[DASHBOARD] Rollout dashboard initialized');
  }
  
  setupRoutes() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../frontend')));
    this.app.use(express.json());
    
    // Main dashboard route
    this.app.get('/rollout', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard.html'));
    });
    
    // API routes
    this.app.get('/api/status', (req, res) => {
      res.json(this.getDashboardData());
    });
    
    this.app.get('/api/history', (req, res) => {
      res.json(this.history);
    });
    
    this.app.get('/api/metrics', (req, res) => {
      res.json(this.bridge.getMetrics());
    });
    
    this.app.get('/api/safety', (req, res) => {
      res.json(this.safetyFramework.getSafetyStatus());
    });
    
    // Emergency controls
    this.app.post('/api/emergency/rollback', (req, res) => {
      const reason = req.body.reason || 'Dashboard emergency rollback';
      
      try {
        this.safetyFramework.manualRollback(reason);
        res.json({ success: true, message: 'Emergency rollback initiated' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    this.app.post('/api/emergency/pause', (req, res) => {
      try {
        this.safetyFramework.enableEmergencyMode();
        res.json({ success: true, message: 'Emergency mode enabled' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Feature flag controls
    this.app.post('/api/flags/:flagName', (req, res) => {
      const { flagName } = req.params;
      const { value } = req.body;
      
      try {
        this.bridge.featureFlags.set(flagName, value);
        res.json({ success: true, message: `Flag ${flagName} updated` });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    this.app.get('/api/flags', (req, res) => {
      res.json(this.bridge.featureFlags.getAllFlags());
    });
  }
  
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.dashboardState.connectedClients++;
      console.log(`[DASHBOARD] Client connected (${this.dashboardState.connectedClients} total)`);
      
      // Send initial data
      socket.emit('dashboard-data', this.getDashboardData());
      socket.emit('history-data', this.history);
      
      socket.on('disconnect', () => {
        this.dashboardState.connectedClients--;
        console.log(`[DASHBOARD] Client disconnected (${this.dashboardState.connectedClients} total)`);
      });
      
      // Handle dashboard commands
      socket.on('emergency-rollback', (data) => {
        const reason = data.reason || 'Dashboard user emergency rollback';
        this.safetyFramework.manualRollback(reason);
      });
      
      socket.on('update-flag', (data) => {
        this.bridge.featureFlags.set(data.flag, data.value);
      });
      
      socket.on('request-update', () => {
        socket.emit('dashboard-data', this.getDashboardData());
      });
    });
  }
  
  setupEventHandlers() {
    // Bridge events
    this.bridge.on('alerts', (alerts) => {
      this.addToHistory('alerts', {
        timestamp: Date.now(),
        count: alerts.length,
        alerts: alerts.slice(0, 5) // Keep only first 5 for display
      });
      
      this.broadcastUpdate('new-alerts', alerts);
    });
    
    this.bridge.on('systemSwitched', (event) => {
      this.broadcastUpdate('system-switched', event);
    });
    
    this.bridge.on('emergencyRollbackCompleted', () => {
      this.broadcastUpdate('emergency-rollback', { completed: true });
    });
    
    // Safety framework events
    this.safetyFramework.on('safetyAlert', (alert) => {
      this.broadcastUpdate('safety-alert', alert);
    });
    
    this.safetyFramework.on('healthCheck', (healthCheck) => {
      this.addToHistory('health', {
        timestamp: healthCheck.timestamp,
        overall: healthCheck.overall,
        bridge: healthCheck.bridge.healthy,
        system: healthCheck.system.healthy,
        performance: healthCheck.performance.healthy,
        validation: healthCheck.validation.healthy
      });
    });
    
    this.safetyFramework.on('emergencyModeEnabled', () => {
      this.broadcastUpdate('emergency-mode', { enabled: true });
    });
    
    this.safetyFramework.on('emergencyModeDisabled', () => {
      this.broadcastUpdate('emergency-mode', { enabled: false });
    });
    
    // Feature flag events
    this.bridge.featureFlags.on('flagChanged', (change) => {
      this.broadcastUpdate('flag-changed', change);
      
      // Track traffic changes
      if (change.flagName === 'hybridTrafficPercent') {
        this.addToHistory('traffic', {
          timestamp: Date.now(),
          percent: change.newValue
        });
      }
    });
  }
  
  start() {
    if (this.dashboardState.isRunning) {
      console.log('[DASHBOARD] Dashboard already running');
      return;
    }
    
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`[DASHBOARD] Dashboard server started on port ${this.config.port}`);
        console.log(`[DASHBOARD] Access dashboard at: http://localhost:${this.config.port}/rollout`);
        
        this.dashboardState.isRunning = true;
        
        // Start periodic updates
        this.dashboardState.updateInterval = setInterval(() => {
          this.updateDashboard();
        }, this.config.updateInterval);
        
        resolve();
      });
    });
  }
  
  stop() {
    if (!this.dashboardState.isRunning) return;
    
    return new Promise((resolve) => {
      // Stop updates
      if (this.dashboardState.updateInterval) {
        clearInterval(this.dashboardState.updateInterval);
      }
      
      // Close server
      this.server.close(() => {
        this.dashboardState.isRunning = false;
        console.log('[DASHBOARD] Dashboard server stopped');
        resolve();
      });
    });
  }
  
  updateDashboard() {
    try {
      // Collect current data
      const dashboardData = this.getDashboardData();
      this.dashboardState.lastUpdate = Date.now();
      
      // Update performance history
      const metrics = this.bridge.getMetrics();
      if (metrics.performance.hybrid.samples > 0) {
        this.addToHistory('performance', {
          timestamp: Date.now(),
          legacyLatency: metrics.performance.legacy.avgLatency,
          hybridLatency: metrics.performance.hybrid.avgLatency,
          improvementFactor: metrics.performance.improvementFactor,
          errorRate: metrics.errors.hybrid / Math.max(metrics.performance.hybrid.samples, 1)
        });
      }
      
      // Update validation history
      if (metrics.validation.latest) {
        this.addToHistory('validation', {
          timestamp: Date.now(),
          accuracy: metrics.validation.latest.accuracy,
          matches: metrics.validation.latest.matches,
          total: metrics.validation.latest.legacyCount
        });
      }
      
      // Broadcast updates to connected clients
      this.broadcastUpdate('dashboard-data', dashboardData);
      
    } catch (error) {
      console.error('[DASHBOARD] Update error:', error.message);
    }
  }
  
  getDashboardData() {
    try {
      const bridgeMetrics = this.bridge.getMetrics();
      const safetyStatus = this.safetyFramework.getSafetyStatus();
      const rolloutStatus = this.bridge.featureFlags.getRolloutStatus();
      
      return {
        timestamp: Date.now(),
        rollout: {
          phase: rolloutStatus.phase,
          hybridEnabled: rolloutStatus.hybridEnabled,
          trafficPercent: rolloutStatus.trafficPercent,
          uptime: rolloutStatus.uptime
        },
        bridge: {
          isRunning: bridgeMetrics.bridge.isRunning,
          activeSystem: bridgeMetrics.bridge.activeSystem,
          uptime: bridgeMetrics.bridge.uptime,
          validationMode: bridgeMetrics.bridge.validationMode
        },
        performance: {
          legacy: bridgeMetrics.performance.legacy,
          hybrid: bridgeMetrics.performance.hybrid,
          improvementFactor: bridgeMetrics.performance.improvementFactor
        },
        alerts: {
          total: bridgeMetrics.alerts.total,
          legacy: bridgeMetrics.alerts.legacy,
          hybrid: bridgeMetrics.alerts.hybrid
        },
        validation: bridgeMetrics.validation,
        errors: bridgeMetrics.errors,
        safety: {
          isActive: safetyStatus.isActive,
          emergencyMode: safetyStatus.emergencyMode,
          consecutiveFailures: safetyStatus.consecutiveFailures,
          lastHealthCheck: safetyStatus.lastHealthCheck,
          recentAlerts: safetyStatus.recentAlerts
        },
        featureFlags: this.bridge.featureFlags.getAllFlags(),
        dashboard: {
          connectedClients: this.dashboardState.connectedClients,
          lastUpdate: this.dashboardState.lastUpdate
        }
      };
    } catch (error) {
      console.error('[DASHBOARD] Error getting dashboard data:', error.message);
      return {
        timestamp: Date.now(),
        error: error.message
      };
    }
  }
  
  addToHistory(type, data) {
    if (!this.history[type]) {
      this.history[type] = [];
    }
    
    this.history[type].push(data);
    
    // Keep only recent history
    if (this.history[type].length > this.config.historyPoints) {
      this.history[type] = this.history[type].slice(-this.config.historyPoints);
    }
  }
  
  broadcastUpdate(event, data) {
    if (this.dashboardState.connectedClients > 0) {
      this.io.emit(event, data);
    }
  }
  
  // Health check endpoint for monitoring
  getHealthStatus() {
    return {
      dashboard: {
        isRunning: this.dashboardState.isRunning,
        connectedClients: this.dashboardState.connectedClients,
        lastUpdate: this.dashboardState.lastUpdate
      },
      bridge: this.bridge.getHealthStatus(),
      safety: this.safetyFramework.getSafetyStatus()
    };
  }
}

module.exports = RolloutDashboard;