/**
 * RelationshipScorer - Calculates comprehensive scores for address relationships
 * Refactored to use BaseService for common functionality
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

import { BaseService } from './BaseService.js';

export class RelationshipScorer extends BaseService {
  constructor(databaseService) {
    super('RelationshipScorer', { database: databaseService });

    // Component weights for final score calculation
    this.weights = {
      volume: 0.25,
      frequency: 0.25,
      temporal: 0.20,
      network: 0.30
    };

    // Cache for expensive calculations
    this.scoreCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Calculate volume-based score (0-100)
   */
  async calculateVolumeScore(relationship) {
    return this.execute('calculateVolumeScore', async () => {
      const totalVolume = parseFloat(relationship.total_volume || 0);
      const transferCount = relationship.transfer_count || 0;

      if (transferCount === 0) {
        return { score: 0, details: {} };
      }

      const avgTransferSize = totalVolume / transferCount;

      // Get volume percentiles from database
      const percentiles = await this.getVolumePercentiles();
      
      // Calculate component scores
      const totalVolumeScore = this.calculatePercentileScore(totalVolume, percentiles.total) * 0.4;
      const avgSizeScore = this.calculatePercentileScore(avgTransferSize, percentiles.average) * 0.3;

      // Volume relative to sender balance
      let balanceRatioScore = 0;
      if (relationship.from_balance) {
        const ratio = totalVolume / parseFloat(relationship.from_balance);
        balanceRatioScore = Math.min(ratio * 30, 30); // Cap at 30 points
      }

      const finalScore = Math.round(totalVolumeScore + avgSizeScore + balanceRatioScore);

      return {
        score: finalScore,
        details: {
          totalVolume,
          avgTransferSize,
          transferCount,
          volumePercentile: this.findPercentile(totalVolume, percentiles.total),
          avgSizePercentile: this.findPercentile(avgTransferSize, percentiles.average),
          balanceRatio: relationship.from_balance ? 
            (totalVolume / parseFloat(relationship.from_balance)).toFixed(2) : null
        }
      };
    }, relationship.from_address, relationship.to_address);
  }

  /**
   * Calculate frequency-based score (0-100)
   */
  async calculateFrequencyScore(relationship) {
    return this.execute('calculateFrequencyScore', async () => {
      const transferCount = relationship.transfer_count || 0;
      
      if (transferCount === 0) {
        return { score: 0, details: {} };
      }

      // Get frequency statistics
      const firstTransfer = new Date(relationship.first_transfer);
      const lastTransfer = new Date(relationship.last_transfer);
      const durationDays = (lastTransfer - firstTransfer) / (1000 * 60 * 60 * 24) || 1;
      const transfersPerDay = transferCount / durationDays;

      // Get frequency percentiles
      const percentiles = await this.getFrequencyPercentiles();

      // Calculate component scores
      const countScore = this.calculatePercentileScore(transferCount, percentiles.count) * 0.4;
      const frequencyScore = this.calculatePercentileScore(transfersPerDay, percentiles.frequency) * 0.3;

      // Consistency score - regular transfers get higher scores
      const consistencyScore = await this.calculateConsistencyScore(
        relationship.from_address,
        relationship.to_address
      ) * 0.3;

      const finalScore = Math.round(countScore + frequencyScore + consistencyScore);

      return {
        score: finalScore,
        details: {
          transferCount,
          durationDays: Math.round(durationDays),
          transfersPerDay: transfersPerDay.toFixed(2),
          countPercentile: this.findPercentile(transferCount, percentiles.count),
          frequencyPercentile: this.findPercentile(transfersPerDay, percentiles.frequency),
          consistencyScore: Math.round(consistencyScore)
        }
      };
    }, relationship.from_address, relationship.to_address);
  }

  /**
   * Calculate temporal score based on recency and patterns
   */
  async calculateTemporalScore(relationship) {
    return this.execute('calculateTemporalScore', async () => {
      const now = Date.now();
      const lastTransfer = new Date(relationship.last_transfer).getTime();
      const firstTransfer = new Date(relationship.first_transfer).getTime();

      // Recency score (0-40 points) - exponential decay
      const daysSinceLastTransfer = (now - lastTransfer) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 40 * Math.exp(-daysSinceLastTransfer / 30));

      // Duration score (0-30 points) - longer relationships score higher
      const durationDays = (lastTransfer - firstTransfer) / (1000 * 60 * 60 * 24);
      const durationScore = Math.min(30, durationDays / 10);

      // Activity pattern score (0-30 points)
      const activityScore = await this.calculateActivityPatternScore(
        relationship.from_address,
        relationship.to_address
      );

      const finalScore = Math.round(recencyScore + durationScore + activityScore);

      return {
        score: finalScore,
        details: {
          daysSinceLastTransfer: Math.round(daysSinceLastTransfer),
          relationshipDurationDays: Math.round(durationDays),
          recencyScore: Math.round(recencyScore),
          durationScore: Math.round(durationScore),
          activityScore: Math.round(activityScore)
        }
      };
    }, relationship.from_address, relationship.to_address);
  }

  /**
   * Calculate network-based score
   */
  async calculateNetworkScore(relationship) {
    return this.execute('calculateNetworkScore', async () => {
      // Get network metrics for both addresses
      const [fromMetrics, toMetrics] = await Promise.all([
        this.getNetworkMetrics(relationship.from_address),
        this.getNetworkMetrics(relationship.to_address)
      ]);

      // Common connections score (0-40 points)
      const commonConnections = await this.getCommonConnections(
        relationship.from_address,
        relationship.to_address
      );
      const commonScore = Math.min(40, commonConnections.length * 5);

      // Centrality score (0-30 points) - how important are the connected addresses
      const centralityScore = (fromMetrics.centrality + toMetrics.centrality) / 2 * 30;

      // Network position score (0-30 points)
      const positionScore = this.calculateNetworkPositionScore(fromMetrics, toMetrics);

      const finalScore = Math.round(commonScore + centralityScore + positionScore);

      return {
        score: finalScore,
        details: {
          commonConnections: commonConnections.length,
          fromCentrality: fromMetrics.centrality.toFixed(2),
          toCentrality: toMetrics.centrality.toFixed(2),
          fromDegree: fromMetrics.degree,
          toDegree: toMetrics.degree,
          networkPosition: positionScore > 20 ? 'central' : positionScore > 10 ? 'intermediate' : 'peripheral'
        }
      };
    }, relationship.from_address, relationship.to_address);
  }

  /**
   * Calculate risk score based on suspicious patterns
   */
  async calculateRiskScore(relationship) {
    return this.execute('calculateRiskScore', async () => {
      let riskScore = 0;
      const riskFactors = [];

      // Check for rapid transfers
      const rapidTransfers = await this.checkRapidTransfers(
        relationship.from_address,
        relationship.to_address
      );
      if (rapidTransfers.found) {
        riskScore += 30;
        riskFactors.push({
          type: 'rapid_transfers',
          severity: 'high',
          details: rapidTransfers.details
        });
      }

      // Check for round number patterns
      const roundNumbers = await this.checkRoundNumbers(relationship);
      if (roundNumbers.suspicious) {
        riskScore += 20;
        riskFactors.push({
          type: 'round_numbers',
          severity: 'medium',
          details: roundNumbers.details
        });
      }

      // Check for unusual timing
      const timingPatterns = await this.checkUnusualTiming(relationship);
      if (timingPatterns.suspicious) {
        riskScore += 15;
        riskFactors.push({
          type: 'unusual_timing',
          severity: 'low',
          details: timingPatterns.details
        });
      }

      // Check if addresses are flagged
      const flaggedAddresses = await this.checkFlaggedAddresses(
        relationship.from_address,
        relationship.to_address
      );
      if (flaggedAddresses.found) {
        riskScore += 35;
        riskFactors.push({
          type: 'flagged_addresses',
          severity: 'high',
          details: flaggedAddresses.details
        });
      }

      return {
        score: Math.min(100, riskScore),
        factors: riskFactors,
        riskLevel: riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low'
      };
    }, relationship.from_address, relationship.to_address);
  }

  /**
   * Calculate comprehensive score for a relationship
   */
  async calculateRelationshipScore(relationship) {
    return this.execute('calculateRelationshipScore', async () => {
      // Check cache first
      const cacheKey = `${relationship.from_address}-${relationship.to_address}`;
      const cached = this.getCachedScore(cacheKey);
      if (cached) return cached;

      // Calculate all component scores in parallel
      const [volumeResult, frequencyResult, temporalResult, networkResult, riskResult] = 
        await Promise.all([
          this.calculateVolumeScore(relationship),
          this.calculateFrequencyScore(relationship),
          this.calculateTemporalScore(relationship),
          this.calculateNetworkScore(relationship),
          this.calculateRiskScore(relationship)
        ]);

      // Calculate weighted base score
      const baseScore = 
        volumeResult.score * this.weights.volume +
        frequencyResult.score * this.weights.frequency +
        temporalResult.score * this.weights.temporal +
        networkResult.score * this.weights.network;

      // Apply risk penalty
      const riskPenalty = riskResult.score * 0.5; // 50% penalty for risk score
      const finalScore = Math.max(0, Math.round(baseScore - riskPenalty));

      const result = {
        totalScore: finalScore,
        components: {
          volume: volumeResult,
          frequency: frequencyResult,
          temporal: temporalResult,
          network: networkResult,
          risk: riskResult
        },
        summary: {
          strength: finalScore > 70 ? 'strong' : finalScore > 40 ? 'medium' : 'weak',
          riskLevel: riskResult.riskLevel,
          primaryFactors: this.identifyPrimaryFactors({
            volume: volumeResult.score,
            frequency: frequencyResult.score,
            temporal: temporalResult.score,
            network: networkResult.score
          })
        }
      };

      // Cache the result
      this.setCachedScore(cacheKey, result);

      return result;
    }, relationship.from_address, relationship.to_address);
  }

  // Helper methods

  async getVolumePercentiles() {
    return this.executeQuery('volumePercentiles', `
      SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY CAST(total_volume AS REAL)) as p99
      FROM account_relationships
    `);
  }

  calculatePercentileScore(value, percentiles) {
    if (value <= percentiles.p25) return 10;
    if (value <= percentiles.p50) return 30;
    if (value <= percentiles.p75) return 50;
    if (value <= percentiles.p90) return 70;
    if (value <= percentiles.p95) return 85;
    if (value <= percentiles.p99) return 95;
    return 100;
  }

  findPercentile(value, percentiles) {
    if (value <= percentiles.p25) return 25;
    if (value <= percentiles.p50) return 50;
    if (value <= percentiles.p75) return 75;
    if (value <= percentiles.p90) return 90;
    if (value <= percentiles.p95) return 95;
    if (value <= percentiles.p99) return 99;
    return 100;
  }

  getCachedScore(key) {
    const cached = this.scoreCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedScore(key, data) {
    this.scoreCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  identifyPrimaryFactors(scores) {
    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([factor]) => factor);
  }

  // Stub methods - implement based on your needs
  async getFrequencyPercentiles() {
    return { count: { p25: 1, p50: 5, p75: 10, p90: 20, p95: 50, p99: 100 } };
  }

  async calculateConsistencyScore() {
    return 15; // Placeholder
  }

  async calculateActivityPatternScore() {
    return 15; // Placeholder
  }

  async getNetworkMetrics(address) {
    return { centrality: 0.5, degree: 10 }; // Placeholder
  }

  async getCommonConnections() {
    return []; // Placeholder
  }

  calculateNetworkPositionScore() {
    return 15; // Placeholder
  }

  async checkRapidTransfers() {
    return { found: false }; // Placeholder
  }

  async checkRoundNumbers() {
    return { suspicious: false }; // Placeholder
  }

  async checkUnusualTiming() {
    return { suspicious: false }; // Placeholder
  }

  async checkFlaggedAddresses() {
    return { found: false }; // Placeholder
  }
}