/**
 * PatternDetector service for identifying suspicious transaction patterns
 * Refactored to use BaseService for common functionality
 */

import { BaseService } from './BaseService.js';

export class PatternDetector extends BaseService {
  constructor(databaseService) {
    super('PatternDetector', { database: databaseService });

    // Pattern types and their base confidence thresholds
    this.patternTypes = {
      RAPID_MOVEMENT: { baseConfidence: 0.7, severity: 'high' },
      CIRCULAR_FLOW: { baseConfidence: 0.8, severity: 'high' },
      LAYERING: { baseConfidence: 0.6, severity: 'medium' },
      MIXING_PATTERNS: { baseConfidence: 0.9, severity: 'high' },
      UNUSUAL_TIMING: { baseConfidence: 0.5, severity: 'low' },
      ROUND_NUMBERS: { baseConfidence: 0.4, severity: 'low' },
      COMPLEX_ROUTING: { baseConfidence: 0.7, severity: 'medium' }
    };

    if (this.db) {
      this.prepareStatements();
    }
  }

  prepareStatements() {
    // Use the actual db instance
    const db = this.db.db || this.db;

    // Rapid sequential transfers query
    this.rapidMovementStmt = db.prepare(`
      WITH transfer_sequences AS (
        SELECT 
          t1.from_address,
          t1.to_address as hop1,
          t2.to_address as hop2,
          t1.timestamp as start_time,
          t2.timestamp as end_time,
          (julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 as minutes_elapsed,
          t1.value as amount1,
          t2.value as amount2,
          t1.hash as tx1_hash,
          t2.hash as tx2_hash
        FROM transfers t1
        JOIN transfers t2 ON t1.to_address = t2.from_address
        WHERE t1.from_address = ?
          AND t2.timestamp > t1.timestamp
          AND (julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 <= ?
          AND ABS(CAST(t1.value AS REAL) - CAST(t2.value AS REAL)) / CAST(t1.value AS REAL) < 0.15
          AND t1.success = 1 AND t2.success = 1
      )
      SELECT * FROM transfer_sequences
      ORDER BY minutes_elapsed, amount1 DESC
    `);

    // Layering pattern detection
    this.layeringStmt = db.prepare(`
      WITH RECURSIVE layering_paths AS (
        SELECT 
          from_address as origin,
          to_address as current,
          1 as hops,
          CAST(from_address || '->' || to_address AS TEXT) as path,
          total_volume as original_amount,
          total_volume as current_amount
        FROM account_relationships
        WHERE from_address = ?
          AND total_volume >= CAST(? AS INTEGER)
        
        UNION ALL
        
        SELECT 
          lp.origin,
          ar.to_address,
          lp.hops + 1,
          lp.path || '->' || ar.to_address,
          lp.original_amount,
          ar.total_volume
        FROM account_relationships ar
        JOIN layering_paths lp ON ar.from_address = lp.current
        WHERE lp.hops < 8
          AND lp.path NOT LIKE '%' || ar.to_address || '%'
          AND ABS(CAST(ar.total_volume AS REAL) - CAST(lp.current_amount AS REAL)) / CAST(lp.current_amount AS REAL) < 0.2
      )
      SELECT 
        path,
        hops,
        original_amount,
        current_amount,
        COUNT(*) as similar_paths
      FROM layering_paths
      WHERE hops >= 3
      GROUP BY origin, current, original_amount
      HAVING similar_paths >= 2
      ORDER BY hops DESC, similar_paths DESC
    `);

    // Round numbers detection
    this.roundNumbersStmt = db.prepare(`
      SELECT 
        from_address,
        to_address,
        value,
        timestamp,
        hash,
        CASE 
          WHEN CAST(value AS TEXT) REGEXP '^[1-9]0+$' THEN 'perfect_round'
          WHEN CAST(value AS TEXT) REGEXP '^[1-9][05]0+$' THEN 'semi_round'
          ELSE 'other'
        END as round_type,
        LENGTH(CAST(value AS TEXT)) - LENGTH(RTRIM(CAST(value AS TEXT), '0')) as trailing_zeros
      FROM transfers
      WHERE from_address = ? OR to_address = ?
        AND success = 1
        AND (
          CAST(value AS TEXT) REGEXP '^[1-9]0{3,}$' OR  -- At least 1000, 10000, etc.
          CAST(value AS TEXT) REGEXP '^[1-9][05]0{2,}$'  -- Like 1500, 2500, etc.
        )
      ORDER BY timestamp DESC
    `);

    // Unusual timing detection
    this.unusualTimingStmt = db.prepare(`
      SELECT 
        from_address,
        to_address,
        value,
        timestamp,
        hash,
        strftime('%H', timestamp) as hour,
        strftime('%w', timestamp) as day_of_week,
        CASE 
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 22 AND 6 THEN 'night'
          WHEN CAST(strftime('%w', timestamp) AS INTEGER) IN (0, 6) THEN 'weekend'
          ELSE 'normal'
        END as timing_type
      FROM transfers
      WHERE (from_address = ? OR to_address = ?)
        AND success = 1
        AND (
          CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 22 AND 6 OR
          CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 0 AND 4 OR
          CAST(strftime('%w', timestamp) AS INTEGER) IN (0, 6)
        )
      ORDER BY timestamp DESC
    `);

    // Mixing patterns detection - high degree nodes
    this.mixingPatternsStmt = db.prepare(`
      WITH high_degree_nodes AS (
        SELECT 
          address,
          degree,
          risk_score,
          node_type
        FROM node_metrics
        WHERE degree > 100
          OR risk_score > 70
          OR node_type IN ('mixer', 'exchange')
      )
      SELECT 
        ar.from_address,
        ar.to_address,
        ar.total_volume,
        ar.transfer_count,
        nm.degree,
        nm.risk_score,
        nm.node_type,
        CASE 
          WHEN ar.from_address = ? THEN 'outgoing'
          ELSE 'incoming'
        END as direction
      FROM account_relationships ar
      JOIN high_degree_nodes nm ON (
        (ar.to_address = nm.address AND ar.from_address = ?) OR
        (ar.from_address = nm.address AND ar.to_address = ?)
      )
      ORDER BY nm.degree DESC, nm.risk_score DESC
    `);

    // Circular flow detection query
    this.circularFlowStmt = db.prepare(`
      WITH RECURSIVE circular_paths AS (
        SELECT 
          from_address as origin,
          to_address as current,
          1 as depth,
          CAST(from_address || '->' || to_address AS TEXT) as path,
          total_volume,
          0 as is_circular
        FROM account_relationships
        WHERE from_address = ?
          AND total_volume >= CAST(? AS INTEGER)
        
        UNION ALL
        
        SELECT 
          cp.origin,
          ar.to_address,
          cp.depth + 1,
          cp.path || '->' || ar.to_address,
          MIN(cp.total_volume, ar.total_volume),
          CASE WHEN ar.to_address = cp.origin THEN 1 ELSE 0 END as is_circular
        FROM account_relationships ar
        JOIN circular_paths cp ON ar.from_address = cp.current
        WHERE cp.depth < ?
          AND cp.is_circular = 0
          AND (ar.to_address = cp.origin OR cp.path NOT LIKE '%' || ar.to_address || '%')
      )
      SELECT 
        path,
        depth as path_length,
        total_volume as min_volume_in_path
      FROM circular_paths
      WHERE is_circular = 1
      ORDER BY depth, total_volume DESC
    `);

    // Continue with other prepared statements...
    this.logger.info('Prepared statements initialized');
  }

