import { logger } from '../utils/logger.js';

/**
 * PatternDetector service for identifying suspicious transaction patterns
 * Integrates with RiskAssessment service to detect money laundering patterns
 */
export class PatternDetector {
  constructor(databaseService) {
    this.db = databaseService?.db;
    this.databaseService = databaseService;
    
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
    // Rapid sequential transfers query
    this.rapidMovementStmt = this.db.prepare(`
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

    // Circular flow detection query  
    this.circularFlowStmt = this.db.prepare(`
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

    // Layering pattern detection
    this.layeringStmt = this.db.prepare(`
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
    this.roundNumbersStmt = this.db.prepare(`
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
    this.unusualTimingStmt = this.db.prepare(`
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
  }

  /**
   * Detect rapid sequential transfers within a time window
   * @param {string} address - Address to analyze
   * @param {number} timeWindow - Time window in seconds (default: 300 = 5 minutes)
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectRapidMovement(address, timeWindow = 300) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting rapid movement for ${address}`, { timeWindow });

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const timeWindowMinutes = timeWindow / 60;
      const sequences = this.rapidMovementStmt.all(address, timeWindowMinutes);

      if (sequences.length === 0) {
        return this._createResult('RAPID_MOVEMENT', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address,
          timeWindow
        });
      }

      // Calculate confidence based on sequence characteristics
      let confidence = this.patternTypes.RAPID_MOVEMENT.baseConfidence;
      
      // Boost confidence for very rapid sequences (< 1 minute)
      const veryRapidCount = sequences.filter(s => s.minutes_elapsed < 1).length;
      confidence += Math.min(veryRapidCount * 0.1, 0.2);

      // Boost confidence for multiple sequences
      confidence += Math.min(sequences.length * 0.05, 0.2);

      // Boost confidence for large amounts
      const largeAmountSequences = sequences.filter(s => 
        parseFloat(s.amount1) > 1000000000000 // > 1 DOT (assuming 10^12 planck units)
      ).length;
      confidence += Math.min(largeAmountSequences * 0.05, 0.15);

      confidence = Math.min(confidence, 1.0);

      const evidence = sequences.map(seq => ({
        path: `${seq.from_address} -> ${seq.hop1} -> ${seq.hop2}`,
        timeElapsed: `${seq.minutes_elapsed.toFixed(2)} minutes`,
        amounts: [seq.amount1, seq.amount2],
        transactions: [seq.tx1_hash, seq.tx2_hash],
        startTime: seq.start_time,
        endTime: seq.end_time
      }));

      const severity = confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low';

      logger.info(`Rapid movement detection completed`, {
        address,
        sequencesFound: sequences.length,
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('RAPID_MOVEMENT', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        timeWindow,
        totalSequences: sequences.length
      });

    } catch (error) {
      logger.error('Error detecting rapid movement', error);
      throw error;
    }
  }

  /**
   * Detect circular money flows (money returning to origin)
   * @param {string} address - Starting address
   * @param {number} maxDepth - Maximum path depth (default: 5)
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectCircularFlow(address, maxDepth = 5) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting circular flows for ${address}`, { maxDepth });

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const minVolume = '1000000000000'; // 1 DOT minimum
      const circularPaths = this.circularFlowStmt.all(address, minVolume, maxDepth);

      if (circularPaths.length === 0) {
        return this._createResult('CIRCULAR_FLOW', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address,
          maxDepth
        });
      }

      // Calculate confidence based on circular flow characteristics
      let confidence = this.patternTypes.CIRCULAR_FLOW.baseConfidence;

      // Boost confidence for shorter paths (more suspicious)
      const shortPaths = circularPaths.filter(p => p.path_length <= 3).length;
      confidence += Math.min(shortPaths * 0.1, 0.15);

      // Boost confidence for multiple circular paths
      confidence += Math.min(circularPaths.length * 0.05, 0.15);

      // Boost confidence for high-value flows
      const highValuePaths = circularPaths.filter(p => 
        parseFloat(p.min_volume_in_path) > 10000000000000 // > 10 DOT
      ).length;
      confidence += Math.min(highValuePaths * 0.05, 0.1);

      confidence = Math.min(confidence, 1.0);

      const evidence = circularPaths.map(path => ({
        path: path.path,
        pathLength: path.path_length,
        minVolumeInPath: path.min_volume_in_path,
        circularType: path.path_length <= 3 ? 'direct_circular' : 'complex_circular'
      }));

      const severity = confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low';

      logger.info(`Circular flow detection completed`, {
        address,
        circularPathsFound: circularPaths.length,
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('CIRCULAR_FLOW', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        maxDepth,
        totalPaths: circularPaths.length
      });

    } catch (error) {
      logger.error('Error detecting circular flows', error);
      throw error;
    }
  }

  /**
   * Detect layering patterns (multiple hops with similar amounts)
   * @param {string} address - Address to analyze
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectLayering(address) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting layering patterns for ${address}`);

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const minVolume = '1000000000000'; // 1 DOT minimum
      const layeringPaths = this.layeringStmt.all(address, minVolume);

      if (layeringPaths.length === 0) {
        return this._createResult('LAYERING', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Calculate confidence based on layering characteristics
      let confidence = this.patternTypes.LAYERING.baseConfidence;

      // Boost confidence for longer chains
      const longChains = layeringPaths.filter(p => p.hops >= 5).length;
      confidence += Math.min(longChains * 0.1, 0.2);

      // Boost confidence for multiple similar paths
      const avgSimilarPaths = layeringPaths.reduce((sum, p) => sum + p.similar_paths, 0) / layeringPaths.length;
      confidence += Math.min((avgSimilarPaths - 2) * 0.05, 0.15);

      // Boost confidence for consistent amounts throughout the chain
      const consistentAmounts = layeringPaths.filter(p => 
        Math.abs(parseFloat(p.original_amount) - parseFloat(p.current_amount)) / parseFloat(p.original_amount) < 0.05
      ).length;
      confidence += Math.min(consistentAmounts * 0.1, 0.15);

      confidence = Math.min(confidence, 1.0);

      const evidence = layeringPaths.map(path => ({
        path: path.path,
        hops: path.hops,
        originalAmount: path.original_amount,
        finalAmount: path.current_amount,
        similarPaths: path.similar_paths,
        amountDeviation: Math.abs(
          (parseFloat(path.original_amount) - parseFloat(path.current_amount)) / parseFloat(path.original_amount)
        ).toFixed(4)
      }));

      const severity = confidence > 0.7 ? 'high' : confidence > 0.5 ? 'medium' : 'low';

      logger.info(`Layering detection completed`, {
        address,
        layeringPathsFound: layeringPaths.length,
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('LAYERING', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        totalPaths: layeringPaths.length
      });

    } catch (error) {
      logger.error('Error detecting layering patterns', error);
      throw error;
    }
  }

  /**
   * Detect mixing patterns (interaction with known mixers)
   * @param {string} address - Address to analyze
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectMixingPatterns(address) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting mixing patterns for ${address}`);

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      // Query for interactions with high-degree nodes (potential mixers)
      const mixingQuery = this.db.prepare(`
        SELECT 
          ar.from_address,
          ar.to_address,
          ar.total_volume,
          ar.transfer_count,
          nm.degree as connected_degree,
          nm.node_type,
          nm.risk_score as connected_risk_score,
          a.identity_display as connected_identity
        FROM account_relationships ar
        JOIN node_metrics nm ON (
          CASE 
            WHEN ar.from_address = ? THEN nm.address = ar.to_address
            ELSE nm.address = ar.from_address
          END
        )
        LEFT JOIN accounts a ON a.address = nm.address
        WHERE (ar.from_address = ? OR ar.to_address = ?)
          AND nm.degree > 100  -- High-degree nodes (potential mixers)
          AND ar.total_volume >= 1000000000000  -- Minimum 1 DOT
        ORDER BY nm.degree DESC, ar.total_volume DESC
      `);

      const mixingConnections = mixingQuery.all(address, address, address);

      // Also check for interactions with nodes that have suspicious patterns
      const suspiciousNodesQuery = this.db.prepare(`
        SELECT 
          ar.from_address,
          ar.to_address,
          ar.total_volume,
          ar.transfer_count,
          COUNT(DISTINCT p.pattern_type) as pattern_count,
          GROUP_CONCAT(DISTINCT p.pattern_type) as patterns
        FROM account_relationships ar
        JOIN patterns p ON (
          CASE 
            WHEN ar.from_address = ? THEN p.address = ar.to_address
            ELSE p.address = ar.from_address
          END
        )
        WHERE (ar.from_address = ? OR ar.to_address = ?)
          AND p.confidence > 0.6
          AND p.false_positive = 0
        GROUP BY ar.from_address, ar.to_address
        HAVING pattern_count >= 2
        ORDER BY pattern_count DESC, ar.total_volume DESC
      `);

      const suspiciousConnections = suspiciousNodesQuery.all(address, address, address);

      const totalSuspiciousConnections = mixingConnections.length + suspiciousConnections.length;

      if (totalSuspiciousConnections === 0) {
        return this._createResult('MIXING_PATTERNS', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Calculate confidence based on mixing indicators
      let confidence = this.patternTypes.MIXING_PATTERNS.baseConfidence;

      // Boost confidence for multiple high-degree connections
      confidence += Math.min(mixingConnections.length * 0.05, 0.2);

      // Boost confidence for connections to known risky nodes
      const highRiskConnections = mixingConnections.filter(c => c.connected_risk_score > 70).length;
      confidence += Math.min(highRiskConnections * 0.1, 0.15);

      // Boost confidence for connections to nodes with multiple suspicious patterns
      confidence += Math.min(suspiciousConnections.length * 0.1, 0.2);

      // Reduce confidence if connected nodes have identities (less likely to be mixers)
      const identifiedConnections = mixingConnections.filter(c => c.connected_identity).length;
      confidence -= Math.min(identifiedConnections * 0.05, 0.1);

      confidence = Math.max(0.1, Math.min(confidence, 1.0));

      const evidence = [
        ...mixingConnections.map(conn => ({
          type: 'high_degree_connection',
          connectedAddress: conn.from_address === address ? conn.to_address : conn.from_address,
          connectedDegree: conn.connected_degree,
          connectedIdentity: conn.connected_identity,
          totalVolume: conn.total_volume,
          transferCount: conn.transfer_count,
          riskScore: conn.connected_risk_score,
          direction: conn.from_address === address ? 'outgoing' : 'incoming'
        })),
        ...suspiciousConnections.map(conn => ({
          type: 'suspicious_patterns_connection',
          connectedAddress: conn.from_address === address ? conn.to_address : conn.from_address,
          patternCount: conn.pattern_count,
          patterns: conn.patterns.split(','),
          totalVolume: conn.total_volume,
          transferCount: conn.transfer_count,
          direction: conn.from_address === address ? 'outgoing' : 'incoming'
        }))
      ];

      const severity = confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low';

      logger.info(`Mixing patterns detection completed`, {
        address,
        mixingConnectionsFound: mixingConnections.length,
        suspiciousConnectionsFound: suspiciousConnections.length,
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('MIXING_PATTERNS', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        mixingConnections: mixingConnections.length,
        suspiciousConnections: suspiciousConnections.length
      });

    } catch (error) {
      logger.error('Error detecting mixing patterns', error);
      throw error;
    }
  }

  /**
   * Detect unusual timing patterns (transfers at odd hours)
   * @param {string} address - Address to analyze
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectUnusualTiming(address) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting unusual timing patterns for ${address}`);

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const unusualTransfers = this.unusualTimingStmt.all(address, address);

      if (unusualTransfers.length === 0) {
        return this._createResult('UNUSUAL_TIMING', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Get total transfer count for the address to calculate percentage
      const totalTransfersQuery = this.db.prepare(`
        SELECT COUNT(*) as total_count
        FROM transfers
        WHERE (from_address = ? OR to_address = ?)
          AND success = 1
      `);
      const totalResult = totalTransfersQuery.get(address, address);
      const totalTransfers = totalResult.total_count;

      if (totalTransfers === 0) {
        return this._createResult('UNUSUAL_TIMING', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Calculate confidence based on timing patterns
      const unusualPercentage = unusualTransfers.length / totalTransfers;
      let confidence = this.patternTypes.UNUSUAL_TIMING.baseConfidence;

      // Boost confidence for high percentage of unusual timing
      if (unusualPercentage > 0.5) confidence += 0.3;
      else if (unusualPercentage > 0.3) confidence += 0.2;
      else if (unusualPercentage > 0.1) confidence += 0.1;

      // Analyze timing patterns
      const nightTransfers = unusualTransfers.filter(t => t.timing_type === 'night').length;
      const weekendTransfers = unusualTransfers.filter(t => t.timing_type === 'weekend').length;

      // Boost confidence for concentration in night hours
      if (nightTransfers / unusualTransfers.length > 0.7) confidence += 0.2;

      // Boost confidence for high-value unusual timing transfers
      const highValueUnusual = unusualTransfers.filter(t => 
        parseFloat(t.value) > 10000000000000 // > 10 DOT
      ).length;
      confidence += Math.min(highValueUnusual * 0.05, 0.15);

      confidence = Math.min(confidence, 1.0);

      const evidence = {
        unusualTransfers: unusualTransfers.map(transfer => ({
          hash: transfer.hash,
          from: transfer.from_address,
          to: transfer.to_address,
          value: transfer.value,
          timestamp: transfer.timestamp,
          hour: transfer.hour,
          dayOfWeek: transfer.day_of_week,
          timingType: transfer.timing_type
        })),
        statistics: {
          totalTransfers,
          unusualCount: unusualTransfers.length,
          unusualPercentage: (unusualPercentage * 100).toFixed(2) + '%',
          nightTransfers,
          weekendTransfers,
          patternBreakdown: {
            night: `${((nightTransfers / unusualTransfers.length) * 100).toFixed(1)}%`,
            weekend: `${((weekendTransfers / unusualTransfers.length) * 100).toFixed(1)}%`
          }
        }
      };

      const severity = confidence > 0.7 ? 'medium' : 'low'; // Unusual timing is rarely high severity

      logger.info(`Unusual timing detection completed`, {
        address,
        unusualTransfersFound: unusualTransfers.length,
        totalTransfers,
        unusualPercentage: (unusualPercentage * 100).toFixed(2) + '%',
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('UNUSUAL_TIMING', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        unusualCount: unusualTransfers.length,
        totalTransfers
      });

    } catch (error) {
      logger.error('Error detecting unusual timing patterns', error);
      throw error;
    }
  }

  /**
   * Detect suspiciously round number patterns
   * @param {string} address - Address to analyze  
   * @returns {Object} Detection result with confidence and evidence
   */
  async detectRoundNumbers(address) {
    const startTime = Date.now();
    try {
      logger.info(`Detecting round number patterns for ${address}`);

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      const roundTransfers = this.roundNumbersStmt.all(address, address);

      if (roundTransfers.length === 0) {
        return this._createResult('ROUND_NUMBERS', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Get total transfer count for the address to calculate percentage
      const totalTransfersQuery = this.db.prepare(`
        SELECT COUNT(*) as total_count
        FROM transfers
        WHERE (from_address = ? OR to_address = ?)
          AND success = 1
      `);
      const totalResult = totalTransfersQuery.get(address, address);
      const totalTransfers = totalResult.total_count;

      if (totalTransfers === 0) {
        return this._createResult('ROUND_NUMBERS', 0, [], 'low', {
          executionTime: Date.now() - startTime,
          address
        });
      }

      // Calculate confidence based on round number patterns
      const roundPercentage = roundTransfers.length / totalTransfers;
      let confidence = this.patternTypes.ROUND_NUMBERS.baseConfidence;

      // Boost confidence for high percentage of round numbers
      if (roundPercentage > 0.4) confidence += 0.3;
      else if (roundPercentage > 0.2) confidence += 0.2;
      else if (roundPercentage > 0.1) confidence += 0.1;

      // Analyze round number types
      const perfectRound = roundTransfers.filter(t => t.round_type === 'perfect_round').length;
      const semiRound = roundTransfers.filter(t => t.round_type === 'semi_round').length;

      // Boost confidence for perfect round numbers (more suspicious)
      confidence += Math.min(perfectRound * 0.05, 0.2);

      // Boost confidence for many trailing zeros
      const highTrailingZeros = roundTransfers.filter(t => t.trailing_zeros >= 6).length;
      confidence += Math.min(highTrailingZeros * 0.05, 0.15);

      confidence = Math.min(confidence, 1.0);

      const evidence = {
        roundTransfers: roundTransfers.map(transfer => ({
          hash: transfer.hash,
          from: transfer.from_address,
          to: transfer.to_address,
          value: transfer.value,
          timestamp: transfer.timestamp,
          roundType: transfer.round_type,
          trailingZeros: transfer.trailing_zeros
        })),
        statistics: {
          totalTransfers,
          roundCount: roundTransfers.length,
          roundPercentage: (roundPercentage * 100).toFixed(2) + '%',
          perfectRoundCount: perfectRound,
          semiRoundCount: semiRound,
          patternBreakdown: {
            perfectRound: `${((perfectRound / roundTransfers.length) * 100).toFixed(1)}%`,
            semiRound: `${((semiRound / roundTransfers.length) * 100).toFixed(1)}%`
          }
        }
      };

      const severity = confidence > 0.6 ? 'medium' : 'low'; // Round numbers are rarely high severity

      logger.info(`Round numbers detection completed`, {
        address,
        roundTransfersFound: roundTransfers.length,
        totalTransfers,
        roundPercentage: (roundPercentage * 100).toFixed(2) + '%',
        confidence,
        executionTime: Date.now() - startTime
      });

      return this._createResult('ROUND_NUMBERS', confidence, evidence, severity, {
        executionTime: Date.now() - startTime,
        address,
        roundCount: roundTransfers.length,
        totalTransfers
      });

    } catch (error) {
      logger.error('Error detecting round number patterns', error);
      throw error;
    }
  }

  /**
   * Analyze transfer patterns for general suspicious activity
   * @param {Array} transfers - Array of transfer objects
   * @returns {Object} Analysis result with pattern insights
   */
  analyzeTransferPatterns(transfers) {
    const startTime = Date.now();
    try {
      logger.info(`Analyzing transfer patterns`, { transferCount: transfers.length });

      if (!Array.isArray(transfers) || transfers.length === 0) {
        return {
          patterns: [],
          confidence: 0,
          severity: 'low',
          analysis: {
            totalTransfers: 0,
            executionTime: Date.now() - startTime
          }
        };
      }

      const patterns = [];
      let overallConfidence = 0;

      // Analyze transfer volume patterns
      const volumeAnalysis = this._analyzeVolumePatterns(transfers);
      if (volumeAnalysis.suspicious) {
        patterns.push(volumeAnalysis);
        overallConfidence += volumeAnalysis.confidence * 0.3;
      }

      // Analyze temporal patterns
      const temporalAnalysis = this._analyzeTemporalPatterns(transfers);
      if (temporalAnalysis.suspicious) {
        patterns.push(temporalAnalysis);
        overallConfidence += temporalAnalysis.confidence * 0.2;
      }

      // Analyze counterparty patterns
      const counterpartyAnalysis = this._analyzeCounterpartyPatterns(transfers);
      if (counterpartyAnalysis.suspicious) {
        patterns.push(counterpartyAnalysis);
        overallConfidence += counterpartyAnalysis.confidence * 0.2;
      }

      // Analyze frequency patterns
      const frequencyAnalysis = this._analyzeFrequencyPatterns(transfers);
      if (frequencyAnalysis.suspicious) {
        patterns.push(frequencyAnalysis);
        overallConfidence += frequencyAnalysis.confidence * 0.3;
      }

      overallConfidence = Math.min(overallConfidence, 1.0);
      const severity = overallConfidence > 0.7 ? 'high' : overallConfidence > 0.4 ? 'medium' : 'low';

      logger.info(`Transfer pattern analysis completed`, {
        transferCount: transfers.length,
        patternsFound: patterns.length,
        overallConfidence,
        executionTime: Date.now() - startTime
      });

      return {
        patterns,
        confidence: overallConfidence,
        severity,
        analysis: {
          totalTransfers: transfers.length,
          patternsDetected: patterns.length,
          executionTime: Date.now() - startTime,
          breakdown: {
            volume: volumeAnalysis.suspicious,
            temporal: temporalAnalysis.suspicious,
            counterparty: counterpartyAnalysis.suspicious,
            frequency: frequencyAnalysis.suspicious
          }
        }
      };

    } catch (error) {
      logger.error('Error analyzing transfer patterns', error);
      throw error;
    }
  }

  // Helper methods for pattern analysis

  _analyzeVolumePatterns(transfers) {
    const volumes = transfers.map(t => parseFloat(t.value || t.amount || 0));
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const maxVolume = Math.max(...volumes);
    const minVolume = Math.min(...volumes);

    // Check for unusual volume spikes
    const spikes = volumes.filter(v => v > avgVolume * 10).length;
    const uniformity = this._calculateUniformity(volumes);

    let confidence = 0;
    const evidence = [];

    if (spikes > 0) {
      confidence += Math.min(spikes * 0.1, 0.4);
      evidence.push(`${spikes} volume spikes detected (>10x average)`);
    }

    if (uniformity > 0.8) {
      confidence += 0.3;
      evidence.push(`High volume uniformity detected (${(uniformity * 100).toFixed(1)}%)`);
    }

    const volumeRange = maxVolume / minVolume;
    if (volumeRange > 1000) {
      confidence += 0.2;
      evidence.push(`Extreme volume range detected (${volumeRange.toFixed(0)}x)`);
    }

    return {
      type: 'volume_patterns',
      suspicious: confidence > 0.3,
      confidence,
      evidence,
      metrics: {
        avgVolume,
        maxVolume,
        minVolume,
        volumeRange,
        uniformity
      }
    };
  }

  _analyzeTemporalPatterns(transfers) {
    if (transfers.length < 2) return { suspicious: false, confidence: 0 };

    const timestamps = transfers
      .map(t => new Date(t.timestamp))
      .sort((a, b) => a - b);

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const uniformity = this._calculateUniformity(intervals);

    let confidence = 0;
    const evidence = [];

    // Check for highly regular intervals (suspicious)
    if (uniformity > 0.9) {
      confidence += 0.4;
      evidence.push(`Highly regular timing detected (${(uniformity * 100).toFixed(1)}% uniformity)`);
    }

    // Check for burst patterns
    const shortIntervals = intervals.filter(i => i < avgInterval * 0.1).length;
    if (shortIntervals > intervals.length * 0.3) {
      confidence += 0.3;
      evidence.push(`Burst pattern detected (${shortIntervals} rapid-fire transfers)`);
    }

    return {
      type: 'temporal_patterns',
      suspicious: confidence > 0.2,
      confidence,
      evidence,
      metrics: {
        avgInterval: avgInterval / 1000 / 60, // minutes
        uniformity,
        burstTransfers: shortIntervals
      }
    };
  }

  _analyzeCounterpartyPatterns(transfers) {
    const counterparties = new Set();
    const addresses = new Set();

    transfers.forEach(t => {
      if (t.from_address) addresses.add(t.from_address);
      if (t.to_address) addresses.add(t.to_address);
      
      const counterparty = t.from_address || t.to_address;
      if (counterparty) counterparties.add(counterparty);
    });

    const uniqueCounterparties = counterparties.size;
    const counterpartyRatio = uniqueCounterparties / transfers.length;

    let confidence = 0;
    const evidence = [];

    // Very few counterparties (potential structuring)
    if (counterpartyRatio < 0.1 && transfers.length > 10) {
      confidence += 0.4;
      evidence.push(`Low counterparty diversity (${uniqueCounterparties} unique counterparties for ${transfers.length} transfers)`);
    }

    // Check for concentration with single counterparty
    const counterpartyCounts = {};
    counterparties.forEach(cp => {
      counterpartyCounts[cp] = transfers.filter(t => 
        t.from_address === cp || t.to_address === cp
      ).length;
    });

    const maxCounterpartyTransfers = Math.max(...Object.values(counterpartyCounts));
    if (maxCounterpartyTransfers > transfers.length * 0.7) {
      confidence += 0.3;
      evidence.push(`High concentration with single counterparty (${maxCounterpartyTransfers} transfers)`);
    }

    return {
      type: 'counterparty_patterns',
      suspicious: confidence > 0.2,
      confidence,
      evidence,
      metrics: {
        uniqueCounterparties,
        counterpartyRatio,
        maxConcentration: maxCounterpartyTransfers
      }
    };
  }

  _analyzeFrequencyPatterns(transfers) {
    if (transfers.length < 5) return { suspicious: false, confidence: 0 };

    const timestamps = transfers.map(t => new Date(t.timestamp)).sort((a, b) => a - b);
    const timespan = timestamps[timestamps.length - 1] - timestamps[0];
    const frequency = transfers.length / (timespan / (1000 * 60 * 60 * 24)); // transfers per day

    let confidence = 0;
    const evidence = [];

    // Very high frequency (potential automated activity)
    if (frequency > 100) {
      confidence += 0.5;
      evidence.push(`Very high transaction frequency (${frequency.toFixed(1)} transfers/day)`);
    } else if (frequency > 50) {
      confidence += 0.3;
      evidence.push(`High transaction frequency (${frequency.toFixed(1)} transfers/day)`);
    }

    // Check for consistent daily patterns
    const dailyCounts = {};
    timestamps.forEach(ts => {
      const day = ts.toISOString().split('T')[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const dailyValues = Object.values(dailyCounts);
    const dailyUniformity = this._calculateUniformity(dailyValues);

    if (dailyUniformity > 0.8 && dailyValues.length > 3) {
      confidence += 0.3;
      evidence.push(`Consistent daily transaction pattern (${(dailyUniformity * 100).toFixed(1)}% uniformity)`);
    }

    return {
      type: 'frequency_patterns',
      suspicious: confidence > 0.2,
      confidence,
      evidence,
      metrics: {
        frequency,
        dailyUniformity,
        timespan: timespan / (1000 * 60 * 60 * 24) // days
      }
    };
  }

  _calculateUniformity(values) {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Return coefficient of variation inverted (higher = more uniform)
    const cv = stdDev / mean;
    return Math.max(0, 1 - cv);
  }

  _createResult(patternType, confidence, evidence, severity, metadata) {
    return {
      patternType,
      confidence: Math.min(Math.max(confidence, 0), 1), // Clamp between 0-1
      evidence,
      severity,
      metadata: {
        detectedAt: new Date().toISOString(),
        ...metadata
      }
    };
  }
}