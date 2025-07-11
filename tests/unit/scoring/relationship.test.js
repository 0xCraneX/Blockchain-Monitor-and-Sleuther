import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { RelationshipScorer } from '../../../src/services/RelationshipScorer';
import { createTestDatabase } from '../../utils/graph-test-helper';

describe('Relationship Scoring', () => {
  let db;
  let scorer;

  beforeEach(async () => {
    db = await createTestDatabase();
    scorer = new RelationshipScorer(db);
    
    // Setup test data
    setupTestRelationships(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Volume Score Calculation', () => {
    it('should calculate percentile-based volume score', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        total_volume: '10000000000000' // 10 DOT
      };

      const score = scorer.calculateVolumeScore(relationship);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle zero volume relationships', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        total_volume: '0'
      };

      const score = scorer.calculateVolumeScore(relationship);
      
      expect(score).toBe(0);
    });

    it('should cap scores at maximum values', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        total_volume: '1000000000000000' // 1000 DOT (very high)
      };

      const score = scorer.calculateVolumeScore(relationship);
      
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should calculate relative volume correctly', () => {
      // Setup account with known balance
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, ?)
      `).run('wealthy_addr', '100000000000000'); // 100 DOT

      const relationship = {
        from_address: 'wealthy_addr',
        to_address: 'addr2',
        total_volume: '50000000000000' // 50 DOT (50% of balance)
      };

      const score = scorer.calculateVolumeScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.volumeComponents.relativeVolume).toBeGreaterThan(0);
      expect(details.volumeComponents.relativeVolume).toBeLessThanOrEqual(30);
    });

    it('should handle different volume percentiles', () => {
      const relationships = [
        { total_volume: '1000000000000' },    // 1 DOT
        { total_volume: '10000000000000' },   // 10 DOT
        { total_volume: '100000000000000' },  // 100 DOT
        { total_volume: '1000000000000000' }  // 1000 DOT
      ];

      const scores = relationships.map(r => scorer.calculateVolumeScore(r));
      
      // Higher volumes should have higher scores
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      }
    });
  });

  describe('Frequency Score Calculation', () => {
    it('should calculate transfer count score', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 50
      };

      const score = scorer.calculateFrequencyScore(relationship);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should calculate transfer frequency per day', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 30,
        first_transfer_block: 1000000,
        last_transfer_block: 1100000 // ~10 days apart
      };

      const score = scorer.calculateFrequencyScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.frequencyComponents.transfersPerDay).toBeCloseTo(3, 1);
    });

    it('should calculate consistency ratio', () => {
      // Add transfers with specific patterns
      const from = 'consistent_sender';
      const to = 'consistent_receiver';
      
      // Create 10 transfers on 8 different days
      const transfers = [
        { day: '2024-01-01', count: 2 },
        { day: '2024-01-02', count: 1 },
        { day: '2024-01-03', count: 1 },
        { day: '2024-01-05', count: 1 },
        { day: '2024-01-07', count: 1 },
        { day: '2024-01-08', count: 2 },
        { day: '2024-01-09', count: 1 },
        { day: '2024-01-10', count: 1 }
      ];

      transfers.forEach((t, i) => {
        for (let j = 0; j < t.count; j++) {
          db.prepare(`
            INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
            VALUES (?, ?, ?, ?, ?, '1000000000000', '125000000', 1)
          `).run(`0xcons${i}${j}`, 1000000 + i, t.day, from, to);
        }
      });

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateFrequencyScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.frequencyComponents.consistency).toBeCloseTo(0.8, 1); // 8 days / 10 days
    });

    it('should handle single transfer relationships', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        transfer_count: 1
      };

      const score = scorer.calculateFrequencyScore(relationship);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(50); // Low score for single transfer
    });
  });

  describe('Temporal Score Calculation', () => {
    it('should apply recency decay correctly', () => {
      const now = new Date();
      const scenarios = [
        { daysAgo: 0, expectedPoints: 40 },   // Today
        { daysAgo: 3, expectedPoints: 35 },   // Few days ago
        { daysAgo: 15, expectedPoints: 25 },  // Two weeks ago
        { daysAgo: 60, expectedPoints: 15 },  // Two months ago
        { daysAgo: 200, expectedPoints: 5 },  // Six months ago
        { daysAgo: 400, expectedPoints: 0 }   // Over a year ago
      ];

      scenarios.forEach(scenario => {
        const lastTransfer = new Date(now);
        lastTransfer.setDate(lastTransfer.getDate() - scenario.daysAgo);

        const relationship = {
          last_transfer_timestamp: lastTransfer.toISOString()
        };

        const score = scorer.calculateTemporalScore(relationship);
        const details = scorer.getScoreDetails(relationship);
        
        expect(details.temporalComponents.recency).toBe(scenario.expectedPoints);
      });
    });

    it('should calculate relationship duration', () => {
      const relationship = {
        first_transfer_block: 1000000,
        last_transfer_block: 1500000, // ~50 days later
        first_transfer_timestamp: '2023-01-01',
        last_transfer_timestamp: '2023-06-01' // 5 months
      };

      const score = scorer.calculateTemporalScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.temporalComponents.duration).toBeGreaterThan(0);
      expect(details.temporalComponents.duration).toBeLessThanOrEqual(30);
    });

    it('should handle future timestamps gracefully', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const relationship = {
        last_transfer_timestamp: futureDate.toISOString()
      };

      const score = scorer.calculateTemporalScore(relationship);
      
      expect(score).toBe(40); // Should treat as recent
    });

    it('should score activity patterns', () => {
      const from = 'active_sender';
      const to = 'active_receiver';
      
      // Create transfers with recent activity
      const now = new Date();
      const transfers = [];
      
      // 5 transfers in last week
      for (let i = 0; i < 5; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        transfers.push({ date, hash: `0xrecent${i}` });
      }
      
      // 15 transfers in last month
      for (let i = 7; i < 22; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        transfers.push({ date, hash: `0xmonth${i}` });
      }
      
      // 80 older transfers
      for (let i = 31; i < 111; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        transfers.push({ date, hash: `0xold${i}` });
      }

      transfers.forEach((t, i) => {
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, ?, ?, ?, '1000000000000', '125000000', 1)
        `).run(t.hash, 1000000 + i, t.date.toISOString(), from, to);
      });

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateTemporalScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.temporalComponents.recentActivityScore).toBeGreaterThan(0);
    });
  });

  describe('Network Score Calculation', () => {
    it('should calculate common connections score', () => {
      const addr1 = 'network_node1';
      const addr2 = 'network_node2';
      const common = ['common1', 'common2', 'common3'];
      
      // Create common connections
      common.forEach((c, i) => {
        db.prepare(`
          INSERT INTO accounts (address, balance) VALUES (?, '1000000000000')
        `).run(c);
        
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES 
            (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1),
            (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
        `).run(
          `0xcom1${i}`, 1000000 + i, addr1, c,
          `0xcom2${i}`, 1000001 + i, addr2, c
        );
      });

      const relationship = { from_address: addr1, to_address: addr2 };
      const score = scorer.calculateNetworkScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.networkComponents.commonConnections).toBe(3);
      expect(details.networkComponents.commonConnectionScore).toBe(15); // 3 * 5
    });

    it('should calculate centrality scores', () => {
      // Create a hub node with many connections
      const hub = 'central_hub';
      const spokes = Array(20).fill(null).map((_, i) => `spoke${i}`);
      
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000')
      `).run(hub);
      
      spokes.forEach((spoke, i) => {
        db.prepare(`
          INSERT INTO accounts (address, balance) VALUES (?, '1000000000000')
        `).run(spoke);
        
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
        `).run(`0xhub${i}`, 1000000 + i, hub, spoke);
      });

      const relationship = { from_address: hub, to_address: spokes[0] };
      const score = scorer.calculateNetworkScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.networkComponents.fromDegree).toBe(20);
      expect(details.networkComponents.centralityScore).toBeGreaterThan(0);
    });

    it('should handle isolated nodes', () => {
      const isolated1 = 'isolated_node1';
      const isolated2 = 'isolated_node2';
      
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(isolated1, isolated2);
      
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run('0xisolated', 1000000, isolated1, isolated2);

      const relationship = { from_address: isolated1, to_address: isolated2 };
      const score = scorer.calculateNetworkScore(relationship);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(50); // Low score for isolated nodes
    });
  });

  describe('Risk Score Calculation', () => {
    it('should detect rapid transfer patterns', () => {
      const from = 'rapid_sender';
      const to = 'rapid_receiver';
      
      // Create rapid transfers (within 5 minutes)
      const baseTime = new Date('2024-01-01T12:00:00Z');
      for (let i = 0; i < 5; i++) {
        const time = new Date(baseTime);
        time.setMinutes(time.getMinutes() + i);
        
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, ?, ?, ?, '1000000000000', '125000000', 1)
        `).run(`0xrapid${i}`, 1000000 + i, time.toISOString(), from, to);
      }

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateRiskScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.riskComponents.rapidTransfers).toBeGreaterThan(0);
      expect(score).toBeGreaterThan(0);
    });

    it('should identify round number transfers', () => {
      const from = 'round_sender';
      const to = 'round_receiver';
      
      // Create round number transfers
      const roundAmounts = [
        '1000000000000',    // 1 DOT
        '10000000000000',   // 10 DOT
        '100000000000000',  // 100 DOT
        '1000000000000000'  // 1000 DOT
      ];
      
      roundAmounts.forEach((amount, i) => {
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, '2024-01-01', ?, ?, ?, '125000000', 1)
        `).run(`0xround${i}`, 1000000 + i, from, to, amount);
      });

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateRiskScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.riskComponents.roundNumbers).toBe(4);
      expect(score).toBeGreaterThan(20);
    });

    it('should flag unusual time patterns', () => {
      const from = 'night_sender';
      const to = 'night_receiver';
      
      // Create transfers at unusual times (2-5 AM UTC)
      const unusualTimes = [
        '2024-01-01T02:30:00Z',
        '2024-01-01T03:15:00Z',
        '2024-01-01T04:45:00Z'
      ];
      
      unusualTimes.forEach((time, i) => {
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, ?, ?, ?, '1234567890123', '125000000', 1)
        `).run(`0xnight${i}`, 1000000 + i, time, from, to);
      });

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateRiskScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.riskComponents.unusualTimes).toBe(3);
      expect(score).toBeGreaterThan(0);
    });

    it('should detect new account interactions', () => {
      const oldAccount = 'old_account';
      const newAccount = 'new_account';
      
      // Create accounts with different ages
      db.prepare(`
        INSERT INTO accounts (address, balance, first_seen_block, created_at) 
        VALUES 
          (?, '1000000000000', 100000, datetime('now', '-365 days')),
          (?, '1000000000000', 1999000, datetime('now', '-2 days'))
      `).run(oldAccount, newAccount);
      
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES (?, ?, datetime('now', '-1 day'), ?, ?, '1000000000000', '125000000', 1)
      `).run('0xnew', 2000000, oldAccount, newAccount);

      const relationship = scorer.getRelationshipData(oldAccount, newAccount);
      const score = scorer.calculateRiskScore(relationship);
      const details = scorer.getScoreDetails(relationship);
      
      expect(details.riskComponents.newAccount).toBe(true);
      expect(score).toBeGreaterThanOrEqual(20);
    });

    it('should combine multiple risk factors', () => {
      const from = 'risky_sender';
      const to = 'risky_receiver';
      
      // Create new account
      db.prepare(`
        INSERT INTO accounts (address, balance, first_seen_block, created_at) 
        VALUES 
          (?, '1000000000000', 100000, datetime('now', '-365 days')),
          (?, '1000000000000', 1999000, datetime('now', '-2 days'))
      `).run(from, to);
      
      // Create risky transfers: rapid, round numbers, unusual times
      const baseTime = new Date('2024-01-01T03:00:00Z');
      for (let i = 0; i < 3; i++) {
        const time = new Date(baseTime);
        time.setMinutes(time.getMinutes() + i * 2);
        
        db.prepare(`
          INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
          VALUES (?, ?, ?, ?, ?, ?, '125000000', 1)
        `).run(`0xrisky${i}`, 2000000 + i, time.toISOString(), from, to, '10000000000000');
      }

      const relationship = scorer.getRelationshipData(from, to);
      const score = scorer.calculateRiskScore(relationship);
      
      expect(score).toBeGreaterThan(40); // High risk score
    });
  });

  describe('Total Score Calculation', () => {
    it('should combine all components with correct weights', () => {
      const relationship = {
        from_address: 'addr1',
        to_address: 'addr2',
        volume_score: 80,
        frequency_score: 70,
        temporal_score: 60,
        network_score: 75,
        risk_score: 10
      };

      const totalScore = scorer.calculateTotalScore(relationship);
      
      // Expected: (80*0.25 + 70*0.25 + 60*0.20 + 75*0.30) * (1 - 10/200)
      // = (20 + 17.5 + 12 + 22.5) * 0.95
      // = 72 * 0.95 = 68.4
      expect(totalScore).toBeCloseTo(68.4, 1);
    });

    it('should apply risk penalty correctly', () => {
      const lowRisk = {
        volume_score: 70,
        frequency_score: 70,
        temporal_score: 70,
        network_score: 70,
        risk_score: 0
      };

      const highRisk = {
        ...lowRisk,
        risk_score: 50
      };

      const lowRiskScore = scorer.calculateTotalScore(lowRisk);
      const highRiskScore = scorer.calculateTotalScore(highRisk);
      
      expect(lowRiskScore).toBe(70); // No penalty
      expect(highRiskScore).toBe(52.5); // 25% penalty
    });

    it('should handle edge cases in scoring', () => {
      const zeroScores = {
        volume_score: 0,
        frequency_score: 0,
        temporal_score: 0,
        network_score: 0,
        risk_score: 0
      };

      const maxScores = {
        volume_score: 100,
        frequency_score: 100,
        temporal_score: 100,
        network_score: 100,
        risk_score: 0
      };

      expect(scorer.calculateTotalScore(zeroScores)).toBe(0);
      expect(scorer.calculateTotalScore(maxScores)).toBe(100);
    });

    it('should update scores in database', async () => {
      const from = 'update_from';
      const to = 'update_to';
      
      // Create relationship
      db.prepare(`
        INSERT INTO accounts (address, balance) VALUES (?, '1000000000000'), (?, '1000000000000')
      `).run(from, to);
      
      db.prepare(`
        INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
        VALUES (?, ?, '2024-01-01', ?, ?, '1000000000000', '125000000', 1)
      `).run('0xupdate', 1000000, from, to);

      // Calculate and update scores
      await scorer.updateRelationshipScore(from, to);
      
      // Verify scores were saved
      const saved = db.prepare(`
        SELECT * FROM account_relationships WHERE from_address = ? AND to_address = ?
      `).get(from, to);
      
      expect(saved.total_score).toBeGreaterThan(0);
      expect(saved.volume_score).toBeGreaterThan(0);
      expect(saved.frequency_score).toBeGreaterThan(0);
      expect(saved.temporal_score).toBeGreaterThan(0);
      expect(saved.network_score).toBeGreaterThanOrEqual(0);
    });
  });
});

function setupTestRelationships(db) {
  // Create test accounts
  const accounts = [
    { address: 'addr1', balance: '10000000000000' },
    { address: 'addr2', balance: '20000000000000' },
    { address: 'addr3', balance: '30000000000000' },
    { address: 'addr4', balance: '40000000000000' },
    { address: 'addr5', balance: '50000000000000' }
  ];

  accounts.forEach(acc => {
    db.prepare(`
      INSERT INTO accounts (address, balance) VALUES (?, ?)
    `).run(acc.address, acc.balance);
  });

  // Create test transfers for percentile calculations
  const transfers = [];
  for (let i = 0; i < 100; i++) {
    const from = accounts[i % 5].address;
    const to = accounts[(i + 1) % 5].address;
    const value = String(Math.floor(Math.random() * 100 + 1) * 1000000000000);
    
    transfers.push({
      hash: `0xtest${i}`,
      block_number: 1000000 + i,
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      from_address: from,
      to_address: to,
      value: value,
      fee: '125000000',
      success: 1
    });
  }

  const insertTransfer = db.prepare(`
    INSERT INTO transfers (hash, block_number, timestamp, from_address, to_address, value, fee, success)
    VALUES (@hash, @block_number, @timestamp, @from_address, @to_address, @value, @fee, @success)
  `);

  transfers.forEach(t => insertTransfer.run(t));
}