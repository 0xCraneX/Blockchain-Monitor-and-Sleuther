import express from 'express';
import { createAnomalyEngine } from '../anomaly/index.js';
import { AnomalyAlertSystem } from '../alerts/AnomalyAlertSystem.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const FileStorage = require('../storage/FileStorage.js');
// Simple console logger fallback since the main logger has import issues
const monitorLogger = {
  info: (msg, data) => console.log(`[ANOMALY] ${msg}`, data || ''),
  error: (msg, error) => console.error(`[ANOMALY] ${msg}`, error || ''),
  success: (msg, data) => console.log(`[ANOMALY] ✅ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[ANOMALY] ⚠️ ${msg}`, data || '')
};

const router = express.Router();

// Initialize anomaly engine and alert system
const anomalyEngine = createAnomalyEngine({
  enabled: true,
  updatePatternsEnabled: true,
  learningEnabled: true
});

const storage = new FileStorage('./data');
const alertSystem = new AnomalyAlertSystem(storage, {
  channels: {
    console: true,
    file: true
  },
  enableSmartFiltering: true,
  enableAggregation: true
});

// Store recent anomaly results
const recentAnomalies = [];
const maxRecentAnomalies = 100;

/**
 * GET /api/anomalies/stats
 * Get anomaly detection statistics
 */
router.get('/stats', (req, res) => {
  try {
    const engineStats = anomalyEngine.getStats();
    const alertStats = alertSystem.getStats();
    
    res.json({
      success: true,
      stats: {
        engine: engineStats,
        alerts: alertStats,
        recentCount: recentAnomalies.length,
        lastDetection: recentAnomalies.length > 0 ? 
          recentAnomalies[recentAnomalies.length - 1].timestamp : null
      }
    });
  } catch (error) {
    monitorLogger.error('Error getting anomaly stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/anomalies/recent
 * Get recent anomaly detections
 */
router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const minRiskScore = parseFloat(req.query.minRiskScore) || 0;
    
    const filtered = recentAnomalies
      .filter(a => a.riskScore >= minRiskScore)
      .slice(-limit)
      .reverse();
    
    res.json({
      success: true,
      anomalies: filtered,
      total: recentAnomalies.length
    });
  } catch (error) {
    monitorLogger.error('Error getting recent anomalies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/anomalies/analyze
 * Analyze activity for anomalies
 */
router.post('/analyze', async (req, res) => {
  try {
    const { address, activity, recentTransfers, relatedAddresses } = req.body;
    
    if (!address || !activity) {
      return res.status(400).json({ 
        success: false, 
        error: 'Address and activity are required' 
      });
    }
    
    // Run anomaly detection
    const result = await anomalyEngine.analyzeActivity(
      address,
      activity,
      recentTransfers || [],
      relatedAddresses || []
    );
    
    // Store result if anomaly detected
    if (result.riskLevel !== 'NONE') {
      recentAnomalies.push({
        ...result,
        id: `anomaly_${Date.now()}`
      });
      
      // Trim array
      if (recentAnomalies.length > maxRecentAnomalies) {
        recentAnomalies.shift();
      }
      
      // Process through alert system
      await alertSystem.processAnomalyResult(address, result, {
        amount: activity.amount,
        type: activity.type
      });
    }
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    monitorLogger.error('Error analyzing activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/anomalies/patterns/:address
 * Get pattern data for a specific address
 */
router.get('/patterns/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const pattern = await anomalyEngine.patternStorage.getPattern(address);
    
    res.json({
      success: true,
      pattern
    });
  } catch (error) {
    monitorLogger.error('Error getting pattern:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/anomalies/risk-distribution
 * Get risk score distribution
 */
router.get('/risk-distribution', (req, res) => {
  try {
    const distribution = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      NONE: 0
    };
    
    recentAnomalies.forEach(anomaly => {
      distribution[anomaly.riskLevel]++;
    });
    
    res.json({
      success: true,
      distribution,
      total: recentAnomalies.length
    });
  } catch (error) {
    monitorLogger.error('Error getting risk distribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/anomalies/types
 * Get anomaly type breakdown
 */
router.get('/types', (req, res) => {
  try {
    const types = {};
    
    recentAnomalies.forEach(anomaly => {
      if (anomaly.anomalies) {
        anomaly.anomalies.forEach(a => {
          types[a.type] = (types[a.type] || 0) + 1;
        });
      }
    });
    
    res.json({
      success: true,
      types,
      total: Object.values(types).reduce((a, b) => a + b, 0)
    });
  } catch (error) {
    monitorLogger.error('Error getting anomaly types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/anomalies/batch-analyze
 * Analyze multiple activities
 */
router.post('/batch-analyze', async (req, res) => {
  try {
    const { activities } = req.body;
    
    if (!Array.isArray(activities)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Activities array is required' 
      });
    }
    
    const results = await anomalyEngine.analyzeBatch(activities);
    
    // Store anomalies
    const anomalies = results.filter(r => r && r.riskLevel !== 'NONE');
    anomalies.forEach(anomaly => {
      recentAnomalies.push({
        ...anomaly,
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
    });
    
    // Trim array
    while (recentAnomalies.length > maxRecentAnomalies) {
      recentAnomalies.shift();
    }
    
    res.json({
      success: true,
      analyzed: activities.length,
      anomaliesFound: anomalies.length,
      results: anomalies
    });
  } catch (error) {
    monitorLogger.error('Error in batch analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
export { anomalyEngine, alertSystem, recentAnomalies };