  /**
   * Detect rapid sequential transfers (money moving quickly through accounts)
   */
  async detectRapidMovement(address, timeWindowMinutes = 300) {
    return this.execute('detectRapidMovement', async () => {
      this.ensureInitialized();

      const results = await this.executeQuery(
        'rapidMovement',
        this.rapidMovementStmt,
        [address, timeWindowMinutes]
      );

      if (!results || results.length === 0) {
        return this._createResult('RAPID_MOVEMENT', 0, [], 'low', {
          address,
          timeWindow: timeWindowMinutes
        });
      }

      // Calculate confidence based on number of hops and time elapsed
      const avgMinutes = results.reduce((sum, r) => sum + r.minutes_elapsed, 0) / results.length;
      const confidence = Math.min(0.9, this.patternTypes.RAPID_MOVEMENT.baseConfidence *
        (1 + (10 / avgMinutes) * 0.3));

      const severity = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';

      return this._createResult('RAPID_MOVEMENT', confidence, results, severity, {
        address,
        timeWindow: timeWindowMinutes,
        averageMinutesBetweenTransfers: avgMinutes,
        totalSequences: results.length
      });
    }, address, timeWindowMinutes);
  }

  /**
   * Detect circular flow patterns (money returning to original account)
   */
  async detectCircularFlow(address, maxDepth = 5, minVolume = '0') {
    return this.execute('detectCircularFlow', async () => {
      this.ensureInitialized();

      const results = await this.executeQuery(
        'circularFlow',
        this.circularFlowStmt,
        [address, minVolume, maxDepth]
      );

      if (!results || results.length === 0) {
        return this._createResult('CIRCULAR_FLOW', 0, [], 'low', {
          address,
          maxDepth
        });
      }

      // Higher confidence for shorter circular paths
      const avgPathLength = results.reduce((sum, r) => sum + r.path_length, 0) / results.length;
      const confidence = Math.min(0.95, this.patternTypes.CIRCULAR_FLOW.baseConfidence *
        (1 + (2 / avgPathLength) * 0.2));

      const severity = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';

      return this._createResult('CIRCULAR_FLOW', confidence, results, severity, {
        address,
        maxDepth,
        averagePathLength: avgPathLength,
        circularPathsFound: results.length
      });
    }, address, maxDepth, minVolume);
  }

