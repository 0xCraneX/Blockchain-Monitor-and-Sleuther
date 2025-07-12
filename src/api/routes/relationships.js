import express from 'express';
import { RelationshipScorer } from '../../services/RelationshipScorer.js';
import { logger } from '../../utils/logger.js';

export function createRelationshipsRouter(databaseService) {
  const router = express.Router();
  const scorer = new RelationshipScorer(databaseService);

  /**
   * GET /api/relationships/:from/:to/score
   * Calculate relationship strength score between two addresses
   */
  router.get('/:from/:to/score', async (req, res) => {
    try {
      const { from, to } = req.params;

      logger.info(`Calculating relationship score for ${from} -> ${to}`);

      const score = await scorer.calculateTotalScore(from, to);

      res.json({
        success: true,
        data: {
          fromAddress: score.fromAddress,
          toAddress: score.toAddress,
          scores: {
            total: score.totalScore,
            volume: score.volumeScore,
            frequency: score.frequencyScore,
            temporal: score.temporalScore,
            network: score.networkScore,
            risk: score.riskScore
          },
          interpretation: scorer.interpretScore(score.totalScore),
          details: score.details
        }
      });
    } catch (error) {
      logger.error('Error calculating relationship score:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate relationship score'
      });
    }
  });

  /**
   * POST /api/relationships/:from/:to/score
   * Calculate and update relationship score in database
   */
  router.post('/:from/:to/score', async (req, res) => {
    try {
      const { from, to } = req.params;

      logger.info(`Updating relationship score for ${from} -> ${to}`);

      const score = await scorer.updateScoresForRelationship(from, to);

      res.json({
        success: true,
        data: {
          fromAddress: score.fromAddress,
          toAddress: score.toAddress,
          totalScore: score.totalScore,
          message: 'Relationship score updated successfully'
        }
      });
    } catch (error) {
      logger.error('Error updating relationship score:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update relationship score'
      });
    }
  });

  /**
   * GET /api/relationships/top
   * Get top relationships by score
   */
  router.get('/top', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const minScore = parseFloat(req.query.minScore) || 0;

      const stmt = databaseService.db.prepare(`
        SELECT 
          ar.*,
          a1.identity_display as from_identity,
          a2.identity_display as to_identity
        FROM account_relationships ar
        LEFT JOIN accounts a1 ON ar.from_address = a1.address
        LEFT JOIN accounts a2 ON ar.to_address = a2.address
        WHERE ar.total_score >= ?
        ORDER BY ar.total_score DESC
        LIMIT ?
      `);

      const relationships = stmt.all(minScore, limit);

      res.json({
        success: true,
        data: relationships
      });
    } catch (error) {
      logger.error('Error fetching top relationships:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch top relationships'
      });
    }
  });

  /**
   * GET /api/relationships/suspicious
   * Get suspicious relationships (high volume + high risk)
   */
  router.get('/suspicious', async (req, res) => {
    try {
      const minVolumeScore = parseFloat(req.query.minVolumeScore) || 70;
      const minRiskScore = parseFloat(req.query.minRiskScore) || 30;
      const limit = parseInt(req.query.limit) || 50;

      const stmt = databaseService.db.prepare(`
        SELECT 
          from_address,
          to_address,
          total_score,
          volume_score,
          risk_score,
          total_volume,
          transfer_count,
          score_updated_at
        FROM account_relationships
        WHERE volume_score >= ? AND risk_score >= ?
        ORDER BY risk_score DESC
        LIMIT ?
      `);

      const relationships = stmt.all(minVolumeScore, minRiskScore, limit);

      res.json({
        success: true,
        data: relationships
      });
    } catch (error) {
      logger.error('Error fetching suspicious relationships:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch suspicious relationships'
      });
    }
  });

  /**
   * POST /api/relationships/bulk-score
   * Calculate scores for multiple relationships
   */
  router.post('/bulk-score', async (req, res) => {
    try {
      const { relationships } = req.body;

      if (!Array.isArray(relationships)) {
        return res.status(400).json({
          success: false,
          error: 'relationships must be an array'
        });
      }

      logger.info(`Calculating scores for ${relationships.length} relationships`);

      const scores = await scorer.getBulkScores(relationships);

      res.json({
        success: true,
        data: {
          count: scores.length,
          scores: scores.map(s => ({
            fromAddress: s.fromAddress,
            toAddress: s.toAddress,
            totalScore: s.totalScore,
            interpretation: scorer.interpretScore(s.totalScore)
          }))
        }
      });
    } catch (error) {
      logger.error('Error calculating bulk scores:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate bulk scores'
      });
    }
  });

  /**
   * GET /api/relationships/distribution
   * Get score distribution statistics
   */
  router.get('/distribution', async (req, res) => {
    try {
      const stmt = databaseService.db.prepare(`
        SELECT 
          CASE 
            WHEN total_score <= 20 THEN '0-20'
            WHEN total_score <= 40 THEN '21-40'
            WHEN total_score <= 60 THEN '41-60'
            WHEN total_score <= 80 THEN '61-80'
            ELSE '81-100'
          END as score_range,
          CASE 
            WHEN total_score <= 20 THEN 'Very Weak'
            WHEN total_score <= 40 THEN 'Weak'
            WHEN total_score <= 60 THEN 'Moderate'
            WHEN total_score <= 80 THEN 'Strong'
            ELSE 'Very Strong'
          END as strength,
          COUNT(*) as count,
          AVG(total_score) as avg_score,
          AVG(transfer_count) as avg_transfers,
          AVG(CAST(total_volume AS REAL)) as avg_volume
        FROM account_relationships
        WHERE total_score IS NOT NULL
        GROUP BY score_range, strength
        ORDER BY 
          CASE score_range
            WHEN '0-20' THEN 1
            WHEN '21-40' THEN 2
            WHEN '41-60' THEN 3
            WHEN '61-80' THEN 4
            ELSE 5
          END
      `);

      const distribution = stmt.all();

      res.json({
        success: true,
        data: distribution
      });
    } catch (error) {
      logger.error('Error fetching score distribution:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch score distribution'
      });
    }
  });

  return router;
}