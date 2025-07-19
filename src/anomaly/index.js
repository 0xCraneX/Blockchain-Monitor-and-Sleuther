/**
 * Anomaly Detection Module for Blockchain Whale Monitoring
 * 
 * This module provides comprehensive anomaly detection for the top 1000 Polkadot whales
 * using multiple detection methods:
 * 
 * - Statistical: Z-score analysis for outliers
 * - Behavioral: Dormant accounts, role changes
 * - Velocity: Transaction rate spikes and bursts
 * - Network: Connection patterns and clustering
 * - Temporal: Timing patterns and timezone analysis
 */

export { AnomalyEngine } from './AnomalyEngine.js';
export { PatternStorage } from './PatternStorage.js';
export { BaseAnomalyDetector } from './BaseAnomalyDetector.js';

// Import for use in createAnomalyEngine
import { AnomalyEngine } from './AnomalyEngine.js';

// Individual detectors (if needed for custom implementations)
export { StatisticalAnomalyDetector } from './detectors/StatisticalAnomalyDetector.js';
export { BehavioralAnomalyDetector } from './detectors/BehavioralAnomalyDetector.js';
export { VelocityAnomalyDetector } from './detectors/VelocityAnomalyDetector.js';
export { NetworkAnomalyDetector } from './detectors/NetworkAnomalyDetector.js';
export { TemporalAnomalyDetector } from './detectors/TemporalAnomalyDetector.js';

/**
 * Quick Start Example:
 * 
 * import { AnomalyEngine } from './src/anomaly/index.js';
 * 
 * // Initialize the engine
 * const anomalyEngine = new AnomalyEngine({
 *   enabled: true,
 *   updatePatternsEnabled: true,
 *   learningEnabled: true,
 *   weights: {
 *     statistical: 0.25,
 *     behavioral: 0.20,
 *     velocity: 0.20,
 *     network: 0.20,
 *     temporal: 0.15
 *   }
 * });
 * 
 * // Analyze a whale's activity
 * const result = await anomalyEngine.analyzeActivity(
 *   whaleAddress,
 *   currentActivity,
 *   recentTransfers,
 *   relatedAddresses
 * );
 * 
 * if (result.riskLevel !== 'NONE') {
 *   console.log(`Alert: ${result.summary}`);
 *   console.log(`Risk Score: ${result.riskScore}`);
 *   console.log(`Recommendations:`, result.recommendations);
 * }
 */

// Default configuration for easy setup
export const defaultConfig = {
  anomalyEngine: {
    enabled: true,
    updatePatternsEnabled: true,
    learningEnabled: true,
    weights: {
      statistical: 0.25,
      behavioral: 0.20,
      velocity: 0.20,
      network: 0.20,
      temporal: 0.15
    },
    riskThresholds: {
      low: 0.3,
      medium: 0.5,
      high: 0.7,
      critical: 0.9
    }
  },
  patternStorage: {
    basePath: './data/anomaly-patterns',
    maxPatternsInMemory: 100,
    compressionEnabled: true
  },
  detectors: {
    statistical: {
      zScoreThreshold: 3.0,
      minDataPoints: 30
    },
    behavioral: {
      dormantThresholdDays: 30,
      roleChangeThreshold: 0.7
    },
    velocity: {
      spikeMultiplier: 5,
      burstMinTransactions: 10
    },
    network: {
      newConnectionThreshold: 5,
      clusteringThreshold: 0.7
    },
    temporal: {
      unusualHourThreshold: 0.05,
      timezoneConsistencyThreshold: 0.8
    }
  }
};

/**
 * Helper function to create a configured engine
 */
export function createAnomalyEngine(customConfig = {}) {
  const config = {
    ...defaultConfig.anomalyEngine,
    ...customConfig,
    patternStorage: {
      ...defaultConfig.patternStorage,
      ...customConfig.patternStorage
    },
    statistical: {
      ...defaultConfig.detectors.statistical,
      ...customConfig.statistical
    },
    behavioral: {
      ...defaultConfig.detectors.behavioral,
      ...customConfig.behavioral
    },
    velocity: {
      ...defaultConfig.detectors.velocity,
      ...customConfig.velocity
    },
    network: {
      ...defaultConfig.detectors.network,
      ...customConfig.network
    },
    temporal: {
      ...defaultConfig.detectors.temporal,
      ...customConfig.temporal
    }
  };
  
  return new AnomalyEngine(config);
}