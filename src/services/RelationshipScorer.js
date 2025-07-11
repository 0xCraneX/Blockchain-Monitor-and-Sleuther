import { logger } from '../utils/logger.js';

/**
 * RelationshipScorer - Calculates comprehensive scores for address relationships
 * 
 * Scoring Components:
 * - Volume Score (0-100): Total volume, average transfer size, relative to balance
 * - Frequency Score (0-100): Transfer count, frequency, consistency
 * - Temporal Score (0-100): Recency, duration, activity patterns
 * - Network Score (0-100): Common connections, centrality, importance
 * - Risk Score (0-100): Suspicious patterns (acts as penalty)
 * 
 * Total Score = Weighted combination with risk penalty
 */
export class RelationshipScorer {
  constructor(databaseService) {
    this.db = databaseService;
    
    // Component weights for final score calculation
    this.weights = {
      volume: 0.25,
      frequency: 0.25,
      temporal: 0.20,
      network: 0.30
    };
    
    // Cache for expensive calculations
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Calculate volume-based score (0-100)
   * Components:
   * - Total volume percentile (0-40 points)
   * - Average transfer size percentile (0-30 points)  
   * - Volume relative to sender balance (0-30 points)
   */
  calculateVolumeScore(relationship) {
    const startTime = Date.now();
    
    try {
      // Get relationship data
      const totalVolume = parseFloat(relationship.total_volume || 0);
      const transferCount = relationship.transfer_count || 0;
      
      if (transferCount === 0) {
        return { score: 0, details: {} };
      }
      
      // Calculate average transfer size
      const avgTransferSize = totalVolume / transferCount;
      
      // Get sender balance
      const sender = this.db.getAccount(relationship.from_address);
      const senderBalance = parseFloat(sender?.balance || 0);
      
      // Calculate percentiles
      const volumePercentile = this._getVolumePercentile(totalVolume);
      const avgSizePercentile = this._getAvgSizePercentile(avgTransferSize);
      
      // Calculate components
      const volumeComponent = Math.min(40, volumePercentile * 40);
      const avgSizeComponent = Math.min(30, avgSizePercentile * 30);
      const relativeVolumeComponent = senderBalance > 0 
        ? Math.min(30, (totalVolume / senderBalance) * 100)
        : 15;
      
      const totalScore = Math.min(100, volumeComponent + avgSizeComponent + relativeVolumeComponent);
      
      const details = {
        totalVolume,
        avgTransferSize,
        volumePercentile,
        avgSizePercentile,
        volumeComponent,
        avgSizeComponent,
        relativeVolumeComponent
      };
      
      logger.debug(`Volume score calculated in ${Date.now() - startTime}ms`);
      
      return { score: totalScore, details };
    } catch (error) {
      logger.error('Error calculating volume score:', error);
      return { score: 0, details: {} };
    }
  }

  /**
   * Calculate frequency-based score (0-100)
   * Components:
   * - Transfer count percentile (0-40 points)
   * - Transfer frequency percentile (0-30 points)
   * - Consistency ratio (0-30 points)
   */
  calculateFrequencyScore(relationship) {
    const startTime = Date.now();
    
    try {
      const transferCount = relationship.transfer_count || 0;
      
      if (transferCount === 0) {
        return { score: 0, details: {} };
      }
      
      // Get temporal data
      const temporalData = this._getTemporalData(relationship.from_address, relationship.to_address);
      
      if (!temporalData.firstTransfer || !temporalData.lastTransfer) {
        return { score: 0, details: {} };
      }
      
      // Calculate days active
      const daysActive = Math.max(1, temporalData.daysActive);
      const transfersPerDay = transferCount / daysActive;
      
      // Get percentiles
      const countPercentile = this._getCountPercentile(transferCount);
      const frequencyPercentile = Math.min(1.0, transfersPerDay / 10); // 10 transfers/day = 100th percentile
      
      // Calculate consistency
      const uniqueDays = temporalData.uniqueDays || 0;
      const consistencyRatio = uniqueDays / daysActive;
      
      // Calculate components
      const countComponent = Math.min(40, countPercentile * 40);
      const frequencyComponent = Math.min(30, frequencyPercentile * 30);
      const consistencyComponent = Math.min(30, consistencyRatio * 30);
      
      const totalScore = Math.min(100, countComponent + frequencyComponent + consistencyComponent);
      
      const details = {
        transferCount,
        daysActive,
        transfersPerDay,
        uniqueDays,
        countPercentile,
        frequencyPercentile,
        countComponent,
        frequencyComponent,
        consistencyComponent
      };
      
      logger.debug(`Frequency score calculated in ${Date.now() - startTime}ms`);
      
      return { score: totalScore, details };
    } catch (error) {
      logger.error('Error calculating frequency score:', error);
      return { score: 0, details: {} };
    }
  }

  /**
   * Calculate temporal score (0-100)
   * Components:
   * - Recency with exponential decay (0-40 points)
   * - Relationship duration (0-30 points)
   * - Recent activity pattern (0-30 points)
   */
  calculateTemporalScore(relationship) {
    const startTime = Date.now();
    
    try {
      const temporalData = this._getTemporalData(relationship.from_address, relationship.to_address);
      
      if (!temporalData.lastTransfer) {
        return { score: 0, details: {} };
      }
      
      // Calculate days since last transfer
      const now = new Date();
      const lastTransferDate = new Date(temporalData.lastTransfer);
      const daysSinceLast = Math.floor((now - lastTransferDate) / (1000 * 60 * 60 * 24));
      
      // Recency component with exponential decay
      let recencyComponent;
      if (daysSinceLast <= 1) {
        recencyComponent = 40;
      } else if (daysSinceLast <= 7) {
        recencyComponent = 35;
      } else if (daysSinceLast <= 30) {
        recencyComponent = 25;
      } else if (daysSinceLast <= 90) {
        recencyComponent = 15;
      } else if (daysSinceLast <= 365) {
        recencyComponent = 5;
      } else {
        recencyComponent = 0;
      }
      
      // Duration component
      const relationshipDays = temporalData.daysActive || 0;
      const durationComponent = Math.min(30, (relationshipDays / 365) * 30);
      
      // Activity pattern component
      const transferCount = relationship.transfer_count || 0;
      let activityComponent = 0;
      
      if (transferCount > 0) {
        const recentWeekRatio = (temporalData.transfersLastWeek || 0) / transferCount;
        const recentMonthRatio = (temporalData.transfersLastMonth || 0) / transferCount;
        activityComponent = Math.min(30, recentWeekRatio * 15 + recentMonthRatio * 15);
      }
      
      const totalScore = recencyComponent + durationComponent + activityComponent;
      
      const details = {
        daysSinceLast,
        relationshipDays,
        transfersLastWeek: temporalData.transfersLastWeek || 0,
        transfersLastMonth: temporalData.transfersLastMonth || 0,
        recencyComponent,
        durationComponent,
        activityComponent
      };
      
      logger.debug(`Temporal score calculated in ${Date.now() - startTime}ms`);
      
      return { score: totalScore, details };
    } catch (error) {
      logger.error('Error calculating temporal score:', error);
      return { score: 0, details: {} };
    }
  }

  /**
   * Calculate network-based score (0-100)
   * Components:
   * - Common connections (0-40 points)
   * - Average degree centrality (0-30 points)
   * - Average PageRank importance (0-30 points)
   */
  calculateNetworkScore(fromAddress, toAddress) {
    const startTime = Date.now();
    
    try {
      // Get common connections
      const commonConnections = this._getCommonConnections(fromAddress, toAddress);
      
      // Get network metrics
      const fromMetrics = this._getNetworkMetrics(fromAddress);
      const toMetrics = this._getNetworkMetrics(toAddress);
      
      // Calculate components
      const commonConnectionsComponent = Math.min(40, commonConnections * 5);
      
      const avgDegreeCentrality = (fromMetrics.degreeCentrality + toMetrics.degreeCentrality) / 2;
      const centralityComponent = Math.min(30, avgDegreeCentrality * 100);
      
      const avgPageRank = (fromMetrics.pageRank + toMetrics.pageRank) / 2;
      const importanceComponent = Math.min(30, avgPageRank * 1000);
      
      const totalScore = Math.min(100, 
        commonConnectionsComponent + centralityComponent + importanceComponent
      );
      
      const details = {
        commonConnections,
        avgDegreeCentrality,
        avgPageRank,
        commonConnectionsComponent,
        centralityComponent,
        importanceComponent
      };
      
      logger.debug(`Network score calculated in ${Date.now() - startTime}ms`);
      
      return { score: totalScore, details };
    } catch (error) {
      logger.error('Error calculating network score:', error);
      return { score: 0, details: {} };
    }
  }

  /**
   * Calculate risk score (0-100, higher = more risky)
   * Components:
   * - Rapid sequential transfers (0-30 points)
   * - Round number patterns (0-25 points)
   * - Unusual time transfers (0-25 points)
   * - New account interaction (0-20 points)
   */
  calculateRiskScore(relationship) {
    const startTime = Date.now();
    
    try {
      const transferCount = relationship.transfer_count || 0;
      
      if (transferCount === 0) {
        return { score: 0, details: {} };
      }
      
      // Get risk indicators
      const riskData = this._getRiskIndicators(relationship.from_address, relationship.to_address);
      
      // Calculate risk components
      const rapidTransferRisk = Math.min(30, (riskData.rapidTransfers / transferCount) * 100);
      const roundNumberRisk = Math.min(25, (riskData.roundNumbers / transferCount) * 50);
      const timeAnomalyRisk = Math.min(25, (riskData.unusualTime / transferCount) * 50);
      const newAccountRisk = riskData.newAccountFlag ? 20 : 0;
      
      const totalRisk = Math.min(100,
        rapidTransferRisk + roundNumberRisk + timeAnomalyRisk + newAccountRisk
      );
      
      const details = {
        rapidTransfers: riskData.rapidTransfers,
        roundNumbers: riskData.roundNumbers,
        unusualTimeTransfers: riskData.unusualTime,
        newAccountInteraction: riskData.newAccountFlag,
        rapidTransferRisk,
        roundNumberRisk,
        timeAnomalyRisk,
        newAccountRisk
      };
      
      logger.debug(`Risk score calculated in ${Date.now() - startTime}ms`);
      
      return { score: totalRisk, details };
    } catch (error) {
      logger.error('Error calculating risk score:', error);
      return { score: 0, details: {} };
    }
  }

  /**
   * Calculate total relationship strength score
   * Combines all components with weighted average and risk penalty
   */
  async calculateTotalScore(fromAddress, toAddress) {
    const startTime = Date.now();
    
    try {
      // Get relationship data
      const relationship = this._getRelationship(fromAddress, toAddress);
      
      if (!relationship) {
        return {
          fromAddress,
          toAddress,
          volumeScore: 0,
          frequencyScore: 0,
          temporalScore: 0,
          networkScore: 0,
          riskScore: 0,
          totalScore: 0,
          details: {}
        };
      }
      
      // Calculate all component scores
      const volumeResult = this.calculateVolumeScore(relationship);
      const frequencyResult = this.calculateFrequencyScore(relationship);
      const temporalResult = this.calculateTemporalScore(relationship);
      const networkResult = this.calculateNetworkScore(fromAddress, toAddress);
      const riskResult = this.calculateRiskScore(relationship);
      
      // Calculate base score with weights
      const baseScore = 
        volumeResult.score * this.weights.volume +
        frequencyResult.score * this.weights.frequency +
        temporalResult.score * this.weights.temporal +
        networkResult.score * this.weights.network;
      
      // Apply risk penalty (max 50% reduction)
      const riskMultiplier = 1 - (riskResult.score / 200);
      const totalScore = Math.round(baseScore * riskMultiplier * 100) / 100;
      
      const result = {
        fromAddress,
        toAddress,
        volumeScore: volumeResult.score,
        frequencyScore: frequencyResult.score,
        temporalScore: temporalResult.score,
        networkScore: networkResult.score,
        riskScore: riskResult.score,
        totalScore,
        details: {
          volume: volumeResult.details,
          frequency: frequencyResult.details,
          temporal: temporalResult.details,
          network: networkResult.details,
          risk: riskResult.details,
          weights: this.weights,
          baseScore,
          riskMultiplier
        }
      };
      
      logger.info(`Total score calculated in ${Date.now() - startTime}ms for ${fromAddress} -> ${toAddress}: ${totalScore}`);
      
      return result;
    } catch (error) {
      logger.error('Error calculating total score:', error);
      throw error;
    }
  }

  /**
   * Update scores for a relationship and persist to database
   */
  async updateScoresForRelationship(fromAddress, toAddress) {
    const startTime = Date.now();
    
    try {
      const scores = await this.calculateTotalScore(fromAddress, toAddress);
      
      // Update the database
      const stmt = this.db.db.prepare(`
        UPDATE account_relationships
        SET 
          volume_score = @volumeScore,
          frequency_score = @frequencyScore,
          temporal_score = @temporalScore,
          network_score = @networkScore,
          risk_score = @riskScore,
          total_score = @totalScore,
          score_updated_at = CURRENT_TIMESTAMP
        WHERE from_address = @fromAddress AND to_address = @toAddress
      `);
      
      stmt.run({
        fromAddress,
        toAddress,
        volumeScore: scores.volumeScore,
        frequencyScore: scores.frequencyScore,
        temporalScore: scores.temporalScore,
        networkScore: scores.networkScore,
        riskScore: scores.riskScore,
        totalScore: scores.totalScore
      });
      
      logger.info(`Scores updated in ${Date.now() - startTime}ms for ${fromAddress} -> ${toAddress}`);
      
      return scores;
    } catch (error) {
      logger.error('Error updating scores:', error);
      throw error;
    }
  }

  /**
   * Calculate scores for multiple relationships efficiently
   */
  async getBulkScores(relationships) {
    const startTime = Date.now();
    const results = [];
    
    try {
      // Process in batches to avoid overwhelming the system
      const batchSize = 10;
      
      for (let i = 0; i < relationships.length; i += batchSize) {
        const batch = relationships.slice(i, i + batchSize);
        
        const batchPromises = batch.map(rel => 
          this.calculateTotalScore(rel.from_address, rel.to_address)
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      
      logger.info(`Bulk scores calculated in ${Date.now() - startTime}ms for ${relationships.length} relationships`);
      
      return results;
    } catch (error) {
      logger.error('Error calculating bulk scores:', error);
      throw error;
    }
  }

  // Helper methods

  _getRelationship(fromAddress, toAddress) {
    const stmt = this.db.db.prepare(`
      SELECT * FROM account_relationships
      WHERE from_address = ? AND to_address = ?
    `);
    return stmt.get(fromAddress, toAddress);
  }

  _getVolumePercentile(volume) {
    const cacheKey = `volume_percentile_${volume}`;
    const cached = this._getCached(cacheKey);
    if (cached !== null) return cached;
    
    const stmt = this.db.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN CAST(total_volume AS REAL) < ? THEN 1 ELSE 0 END) as rank
      FROM account_relationships
    `);
    
    const result = stmt.get(volume);
    const percentile = result.total > 0 ? result.rank / result.total : 0;
    
    this._setCached(cacheKey, percentile);
    return percentile;
  }

  _getAvgSizePercentile(avgSize) {
    const cacheKey = `avg_size_percentile_${avgSize}`;
    const cached = this._getCached(cacheKey);
    if (cached !== null) return cached;
    
    const stmt = this.db.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN CAST(total_volume AS REAL) / NULLIF(transfer_count, 0) < ? THEN 1 ELSE 0 END) as rank
      FROM account_relationships
    `);
    
    const result = stmt.get(avgSize);
    const percentile = result.total > 0 ? result.rank / result.total : 0;
    
    this._setCached(cacheKey, percentile);
    return percentile;
  }

  _getCountPercentile(count) {
    const cacheKey = `count_percentile_${count}`;
    const cached = this._getCached(cacheKey);
    if (cached !== null) return cached;
    
    const stmt = this.db.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN transfer_count < ? THEN 1 ELSE 0 END) as rank
      FROM account_relationships
    `);
    
    const result = stmt.get(count);
    const percentile = result.total > 0 ? result.rank / result.total : 0;
    
    this._setCached(cacheKey, percentile);
    return percentile;
  }

  _getTemporalData(fromAddress, toAddress) {
    const stmt = this.db.db.prepare(`
      SELECT 
        MIN(timestamp) as first_transfer,
        MAX(timestamp) as last_transfer,
        COUNT(DISTINCT DATE(timestamp)) as unique_days,
        COUNT(CASE WHEN datetime(timestamp) >= datetime('now', '-7 days') THEN 1 END) as transfers_last_week,
        COUNT(CASE WHEN datetime(timestamp) >= datetime('now', '-30 days') THEN 1 END) as transfers_last_month
      FROM transfers
      WHERE from_address = ? AND to_address = ?
    `);
    
    const result = stmt.get(fromAddress, toAddress);
    
    if (result && result.first_transfer && result.last_transfer) {
      const firstDate = new Date(result.first_transfer);
      const lastDate = new Date(result.last_transfer);
      const daysActive = Math.max(1, Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1);
      
      return {
        firstTransfer: result.first_transfer,
        lastTransfer: result.last_transfer,
        uniqueDays: result.unique_days || 0,
        transfersLastWeek: result.transfers_last_week || 0,
        transfersLastMonth: result.transfers_last_month || 0,
        daysActive
      };
    }
    
    return {};
  }

  _getCommonConnections(fromAddress, toAddress) {
    const stmt = this.db.db.prepare(`
      SELECT COUNT(DISTINCT CASE 
        WHEN r1.to_address = r2.from_address THEN r1.to_address 
        WHEN r1.from_address = r2.to_address THEN r1.from_address 
      END) as common_connections
      FROM account_relationships r1, account_relationships r2
      WHERE r1.from_address = ? 
      AND r2.to_address = ?
      AND (r1.to_address = r2.from_address OR r1.from_address = r2.to_address)
    `);
    
    const result = stmt.get(fromAddress, toAddress);
    return result?.common_connections || 0;
  }

  _getNetworkMetrics(address) {
    const stmt = this.db.db.prepare(`
      SELECT 
        degree_centrality,
        pagerank
      FROM account_network_metrics
      WHERE address = ?
    `);
    
    const result = stmt.get(address);
    return {
      degreeCentrality: result?.degree_centrality || 0,
      pageRank: result?.pagerank || 0
    };
  }

  _getRiskIndicators(fromAddress, toAddress) {
    // Get rapid transfers
    const rapidStmt = this.db.db.prepare(`
      SELECT COUNT(*) as rapid_count
      FROM transfers t1
      JOIN transfers t2 ON t1.to_address = t2.from_address
      WHERE t1.from_address = ?
      AND t2.to_address = ?
      AND ABS(julianday(t2.timestamp) - julianday(t1.timestamp)) * 24 * 60 < 5
    `);
    
    const rapidResult = rapidStmt.get(fromAddress, toAddress);
    
    // Get round numbers
    const roundStmt = this.db.db.prepare(`
      SELECT COUNT(*) as round_count
      FROM transfers
      WHERE from_address = ? AND to_address = ?
      AND (
        CAST(value AS REAL) % 1000000000000 = 0 OR
        CAST(value AS REAL) % 10000000000000 = 0 OR
        CAST(value AS REAL) % 100000000000000 = 0
      )
    `);
    
    const roundResult = roundStmt.get(fromAddress, toAddress);
    
    // Get unusual time transfers
    const unusualStmt = this.db.db.prepare(`
      SELECT COUNT(*) as unusual_count
      FROM transfers
      WHERE from_address = ? AND to_address = ?
      AND CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 2 AND 5
    `);
    
    const unusualResult = unusualStmt.get(fromAddress, toAddress);
    
    // Check new account
    const accountStmt = this.db.db.prepare(`
      SELECT 
        ar.created_at as rel_created,
        a.created_at as acc_created
      FROM account_relationships ar
      JOIN accounts a ON ar.to_address = a.address
      WHERE ar.from_address = ? AND ar.to_address = ?
    `);
    
    const accountResult = accountStmt.get(fromAddress, toAddress);
    let newAccountFlag = false;
    
    if (accountResult?.rel_created && accountResult?.acc_created) {
      const relCreated = new Date(accountResult.rel_created);
      const accCreated = new Date(accountResult.acc_created);
      const daysDiff = Math.floor((relCreated - accCreated) / (1000 * 60 * 60 * 24));
      newAccountFlag = daysDiff < 7;
    }
    
    return {
      rapidTransfers: rapidResult?.rapid_count || 0,
      roundNumbers: roundResult?.round_count || 0,
      unusualTime: unusualResult?.unusual_count || 0,
      newAccountFlag
    };
  }

  _getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }
    return null;
  }

  _setCached(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Interpret the meaning of a score
   */
  interpretScore(score) {
    if (score <= 20) {
      return "Very weak relationship (minimal interaction)";
    } else if (score <= 40) {
      return "Weak relationship (occasional interaction)";
    } else if (score <= 60) {
      return "Moderate relationship (regular interaction)";
    } else if (score <= 80) {
      return "Strong relationship (frequent, consistent interaction)";
    } else {
      return "Very strong relationship (high volume, frequent, well-connected)";
    }
  }
}