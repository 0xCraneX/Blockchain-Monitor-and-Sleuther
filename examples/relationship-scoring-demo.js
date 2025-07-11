import { DatabaseService } from '../src/services/DatabaseService.js';
import { RelationshipScorer } from '../src/services/RelationshipScorer.js';
import { logger } from '../src/utils/logger.js';

/**
 * Demo script showing how to use the RelationshipScorer service
 */
async function main() {
  const db = new DatabaseService();
  
  try {
    // Initialize database
    await db.initialize();
    
    // Create scorer instance
    const scorer = new RelationshipScorer(db);
    
    // Example 1: Calculate score for a specific relationship
    console.log('\n=== Example 1: Single Relationship Score ===');
    const fromAddress = '1YourFromAddressHere';
    const toAddress = '1YourToAddressHere';
    
    const score = await scorer.calculateTotalScore(fromAddress, toAddress);
    
    console.log(`\nRelationship: ${fromAddress} -> ${toAddress}`);
    console.log('\nComponent Scores:');
    console.log(`  Volume Score: ${score.volumeScore.toFixed(2)}/100`);
    console.log(`  Frequency Score: ${score.frequencyScore.toFixed(2)}/100`);
    console.log(`  Temporal Score: ${score.temporalScore.toFixed(2)}/100`);
    console.log(`  Network Score: ${score.networkScore.toFixed(2)}/100`);
    console.log(`  Risk Score: ${score.riskScore.toFixed(2)}/100 (penalty)`);
    console.log(`\nTotal Strength Score: ${score.totalScore.toFixed(2)}/100`);
    console.log(`Interpretation: ${scorer.interpretScore(score.totalScore)}`);
    
    // Example 2: Update scores in database
    console.log('\n=== Example 2: Update Scores in Database ===');
    await scorer.updateScoresForRelationship(fromAddress, toAddress);
    console.log('Scores updated successfully in database');
    
    // Example 3: Get top relationships by score
    console.log('\n=== Example 3: Top Relationships by Score ===');
    const topRelationships = db.db.prepare(`
      SELECT 
        from_address,
        to_address,
        total_score,
        volume_score,
        frequency_score,
        temporal_score,
        network_score,
        risk_score,
        transfer_count,
        total_volume
      FROM account_relationships
      WHERE total_score > 0
      ORDER BY total_score DESC
      LIMIT 10
    `).all();
    
    console.log('\nTop 10 Relationships:');
    topRelationships.forEach((rel, index) => {
      console.log(`${index + 1}. ${rel.from_address.substring(0, 8)}... -> ${rel.to_address.substring(0, 8)}...`);
      console.log(`   Score: ${rel.total_score?.toFixed(2) || 'N/A'} | Transfers: ${rel.transfer_count} | Volume: ${rel.total_volume}`);
    });
    
    // Example 4: Find suspicious relationships
    console.log('\n=== Example 4: Suspicious Relationships ===');
    const suspiciousRelationships = db.db.prepare(`
      SELECT 
        from_address,
        to_address,
        total_score,
        volume_score,
        risk_score,
        transfer_count
      FROM account_relationships
      WHERE volume_score > 70 AND risk_score > 30
      ORDER BY risk_score DESC
      LIMIT 5
    `).all();
    
    console.log('\nHigh Volume + High Risk Relationships:');
    suspiciousRelationships.forEach((rel, index) => {
      console.log(`${index + 1}. ${rel.from_address.substring(0, 8)}... -> ${rel.to_address.substring(0, 8)}...`);
      console.log(`   Volume Score: ${rel.volume_score?.toFixed(2) || 'N/A'} | Risk Score: ${rel.risk_score?.toFixed(2) || 'N/A'}`);
    });
    
    // Example 5: Bulk scoring
    console.log('\n=== Example 5: Bulk Scoring ===');
    const relationships = db.db.prepare(`
      SELECT from_address, to_address
      FROM account_relationships
      WHERE total_score IS NULL OR score_updated_at IS NULL
      LIMIT 5
    `).all();
    
    if (relationships.length > 0) {
      console.log(`\nScoring ${relationships.length} relationships...`);
      const startTime = Date.now();
      const scores = await scorer.getBulkScores(relationships);
      const duration = Date.now() - startTime;
      
      console.log(`Completed in ${duration}ms`);
      console.log(`Average time per relationship: ${(duration / relationships.length).toFixed(2)}ms`);
      
      // Update scores in database
      const updateStmt = db.db.prepare(`
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
      
      const updateMany = db.db.transaction((scores) => {
        for (const score of scores) {
          updateStmt.run({
            fromAddress: score.fromAddress,
            toAddress: score.toAddress,
            volumeScore: score.volumeScore,
            frequencyScore: score.frequencyScore,
            temporalScore: score.temporalScore,
            networkScore: score.networkScore,
            riskScore: score.riskScore,
            totalScore: score.totalScore
          });
        }
      });
      
      updateMany(scores);
      console.log('Bulk scores updated in database');
    } else {
      console.log('No relationships need scoring');
    }
    
    // Example 6: Score distribution analysis
    console.log('\n=== Example 6: Score Distribution ===');
    const distribution = db.db.prepare(`
      SELECT 
        CASE 
          WHEN total_score <= 20 THEN '0-20 (Very Weak)'
          WHEN total_score <= 40 THEN '21-40 (Weak)'
          WHEN total_score <= 60 THEN '41-60 (Moderate)'
          WHEN total_score <= 80 THEN '61-80 (Strong)'
          ELSE '81-100 (Very Strong)'
        END as score_range,
        COUNT(*) as count,
        AVG(total_score) as avg_score,
        AVG(transfer_count) as avg_transfers
      FROM account_relationships
      WHERE total_score IS NOT NULL
      GROUP BY score_range
      ORDER BY avg_score
    `).all();
    
    console.log('\nScore Distribution:');
    distribution.forEach(range => {
      console.log(`${range.score_range}: ${range.count} relationships`);
      console.log(`  Average Score: ${range.avg_score?.toFixed(2) || 'N/A'}`);
      console.log(`  Average Transfers: ${range.avg_transfers?.toFixed(0) || 'N/A'}`);
    });
    
  } catch (error) {
    logger.error('Error in relationship scoring demo:', error);
  } finally {
    db.close();
  }
}

// Run the demo
main().catch(console.error);