  /**
   * Create standardized result object
   */
  _createResult(patternType, confidence, evidence, severity, metadata = {}) {
    // Ensure confidence is between 0 and 1
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      patternType,
      confidence,
      evidence,
      severity,
      metadata: {
        ...metadata,
        detectedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate uniformity of values (for pattern detection)
   */
  _calculateUniformity(values) {
    if (values.length === 0) {
      return 0;
    }

    const numericValues = values.map(v => parseFloat(v));
    const mean = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;

    if (mean === 0) {
      return 0;
    }

    const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    // Convert to uniformity score (0 = highly varied, 1 = very uniform)
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Analyze transfer patterns for suspicious activity
   */
  analyzeTransferPatterns(transfers) {
    if (!Array.isArray(transfers) || transfers.length === 0) {
      return {
        patterns: [],
        confidence: 0,
        severity: 'low',
        analysis: {
          totalTransfers: 0,
          breakdown: {}
        }
      };
    }

    const patterns = [];
    let totalConfidence = 0;

    // Volume analysis
    const volumes = transfers.map(t => parseFloat(t.value || 0));
    const volumeUniformity = this._calculateUniformity(volumes);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const maxVolume = Math.max(...volumes);
    const spikes = volumes.filter(v => v > avgVolume * 10).length;

    if (volumeUniformity > 0.8 || spikes > 0) {
      patterns.push({
        type: 'volume_patterns',
        description: spikes > 0 ? `${spikes} volume spikes detected (>10x average)` : 'Highly uniform transfer amounts',
        uniformity: volumeUniformity,
        spikes: spikes,
        suspicious: true
      });
      totalConfidence += 0.3;
    }

    // Temporal analysis
    const timestamps = transfers.map(t => new Date(t.timestamp).getTime()).sort();
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const intervalUniformity = this._calculateUniformity(intervals);
    if (intervalUniformity > 0.7) {
      patterns.push({
        type: 'temporal_patterns',
        description: 'Regular time intervals between transfers',
        uniformity: intervalUniformity,
        suspicious: true
      });
      totalConfidence += 0.3;
    }

    // Counterparty analysis
    const counterparties = new Set();
    transfers.forEach(t => {
      if (t.to_address) {
        counterparties.add(t.to_address);
      }
      if (t.from_address) {
        counterparties.add(t.from_address);
      }
    });

    const counterpartyRatio = counterparties.size / transfers.length;
    if (counterpartyRatio < 0.2) {
      patterns.push({
        type: 'counterparty_patterns',
        description: 'Limited number of unique counterparties',
        ratio: counterpartyRatio,
        suspicious: true
      });
      totalConfidence += 0.2;
    }

    // Frequency analysis
    const frequency = transfers.length / ((timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60 * 24)); // transfers per day
    if (frequency > 50) {
      patterns.push({
        type: 'frequency_patterns',
        description: 'High frequency of transfers',
        transfersPerDay: frequency,
        suspicious: true
      });
      totalConfidence += 0.2;
    }

    const confidence = Math.min(1, totalConfidence);
    const severity = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';

    return {
      patterns,
      confidence,
      severity,
      analysis: {
        totalTransfers: transfers.length,
        breakdown: {
          volumeUniformity,
          temporalUniformity: intervalUniformity,
          counterpartyDiversity: counterpartyRatio,
          dailyFrequency: frequency
        }
      }
    };
  }

  /**
   * Detect layering patterns (multiple hops with similar amounts)
   */
  async detectLayering(address) {
    return this.execute('detectLayering', async () => {
      this.ensureInitialized();

      const minVolume = '1000000000000'; // 1 DOT minimum
      const results = await this.executeQuery(
        'layering',
        this.layeringStmt,
        [address, minVolume]
      );

      if (!results || results.length === 0) {
        return this._createResult('LAYERING', 0, [], 'low', { address });
      }

      // Calculate confidence based on layering characteristics
      let confidence = this.patternTypes.LAYERING.baseConfidence;

      // Boost confidence for longer chains
      const longChains = results.filter(p => p.hops >= 5).length;
      confidence += Math.min(longChains * 0.1, 0.2);

      // Boost confidence for multiple similar paths
      const avgSimilarPaths = results.reduce((sum, p) => sum + p.similar_paths, 0) / results.length;
      confidence += Math.min((avgSimilarPaths - 2) * 0.05, 0.15);

      confidence = Math.min(confidence, 1.0);

      const severity = confidence > 0.7 ? 'high' : confidence > 0.5 ? 'medium' : 'low';

      return this._createResult('LAYERING', confidence, results, severity, {
        address,
        averageHops: results.reduce((sum, r) => sum + r.hops, 0) / results.length,
        layeringPathsFound: results.length
      });
    }, address);
  }

  /**
   * Detect mixing patterns with high-degree nodes
   */
  async detectMixingPatterns(address) {
    return this.execute('detectMixingPatterns', async () => {
      this.ensureInitialized();

      const results = await this.executeQuery(
        'mixingPatterns',
        this.mixingPatternsStmt,
        [address, address, address]
      );

      if (!results || results.length === 0) {
        return this._createResult('MIXING_PATTERNS', 0, [], 'low', { address });
      }

      // Calculate confidence based on mixing patterns
      let confidence = this.patternTypes.MIXING_PATTERNS.baseConfidence;

      // Check for high-risk connections
      const highRiskConnections = results.filter(r => r.risk_score > 70).length;
      confidence += Math.min(highRiskConnections * 0.1, 0.3);

      // Check for connections to mixers
      const mixerConnections = results.filter(r => r.node_type === 'mixer').length;
      confidence += Math.min(mixerConnections * 0.15, 0.3);

      confidence = Math.min(confidence, 1.0);

      const severity = confidence > 0.8 ? 'high' : confidence > 0.5 ? 'medium' : 'low';

      return this._createResult('MIXING_PATTERNS', confidence, results, severity, {
        address,
        highRiskConnections,
        mixerConnections,
        totalConnections: results.length
      });
    }, address);
  }

  /**
   * Detect unusual timing patterns
   */
  async detectUnusualTiming(address) {
    return this.execute('detectUnusualTiming', async () => {
      this.ensureInitialized();

      const results = await this.executeQuery(
        'unusualTiming',
        this.unusualTimingStmt,
        [address, address]
      );

      if (!results || results.length === 0) {
        return this._createResult('UNUSUAL_TIMING', 0,
          { unusualTransfers: [], statistics: {} }, 'low', { address });
      }

      // Calculate timing statistics
      const nightTransfers = results.filter(r => r.timing_type === 'night').length;
      const weekendTransfers = results.filter(r => r.timing_type === 'weekend').length;
      const totalTransfers = results.length;

      // Calculate confidence based on unusual timing patterns
      let confidence = 0;

      if (nightTransfers / totalTransfers > 0.3) {
        confidence += 0.3;
      }

      if (weekendTransfers / totalTransfers > 0.4) {
        confidence += 0.2;
      }

      confidence = Math.min(confidence, this.patternTypes.UNUSUAL_TIMING.baseConfidence);

      const severity = confidence > 0.4 ? 'medium' : 'low';

      return this._createResult('UNUSUAL_TIMING', confidence,
        {
          unusualTransfers: results,
          statistics: {
            nightTransfers,
            weekendTransfers,
            totalTransfers,
            nightPercentage: (nightTransfers / totalTransfers * 100).toFixed(2),
            weekendPercentage: (weekendTransfers / totalTransfers * 100).toFixed(2)
          }
        },
        severity, { address });
    }, address);
  }

  /**
   * Detect round number patterns
   */
  async detectRoundNumbers(address) {
    return this.execute('detectRoundNumbers', async () => {
      this.ensureInitialized();

      const results = await this.executeQuery(
        'roundNumbers',
        this.roundNumbersStmt,
        [address, address]
      );

      if (!results || results.length === 0) {
        return this._createResult('ROUND_NUMBERS', 0,
          { roundTransfers: [], statistics: {} }, 'low', { address });
      }

      // Calculate round number statistics
      const perfectRounds = results.filter(r => r.round_type === 'perfect_round').length;
      const semiRounds = results.filter(r => r.round_type === 'semi_round').length;
      const totalRounds = results.length;

      // Calculate confidence based on round number prevalence
      let confidence = this.patternTypes.ROUND_NUMBERS.baseConfidence;

      if (perfectRounds / totalRounds > 0.5) {
        confidence += 0.2;
      }

      if (totalRounds > 5) {
        confidence += 0.1;
      }

      confidence = Math.min(confidence, 0.7);

      const severity = confidence > 0.5 ? 'medium' : 'low';

      return this._createResult('ROUND_NUMBERS', confidence,
        {
          roundTransfers: results,
          statistics: {
            perfectRounds,
            semiRounds,
            totalRounds,
            perfectRoundPercentage: (perfectRounds / totalRounds * 100).toFixed(2),
            semiRoundPercentage: (semiRounds / totalRounds * 100).toFixed(2)
          }
        },
        severity, { address });
    }, address);
  }
}