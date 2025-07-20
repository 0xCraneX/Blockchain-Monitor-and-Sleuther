/**
 * Feature Flag Management for Hybrid System Rollout
 * Provides safe rollout controls with instant rollback capability
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class FeatureFlags extends EventEmitter {
  constructor(configPath = './data/config/feature-flags.json') {
    super();
    
    this.configPath = configPath;
    this.flags = this.loadDefaultFlags();
    this.watchInterval = null;
    
    // Load from file if exists
    this.loadFromFile();
    
    // Start watching for file changes (hot reload)
    this.startWatching();
    
    console.log('[FEATURE-FLAGS] Feature flags initialized', this.flags);
  }
  
  loadDefaultFlags() {
    return {
      // Core hybrid system controls
      enableHybridSystem: false,
      enableParallelMode: false,
      enableShadowMode: false,
      
      // Traffic splitting
      hybridTrafficPercent: 0,
      hybridAddressLimit: 0,
      
      // Component-specific flags
      enableHybridRPC: false,
      enableHybridPatterns: false,
      enableHybridIndexer: false,
      enableHybridCache: false,
      
      // Performance features
      enablePredictiveFetching: false,
      enableAdvancedPatterns: false,
      enableCircuitBreakers: true, // Always on for safety
      
      // Monitoring and validation
      enableMetricsComparison: true,
      enableAlertValidation: true,
      enablePerformanceTracking: true,
      
      // Emergency controls
      emergencyRollback: false,
      forceLegacyMode: false,
      
      // Development features
      enableDebugLogging: false,
      enableTestMode: false,
      
      // Rollout metadata
      lastUpdated: new Date().toISOString(),
      rolloutPhase: 'disabled',
      rolloutStartTime: null
    };
  }
  
  loadFromFile() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileFlags = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.flags = { ...this.flags, ...fileFlags };
        console.log('[FEATURE-FLAGS] Loaded flags from file');
      } else {
        // Create directory and file with defaults
        this.saveToFile();
      }
    } catch (error) {
      console.error('[FEATURE-FLAGS] Error loading flags from file:', error.message);
      console.log('[FEATURE-FLAGS] Using default flags');
    }
  }
  
  saveToFile() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      this.flags.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.configPath, JSON.stringify(this.flags, null, 2));
      console.log('[FEATURE-FLAGS] Saved flags to file');
    } catch (error) {
      console.error('[FEATURE-FLAGS] Error saving flags to file:', error.message);
    }
  }
  
  startWatching() {
    // Watch for file changes every 5 seconds
    this.watchInterval = setInterval(() => {
      this.loadFromFile();
    }, 5000);
  }
  
  stopWatching() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }
  
  // Get a specific flag value
  get(flagName) {
    return this.flags[flagName];
  }
  
  // Set a flag value
  set(flagName, value) {
    const oldValue = this.flags[flagName];
    this.flags[flagName] = value;
    
    this.saveToFile();
    
    // Emit change event
    this.emit('flagChanged', { flagName, oldValue, newValue: value });
    
    console.log(`[FEATURE-FLAGS] Flag updated: ${flagName} = ${value}`);
  }
  
  // Update multiple flags at once
  update(flagUpdates) {
    const changes = [];
    
    Object.entries(flagUpdates).forEach(([flagName, value]) => {
      const oldValue = this.flags[flagName];
      this.flags[flagName] = value;
      changes.push({ flagName, oldValue, newValue: value });
    });
    
    this.saveToFile();
    
    // Emit change events
    changes.forEach(change => {
      this.emit('flagChanged', change);
    });
    
    console.log('[FEATURE-FLAGS] Multiple flags updated:', flagUpdates);
  }
  
  // Check if hybrid system should be enabled
  isHybridEnabled() {
    return this.get('enableHybridSystem') && 
           !this.get('emergencyRollback') && 
           !this.get('forceLegacyMode');
  }
  
  // Check if in parallel/shadow mode
  isParallelMode() {
    return this.get('enableParallelMode') && this.isHybridEnabled();
  }
  
  // Check if in shadow mode (hybrid runs but doesn't emit alerts)
  isShadowMode() {
    return this.get('enableShadowMode') && this.isHybridEnabled();
  }
  
  // Get current traffic percentage for hybrid
  getTrafficPercent() {
    if (!this.isHybridEnabled()) return 0;
    return Math.max(0, Math.min(100, this.get('hybridTrafficPercent')));
  }
  
  // Check if an address should use hybrid system
  shouldUseHybrid(address = null) {
    if (!this.isHybridEnabled()) return false;
    
    const trafficPercent = this.getTrafficPercent();
    if (trafficPercent === 0) return false;
    if (trafficPercent === 100) return true;
    
    // Use address hash for consistent routing
    if (address) {
      const hash = this.hashAddress(address);
      return (hash % 100) < trafficPercent;
    }
    
    // Random routing if no address
    return Math.random() * 100 < trafficPercent;
  }
  
  // Hash address for consistent routing
  hashAddress(address) {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Emergency rollback - immediately disable all hybrid features
  emergencyRollback(reason = 'Manual emergency rollback') {
    console.log(`[FEATURE-FLAGS] EMERGENCY ROLLBACK: ${reason}`);
    
    this.update({
      emergencyRollback: true,
      enableHybridSystem: false,
      enableParallelMode: false,
      hybridTrafficPercent: 0,
      rolloutPhase: 'emergency_rollback'
    });
    
    this.emit('emergencyRollback', { reason, timestamp: new Date().toISOString() });
  }
  
  // Set rollout phase
  setRolloutPhase(phase) {
    const validPhases = [
      'disabled', 'foundation', 'parallel', 'gradual', 
      'performance', 'production', 'emergency_rollback'
    ];
    
    if (!validPhases.includes(phase)) {
      throw new Error(`Invalid rollout phase: ${phase}`);
    }
    
    this.set('rolloutPhase', phase);
    
    if (phase === 'foundation' && !this.get('rolloutStartTime')) {
      this.set('rolloutStartTime', new Date().toISOString());
    }
  }
  
  // Get rollout status
  getRolloutStatus() {
    return {
      phase: this.get('rolloutPhase'),
      startTime: this.get('rolloutStartTime'),
      hybridEnabled: this.isHybridEnabled(),
      parallelMode: this.isParallelMode(),
      shadowMode: this.isShadowMode(),
      trafficPercent: this.getTrafficPercent(),
      emergencyRollback: this.get('emergencyRollback'),
      uptime: this.get('rolloutStartTime') ? 
        Date.now() - new Date(this.get('rolloutStartTime')).getTime() : 0
    };
  }
  
  // Get all flags
  getAllFlags() {
    return { ...this.flags };
  }
  
  // Reset to defaults
  reset() {
    this.flags = this.loadDefaultFlags();
    this.saveToFile();
    this.emit('reset');
    console.log('[FEATURE-FLAGS] Reset to default flags');
  }
  
  // Validate flag configuration
  validateConfiguration() {
    const errors = [];
    
    // Check for conflicting flags
    if (this.get('emergencyRollback') && this.get('enableHybridSystem')) {
      errors.push('Emergency rollback is enabled but hybrid system is also enabled');
    }
    
    if (this.get('forceLegacyMode') && this.get('enableHybridSystem')) {
      errors.push('Force legacy mode is enabled but hybrid system is also enabled');
    }
    
    if (this.get('hybridTrafficPercent') > 100 || this.get('hybridTrafficPercent') < 0) {
      errors.push('Hybrid traffic percent must be between 0 and 100');
    }
    
    // Check if shadow mode makes sense
    if (this.get('enableShadowMode') && !this.get('enableParallelMode')) {
      errors.push('Shadow mode requires parallel mode to be enabled');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Global instance
let globalFeatureFlags = null;

function getFeatureFlags() {
  if (!globalFeatureFlags) {
    globalFeatureFlags = new FeatureFlags();
  }
  return globalFeatureFlags;
}

module.exports = {
  FeatureFlags,
  getFeatureFlags
};